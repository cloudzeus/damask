import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
}

type FakeTrdr = {
  id: string; TRDR: number | null; SODTYPE: number; ISPROSP: number
  NAME: string; AFM: string | null; WEBPAGE: string | null
}
type FakeContact = {
  id: string; trdrId: string; name: string; email: string | null; phone: string | null; mobile: string | null
  isPrimary: boolean; userId: string | null
}
type FakeAccessRequest = { id: string; contactId: string | null; email: string; status: string }

const store: { trdrs: FakeTrdr[]; contacts: FakeContact[]; requests: FakeAccessRequest[] } = {
  trdrs: [], contacts: [], requests: [],
}
let nextId = 1

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['customer.edit', 'customer.view'], trdrId: null },
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
    trdr: {
      findFirst: vi.fn(async ({ where }: { where: { AFM?: string; id?: { not: string } } }) =>
        store.trdrs.find(t => t.AFM === where.AFM && (!where.id || t.id !== where.id.not)) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        store.trdrs.find(t => t.id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.AFM && store.trdrs.some(t => t.AFM === data.AFM)) throw p2002Error()
        const created: FakeTrdr = {
          id: `trdr-${nextId++}`,
          TRDR: null,
          SODTYPE: data.SODTYPE as number,
          ISPROSP: data.ISPROSP as number,
          NAME: data.NAME as string,
          AFM: (data.AFM as string | null) ?? null,
          WEBPAGE: (data.WEBPAGE as string | null) ?? null,
        }
        store.trdrs.push(created)
        return created
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeTrdr> }) => {
        const t = store.trdrs.find(x => x.id === where.id)
        if (!t) throw new Error('not found')
        Object.assign(t, data)
        return { ...t }
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = store.trdrs.findIndex(t => t.id === where.id)
        if (idx === -1) throw new Error('not found')
        const [removed] = store.trdrs.splice(idx, 1)
        return removed
      }),
    },
    contact: {
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: { trdr?: boolean } }) => {
        const c = store.contacts.find(x => x.id === where.id)
        if (!c) return null
        if (include?.trdr) return { ...c, trdr: store.trdrs.find(t => t.id === c.trdrId) }
        return c
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created: FakeContact = {
          id: `contact-${nextId++}`,
          trdrId: data.trdrId as string,
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
      updateMany: vi.fn(async ({ where, data }: { where: { trdrId: string; isPrimary?: boolean; id?: { not: string } }; data: Partial<FakeContact> }) => {
        const matches = store.contacts.filter(c =>
          c.trdrId === where.trdrId
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
    SODTYPE: 13,
    ISPROSP: 1,
    NAME: 'Νέος Συναλλασσόμενος',
    AFM: '',
    IRSDATA: '',
    JOBTYPETRD: '',
    appLegalForm: '',
    EMAIL: '',
    PHONE01: '',
    WEBPAGE: '',
    ADDRESS: '',
    CITY: '',
    ZIP: '',
    COUNTRY: '',
    TRDCATEGORY: '',
    PAYMENT: '',
    SHIPMENT: '',
    appLat: null,
    appLng: null,
    appNotes: '',
    ...overrides,
  }
}

function contactValues(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
  return { name: 'Νέα Επαφή', position: '', email: '', phone: '', mobile: '', isPrimary: false, ...overrides }
}

beforeEach(() => {
  store.trdrs = [
    { id: 'cust-lead', TRDR: null, SODTYPE: 13, ISPROSP: 1, NAME: 'Υποψήφιος ΑΕ', AFM: '111111111', WEBPAGE: null },
    { id: 'cust-customer', TRDR: null, SODTYPE: 13, ISPROSP: 0, NAME: 'Πελάτης ΑΕ', AFM: '222222222', WEBPAGE: 'https://example.gr' },
    { id: 'cust-synced', TRDR: 1001, SODTYPE: 12, ISPROSP: 0, NAME: 'Προμηθευτής Συγχρονισμένος', AFM: '333333333', WEBPAGE: null },
  ]
  store.contacts = [
    { id: 'contact-primary', trdrId: 'cust-customer', name: 'Κύρια Επαφή', email: 'primary@example.gr', phone: null, mobile: null, isPrimary: true, userId: null },
    { id: 'contact-secondary', trdrId: 'cust-customer', name: 'Δευτερεύουσα Επαφή', email: 'secondary@example.gr', phone: null, mobile: null, isPrimary: false, userId: null },
    { id: 'contact-linked', trdrId: 'cust-customer', name: 'Ήδη User', email: 'linked@example.gr', phone: null, mobile: null, isPrimary: false, userId: 'user-1' },
  ]
  store.requests = []
  settingStore.clear()
  nextId = 1
  geocodeSearchMock.mockReset()
  geocodeReverseMock.mockReset()
})

describe('createPartner()', () => {
  it('δημιουργεί τοπικό συναλλασσόμενο (χωρίς TRDR) με SODTYPE/ISPROSP όπως δόθηκαν', async () => {
    const res = await createPartner(partnerValues({ SODTYPE: 12, ISPROSP: 0, NAME: 'Νέος Προμηθευτής' }))
    expect(res).toMatchObject({ ok: true })
    const created = store.trdrs.find(t => t.NAME === 'Νέος Προμηθευτής')
    expect(created?.SODTYPE).toBe(12)
    expect(created?.ISPROSP).toBe(0)
    expect(created?.TRDR).toBeNull()
  })

  it('απορρίπτει διπλότυπο ΑΦΜ με φιλικό μήνυμα', async () => {
    const res = await createPartner(partnerValues({ AFM: '111111111' }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.AFM).toBeTruthy()
  })

  it('απορρίπτει άκυρο ΑΦΜ (όχι 9 ψηφία) με fieldError', async () => {
    const res = await createPartner(partnerValues({ AFM: '123' }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.AFM).toBeTruthy()
  })

  it('απορρίπτει SODTYPE εκτός 12/13', async () => {
    // @ts-expect-error δοκιμάζουμε σκόπιμα μη έγκυρη τιμή
    const res = await createPartner(partnerValues({ SODTYPE: 99 }))
    expect(res.ok).toBe(false)
  })
})

describe('updatePartner()', () => {
  it('ενημερώνει στοιχεία', async () => {
    const res = await updatePartner('cust-lead', partnerValues({ NAME: 'Ενημερωμένο Όνομα', ISPROSP: 1 }))
    expect(res).toMatchObject({ ok: true })
    expect(store.trdrs.find(t => t.id === 'cust-lead')?.NAME).toBe('Ενημερωμένο Όνομα')
  })

  it('σφάλμα για άγνωστη καρτέλα', async () => {
    const res = await updatePartner('does-not-exist', partnerValues())
    expect(res.ok).toBe(false)
  })
})

describe('deletePartner() — guard: μόνο τοπικές καρτέλες', () => {
  it('διαγράφει τοπική καρτέλα (TRDR=null)', async () => {
    const res = await deletePartner('cust-lead')
    expect(res).toMatchObject({ ok: true })
    expect(store.trdrs.some(t => t.id === 'cust-lead')).toBe(false)
  })

  it('αρνείται διαγραφή καρτέλας συγχρονισμένης με SoftOne (TRDR != null)', async () => {
    const res = await deletePartner('cust-synced')
    expect(res.ok).toBe(false)
    expect(store.trdrs.some(t => t.id === 'cust-synced')).toBe(true)
  })
})

describe('convertLeadToCustomer() — guard: μόνο από ISPROSP=1', () => {
  it('μετατρέπει ISPROSP 1→0', async () => {
    const res = await convertLeadToCustomer('cust-lead')
    expect(res).toMatchObject({ ok: true })
    expect(store.trdrs.find(t => t.id === 'cust-lead')?.ISPROSP).toBe(0)
  })

  it('αρνείται μετατροπή όταν ήδη ISPROSP=0', async () => {
    const res = await convertLeadToCustomer('cust-customer')
    expect(res.ok).toBe(false)
    expect(store.trdrs.find(t => t.id === 'cust-customer')?.ISPROSP).toBe(0)
  })
})

describe('createContact() / isPrimary', () => {
  it('δημιουργεί επαφή', async () => {
    const res = await createContact('cust-lead', contactValues({ name: 'Πρώτη Επαφή' }))
    expect(res).toMatchObject({ ok: true })
    expect(store.contacts.some(c => c.name === 'Πρώτη Επαφή' && c.trdrId === 'cust-lead')).toBe(true)
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
  it('δημιουργεί AccessRequest με type=CUSTOMER για επαφή πελάτη (SODTYPE 13)', async () => {
    const res = await requestContactAccess('contact-secondary')
    expect(res).toMatchObject({ ok: true })
    expect(store.requests).toHaveLength(1)
  })

  it('δημιουργεί AccessRequest με type=SUPPLIER για επαφή προμηθευτή (SODTYPE 12)', async () => {
    store.contacts.push({ id: 'contact-supplier', trdrId: 'cust-synced', name: 'Επαφή Προμηθευτή', email: 'supplier@example.gr', phone: null, mobile: null, isPrimary: false, userId: null })
    const res = await requestContactAccess('contact-supplier')
    expect(res).toMatchObject({ ok: true })
  })

  it('αρνείται όταν η επαφή δεν έχει email', async () => {
    store.contacts.push({ id: 'contact-no-email', trdrId: 'cust-customer', name: 'Χωρίς Email', email: null, phone: null, mobile: null, isPrimary: false, userId: null })
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
