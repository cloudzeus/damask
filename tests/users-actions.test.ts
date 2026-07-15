import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

/**
 * Πραγματικό PrismaClientKnownRequestError (όχι plain Error+code) — τα actions
 * κάνουν `e instanceof Prisma.PrismaClientKnownRequestError`, οπότε το mock
 * πρέπει να πετάει πραγματικό instance για να πιάνεται σωστά το catch.
 */
function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

type FakeUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  active: boolean
  roleId: string
  phone?: string | null
  mobile?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
}
type FakeRole = { id: string; name: string }
type FakeAccessRequest = {
  id: string
  type: string
  name: string
  company: string
  afm: string
  phone: string
  email: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
}

const store: { users: FakeUser[]; roles: FakeRole[]; requests: FakeAccessRequest[] } = {
  users: [],
  roles: [],
  requests: [],
}

const CURRENT_USER_ID = 'admin-1'

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: CURRENT_USER_ID, role: 'ADMIN', permissions: ['user.manage'], customerId: null },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        store.users.find(u => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const user = store.users.find(u => u.id === where.id)
        if (!user) throw new Error('not found')
        if (data.email && store.users.some(u => u.id !== where.id && u.email === data.email)) {
          throw p2002Error()
        }
        Object.assign(user, data)
        return { ...user }
      }),
      create: vi.fn(async ({ data }: { data: Omit<FakeUser, 'id'> }) => {
        if (store.users.some(u => u.email === data.email)) {
          throw p2002Error()
        }
        const created: FakeUser = { id: `u${store.users.length + 1}`, ...data }
        store.users.push(created)
        return created
      }),
    },
    role: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; name?: string } }) =>
        store.roles.find(r => (where.id ? r.id === where.id : r.name === where.name)) ?? null,
      ),
    },
    accessRequest: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        store.requests.find(r => r.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeAccessRequest> }) => {
        const request = store.requests.find(r => r.id === where.id)
        if (!request) throw new Error('not found')
        Object.assign(request, data)
        return { ...request }
      }),
    },
  },
}))

import {
  toggleUserActive, changeUserRole, approveAccessRequest, rejectAccessRequest,
  createUser, updateUser, type UserFormValues,
} from '@/app/(app)/users/actions'

function formValues(overrides: Partial<UserFormValues> = {}): UserFormValues {
  return {
    name: 'Νέος Χρήστης',
    email: 'new.user@damask.gr',
    roleId: 'role-sales',
    password: 'StrongPass123',
    phone: '2101234567',
    mobile: '6912345678',
    address: 'Λεωφόρος Δοκιμής 1',
    city: 'Αθήνα',
    country: 'Ελλάδα',
    active: true,
    ...overrides,
  }
}

beforeEach(() => {
  store.users = [
    { id: CURRENT_USER_ID, email: 'admin@damask.gr', name: 'Admin', passwordHash: 'x', active: true, roleId: 'role-admin' },
    { id: 'u2', email: 'sales@damask.gr', name: 'Νίκος Πωλητής', passwordHash: 'x', active: true, roleId: 'role-sales' },
    { id: 'u3', email: 'inactive@damask.gr', name: 'Ανενεργός Χρήστης', passwordHash: 'x', active: false, roleId: 'role-sales' },
  ]
  store.roles = [
    { id: 'role-admin', name: 'ADMIN' },
    { id: 'role-sales', name: 'SALESMAN' },
    { id: 'role-architect', name: 'ARCHITECT' },
    { id: 'role-customer', name: 'CUSTOMER' },
    { id: 'role-supplier', name: 'SUPPLIER' },
  ]
  store.requests = [
    { id: 'req-1', type: 'CUSTOMER', name: 'Νίκος Σταύρου', company: 'Interior Concept', afm: '123456789', phone: '2101234567', email: 'nikos@interior.gr', status: 'PENDING' },
    { id: 'req-2', type: 'ARCHITECT', name: 'Μαρία Παπαδάκη', company: 'Atelier Nord', afm: '987654321', phone: '2109876543', email: 'maria@atelier.gr', status: 'PENDING' },
    { id: 'req-3', type: 'CUSTOMER', name: 'Ήδη εγκεκριμένος', company: 'X', afm: '111111111', phone: '210', email: 'approved@x.gr', status: 'APPROVED' },
    { id: 'req-4', type: 'SUPPLIER', name: 'Κώστας Προμηθευτής', company: 'Ξυλεία Βορρά', afm: '222222222', phone: '2104445566', email: 'kostas@xylia.gr', status: 'PENDING' },
  ]
})

