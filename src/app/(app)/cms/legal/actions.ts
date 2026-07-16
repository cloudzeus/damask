'use server'

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { getSetting, setSetting, PUBLIC_CONSENT_CACHE_TAG } from '@/lib/settings'
import { translateText } from '@/lib/deepseek'
import { slugify, nextSlugCandidate } from '@/lib/slug'
import { buildLegalSeedPages, type CompanyProfileLike } from './legal-seed-content'

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function revalidateLegal() {
  revalidatePath('/cms/legal')
  // οι δημόσιες /legal/[slug] σελίδες + το footer του (public) layout διαβάζουν LegalPage απευθείας (καμία δική τους cache tag) —
  // revalidatePath καλύπτει τη λίστα admin· η δημόσια σελίδα ξαναφορτώνει σε κάθε request ούτως ή άλλως (dynamic, βλ. cookies() στο layout).
  revalidatePath('/legal', 'layout')
}

// ══════════════════════════════════════════════════════════════════════════
// Σελίδες (LegalPage + LegalPageTranslation)
// ══════════════════════════════════════════════════════════════════════════

const localeContentShape = { title: z.string().trim().max(300), body: z.string() }
const elContentSchema = z.object({
  title: z.string().trim().min(1, 'Συμπλήρωσε τίτλο (Ελληνικά).').max(300),
  body: z.string().trim().min(1, 'Συμπλήρωσε το κείμενο (Ελληνικά).'),
})
const enContentSchema = z.object(localeContentShape)

const legalPageFormSchema = z.object({
  slug: z.string().trim().min(1, 'Συμπλήρωσε slug.').max(160),
  published: z.boolean(),
  el: elContentSchema,
  en: enContentSchema,
  enMachineTranslated: z.boolean(),
})

export type LegalLocaleContentValues = { title: string; body: string }
export type LegalPageFormValues = {
  slug: string
  published: boolean
  el: LegalLocaleContentValues
  en: LegalLocaleContentValues
  enMachineTranslated: boolean
}

function hasEnContent(en: LegalLocaleContentValues): boolean {
  return en.title.trim() !== '' && en.body.trim() !== ''
}

async function isLegalSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.legalPage.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
  return existing !== null
}

async function ensureLegalSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base)
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = nextSlugCandidate(root, attempt)
    if (!(await isLegalSlugTaken(candidate, excludeId))) return candidate
  }
  return `${root}-${Date.now()}`
}

export async function createLegalPage(values: LegalPageFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = legalPageFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data
  const slug = await ensureLegalSlug(data.slug || data.el.title)

  const translations: Prisma.LegalPageTranslationCreateWithoutPageInput[] = [
    { locale: 'el', title: data.el.title, body: data.el.body, machineTranslated: false },
  ]
  if (hasEnContent(data.en)) {
    translations.push({ locale: 'en', title: data.en.title, body: data.en.body, machineTranslated: data.enMachineTranslated })
  }

  const page = await prisma.legalPage.create({
    data: { slug, published: data.published, translations: { create: translations } },
  })

  revalidateLegal()
  return { ok: true, message: `Η σελίδα «${data.el.title}» δημιουργήθηκε.`, id: page.id }
}

export async function updateLegalPage(pageId: string, values: LegalPageFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = legalPageFormSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const existing = await prisma.legalPage.findUnique({ where: { id: pageId } })
  if (!existing) return { ok: false, message: 'Η σελίδα δεν βρέθηκε.' }

  const slug = data.slug === existing.slug ? existing.slug : await ensureLegalSlug(data.slug, pageId)

  await prisma.$transaction(async tx => {
    await tx.legalPage.update({ where: { id: pageId }, data: { slug, published: data.published } })

    await tx.legalPageTranslation.upsert({
      where: { pageId_locale: { pageId, locale: 'el' } },
      update: { title: data.el.title, body: data.el.body },
      create: { pageId, locale: 'el', title: data.el.title, body: data.el.body, machineTranslated: false },
    })

    if (hasEnContent(data.en)) {
      await tx.legalPageTranslation.upsert({
        where: { pageId_locale: { pageId, locale: 'en' } },
        update: { title: data.en.title, body: data.en.body, machineTranslated: data.enMachineTranslated },
        create: { pageId, locale: 'en', title: data.en.title, body: data.en.body, machineTranslated: data.enMachineTranslated },
      })
    } else {
      await tx.legalPageTranslation.deleteMany({ where: { pageId, locale: 'en' } })
    }
  })

  revalidateLegal()
  revalidatePath(`/cms/legal/${pageId}/edit`)
  return { ok: true, message: `Οι αλλαγές για «${data.el.title}» αποθηκεύτηκαν.`, id: pageId }
}

export async function deleteLegalPage(pageId: string): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const page = await prisma.legalPage.findUnique({ where: { id: pageId }, include: { translations: { where: { locale: 'el' } } } })
  if (!page) return { ok: false, message: 'Η σελίδα δεν βρέθηκε.' }

  await prisma.legalPage.delete({ where: { id: pageId } })

  revalidateLegal()
  return { ok: true, message: `Η σελίδα «${page.translations[0]?.title ?? page.slug}» διαγράφηκε.` }
}

/** ⋮ γρήγορη ενέργεια στη λίστα — toggle Δημοσίευση/Αναίρεση δημοσίευσης (published είναι απλό boolean, όχι 4-state όπως τα Posts). */
export async function togglePublishLegalPage(pageId: string): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const page = await prisma.legalPage.findUnique({ where: { id: pageId } })
  if (!page) return { ok: false, message: 'Η σελίδα δεν βρέθηκε.' }

  await prisma.legalPage.update({ where: { id: pageId }, data: { published: !page.published } })

  revalidateLegal()
  return { ok: true, message: !page.published ? 'Η σελίδα δημοσιεύτηκε.' : 'Η δημοσίευση αναιρέθηκε.' }
}

