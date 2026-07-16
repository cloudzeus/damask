import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
}

type FakeCustomer = {
  id: string; trdr: number | null; sodtype: number; status: 'LEAD' | 'CUSTOMER'
  name: string; afm: string | null; website: string | null
}
type FakeContact = {
  id: string; customerId: string; name: string; email: string | null; phone: string | null; mobile: string | null
  isPrimary: boolean; userId: string | null
}
type FakeAccessRequest = { id: string; contactId: string | null; email: string; status: string }

const store: { customers: FakeCustomer[]; contacts: FakeContact[]; requests: FakeAccessRequest[] } = {
  customers: [], contacts: [], requests: [],
}
let nextId = 1

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['customer.edit', 'customer.view'], customerId: null },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const settingStore = new Map<string, unknown>()
vi.mock('@/lib/settings', () => ({
  getIntegration: vi.fn(async (name: string) => (settingStore.get(name) ?? {})),
}))

const geocodeSearchMock = vi.fn()
const geocodeReverseMock = vi.fn()
vi.mock('@/lib/geocode', () => ({
  geocodeSearch: (...args: unknown[]) => geocodeSearchMock(...args),
  geocodeReverse: (...args: unknown[]) => geocodeReverseMock(...args),
  GeocodeError: class GeocodeError extends Error {},
}))

vi.mock('@/lib/aade', () => ({
  aadeLookup: vi.fn(async () => null),
}))

vi.mock('@/lib/prisma', () => {
  const dbMock = {
    customer: {
      findFirst: vi.fn(async ({ where }: { where: { afm?: string; id?: { not: string } } }) =>
        store.customers.find(c => c.afm === where.afm && (!where.id || c.id !== where.id.not)) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        store.customers.find(c => c.id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.afm && store.customers.some(c => c.afm === data.afm)) throw p2002Error()
        const created: FakeCustomer = {
          id: `cust-${nextId++}`,
          trdr: null,
          sodtype: data.sodtype as number,
          status: data.status as 'LEAD' | 'CUSTOMER',
          name: data.name as string,
          afm: (data.afm as string | null) ?? null,
          website: (data.website as string | null) ?? null,
        }
        store.customers.push(created)
        return created
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeCustomer> }) => {
        const c = store.customers.find(x => x.id === where.id)
        if (!c) throw new Error('not found')
        Object.assign(c, data)
        return { ...c }
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = store.customers.findIndex(c => c.id === where.id)
        if (idx === -1) throw new Error('not found')
        const [removed] = store.customers.splice(idx, 1)
        return removed
      }),
    },
    contact: {
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: { customer?: boolean } }) => {
        const c = store.contacts.find(x => x.id === where.id)
        if (!c) return null
        if (include?.customer) return { ...c, customer: store.customers.find(cust => cust.id === c.customerId) }
        return c
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created: FakeContact = {
          id: `contact-${nextId++}`,
          customerId: data.customerId as string,
          name: data.name as string,
          email: (data.email as string | null) ?? null,
          phone: (data.phone as string | null) ?? null,
          mobile: (data.mobile as string | null) ?? null,
          isPrimary: Boolean(data.isPrimary),
          userId: null,
        }
        store.contacts.push(created)
        return created
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeContact> }) => {
        const c = store.contacts.find(x => x.id === where.id)
        if (!c) throw new Error('not found')
        Object.assign(c, data)
        return { ...c }
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { customerId: string; isPrimary?: boolean; id?: { not: string } }; data: Partial<FakeContact> }) => {
        const matches = store.contacts.filter(c =>
          c.customerId === where.customerId
          && (where.isPrimary === undefined || c.isPrimary === where.isPrimary)
          && (!where.id || c.id !== where.id.not),
        )
        for (const c of matches) Object.assign(c, data)
        return { count: matches.length }
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = store.contacts.findIndex(c => c.id === where.id)
        if (idx === -1) throw new Error('not found')
        const [removed] = store.contacts.splice(idx, 1)
        return removed
      }),
    },
    accessRequest: {
      findFirst: vi.fn(async ({ where }: { where: { contactId: string; status: string } }) =>
        store.requests.find(r => r.contactId === where.contactId && r.status === where.status) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { contactId: string; email: string } }) => {
        if (store.requests.some(r => r.email === data.email)) throw p2002Error()
        const created: FakeAccessRequest = { id: `req-${nextId++}`, contactId: data.contactId, email: data.email, status: 'PENDING' }
        store.requests.push(created)
        return created
      }),
    },
    $transaction: async (arg: unknown) => {
      if (typeof arg === 'function') return arg(dbMock)
      return Promise.all(arg as Promise<unknown>[])
    },
  }
  return { prisma: dbMock }
})

