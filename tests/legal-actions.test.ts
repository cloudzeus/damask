import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeTranslation = { id: string; pageId: string; locale: string; title: string; body: string; machineTranslated: boolean }
type FakePage = { id: string; slug: string; published: boolean }

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

const store: { pages: FakePage[]; translations: FakeTranslation[] } = { pages: [], translations: [] }

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['cms.view', 'cms.edit'], trdrId: null },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const getSettingMock = vi.fn()
const setSettingMock = vi.fn()
vi.mock('@/lib/settings', () => ({
  getSetting: (key: string) => getSettingMock(key),
  setSetting: (key: string, value: unknown) => setSettingMock(key, value),
  PUBLIC_CONSENT_CACHE_TAG: 'public-consent-config',
}))

// Bare arrow (χωρίς inline implementation) — ίδιος λόγος με το cms-posts-actions.test.ts:
// κρατά το inferred TArgs γενικό ώστε το .mock.calls[i][1] παρακάτω να μη σπάει το tsc.
const translateTextMock = vi.fn()
vi.mock('@/lib/deepseek', () => ({
  translateText: (text: unknown, from: unknown, to: unknown) => translateTextMock(text, from, to),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    legalPage: {
      findMany: vi.fn(async ({ where }: { where?: { slug?: { in: string[] } } } = {}) => {
        const slugs = where?.slug?.in
        return store.pages.filter(p => !slugs || slugs.includes(p.slug)).map(p => ({ slug: p.slug }))
      }),
      findFirst: vi.fn(async ({ where }: { where: { slug: string; id?: { not: string } } }) =>
        store.pages.find(p => p.slug === where.slug && (!where.id || p.id !== where.id.not)) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const page = store.pages.find(p => p.id === where.id)
        if (!page) return null
        return { ...page, translations: store.translations.filter(t => t.pageId === page.id && t.locale === 'el') }
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('page')
        const page: FakePage = { id, slug: data.slug as string, published: (data.published as boolean) ?? false }
        store.pages.push(page)
        const nested = data.translations as { create: Record<string, unknown>[] } | undefined
        for (const t of nested?.create ?? []) {
          store.translations.push({ id: nextId('tr'), pageId: id, ...t } as FakeTranslation)
        }
        return page
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const page = store.pages.find(p => p.id === where.id)!
        Object.assign(page, data)
        return page
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = store.pages.findIndex(p => p.id === where.id)
        const [removed] = store.pages.splice(idx, 1)
        return removed
      }),
    },
  },
}))

import {
  seedBasicLegalPages, createLegalPage, togglePublishLegalPage, deleteLegalPage, type LegalPageFormValues,
} from '@/app/(app)/cms/legal/actions'

const EMPTY_LOCALE = { title: '', body: '' }
const SEED_SLUGS = ['privacy-policy', 'terms', 'cookies', 'returns', 'shipping', 'gdpr-rights']

function baseFormValues(overrides: Partial<LegalPageFormValues> = {}): LegalPageFormValues {
  return {
    slug: '',
    published: false,
    el: { ...EMPTY_LOCALE },
    en: { ...EMPTY_LOCALE },
    enMachineTranslated: false,
    ...overrides,
  }
}

beforeEach(() => {
  store.pages = []
  store.translations = []
  getSettingMock.mockReset()
  getSettingMock.mockResolvedValue(null) // κανένα company.profile — τα seed pages πέφτουν στα placeholders
  setSettingMock.mockReset()
  translateTextMock.mockReset()
  translateTextMock.mockImplementation(async (text: string) => `EN:${text}`)
})