/** Κουμπί «Μετάφραση στα EN με DeepSeek» ΜΕΣΑ στον editor — δουλεύει πάνω σε ό,τι υπάρχει ΤΩΡΑ στη φόρμα (πιθανώς μη αποθηκευμένο). */
export async function translateLegalFieldsToEnglish(el: LegalLocaleContentValues): Promise<
  | { ok: true; data: LegalLocaleContentValues }
  | { ok: false; message: string }
> {
  const session = await requirePermission('cms.edit')

  const parsed = elContentSchema.safeParse(el)
  if (!parsed.success) return { ok: false, message: 'Συμπλήρωσε πρώτα τίτλο και κείμενο (Ελληνικά).' }
  const data = parsed.data
  const aiOpts = { refType: 'legalPage', userId: session.user.id }

  try {
    const [title, body] = await Promise.all([
      translateText(data.title, 'el', 'en', aiOpts),
      translateText(data.body, 'el', 'en', aiOpts),
    ])
    return { ok: true, data: { title, body } }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Η μετάφραση απέτυχε.' }
  }
}

/**
 * «Δημιουργία βασικών» — δημιουργεί DRAFT σκελετούς για τα 6 βασικά slugs
 * (privacy-policy/terms/cookies/returns/shipping/gdpr-rights) ΜΟΝΟ για όσα
 * ΔΕΝ υπάρχουν ήδη· idempotent — ξανά-κλικ δεν δημιουργεί διπλότυπα.
 */
export async function seedBasicLegalPages(): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const profile = await getSetting<CompanyProfileLike>('company.profile')
  const seedPages = buildLegalSeedPages(profile)

  const existing = await prisma.legalPage.findMany({ where: { slug: { in: seedPages.map(p => p.slug) } }, select: { slug: true } })
  const existingSlugs = new Set(existing.map(p => p.slug))
  const toCreate = seedPages.filter(p => !existingSlugs.has(p.slug))

  if (toCreate.length === 0) {
    return { ok: true, message: 'Οι βασικές σελίδες υπάρχουν ήδη — δεν δημιουργήθηκε τίποτα νέο.' }
  }

  for (const p of toCreate) {
    await prisma.legalPage.create({
      data: {
        slug: p.slug,
        published: false,
        translations: { create: [{ locale: 'el', title: p.title, body: p.body, machineTranslated: false }] },
      },
    })
  }

  revalidateLegal()
  return { ok: true, message: `Δημιουργήθηκαν ${toCreate.length} νέες σελίδες: ${toCreate.map(p => p.title).join(', ')}.` }
}

// ══════════════════════════════════════════════════════════════════════════
// Consent Modal config (setting key "consent.config")
// ══════════════════════════════════════════════════════════════════════════

const consentModalSchema = z.object({
  titleEl: z.string().trim().min(1, 'Συμπλήρωσε τίτλο (Ελληνικά).').max(200),
  titleEn: z.string().trim().max(200),
  textEl: z.string().trim().min(1, 'Συμπλήρωσε κείμενο (Ελληνικά).').max(2000),
  textEn: z.string().trim().max(2000),
  analyticsEnabled: z.boolean(),
  marketingEnabled: z.boolean(),
  acceptAllLabel: z.string().trim().min(1, 'Συμπλήρωσε κείμενο κουμπιού.').max(60),
  necessaryOnlyLabel: z.string().trim().min(1, 'Συμπλήρωσε κείμενο κουμπιού.').max(60),
  customizeLabel: z.string().trim().min(1, 'Συμπλήρωσε κείμενο κουμπιού.').max(60),
  policyVersion: z.string().trim().min(1, 'Συμπλήρωσε έκδοση πολιτικής.').max(40),
  position: z.enum(['bar', 'modal']),
  cookiesPageSlug: z.string().trim().min(1, 'Συμπλήρωσε slug σελίδας cookies.').max(160),
})

export type ConsentModalFormValues = z.infer<typeof consentModalSchema>

export async function saveConsentModalConfig(values: ConsentModalFormValues): Promise<ActionResult> {
  await requirePermission('cms.edit')

  const parsed = consentModalSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  await setSetting('consent.config', parsed.data)
  revalidatePath('/cms/legal')
  revalidateTag(PUBLIC_CONSENT_CACHE_TAG, 'max')
  return { ok: true, message: 'Οι ρυθμίσεις του consent modal αποθηκεύτηκαν.' }
}

/** «Μετάφραση» DeepSeek στο tab Consent Modal — μεταφράζει τίτλο+κείμενο μαζί, ΧΩΡΙΣ αποθήκευση. */
export async function translateConsentTextDraft(titleEl: string, textEl: string): Promise<
  | { ok: true; titleEn: string; textEn: string }
  | { ok: false; message: string }
> {
  const session = await requirePermission('cms.edit')

  if (titleEl.trim() === '' && textEl.trim() === '') {
    return { ok: false, message: 'Συμπλήρωσε πρώτα τίτλο ή κείμενο (Ελληνικά).' }
  }
  const aiOpts = { refType: 'consentConfig', userId: session.user.id }

  try {
    const [titleEn, textEn] = await Promise.all([
      titleEl.trim() !== '' ? translateText(titleEl, 'el', 'en', aiOpts) : Promise.resolve(''),
      textEl.trim() !== '' ? translateText(textEl, 'el', 'en', aiOpts) : Promise.resolve(''),
    ])
    return { ok: true, titleEn, textEn }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Η μετάφραση απέτυχε.' }
  }
}