describe('toggleUserActive()', () => {
  it('αρνείται να απενεργοποιήσει τον ίδιο τον χρήστη', async () => {
    const res = await toggleUserActive(CURRENT_USER_ID)
    expect(res.ok).toBe(false)
    expect(store.users.find(u => u.id === CURRENT_USER_ID)?.active).toBe(true)
  })

  it('απενεργοποιεί έναν ενεργό χρήστη', async () => {
    const res = await toggleUserActive('u2')
    expect(res).toMatchObject({ ok: true })
    expect(store.users.find(u => u.id === 'u2')?.active).toBe(false)
  })

  it('ενεργοποιεί έναν ανενεργό χρήστη', async () => {
    const res = await toggleUserActive('u3')
    expect(res).toMatchObject({ ok: true })
    expect(store.users.find(u => u.id === 'u3')?.active).toBe(true)
  })

  it('επιστρέφει σφάλμα για άγνωστο χρήστη', async () => {
    const res = await toggleUserActive('does-not-exist')
    expect(res.ok).toBe(false)
  })
})

describe('changeUserRole()', () => {
  it('αλλάζει τον ρόλο του χρήστη', async () => {
    const res = await changeUserRole('u2', 'role-architect')
    expect(res).toMatchObject({ ok: true })
    expect(store.users.find(u => u.id === 'u2')?.roleId).toBe('role-architect')
  })

  it('επιστρέφει σφάλμα για άγνωστο ρόλο', async () => {
    const res = await changeUserRole('u2', 'role-does-not-exist')
    expect(res.ok).toBe(false)
    expect(store.users.find(u => u.id === 'u2')?.roleId).toBe('role-sales')
  })
})

describe('approveAccessRequest()', () => {
  it('δημιουργεί User με ρόλο CUSTOMER για αίτημα τύπου CUSTOMER', async () => {
    const res = await approveAccessRequest('req-1')
    expect(res).toMatchObject({ ok: true })

    const created = store.users.find(u => u.email === 'nikos@interior.gr')
    expect(created).toBeTruthy()
    expect(created?.roleId).toBe('role-customer')
    expect(created?.active).toBe(true)
    expect(created?.passwordHash).not.toBe('')

    expect(store.requests.find(r => r.id === 'req-1')?.status).toBe('APPROVED')
  })

  it('δημιουργεί User με ρόλο ARCHITECT για αίτημα τύπου ARCHITECT', async () => {
    await approveAccessRequest('req-2')
    const created = store.users.find(u => u.email === 'maria@atelier.gr')
    expect(created?.roleId).toBe('role-architect')
    expect(store.requests.find(r => r.id === 'req-2')?.status).toBe('APPROVED')
  })

  it('δημιουργεί User με ρόλο SUPPLIER για αίτημα τύπου SUPPLIER', async () => {
    const res = await approveAccessRequest('req-4')
    expect(res).toMatchObject({ ok: true })
    const created = store.users.find(u => u.email === 'kostas@xylia.gr')
    expect(created?.roleId).toBe('role-supplier')
    expect(store.requests.find(r => r.id === 'req-4')?.status).toBe('APPROVED')
  })

  it('αρνείται αίτημα που δεν είναι πλέον PENDING', async () => {
    const res = await approveAccessRequest('req-3')
    expect(res.ok).toBe(false)
    expect(store.users.some(u => u.email === 'approved@x.gr')).toBe(false)
  })

  it('αρνείται άγνωστο αίτημα', async () => {
    const res = await approveAccessRequest('does-not-exist')
    expect(res.ok).toBe(false)
  })
})

describe('rejectAccessRequest()', () => {
  it('σημειώνει το αίτημα ως REJECTED χωρίς να δημιουργεί χρήστη', async () => {
    const res = await rejectAccessRequest('req-1')
    expect(res).toMatchObject({ ok: true })
    expect(store.requests.find(r => r.id === 'req-1')?.status).toBe('REJECTED')
    expect(store.users.some(u => u.email === 'nikos@interior.gr')).toBe(false)
  })

  it('αρνείται αίτημα που δεν είναι πλέον PENDING', async () => {
    const res = await rejectAccessRequest('req-3')
    expect(res.ok).toBe(false)
  })
})

