'use server'

import { z } from 'zod'
import { Prisma, type PostStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { getSetting } from '@/lib/settings'
import { deepseekChat, translateText } from '@/lib/deepseek'
import { buildArticleGenerationMessages, parseGeneratedArticle, type ArticleTone, type ArticleLength } from '@/lib/cms-autogen'
import { slugify, nextSlugCandidate } from '@/lib/slug'

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

/**
 * Πλήρες (ενωμένο με τελείες) path — ΟΧΙ μόνο το πρώτο segment — γιατί το
 * PostFormValues έχει nested αντικείμενα (el.title, el.body…). Οι απλές
 * (μονο-επίπεδης φόρμας) actions αλλού στο app (users/roles/settings) έχουν
 * μόνο top-level πεδία, όπου path[0] === το πλήρες path ούτως ή άλλως.
 */
function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function revalidatePosts() {
  revalidatePath('/cms/posts')
}

// ══════════════════════════════════════════════════════════════════════════
// Άρθρα (Post + PostTranslation)
// ══════════════════════════════════════════════════════════════════════════

const localeContentShape = {
  title: z.string().trim().max(300),
  excerpt: z.string().trim().max(500),
  body: z.string(),
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(200),
}

const elContentSchema = z.object({
  ...localeContentShape,
  title: z.string().trim().min(1, 'Συμπλήρωσε τίτλο (Ελληνικά).').max(300),
  body: z.string().trim().min(1, 'Συμπλήρωσε το κείμενο (Ελληνικά).'),
})
const enContentSchema = z.object(localeContentShape)

const postFormSchema = z.object({
  slug: z.string().trim().min(1, 'Συμπλήρωσε slug.').max(160),
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']),
  categoryId: z.string().nullable(),
  authorId: z.string().nullable(),
  featuredImage: z.string().nullable(),
  el: elContentSchema,
  en: enContentSchema,
  enMachineTranslated: z.boolean(),
})

export type LocaleContentValues = {
  title: string
  excerpt: string
  body: string
  seoTitle: string
  seoDescription: string
}

export type PostFormValues = {
  slug: string
  status: PostStatus
  categoryId: string | null
  authorId: string | null
  featuredImage: string | null
  el: LocaleContentValues
  en: LocaleContentValues
  enMachineTranslated: boolean
}

/** true αν υπάρχει αρκετό EN περιεχόμενο ώστε να αξίζει μια PostTranslation γραμμή (title+body — τα μόνα not-null πεδία του μοντέλου). */
function hasEnContent(en: LocaleContentValues): boolean {
  return en.title.trim() !== '' && en.body.trim() !== ''
}

async function isPostSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.post.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
  return existing !== null
}

async function ensurePostSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base)
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = nextSlugCandidate(root, attempt)
    if (!(await isPostSlugTaken(candidate, excludeId))) return candidate
  }
  return `${root}-${Date.now()}`
}

async function validateRelations(categoryId: string | null, authorId: string | null): Promise<string | null> {
  if (categoryId) {
    const category = await prisma.postCategory.findUnique({ where: { id: categoryId } })
    if (!category) return 'Η κατηγορία δεν βρέθηκε.'
  }
  if (authorId) {
    const author = await prisma.author.findUnique({ where: { id: authorId } })
    if (!author) return 'Ο συγγραφέας δεν βρέθηκε.'
  }
  return null
}