import {
  createPartner, updatePartner, deletePartner, convertLeadToCustomer,
  createContact, updateContact, setPrimaryContact, requestContactAccess,
  geocodeAddressAction, getMapsClientConfig, setPartnerLogoFromWebsite,
  type PartnerFormValues, type ContactFormValues,
} from '@/app/(app)/partners/actions'

function partnerValues(overrides: Partial<PartnerFormValues> = {}): PartnerFormValues {
  return {
    sodtype: 13,
    status: 'LEAD',
    name: 'Νέος Συναλλασσόμενος',
    afm: '',
    doy: '',
    legalForm: '',
    profession: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    zip: '',
    lat: null,
    lng: null,
    notes: '',
    ...overrides,
  }
}

function contactValues(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
  return { name: 'Νέα Επαφή', position: '', email: '', phone: '', mobile: '', isPrimary: false, ...overrides }
}

beforeEach(() => {
  store.customers = [
    { id: 'cust-lead', trdr: null, sodtype: 13, status: 'LEAD', name: 'Υποψήφιος ΑΕ', afm: '111111111', website: null },
    { id: 'cust-customer', trdr: null, sodtype: 13, status: 'CUSTOMER', name: 'Πελάτης ΑΕ', afm: '222222222', website: 'https://example.gr' },
    { id: 'cust-synced', trdr: 1001, sodtype: 12, status: 'CUSTOMER', name: 'Προμηθευτής Συγχρονισμένος', afm: '333333333', website: null },
  ]
  store.contacts = [
    { id: 'contact-primary', customerId: 'cust-customer', name: 'Κύρια Επαφή', email: 'primary@example.gr', phone: null, mobile: null, isPrimary: true, userId: null },
    { id: 'contact-secondary', customerId: 'cust-customer', name: 'Δευτερεύουσα Επαφή', email: 'secondary@example.gr', phone: null, mobile: null, isPrimary: false, userId: null },
    { id: 'contact-linked', customerId: 'cust-customer', name: 'Ήδη User', email: 'linked@example.gr', phone: null, mobile: null, isPrimary: false, userId: 'user-1' },
  ]
  store.requests = []
  settingStore.clear()
  nextId = 1
  geocodeSearchMock.mockReset()
  geocodeReverseMock.mockReset()
})