describe('createUser()', () => {
  it('δημιουργεί χρήστη με όλα τα στοιχεία επικοινωνίας', async () => {
    const res = await createUser(formValues())
    expect(res).toMatchObject({ ok: true })

    const created = store.users.find(u => u.email === 'new.user@damask.gr')
    expect(created).toBeTruthy()
    expect(created?.roleId).toBe('role-sales')
    expect(created?.active).toBe(true)
    expect(created?.passwordHash).not.toBe('StrongPass123')
    expect(created?.phone).toBe('2101234567')
    expect(created?.mobile).toBe('6912345678')
    expect(created?.address).toBe('Λεωφόρος Δοκιμής 1')
    expect(created?.city).toBe('Αθήνα')
    expect(created?.country).toBe('Ελλάδα')
  })

  it('μετατρέπει κενά προαιρετικά πεδία επικοινωνίας σε null', async () => {
    const res = await createUser(
      formValues({ email: 'blank.fields@damask.gr', phone: '', mobile: '', address: '', city: '', country: '' }),
    )
    expect(res).toMatchObject({ ok: true })

    const created = store.users.find(u => u.email === 'blank.fields@damask.gr')
    expect(created?.phone).toBeNull()
    expect(created?.mobile).toBeNull()
    expect(created?.address).toBeNull()
    expect(created?.city).toBeNull()
    expect(created?.country).toBeNull()
  })

  it('απορρίπτει με fieldErrors όταν λείπουν υποχρεωτικά στοιχεία', async () => {
    const res = await createUser(formValues({ name: '', password: 'short' }))
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.fieldErrors?.name).toBeTruthy()
      expect(res.fieldErrors?.password).toBeTruthy()
    }
    expect(store.users.some(u => u.email === 'new.user@damask.gr')).toBe(false)
  })

  it('απορρίπτει άκυρο email με fieldError', async () => {
    const res = await createUser(formValues({ email: 'not-an-email' }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.email).toBeTruthy()
  })

  it('φιλικό μήνυμα για διπλότυπο email', async () => {
    const res = await createUser(formValues({ email: 'admin@damask.gr' }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.email).toBeTruthy()
    // δεν δημιουργήθηκε δεύτερος χρήστης με το ίδιο email
    expect(store.users.filter(u => u.email === 'admin@damask.gr')).toHaveLength(1)
  })

  it('απορρίπτει άγνωστο ρόλο', async () => {
    const res = await createUser(formValues({ email: 'ghost-role@damask.gr', roleId: 'role-does-not-exist' }))
    expect(res.ok).toBe(false)
    expect(store.users.some(u => u.email === 'ghost-role@damask.gr')).toBe(false)
  })
})

describe('updateUser()', () => {
  it('ενημερώνει στοιχεία επικοινωνίας χωρίς να αλλάξει τον κωδικό όταν μένει κενός', async () => {
    const res = await updateUser(
      'u2',
      formValues({ name: 'Νίκος Πωλητής', email: 'sales@damask.gr', roleId: 'role-sales', active: true, password: '', city: 'Θεσσαλονίκη' }),
    )
    expect(res).toMatchObject({ ok: true })

    const after = store.users.find(u => u.id === 'u2')
    expect(after?.city).toBe('Θεσσαλονίκη')
    expect(after?.passwordHash).toBe('x')
  })

  it('αλλάζει τον κωδικό μόνο όταν δοθεί νέος', async () => {
    const res = await updateUser(
      'u2',
      formValues({ name: 'Νίκος Πωλητής', email: 'sales@damask.gr', roleId: 'role-sales', active: true, password: 'BrandNewPass1' }),
    )
    expect(res).toMatchObject({ ok: true })
    expect(store.users.find(u => u.id === 'u2')?.passwordHash).not.toBe('x')
  })

  it('guard: δεν αλλάζει τον δικό του ρόλο', async () => {
    const res = await updateUser(
      CURRENT_USER_ID,
      formValues({ name: 'Admin', email: 'admin@damask.gr', roleId: 'role-sales', active: true, password: '' }),
    )
    expect(res.ok).toBe(false)
    expect(store.users.find(u => u.id === CURRENT_USER_ID)?.roleId).toBe('role-admin')
  })

  it('guard: δεν απενεργοποιεί τον εαυτό του', async () => {
    const res = await updateUser(
      CURRENT_USER_ID,
      formValues({ name: 'Admin', email: 'admin@damask.gr', roleId: 'role-admin', active: false, password: '' }),
    )
    expect(res.ok).toBe(false)
    expect(store.users.find(u => u.id === CURRENT_USER_ID)?.active).toBe(true)
  })

  it('επιτρέπει self-edit όταν δεν αλλάζει ρόλο ή ενεργή κατάσταση', async () => {
    const res = await updateUser(
      CURRENT_USER_ID,
      formValues({ name: 'Admin', email: 'admin@damask.gr', roleId: 'role-admin', active: true, password: '', city: 'Πάτρα' }),
    )
    expect(res).toMatchObject({ ok: true })
    expect(store.users.find(u => u.id === CURRENT_USER_ID)?.city).toBe('Πάτρα')
  })

  it('φιλικό μήνυμα για διπλότυπο email σε άλλον χρήστη', async () => {
    const res = await updateUser(
      'u2',
      formValues({ name: 'Νίκος Πωλητής', email: 'admin@damask.gr', roleId: 'role-sales', active: true, password: '' }),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.email).toBeTruthy()
    expect(store.users.find(u => u.id === 'u2')?.email).toBe('sales@damask.gr')
  })

  it('επιστρέφει σφάλμα για άγνωστο χρήστη', async () => {
    const res = await updateUser('does-not-exist', formValues())
    expect(res.ok).toBe(false)
  })

  it('απορρίπτει με fieldErrors όταν ο νέος κωδικός είναι πολύ μικρός', async () => {
    const res = await updateUser(
      'u2',
      formValues({ name: 'Νίκος Πωλητής', email: 'sales@damask.gr', roleId: 'role-sales', active: true, password: 'short' }),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.password).toBeTruthy()
  })
})