export async function createPost(values: PostFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = postFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const relationError = await validateRelations(data.categoryId, data.authorId)
  if (relationError) return { ok: false, message: relationError }

  const slug = await ensurePostSlug(data.slug || data.el.title)
  const now = new Date()

  const translations: Prisma.PostTranslationCreateWithoutPostInput[] = [{
    locale: 'el',
    title: data.el.title,
    excerpt: emptyToNull(data.el.excerpt),
    body: data.el.body,
    seoTitle: emptyToNull(data.el.seoTitle),
    seoDescription: emptyToNull(data.el.seoDescription),
    machineTranslated: false,
  }]
  if (hasEnContent(data.en)) {
    translations.push({
      locale: 'en',
      title: data.en.title,
      excerpt: emptyToNull(data.en.excerpt),
      body: data.en.body,
      seoTitle: emptyToNull(data.en.seoTitle),
      seoDescription: emptyToNull(data.en.seoDescription),
      machineTranslated: data.enMachineTranslated,
    })
  }

  const post = await prisma.post.create({
    data: {
      slug,
      status: data.status,
      categoryId: data.categoryId,
      authorId: data.authorId,
      featuredImage: data.featuredImage,
      publishedAt: data.status === 'PUBLISHED' ? now : null,
      translations: { create: translations },
    },
  })

  revalidatePosts()
  return { ok: true, message: `Το άρθρο «${data.el.title}» δημιουργήθηκε.`, id: post.id }
}

export async function updatePost(postId: string, values: PostFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = postFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const existing = await prisma.post.findUnique({ where: { id: postId }, include: { translations: true } })
  if (!existing) return { ok: false, message: 'Το άρθρο δεν βρέθηκε.' }

  const relationError = await validateRelations(data.categoryId, data.authorId)
  if (relationError) return { ok: false, message: relationError }

  const slug = data.slug === existing.slug ? existing.slug : await ensurePostSlug(data.slug, postId)
  const wasPublished = existing.status === 'PUBLISHED'
  const nowPublishing = data.status === 'PUBLISHED'

  await prisma.$transaction(async tx => {
    await tx.post.update({
      where: { id: postId },
      data: {
        slug,
        status: data.status,
        categoryId: data.categoryId,
        authorId: data.authorId,
        featuredImage: data.featuredImage,
        // κλειδώνει publishedAt στην ΠΡΩΤΗ δημοσίευση· δεν το ξαναγράφει σε κάθε save.
        publishedAt: !wasPublished && nowPublishing ? new Date() : existing.publishedAt,
      },
    })

    await tx.postTranslation.upsert({
      where: { postId_locale: { postId, locale: 'el' } },
      update: {
        title: data.el.title,
        excerpt: emptyToNull(data.el.excerpt),
        body: data.el.body,
        seoTitle: emptyToNull(data.el.seoTitle),
        seoDescription: emptyToNull(data.el.seoDescription),
      },
      create: {
        postId, locale: 'el',
        title: data.el.title,
        excerpt: emptyToNull(data.el.excerpt),
        body: data.el.body,
        seoTitle: emptyToNull(data.el.seoTitle),
        seoDescription: emptyToNull(data.el.seoDescription),
        machineTranslated: false,
      },
    })

    if (hasEnContent(data.en)) {
      await tx.postTranslation.upsert({
        where: { postId_locale: { postId, locale: 'en' } },
        update: {
          title: data.en.title,
          excerpt: emptyToNull(data.en.excerpt),
          body: data.en.body,
          seoTitle: emptyToNull(data.en.seoTitle),
          seoDescription: emptyToNull(data.en.seoDescription),
          machineTranslated: data.enMachineTranslated,
        },
        create: {
          postId, locale: 'en',
          title: data.en.title,
          excerpt: emptyToNull(data.en.excerpt),
          body: data.en.body,
          seoTitle: emptyToNull(data.en.seoTitle),
          seoDescription: emptyToNull(data.en.seoDescription),
          machineTranslated: data.enMachineTranslated,
        },
      })
    } else {
      // Ο χρήστης άδειασε το EN — αφαίρεσε την ξεπερασμένη μετάφραση αντί να μείνει «ορφανή».
      await tx.postTranslation.deleteMany({ where: { postId, locale: 'en' } })
    }
  })

  revalidatePosts()
  revalidatePath(`/cms/posts/${postId}/edit`)
  return { ok: true, message: `Οι αλλαγές για «${data.el.title}» αποθηκεύτηκαν.`, id: postId }
}

