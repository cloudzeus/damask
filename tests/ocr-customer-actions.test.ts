import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeTrdr = {
  id: string; TRDR: number | null; NAME: string; AFM: string | null
  EMAIL: string | null; PHONE01: string | null; ADDRESS: string | null; CITY: string | null; ZIP: string | null
  SODTYPE: number; ISPROSP: number; IRSDATA: string | null; appNotes: string | null; WEBPAGE: string | null
}
type FakeContact = { id: string; trdrId: string; name: string; email: string | null; phone: string | null }
type FakeIrsdata = { IRSDATA: number; CODE: string | null; NAME: string }

const store: { trdrs: FakeTrdr[]; contacts: FakeContact[]; irsdata: FakeIrsdata[] } = { trdrs: [], contacts: [], irsdata: [] }
let nextId = 1

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['customer.edit'], trdrId: null },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trdr: {
      findFirst: vi.fn(async ({ where }: { where: { AFM: string } }) =>
        store.trdrs.find(t => t.AFM === where.AFM) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `trdr-${nextId++}`
        const trdr: FakeTrdr = {
          id,
          TRDR: (data.TRDR as number | null) ?? null,
          NAME: data.NAME as string,
          AFM: (data.AFM as string | null) ?? null,
          EMAIL: (data.EMAIL as string | null) ?? null,
          PHONE01: (data.PHONE01 as string | null) ?? null,
          ADDRESS: (data.ADDRESS as string | null) ?? null,
          CITY: (data.CITY as string | null) ?? null,
          ZIP: (data.ZIP as string | null) ?? null,
          SODTYPE: (data.SODTYPE as number | undefined) ?? 12,
          ISPROSP: (data.ISPROSP as number | undefined) ?? 0,
          IRSDATA: (data.IRSDATA as string | null) ?? null,
          appNotes: (data.appNotes as string | null) ?? null,
          WEBPAGE: (data.WEBPAGE as string | null) ?? null,
        }
        store.trdrs.push(trdr)
        const contactsCreate = (data.contacts as { create?: { name: string; email?: string; phone?: string }[] } | undefined)?.create
        if (contactsCreate) {
          for (const c of contactsCreate) {
            store.contacts.push({ id: `contact-${nextId++}`, trdrId: id, name: c.name, email: c.email ?? null, phone: c.phone ?? null })
          }
        }
        return { ...trdr }
      }),
    },
    irsdata: {
      findFirst: vi.fn(async ({ where }: { where: { NAME: { contains: string; mode: string } } }) =>
        store.irsdata.find(i => i.NAME.toLowerCase().includes(where.NAME.contains.toLowerCase())) ?? null,
      ),
    },
  },
}))

vi.mock('@/lib/aade', () => ({ aadeLookup: vi.fn() }))

import { createCustomerFromOcr, verifyIssuerAfm } from '@/lib/ocr/customer-actions'
import { aadeLookup } from '@/lib/aade'

beforeEach(() => {
  store.trdrs = []
  store.contacts = []
  store.irsdata = []
  nextId = 1
  vi.mocked(aadeLookup).mockReset()
})

