import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeProduct = {
  id: string
  code: string
  mtrl: number | null
  status: string
  priceWholesale: number | null
  priceRetail: number | null
  cbmPerUnit: number | null
  weightPerUnit: number | null
  stock: number | null
}
type FakeTranslation = { id: string; productId: string; locale: string; name: string }

const store: { products: FakeProduct[]; translations: FakeTranslation[] } = { products: [], translations: [] }

vi.mock('@/lib/prisma', () => {
  const db = {
    product: {
      findMany: vi.fn(async ({ where }: { where: { code: { in: string[] } } }) =>
        store.products.filter(p => where.code.in.includes(p.code)).map(p => ({ code: p.code })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) =>
        store.products.find(p => p.code === where.code) ?? null,
      ),
      upsert: vi.fn(async ({ where, create, update }: { where: { code: string }; create: Partial<FakeProduct>; update: Partial<FakeProduct> }) => {
        let p = store.products.find(x => x.code === where.code)
        if (!p) {
          p = { id: `p${store.products.length + 1}`, code: where.code, mtrl: null, status: 'DRAFT', priceWholesale: null, priceRetail: null, cbmPerUnit: null, weightPerUnit: null, stock: null, ...create }
          store.products.push(p)
        } else {
          // Πραγματική σημασιολογία Prisma: κλειδιά με τιμή `undefined` στο update
          // ΠΑΡΑΛΕΙΠΟΝΤΑΙ από το SQL UPDATE (δεν αγγίζουν τη στήλη) — αντίθετα από το
          // απλό Object.assign της JS που θα έγραφε κυριολεκτικά `undefined` πάνω
          // στην υπάρχουσα τιμή. Το mock αναπαράγει αυτή τη διαφορά επίτηδες,
          // γιατί ακριβώς αυτή τη συμπεριφορά ελέγχει το test "δεν σβήνει τιμή".
          const cleaned = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined))
          Object.assign(p, cleaned)
        }
        return { ...p }
      }),
    },
    productTranslation: {
      upsert: vi.fn(async ({ where, create, update }: {
        where: { productId_locale: { productId: string; locale: string } }
        create: Omit<FakeTranslation, 'id'>
        update: { name: string }
      }) => {
        const { productId, locale } = where.productId_locale
        let t = store.translations.find(x => x.productId === productId && x.locale === locale)
        if (!t) { t = { id: `t${store.translations.length + 1}`, ...create }; store.translations.push(t) }
        else Object.assign(t, update)
        return { ...t }
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
  }
  return { prisma: db }
})

import { validateProductChunk, runProductImport } from '@/lib/import/product-upsert'

beforeEach(() => {
  store.products = [
    { id: 'p0', code: 'EXISTING-1', mtrl: 42, status: 'PUBLISHED', priceWholesale: 10, priceRetail: 20, cbmPerUnit: 1, weightPerUnit: 2, stock: 5 },
  ]
  store.translations = [{ id: 't0', productId: 'p0', locale: 'el', name: 'Παλιό όνομα' }]
})

function row(rowNum: number, values: Record<string, string>) {
  return { rowNum, values }
}

describe('validateProductChunk()', () => {
  it('ταξινομεί νέο κωδικό ως δημιουργία και υπάρχοντα ως ενημέρωση', async () => {
    const res = await validateProductChunk([
      row(2, { code: 'NEW-1', name: 'Νέο προϊόν' }),
      row(3, { code: 'EXISTING-1', name: 'Ενημερωμένο όνομα' }),
    ])
    expect(res.toCreate).toBe(1)
    expect(res.toUpdate).toBe(1)
    expect(res.errors).toHaveLength(0)
  })

  it('δεν γράφει τίποτα στη βάση (dry-run)', async () => {
    await validateProductChunk([row(2, { code: 'DRYRUN-1', name: 'Δοκιμή' })])
    expect(store.products.some(p => p.code === 'DRYRUN-1')).toBe(false)
  })

  it('επιστρέφει field errors για μη έγκυρες γραμμές, χωρίς να τις μετράει', async () => {
    const res = await validateProductChunk([row(2, { code: '', name: 'Χωρίς κωδικό' })])
    expect(res.toCreate).toBe(0)
    expect(res.toUpdate).toBe(0)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].row).toBe(2)
  })

  it('εντοπίζει διπλότυπο κωδικό μέσα στο ίδιο chunk', async () => {
    const res = await validateProductChunk([
      row(2, { code: 'DUP-1', name: 'Πρώτη' }),
      row(3, { code: 'DUP-1', name: 'Δεύτερη' }),
    ])
    expect(res.toCreate).toBe(1)
    expect(res.errors.some(e => e.message.includes('Διπλότυπος κωδικός'))).toBe(true)
  })
})