export async function deletePost(postId: string): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const post = await prisma.post.findUnique({ where: { id: postId }, include: { translations: { where: { locale: 'el' } } } })
  if (!post) return { ok: false, message: 'Το άρθρο δεν βρέθηκε.' }

  await prisma.post.delete({ where: { id: postId } })

  revalidatePosts()
  return { ok: true, message: `Το άρθρο «${post.translations[0]?.title ?? post.slug}» διαγράφηκε.` }
}

/** Δημοσίευση/Αρχειοθέτηση — απλό toggle ⋮ ενέργειας στη λίστα. PUBLISHED→ARCHIVED, οτιδήποτε άλλο→PUBLISHED. */
export async function togglePublishPost(postId: string): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post) return { ok: false, message: 'Το άρθρο δεν βρέθηκε.' }

  const nextStatus: PostStatus = post.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED'
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: nextStatus,
      publishedAt: nextStatus === 'PUBLISHED' ? (post.publishedAt ?? new Date()) : post.publishedAt,
    },
  })

  revalidatePosts()
  return {
    ok: true,
    message: nextStatus === 'PUBLISHED' ? 'Το άρθρο δημοσιεύτηκε.' : 'Το άρθρο αρχειοθετήθηκε.',
  }
}

/**
 * ⋮ «Μετάφραση EN (DeepSeek)» στη λίστα άρθρων — μεταφράζει την ΑΠΟΘΗΚΕΥΜΕΝΗ
 * EL έκδοση και γράφει απευθείας την EN μετάφραση στη DB (machineTranslated).
 * Διαφέρει από το translateFieldsToEnglish παρακάτω, που δουλεύει πάνω σε
 * ΑΝΕΝΤΑΧΤΟ (ακόμα μη αποθηκευμένο) περιεχόμενο μέσα στον editor.
 */
export async function translatePostToEnglish(postId: string): Promise<ActionResult> {
  const session = await requirePermission('cms.edit')

  const el = await prisma.postTranslation.findUnique({ where: { postId_locale: { postId, locale: 'el' } } })
  if (!el) return { ok: false, message: 'Δεν υπάρχει ελληνικό κείμενο για μετάφραση.' }

  const aiOpts = { refType: 'post', refId: postId, userId: session.user.id }
  let translated: LocaleContentValues
  try {
    const [title, excerpt, body, seoTitle, seoDescription] = await Promise.all([
      translateText(el.title, 'el', 'en', aiOpts),
      el.excerpt ? translateText(el.excerpt, 'el', 'en', aiOpts) : Promise.resolve(''),
      translateText(el.body, 'el', 'en', aiOpts),
      el.seoTitle ? translateText(el.seoTitle, 'el', 'en', aiOpts) : Promise.resolve(''),
      el.seoDescription ? translateText(el.seoDescription, 'el', 'en', aiOpts) : Promise.resolve(''),
    ])
    translated = { title, excerpt, body, seoTitle, seoDescription }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Η μετάφραση απέτυχε.' }
  }

  await prisma.postTranslation.upsert({
    where: { postId_locale: { postId, locale: 'en' } },
    update: {
      title: translated.title,
      excerpt: emptyToNull(translated.excerpt),
      body: translated.body,
      seoTitle: emptyToNull(translated.seoTitle),
      seoDescription: emptyToNull(translated.seoDescription),
      machineTranslated: true,
    },
    create: {
      postId, locale: 'en',
      title: translated.title,
      excerpt: emptyToNull(translated.excerpt),
      body: translated.body,
      seoTitle: emptyToNull(translated.seoTitle),
      seoDescription: emptyToNull(translated.seoDescription),
      machineTranslated: true,
    },
  })

  revalidatePosts()
  return { ok: true, message: 'Η αγγλική μετάφραση ενημερώθηκε.' }
}

/**
 * Κουμπί «Μετάφραση στα EN με DeepSeek» ΜΕΣΑ στον editor — μεταφράζει ό,τι
 * υπάρχει ΤΩΡΑ στη φόρμα (πιθανώς μη αποθηκευμένο ακόμα) και επιστρέφει τα
 * μεταφρασμένα πεδία στο client για να γεμίσουν το EN tab. Καμία εγγραφή DB εδώ.
 */