describe('createCustomerFromOcr', () => {
  it('creates a Trdr with TRDR=null, first phone/email on the row, extras as Contact rows', async () => {
    const res = await createCustomerFromOcr({
      name: 'Νέος Πελάτης ΑΕ',
      afm: '094014201',
      address: 'Οδός 1',
      city: 'Αθήνα',
      zip: '10559',
      phones: ['2101234567', '6971234567'],
      emails: ['info@example.gr', 'sales@example.gr'],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    const trdr = store.trdrs.find(t => t.id === res.customerId)
    expect(trdr).toBeDefined()
    expect(trdr!.TRDR).toBeNull()
    expect(trdr!.NAME).toBe('Νέος Πελάτης ΑΕ')
    expect(trdr!.AFM).toBe('094014201')
    expect(trdr!.PHONE01).toBe('2101234567')
    expect(trdr!.EMAIL).toBe('info@example.gr')

    // extra phone/email each become their own Contact row named «Από παραστατικό»
    expect(store.contacts).toHaveLength(2)
    expect(store.contacts.find(c => c.phone === '6971234567')).toBeDefined()
    expect(store.contacts.find(c => c.email === 'sales@example.gr')).toBeDefined()
    expect(store.contacts.every(c => c.name === 'Από παραστατικό')).toBe(true)
  })

  it('creates a trdr with only a single phone/email and no extra Contact rows', async () => {
    const res = await createCustomerFromOcr({
      name: 'Μονό Στοιχείο',
      afm: '',
      phones: ['2101234567'],
      emails: ['a@b.gr'],
    })
    expect(res.ok).toBe(true)
    expect(store.contacts).toHaveLength(0)
  })

  it('rejects a duplicate ΑΦΜ with a friendly Greek message and points to the existing trdr', async () => {
    store.trdrs.push({
      id: 'cust-existing', TRDR: 555, NAME: 'Ήδη Υπάρχων', AFM: '094014201',
      EMAIL: null, PHONE01: null, ADDRESS: null, CITY: null, ZIP: null,
      SODTYPE: 12, ISPROSP: 0, IRSDATA: null, appNotes: null, WEBPAGE: null,
    })

    const res = await createCustomerFromOcr({
      name: 'Διπλότυπο', afm: '094014201', phones: [], emails: [],
    })

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.duplicate).toBe(true)
    if (!res.duplicate) return
    expect(res.customerId).toBe('cust-existing')
    expect(res.customerName).toBe('Ήδη Υπάρχων')
    expect(res.message).toMatch(/Υπάρχει ήδη καρτέλα/)
    // no new trdr created
    expect(store.trdrs).toHaveLength(1)
  })

  it('rejects an invalid ΑΦΜ (not 9 digits) with field errors, without hitting the DB', async () => {
    const res = await createCustomerFromOcr({
      name: 'Κακό ΑΦΜ', afm: '123', phones: [], emails: [],
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.duplicate).toBe(false)
    if (res.duplicate) return
    expect(res.fieldErrors?.afm).toBeDefined()
    expect(store.trdrs).toHaveLength(0)
  })

  it('rejects a blank name', async () => {
    const res = await createCustomerFromOcr({ name: '  ', afm: '', phones: [], emails: [] })
    expect(res.ok).toBe(false)
  })

  it('allows creation without an ΑΦΜ (skips the duplicate check)', async () => {
    const res = await createCustomerFromOcr({ name: 'Χωρίς ΑΦΜ', afm: '', phones: [], emails: [] })
    expect(res.ok).toBe(true)
  })

  it('defaults sodtype to 12 (Προμηθευτής) and always sets ISPROSP=0 when not given explicitly', async () => {
    const res = await createCustomerFromOcr({ name: 'Default Sodtype', afm: '', phones: [], emails: [] })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const trdr = store.trdrs.find(t => t.id === res.customerId)
    expect(trdr?.SODTYPE).toBe(12)
    expect(trdr?.ISPROSP).toBe(0)
  })

  it('persists sodtype=13 (Πελάτης) and website when the panel toggle overrides them; doy without a mirror match goes to appNotes', async () => {
    const res = await createCustomerFromOcr({
      name: 'Πελάτης Από OCR', afm: '', sodtype: 13, doy: 'Δ.Ο.Υ. Αθηνών', website: 'https://example.gr',
      phones: [], emails: [],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const trdr = store.trdrs.find(t => t.id === res.customerId)
    expect(trdr?.SODTYPE).toBe(13)
    expect(trdr?.IRSDATA).toBeNull()
    expect(trdr?.appNotes).toMatch(/Δ.Ο.Υ. Αθηνών/)
    expect(trdr?.WEBPAGE).toBe('https://example.gr')
  })

  it('resolves doy to Irsdata.CODE when a mirror match is found by NAME', async () => {
    store.irsdata.push({ IRSDATA: 1, CODE: '1120', NAME: 'Δ.Ο.Υ. Αθηνών' })
    const res = await createCustomerFromOcr({
      name: 'Με ΔΟΥ Match', afm: '', doy: 'Δ.Ο.Υ. Αθηνών', phones: [], emails: [],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const trdr = store.trdrs.find(t => t.id === res.customerId)
    expect(trdr?.IRSDATA).toBe('1120')
    expect(trdr?.appNotes).toBeNull()
  })
})

describe('verifyIssuerAfm', () => {
  it('rejects a malformed ΑΦΜ before calling aadeLookup', async () => {
    const res = await verifyIssuerAfm('123')
    expect(res.ok).toBe(false)
    expect(aadeLookup).not.toHaveBeenCalled()
  })

  it('reports found=true with the company when aadeLookup resolves', async () => {
    vi.mocked(aadeLookup).mockResolvedValueOnce({
      afm: '094014201', name: 'ΕΘΝΙΚΗ ΤΡΑΠΕΖΑ', shortName: null, doy: 'Δ.Ο.Υ.', legalForm: 'ΑΕ',
      address: 'Αιόλου 86', zip: '10559', city: 'Αθήνα', country: 'GR', foundingDate: null,
      profession: 'Τράπεζα', activities: [], aadeStatus: 'ΕΝΕΡΓΟΣ ΑΦΜ', isActive: true,
    })
    const res = await verifyIssuerAfm('094014201')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.found).toBe(true)
  })

  it('reports found=false when aadeLookup returns null (not in the registry)', async () => {
    vi.mocked(aadeLookup).mockResolvedValueOnce(null)
    const res = await verifyIssuerAfm('999999999')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.found).toBe(false)
  })

  it('surfaces the Greek AadeLookupError message on failure', async () => {
    vi.mocked(aadeLookup).mockRejectedValueOnce(new Error('Αδυναμία σύνδεσης με την υπηρεσία ΑΑΔΕ.'))
    const res = await verifyIssuerAfm('094014201')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.message).toMatch(/ΑΑΔΕ/)
  })
})
