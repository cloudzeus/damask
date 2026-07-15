import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeTranslation = {
  id: string
  postId: string
  locale: string
  title: string
  excerpt: string | null
  body: string
  seoTitle: string | null
  seoDescription: string | null
  machineTranslated: boolean
}
type FakePost = {
  id: string
  slug: string
  status: string
  categoryId: string | null
  authorId: string | null
  featuredImage: string | null
  aiGenerated: boolean
  publishedAt: Date | null
}
type FakeCategory = { id: string; slug: string; postCount: number; nameEl: string }

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

const store: { posts: FakePost[]; translations: FakeTranslation[]; categories: FakeCategory[] } = {
  posts: [],
  translations: [],
  categories: [],
}

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['cms.view', 'cms.edit'], customerId: null },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async () => null) }))

// Bare vi.fn() (χωρίς inline implementation) ώστε το inferred TArgs να μείνει
// το γενικό any[] — αλλιώς το .mock.calls[i][1]/[2] παρακάτω (assert στο
// from/to locale) θα σπάσει το tsc ως tuple-index-out-of-range, αφού η
// signature θα περιοριζόταν στα ορίσματα του inline implementation.
const deepseekChatMock = vi.fn()
const translateTextMock = vi.fn()
vi.mock('@/lib/deepseek', () => ({
  deepseekChat: (messages: unknown, opts: unknown) => deepseekChatMock(messages, opts),
  translateText: (text: unknown, from: unknown, to: unknown, opts: unknown) => translateTextMock(text, from, to, opts),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('post')
        const post: FakePost = {
          id,
          slug: data.slug as string,
          status: (data.status as string) ?? 'DRAFT',
          categoryId: (data.categoryId as string | null) ?? null,
          authorId: (data.authorId as string | null) ?? null,
          featuredImage: (data.featuredImage as string | null) ?? null,
          aiGenerated: (data.aiGenerated as boolean) ?? false,
          publishedAt: (data.publishedAt as Date | null) ?? null,
        }
        store.posts.push(post)
        const nested = data.translations as { create: Record<string, unknown>[] } | undefined
        for (const t of nested?.create ?? []) {
          store.translations.push({ id: nextId('tr'), postId: id, ...t } as FakeTranslation)
        }
        return post
      }),
      findFirst: vi.fn(async ({ where }: { where: { slug: string; id?: { not: string } } }) =>
        store.posts.find(p => p.slug === where.slug && (!where.id || p.id !== where.id.not)) ?? null,
      ),
    },
    postCategory: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const category = store.categories.find(c => c.id === where.id)
        if (!category) return null
        return {
          id: category.id,
          slug: category.slug,
          _count: { posts: category.postCount },
          translations: [{ locale: 'el', name: category.nameEl }],
        }
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = store.categories.findIndex(c => c.id === where.id)
        const [removed] = store.categories.splice(idx, 1)
        return removed
      }),
    },
    author: {
      findUnique: vi.fn(async () => null),
    },
  },
}))

import { createPost, deleteCategory, generateArticleWithAI, type PostFormValues } from '@/app/(app)/cms/posts/actions'

const EMPTY_LOCALE = { title: '', excerpt: '', body: '', seoTitle: '', seoDescription: '' }

function baseFormValues(overrides: Partial<PostFormValues> = {}): PostFormValues {
  return {
    slug: '',
    status: 'DRAFT',
    categoryId: null,
    authorId: null,
    featuredImage: null,
    el: { ...EMPTY_LOCALE },
    en: { ...EMPTY_LOCALE },
    enMachineTranslated: false,
    ...overrides,
  }
}

beforeEach(() => {
  store.posts = []
  store.translations = []
  store.categories = []
  deepseekChatMock.mockReset()
  translateTextMock.mockReset()
  translateTextMock.mockImplementation(async (text: string) => `EN:${text}`)
})