describe('runProductImport()', () => {
  it('δημιουργεί νέο Product με mtrl=null, status=DRAFT, και μετάφραση el', async () => {
    const totals = await runProductImport([row(2, { code: 'CREATE-1', name: 'Καινούριο', priceRetail: '19,90' })])
    expect(totals.created).toBe(1)
    expect(totals.updated).toBe(0)
    expect(totals.failed).toBe(0)

    const p = store.products.find(x => x.code === 'CREATE-1')
    expect(p).toBeTruthy()
    expect(p?.mtrl).toBeNull()
    expect(p?.status).toBe('DRAFT')
    expect(p?.priceRetail).toBe(19.9)

    const t = store.translations.find(x => x.productId === p?.id && x.locale === 'el')
    expect(t?.name).toBe('Καινούριο')
  })

  it('δημιουργεί και μετάφραση en όταν δίνεται nameEn', async () => {
    await runProductImport([row(2, { code: 'CREATE-2', name: 'Ελληνικά', nameEn: 'English' })])
    const p = store.products.find(x => x.code === 'CREATE-2')
    const t = store.translations.find(x => x.productId === p?.id && x.locale === 'en')
    expect(t?.name).toBe('English')
  })

  it('δεν δημιουργεί μετάφραση en όταν δεν δίνεται nameEn', async () => {
    await runProductImport([row(2, { code: 'CREATE-3', name: 'Μόνο Ελληνικά' })])
    const p = store.products.find(x => x.code === 'CREATE-3')
    expect(store.translations.some(x => x.productId === p?.id && x.locale === 'en')).toBe(false)
  })

  it('ενημερώνει υπάρχον προϊόν χωρίς να αγγίζει το status', async () => {
    const totals = await runProductImport([row(2, { code: 'EXISTING-1', name: 'Ενημερωμένο', priceRetail: '25' })])
    expect(totals.updated).toBe(1)
    expect(totals.created).toBe(0)
    const p = store.products.find(x => x.code === 'EXISTING-1')
    expect(p?.status).toBe('PUBLISHED') // δεν υποβαθμίζεται
    expect(p?.priceRetail).toBe(25)
  })

  it('κενό αριθμητικό πεδίο σε ενημέρωση ΔΕΝ σβήνει την υπάρχουσα τιμή', async () => {
    await runProductImport([row(2, { code: 'EXISTING-1', name: 'Ενημέρωση χωρίς τιμή χονδρικής' })])
    const p = store.products.find(x => x.code === 'EXISTING-1')
    // priceWholesale ήταν 10 πριν· η γραμμή δεν έδωσε τιμή γι' αυτό το πεδίο.
    expect(p?.priceWholesale).toBe(10)
  })

  it('συνεχίζει τις υπόλοιπες γραμμές όταν μία γραμμή έχει σφάλμα', async () => {
    const totals = await runProductImport([
      row(2, { code: '', name: 'Άκυρη γραμμή' }),
      row(3, { code: 'VALID-1', name: 'Έγκυρη γραμμή' }),
    ])
    expect(totals.failed).toBe(1)
    expect(totals.created).toBe(1)
    expect(store.products.some(p => p.code === 'VALID-1')).toBe(true)
  })

  it('καλεί το onProgress callback μετά από κάθε chunk με τρέχοντα totals', async () => {
    const snapshots: number[] = []
    await runProductImport(
      [row(2, { code: 'PROG-1', name: 'Α' }), row(3, { code: 'PROG-2', name: 'Β' })],
      async totals => { snapshots.push(totals.processed) },
    )
    expect(snapshots).toEqual([2])
  })
})