export async function translateFieldsToEnglish(el: LocaleContentValues): Promise<
  | { ok: true; data: LocaleContentValues }
  | { ok: false; message: string }
> {
  const session = await requirePermission('cms.edit')

  const parsed = elContentSchema.safeParse(el)
  if (!parsed.success) return { ok: false, message: 'Συμπλήρωσε πρώτα τίτλο και κείμενο (Ελληνικά).' }
  const data = parsed.data
  const aiOpts = { refType: 'post', userId: session.user.id }

  try {
    const [title, excerpt, body, seoTitle, seoDescription] = await Promise.all([
      translateText(data.title, 'el', 'en', aiOpts),
      data.excerpt ? translateText(data.excerpt, 'el', 'en', aiOpts) : Promise.resolve(''),
      translateText(data.body, 'el', 'en', aiOpts),
      data.seoTitle ? translateText(data.seoTitle, 'el', 'en', aiOpts) : Promise.resolve(''),
      data.seoDescription ? translateText(data.seoDescription, 'el', 'en', aiOpts) : Promise.resolve(''),
    ])
    return { ok: true, data: { title, excerpt, body, seoTitle, seoDescription } }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Η μετάφραση απέτυχε.' }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// «✨ Δημιουργία με AI» — generateText (ελληνικό SEO/GEO άρθρο) + translateText (EN)
// ══════════════════════════════════════════════════════════════════════════

const autogenSchema = z.object({
  topic: z.string().trim().min(3, 'Περίγραψε το θέμα του άρθρου.').max(2000),
  categoryId: z.string().nullable(),
  tone: z.enum(['informative', 'commercial', 'technical']),
  length: z.enum(['short', 'medium', 'long']),
})

export type AutogenInput = {
  topic: string
  categoryId: string | null
  tone: ArticleTone
  length: ArticleLength
}

type CompanyProfileContext = { name?: string; title?: string; jobTypeDesc?: string }

async function loadCompanyContext(): Promise<string | null> {
  const profile = await getSetting<CompanyProfileContext>('company.profile')
  if (!profile) return null
  const parts = [profile.name, profile.title, profile.jobTypeDesc].map(p => p?.trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : null
}

export async function generateArticleWithAI(input: AutogenInput): Promise<ActionResult> {
  const session = await requirePermission('cms.edit')

  const parsed = autogenSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Συμπλήρωσε το θέμα του άρθρου.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data
  const aiOpts = { refType: 'post', userId: session.user.id }

  let categoryName: string | null = null
  if (data.categoryId) {
    const category = await prisma.postCategory.findUnique({
      where: { id: data.categoryId },
      include: { translations: { where: { locale: 'el' } } },
    })
    if (!category) return { ok: false, message: 'Η κατηγορία δεν βρέθηκε.' }
    categoryName = category.translations[0]?.name ?? null
  }

  const companyContext = await loadCompanyContext()

  let generated
  try {
    const raw = await deepseekChat(
      buildArticleGenerationMessages({ topic: data.topic, categoryName, tone: data.tone, length: data.length, companyContext }),
      { maxTokens: 4000, temperature: 0.6, scope: 'CMS_GENERATE', ...aiOpts },
    )
    generated = parseGeneratedArticle(raw)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Η δημιουργία του άρθρου απέτυχε.' }
  }

  let translated: LocaleContentValues
  try {
    const [title, excerpt, body, seoTitle, seoDescription] = await Promise.all([
      translateText(generated.title, 'el', 'en', aiOpts),
      translateText(generated.excerpt, 'el', 'en', aiOpts),
      translateText(generated.body, 'el', 'en', aiOpts),
      translateText(generated.seoTitle, 'el', 'en', aiOpts),
      translateText(generated.seoDescription, 'el', 'en', aiOpts),
    ])
    translated = { title, excerpt, body, seoTitle, seoDescription }
  } catch (e) {
    return { ok: false, message: `Το άρθρο γράφτηκε αλλά η μετάφραση EN απέτυχε: ${e instanceof Error ? e.message : ''}` }
  }

  const slug = await ensurePostSlug(generated.title)

  const post = await prisma.post.create({
    data: {
      slug,
      status: 'DRAFT',
      categoryId: data.categoryId,
      aiGenerated: true,
      translations: {
        create: [
          {
            locale: 'el',
            title: generated.title,
            excerpt: generated.excerpt,
            body: generated.body,
            seoTitle: generated.seoTitle,
            seoDescription: generated.seoDescription,
            machineTranslated: false,
          },
          {
            locale: 'en',
            title: translated.title,
            excerpt: translated.excerpt,
            body: translated.body,
            seoTitle: translated.seoTitle,
            seoDescription: translated.seoDescription,
            machineTranslated: true,
          },
        ],
      },
    },
  })

  revalidatePosts()
  return { ok: true, message: 'Δημιουργήθηκε — έλεγξε και δημοσίευσε.', id: post.id }
}

// ══════════════════════════════════════════════════════════════════════════
// Κατηγορίες (PostCategory + PostCategoryTranslation)
// ══════════════════════════════════════════════════════════════════════════

const categoryFormSchema = z.object({
  nameEl: z.string().trim().min(1, 'Συμπλήρωσε όνομα (Ελληνικά).').max(120),
  nameEn: z.string().trim().max(120),
})

export type CategoryFormValues = { nameEl: string; nameEn: string }

async function isCategorySlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.postCategory.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
  return existing !== null
}

async function ensureCategorySlug(base: string): Promise<string> {
  const root = slugify(base)
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = nextSlugCandidate(root, attempt)
    if (!(await isCategorySlugTaken(candidate))) return candidate
  }
  return `${root}-${Date.now()}`
}

export async function createCategory(values: CategoryFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = categoryFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Συμπλήρωσε το ελληνικό όνομα.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data
  const slug = await ensureCategorySlug(data.nameEl)

  const category = await prisma.postCategory.create({
    data: {
      slug,
      translations: {
        create: [
          { locale: 'el', name: data.nameEl },
          ...(data.nameEn.trim() !== '' ? [{ locale: 'en', name: data.nameEn.trim() }] : []),
        ],
      },
    },
  })

  revalidatePosts()
  return { ok: true, message: `Η κατηγορία «${data.nameEl}» δημιουργήθηκε.`, id: category.id }
}

export async function updateCategory(categoryId: string, values: CategoryFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = categoryFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Συμπλήρωσε το ελληνικό όνομα.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const category = await prisma.postCategory.findUnique({ where: { id: categoryId } })
  if (!category) return { ok: false, message: 'Η κατηγορία δεν βρέθηκε.' }

  await prisma.postCategoryTranslation.upsert({
    where: { categoryId_locale: { categoryId, locale: 'el' } },
    update: { name: data.nameEl },
    create: { categoryId, locale: 'el', name: data.nameEl },
  })

  if (data.nameEn.trim() !== '') {
    await prisma.postCategoryTranslation.upsert({
      where: { categoryId_locale: { categoryId, locale: 'en' } },
      update: { name: data.nameEn.trim() },
      create: { categoryId, locale: 'en', name: data.nameEn.trim() },
    })
  } else {
    await prisma.postCategoryTranslation.deleteMany({ where: { categoryId, locale: 'en' } })
  }

  revalidatePosts()
  return { ok: true, message: `Η κατηγορία «${data.nameEl}» ενημερώθηκε.` }
}

/** Διαγραφή κατηγορίας — μόνο αν δεν έχει άρθρα (spec: «διαγραφή μόνο άδεια»). */
export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const category = await prisma.postCategory.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { posts: true } }, translations: { where: { locale: 'el' } } },
  })
  if (!category) return { ok: false, message: 'Η κατηγορία δεν βρέθηκε.' }
  if (category._count.posts > 0) {
    return { ok: false, message: `Η κατηγορία έχει ${category._count.posts} άρθρα — μετακίνησέ τα πρώτα σε άλλη κατηγορία.` }
  }

  await prisma.postCategory.delete({ where: { id: categoryId } })
  revalidatePosts()
  return { ok: true, message: `Η κατηγορία «${category.translations[0]?.name ?? category.slug}» διαγράφηκε.` }
}