describe('createPost', () => {
  it('δημιουργεί άρθρο με μόνο el translation όταν το en είναι κενό', async () => {
    const res = await createPost(baseFormValues({
      slug: 'to-arthro-mou',
      el: { ...EMPTY_LOCALE, title: 'Το άρθρο μου', body: 'Κείμενο.' },
    }))

    expect(res).toMatchObject({ ok: true })
    expect(store.posts).toHaveLength(1)
    const translations = store.translations.filter(t => t.postId === store.posts[0].id)
    expect(translations).toHaveLength(1)
    expect(translations[0]).toMatchObject({ locale: 'el', title: 'Το άρθρο μου', machineTranslated: false })
  })

  it('δημιουργεί ΚΑΙ en translation όταν υπάρχει τίτλος+κείμενο en', async () => {
    const res = await createPost(baseFormValues({
      slug: 'my-post',
      el: { ...EMPTY_LOCALE, title: 'Ελληνικός τίτλος', body: 'Ελληνικό κείμενο.' },
      en: { ...EMPTY_LOCALE, title: 'English title', body: 'English body.' },
      enMachineTranslated: true,
    }))

    expect(res).toMatchObject({ ok: true })
    const translations = store.translations.filter(t => t.postId === (res as { id: string }).id)
    expect(translations.map(t => t.locale).sort()).toEqual(['el', 'en'])
    expect(translations.find(t => t.locale === 'en')).toMatchObject({ title: 'English title', machineTranslated: true })
  })

  it('απορρίπτει όταν λείπει ο ελληνικός τίτλος/κείμενο (validation guard)', async () => {
    const res = await createPost(baseFormValues({ slug: 'x' }))

    expect(res.ok).toBe(false)
    expect(store.posts).toHaveLength(0)
  })

  it('λύνει σύγκρουση slug προσθέτοντας -2 όταν το slug υπάρχει ήδη', async () => {
    store.posts.push({
      id: 'existing', slug: 'karekla', status: 'DRAFT', categoryId: null, authorId: null, featuredImage: null, aiGenerated: false, publishedAt: null,
    })

    const res = await createPost(baseFormValues({
      slug: 'karekla',
      el: { ...EMPTY_LOCALE, title: 'Καρέκλα', body: 'Κείμενο.' },
    }))

    expect(res).toMatchObject({ ok: true })
    const created = store.posts.find(p => p.id === (res as { id: string }).id)!
    expect(created.slug).toBe('karekla-2')
  })
})

describe('deleteCategory', () => {
  it('αρνείται διαγραφή όταν η κατηγορία έχει άρθρα', async () => {
    store.categories.push({ id: 'cat-1', slug: 'tapetsaries', postCount: 3, nameEl: 'Ταπετσαρίες' })

    const res = await deleteCategory('cat-1')

    expect(res.ok).toBe(false)
    expect(store.categories).toHaveLength(1)
  })

  it('διαγράφει όταν η κατηγορία είναι άδεια', async () => {
    store.categories.push({ id: 'cat-2', slug: 'kourtines', postCount: 0, nameEl: 'Κουρτίνες' })

    const res = await deleteCategory('cat-2')

    expect(res).toMatchObject({ ok: true })
    expect(store.categories).toHaveLength(0)
  })
})

describe('generateArticleWithAI', () => {
  const generatedArticle = {
    title: 'Πώς να διαλέξετε ύφασμα',
    excerpt: 'Σύντομη περίληψη.',
    body: '## Οδηγός\nΠεριεχόμενο άρθρου.',
    seoTitle: 'SEO τίτλος',
    seoDescription: 'SEO περιγραφή άρθρου.',
  }

  it('δημιουργεί Post DRAFT aiGenerated με ΑΚΡΙΒΩΣ 2 translations (el πρωτότυπο + en machineTranslated)', async () => {
    deepseekChatMock.mockResolvedValueOnce(JSON.stringify(generatedArticle))

    const res = await generateArticleWithAI({ topic: 'Ύφασμα ταπετσαρίας', categoryId: null, tone: 'informative', length: 'short' })

    expect(res).toMatchObject({ ok: true })
    const postId = (res as { id: string }).id
    const post = store.posts.find(p => p.id === postId)!
    expect(post.status).toBe('DRAFT')
    expect(post.aiGenerated).toBe(true)

    const translations = store.translations.filter(t => t.postId === postId)
    expect(translations).toHaveLength(2)

    const el = translations.find(t => t.locale === 'el')!
    expect(el.title).toBe(generatedArticle.title)
    expect(el.machineTranslated).toBe(false)

    const en = translations.find(t => t.locale === 'en')!
    expect(en.machineTranslated).toBe(true)
    expect(en.title).toBe(`EN:${generatedArticle.title}`)
    expect(en.body).toBe(`EN:${generatedArticle.body}`)

    // 5 πεδία μεταφράστηκαν (title/excerpt/body/seoTitle/seoDescription), όλα el→en
    expect(translateTextMock).toHaveBeenCalledTimes(5)
    for (const call of translateTextMock.mock.calls) {
      expect(call[1]).toBe('el')
      expect(call[2]).toBe('en')
    }
  })

  it('δεν δημιουργεί άρθρο όταν το DeepSeek επιστρέφει μη έγκυρο JSON', async () => {
    deepseekChatMock.mockResolvedValueOnce('αυτό δεν είναι json')

    const res = await generateArticleWithAI({ topic: 'Θέμα', categoryId: null, tone: 'informative', length: 'short' })

    expect(res.ok).toBe(false)
    expect(store.posts).toHaveLength(0)
    expect(translateTextMock).not.toHaveBeenCalled()
  })

  it('απορρίπτει άδειο topic (validation guard) χωρίς να καλέσει το DeepSeek', async () => {
    const res = await generateArticleWithAI({ topic: '', categoryId: null, tone: 'informative', length: 'short' })

    expect(res.ok).toBe(false)
    expect(deepseekChatMock).not.toHaveBeenCalled()
  })
})