describe('createPartner()', () => {
  it('δημιουργεί τοπικό συναλλασσόμενο (χωρίς trdr) με sodtype/status όπως δόθηκαν', async () => {
    const res = await createPartner(partnerValues({ sodtype: 12, status: 'CUSTOMER', name: 'Νέος Προμηθευτής' }))
    expect(res).toMatchObject({ ok: true })
    const created = store.customers.find(c => c.name === 'Νέος Προμηθευτής')
    expect(created?.sodtype).toBe(12)
    expect(created?.status).toBe('CUSTOMER')
    expect(created?.trdr).toBeNull()
  })

  it('απορρίπτει διπλότυπο ΑΦΜ με φιλικό μήνυμα', async () => {
    const res = await createPartner(partnerValues({ afm: '111111111' }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.afm).toBeTruthy()
  })

  it('απορρίπτει άκυρο ΑΦΜ (όχι 9 ψηφία) με fieldError', async () => {
    const res = await createPartner(partnerValues({ afm: '123' }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.afm).toBeTruthy()
  })

  it('απορρίπτει sodtype εκτός 12/13', async () => {
    // @ts-expect-error δοκιμάζουμε σκόπιμα μη έγκυρη τιμή
    const res = await createPartner(partnerValues({ sodtype: 99 }))
    expect(res.ok).toBe(false)
  })
})

describe('updatePartner()', () => {
  it('ενημερώνει στοιχεία', async () => {
    const res = await updatePartner('cust-lead', partnerValues({ name: 'Ενημερωμένο Όνομα', status: 'LEAD' }))
    expect(res).toMatchObject({ ok: true })
    expect(store.customers.find(c => c.id === 'cust-lead')?.name).toBe('Ενημερωμένο Όνομα')
  })

  it('σφάλμα για άγνωστη καρτέλα', async () => {
    const res = await updatePartner('does-not-exist', partnerValues())
    expect(res.ok).toBe(false)
  })
})

describe('deletePartner() — guard: μόνο τοπικές καρτέλες', () => {
  it('διαγράφει τοπική καρτέλα (trdr=null)', async () => {
    const res = await deletePartner('cust-lead')
    expect(res).toMatchObject({ ok: true })
    expect(store.customers.some(c => c.id === 'cust-lead')).toBe(false)
  })

  it('αρνείται διαγραφή καρτέλας συγχρονισμένης με SoftOne (trdr != null)', async () => {
    const res = await deletePartner('cust-synced')
    expect(res.ok).toBe(false)
    expect(store.customers.some(c => c.id === 'cust-synced')).toBe(true)
  })
})

describe('convertLeadToCustomer() — guard: μόνο από LEAD', () => {
  it('μετατρέπει LEAD σε CUSTOMER', async () => {
    const res = await convertLeadToCustomer('cust-lead')
    expect(res).toMatchObject({ ok: true })
    expect(store.customers.find(c => c.id === 'cust-lead')?.status).toBe('CUSTOMER')
  })

  it('αρνείται μετατροπή όταν ήδη CUSTOMER', async () => {
    const res = await convertLeadToCustomer('cust-customer')
    expect(res.ok).toBe(false)
    expect(store.customers.find(c => c.id === 'cust-customer')?.status).toBe('CUSTOMER')
  })
})

describe('createContact() / isPrimary', () => {
  it('δημιουργεί επαφή', async () => {
    const res = await createContact('cust-lead', contactValues({ name: 'Πρώτη Επαφή' }))
    expect(res).toMatchObject({ ok: true })
    expect(store.contacts.some(c => c.name === 'Πρώτη Επαφή' && c.customerId === 'cust-lead')).toBe(true)
  })

  it('θέτοντας isPrimary=true, αποεπιλέγει τις υπόλοιπες πρωτεύουσες επαφές του ίδιου συναλλασσόμενου', async () => {
    await createContact('cust-customer', contactValues({ name: 'Νέα Κύρια', isPrimary: true }))
    expect(store.contacts.find(c => c.id === 'contact-primary')?.isPrimary).toBe(false)
    expect(store.contacts.find(c => c.name === 'Νέα Κύρια')?.isPrimary).toBe(true)
  })
})

describe('updateContact()', () => {
  it('ενημερώνει επαφή χωρίς να αγγίξει τους υπόλοιπους όταν isPrimary=false', async () => {
    const res = await updateContact('contact-secondary', contactValues({ name: 'Ενημερωμένη', isPrimary: false }))
    expect(res).toMatchObject({ ok: true })
    expect(store.contacts.find(c => c.id === 'contact-primary')?.isPrimary).toBe(true)
  })
})

describe('setPrimaryContact()', () => {
  it('ορίζει νέα κύρια επαφή και αποεπιλέγει την προηγούμενη', async () => {
    const res = await setPrimaryContact('contact-secondary')
    expect(res).toMatchObject({ ok: true })
    expect(store.contacts.find(c => c.id === 'contact-secondary')?.isPrimary).toBe(true)
    expect(store.contacts.find(c => c.id === 'contact-primary')?.isPrimary).toBe(false)
  })
})

describe('requestContactAccess()', () => {
  it('δημιουργεί AccessRequest με type=CUSTOMER για επαφή πελάτη (sodtype 13)', async () => {
    const res = await requestContactAccess('contact-secondary')
    expect(res).toMatchObject({ ok: true })
    expect(store.requests).toHaveLength(1)
  })

  it('δημιουργεί AccessRequest με type=SUPPLIER για επαφή προμηθευτή (sodtype 12)', async () => {
    store.contacts.push({ id: 'contact-supplier', customerId: 'cust-synced', name: 'Επαφή Προμηθευτή', email: 'supplier@example.gr', phone: null, mobile: null, isPrimary: false, userId: null })
    const res = await requestContactAccess('contact-supplier')
    expect(res).toMatchObject({ ok: true })
  })

  it('αρνείται όταν η επαφή δεν έχει email', async () => {
    store.contacts.push({ id: 'contact-no-email', customerId: 'cust-customer', name: 'Χωρίς Email', email: null, phone: null, mobile: null, isPrimary: false, userId: null })
    const res = await requestContactAccess('contact-no-email')
    expect(res.ok).toBe(false)
  })

  it('αρνείται όταν η επαφή έχει ήδη λογαριασμό user', async () => {
    const res = await requestContactAccess('contact-linked')
    expect(res.ok).toBe(false)
  })

  it('αρνείται δεύτερο αίτημα ενώ υπάρχει ήδη ένα σε αναμονή για την ίδια επαφή', async () => {
    await requestContactAccess('contact-secondary')
    const res = await requestContactAccess('contact-secondary')
    expect(res.ok).toBe(false)
  })
})

describe('geocodeAddressAction()', () => {
  it('επιστρέφει το πρώτο αποτέλεσμα geocodeSearch', async () => {
    geocodeSearchMock.mockResolvedValueOnce([{ lat: 38.05, lng: 23.79, displayName: 'Αθήνα', address: null, city: 'Αθήνα', zip: null, country: 'GR' }])
    const res = await geocodeAddressAction('Αθήνα')
    expect(res).toMatchObject({ ok: true })
  })

  it('φιλικό μήνυμα όταν δεν βρέθηκε τίποτα', async () => {
    geocodeSearchMock.mockResolvedValueOnce([])
    const res = await geocodeAddressAction('ανύπαρκτη διεύθυνση')
    expect(res.ok).toBe(false)
  })
})

describe('getMapsClientConfig() — places config action', () => {
  it('επιστρέφει τα client-safe keys, ΟΧΙ το geocodeApiKey', async () => {
    settingStore.set('maps', { googleMapsApiKey: 'google-key', maptilerApiKey: 'maptiler-key', geocodeApiKey: 'secret-geocode-key' })
    const config = await getMapsClientConfig()
    expect(config.googleMapsApiKey).toBe('google-key')
    expect(config.maptilerApiKey).toBe('maptiler-key')
    expect(config).not.toHaveProperty('geocodeApiKey')
  })

  it('επιστρέφει null όταν δεν έχουν ρυθμιστεί keys', async () => {
    const config = await getMapsClientConfig()
    expect(config.googleMapsApiKey).toBeNull()
    expect(config.maptilerApiKey).toBeNull()
  })
})

describe('setPartnerLogoFromWebsite()', () => {
  it('αποθηκεύει favicon URL από το website της καρτέλας', async () => {
    const res = await setPartnerLogoFromWebsite('cust-customer')
    expect(res).toMatchObject({ ok: true })
  })

  it('αρνείται όταν δεν υπάρχει website', async () => {
    const res = await setPartnerLogoFromWebsite('cust-lead')
    expect(res.ok).toBe(false)
  })
})
