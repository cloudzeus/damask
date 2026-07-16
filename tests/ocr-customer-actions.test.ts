import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeCustomer = {
  id: string; trdr: number | null; name: string; afm: string | null
  email: string | null; phone: string | null; address: string | null; city: string | null; zip: string | null
}
type FakeContact = { id: string; customerId: string; name: string; email: string | null; phone: string | null }

const store: { customers: FakeCustomer[]; contacts: FakeContact[] } = { customers: [], contacts: [] }
let nextId = 1

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['customer.edit'], customerId: null },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(async ({ where }: { where: { afm: string } }) =>
        store.customers.find(c => c.afm === where.afm) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `cust-${nextId++}`
        const customer: FakeCustomer = {
          id,
          trdr: (data.trdr as number | null) ?? null,
          name: data.name as string,
          afm: (data.afm as string | null) ?? null,
          email: (data.email as string | null) ?? null,
          phone: (data.phone as string | null) ?? null,
          address: (data.address as string | null) ?? null,
          city: (data.city as string | null) ?? null,
          zip: (data.zip as string | null) ?? null,
        }
        store.customers.push(customer)
        const contactsCreate = (data.contacts as { create?: { name: string; email?: string; phone?: string }[] } | undefined)?.create
        if (contactsCreate) {
          for (const c of contactsCreate) {
            store.contacts.push({ id: `contact-${nextId++}`, customerId: id, name: c.name, email: c.email ?? null, phone: c.phone ?? null })
          }
        }
        return { ...customer }
      }),
    },
  },
}))

vi.mock('@/lib/aade', () => ({ aadeLookup: vi.fn() }))

import { createCustomerFromOcr, verifyIssuerAfm } from '@/lib/ocr/customer-actions'
import { aadeLookup } from '@/lib/aade'

beforeEach(() => {
  store.customers = []
  store.contacts = []
  nextId = 1
  vi.mocked(aadeLookup).mockReset()
})

describe('createCustomerFromOcr', () => {
  it('creates a Customer with trdr=null, first phone/email on the row, extras as Contact rows', async () => {
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
    const customer = store.customers.find(c => c.id === res.customerId)
    expect(customer).toBeDefined()
    expect(customer!.trdr).toBeNull()
    expect(customer!.name).toBe('Νέος Πελάτης ΑΕ')
    expect(customer!.afm).toBe('094014201')
    expect(customer!.phone).toBe('2101234567')
    expect(customer!.email).toBe('info@example.gr')

    // extra phone/email each become their own Contact row named «Από παραστατικό»
    expect(store.contacts).toHaveLength(2)
    expect(store.contacts.find(c => c.phone === '6971234567')).toBeDefined()
    expect(store.contacts.find(c => c.email === 'sales@example.gr')).toBeDefined()
    expect(store.contacts.every(c => c.name === 'Από παραστατικό')).toBe(true)
  })

  it('creates a customer with only a single phone/email and no extra Contact rows', async () => {
    const res = await createCustomerFromOcr({
      name: 'Μονό Στοιχείο',
      afm: '',
      phones: ['2101234567'],
      emails: ['a@b.gr'],
    })
    expect(res.ok).toBe(true)
    expect(store.contacts).toHaveLength(0)
  })

  it('rejects a duplicate ΑΦΜ with a friendly Greek message and points to the existing customer', async () => {
    store.customers.push({
      id: 'cust-existing', trdr: 555, name: 'Ήδη Υπάρχων', afm: '094014201',
      email: null, phone: null, address: null, city: null, zip: null,
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
    // no new customer created
    expect(store.customers).toHaveLength(1)
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
    expect(store.customers).toHaveLength(0)
  })

  it('rejects a blank name', async () => {
    const res = await createCustomerFromOcr({ name: '  ', afm: '', phones: [], emails: [] })
    expect(res.ok).toBe(false)
  })

  it('allows creation without an ΑΦΜ (skips the duplicate check)', async () => {
    const res = await createCustomerFromOcr({ name: 'Χωρίς ΑΦΜ', afm: '', phones: [], emails: [] })
    expect(res.ok).toBe(true)
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