describe('seedBasicLegalPages (idempotent)', () => {
  it('πρώτη κλήση σε άδεια DB: δημιουργεί ΚΑΙ τις 6 βασικές σελίδες DRAFT', async () => {
    const res = await seedBasicLegalPages()

    expect(res).toMatchObject({ ok: true })
    expect(store.pages).toHaveLength(6)
    expect(store.pages.map(p => p.slug).sort()).toEqual([...SEED_SLUGS].sort())
    expect(store.pages.every(p => p.published === false)).toBe(true)

    // κάθε σελίδα έχει ακριβώς 1 el translation, ΟΧΙ lorem ipsum (πραγματικός τίτλος)
    for (const page of store.pages) {
      const translations = store.translations.filter(t => t.pageId === page.id)
      expect(translations).toHaveLength(1)
      expect(translations[0].locale).toBe('el')
      expect(translations[0].title.length).toBeGreaterThan(0)
      expect(translations[0].body).not.toMatch(/lorem ipsum/i)
    }
  })

  it('δεύτερη κλήση (όλα ήδη υπάρχουν): idempotent — δεν δημιουργεί διπλότυπα', async () => {
    await seedBasicLegalPages()
    expect(store.pages).toHaveLength(6)

    const res = await seedBasicLegalPages()

    expect(res).toMatchObject({ ok: true })
    expect(store.pages).toHaveLength(6) // ΟΧΙ 12
    expect(res.message).toMatch(/υπάρχουν ήδη/)
  })

  it('μερική κατάσταση: δημιουργεί ΜΟΝΟ τα slugs που λείπουν', async () => {
    store.pages.push({ id: 'existing-1', slug: 'privacy-policy', published: true })
    store.pages.push({ id: 'existing-2', slug: 'terms', published: false })

    const res = await seedBasicLegalPages()

    expect(res).toMatchObject({ ok: true })
    expect(store.pages).toHaveLength(6)
    // οι 2 προϋπάρχουσες ΔΕΝ ξαναγράφτηκαν (ίδιο published state, όχι reset)
    expect(store.pages.find(p => p.slug === 'privacy-policy')).toMatchObject({ id: 'existing-1', published: true })
    const newSlugs = SEED_SLUGS.filter(s => s !== 'privacy-policy' && s !== 'terms')
    for (const slug of newSlugs) {
      expect(store.pages.some(p => p.slug === slug)).toBe(true)
    }
  })

  it('χρησιμοποιεί το company.profile (όταν υπάρχει) αντί για placeholder στην επωνυμία', async () => {
    getSettingMock.mockResolvedValue({ name: 'Damask Α.Ε.', email: 'info@damask.gr' })

    await seedBasicLegalPages()

    const privacy = store.pages.find(p => p.slug === 'privacy-policy')!
    const translation = store.translations.find(t => t.pageId === privacy.id)!
    expect(translation.body).toContain('Damask Α.Ε.')
    expect(translation.body).toContain('info@damask.gr')
    expect(translation.body).not.toContain('[ΣΥΜΠΛΗΡΩΣΕ: επωνυμία εταιρείας]')
  })
})

describe('createLegalPage', () => {
  it('απορρίπτει όταν λείπει ο ελληνικός τίτλος/κείμενο', async () => {
    const res = await createLegalPage(baseFormValues({ slug: 'x' }))
    expect(res.ok).toBe(false)
    expect(store.pages).toHaveLength(0)
  })

  it('λύνει σύγκρουση slug προσθέτοντας -2', async () => {
    store.pages.push({ id: 'existing', slug: 'oroi-xrisis', published: false })

    const res = await createLegalPage(baseFormValues({
      slug: 'oroi-xrisis',
      el: { title: 'Όροι Χρήσης', body: 'Κείμενο.' },
    }))

    expect(res).toMatchObject({ ok: true })
    const created = store.pages.find(p => p.id === (res as { id: string }).id)!
    expect(created.slug).toBe('oroi-xrisis-2')
  })
})

describe('togglePublishLegalPage / deleteLegalPage', () => {
  it('toggle εναλλάσσει το published boolean', async () => {
    store.pages.push({ id: 'p1', slug: 'cookies', published: false })
    store.translations.push({ id: 't1', pageId: 'p1', locale: 'el', title: 'Πολιτική Cookies', body: 'x', machineTranslated: false })

    const res1 = await togglePublishLegalPage('p1')
    expect(res1).toMatchObject({ ok: true })
    expect(store.pages.find(p => p.id === 'p1')?.published).toBe(true)

    const res2 = await togglePublishLegalPage('p1')
    expect(res2).toMatchObject({ ok: true })
    expect(store.pages.find(p => p.id === 'p1')?.published).toBe(false)
  })

  it('delete αφαιρεί τη σελίδα', async () => {
    store.pages.push({ id: 'p2', slug: 'shipping', published: false })
    store.translations.push({ id: 't2', pageId: 'p2', locale: 'el', title: 'Τρόποι Αποστολής', body: 'x', machineTranslated: false })

    const res = await deleteLegalPage('p2')
    expect(res).toMatchObject({ ok: true })
    expect(store.pages).toHaveLength(0)
  })
})