/** «Μετάφραση» κουμπάκι στο category dialog — μεταφράζει το EL όνομα σε EN, ΧΩΡΙΣ αποθήκευση (client γεμίζει το πεδίο). */
export async function translateCategoryNameDraft(nameEl: string): Promise<
  { ok: true; nameEn: string } | { ok: false; message: string }
> {
  const session = await requirePermission('cms.edit')
  const trimmed = nameEl.trim()
  if (trimmed === '') return { ok: false, message: 'Συμπλήρωσε πρώτα το ελληνικό όνομα.' }
  try {
    const nameEn = await translateText(trimmed, 'el', 'en', { refType: 'postCategory', userId: session.user.id })
    return { ok: true, nameEn }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Η μετάφραση απέτυχε.' }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Συγγραφείς (Author)
// ══════════════════════════════════════════════════════════════════════════

const authorFormSchema = z.object({
  name: z.string().trim().min(1, 'Συμπλήρωσε όνομα.').max(150),
  bio: z.string().trim().max(2000),
  avatarUrl: z.string().nullable(),
  userId: z.string().nullable(),
})

export type AuthorFormValues = { name: string; bio: string; avatarUrl: string | null; userId: string | null }

const DUPLICATE_AUTHOR_USER_MESSAGE = 'Αυτός ο χρήστης είναι ήδη συνδεδεμένος με άλλον συγγραφέα.'

export async function createAuthor(values: AuthorFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = authorFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Συμπλήρωσε το όνομα.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  if (data.userId) {
    const user = await prisma.user.findUnique({ where: { id: data.userId } })
    if (!user) return { ok: false, message: 'Ο χρήστης δεν βρέθηκε.' }
  }

  try {
    const author = await prisma.author.create({
      data: { name: data.name, bio: emptyToNull(data.bio), avatarUrl: data.avatarUrl, userId: data.userId },
    })
    revalidatePosts()
    return { ok: true, message: `Ο συγγραφέας «${data.name}» δημιουργήθηκε.`, id: author.id }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: DUPLICATE_AUTHOR_USER_MESSAGE, fieldErrors: { userId: DUPLICATE_AUTHOR_USER_MESSAGE } }
    }
    throw e
  }
}

export async function updateAuthor(authorId: string, values: AuthorFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = authorFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Συμπλήρωσε το όνομα.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const existing = await prisma.author.findUnique({ where: { id: authorId } })
  if (!existing) return { ok: false, message: 'Ο συγγραφέας δεν βρέθηκε.' }

  if (data.userId) {
    const user = await prisma.user.findUnique({ where: { id: data.userId } })
    if (!user) return { ok: false, message: 'Ο χρήστης δεν βρέθηκε.' }
  }

  try {
    await prisma.author.update({
      where: { id: authorId },
      data: { name: data.name, bio: emptyToNull(data.bio), avatarUrl: data.avatarUrl, userId: data.userId },
    })
    revalidatePosts()
    return { ok: true, message: `Οι αλλαγές για «${data.name}» αποθηκεύτηκαν.` }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: DUPLICATE_AUTHOR_USER_MESSAGE, fieldErrors: { userId: DUPLICATE_AUTHOR_USER_MESSAGE } }
    }
    throw e
  }
}

/** Διαγραφή συγγραφέα — επιτρέπεται πάντα (Post.authorId γίνεται SetNull αυτόματα από το Prisma optional relation default). */
export async function deleteAuthor(authorId: string): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const author = await prisma.author.findUnique({ where: { id: authorId } })
  if (!author) return { ok: false, message: 'Ο συγγραφέας δεν βρέθηκε.' }

  await prisma.author.delete({ where: { id: authorId } })
  revalidatePosts()
  return { ok: true, message: `Ο συγγραφέας «${author.name}» διαγράφηκε.` }
}
