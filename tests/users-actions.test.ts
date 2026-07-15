import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  active: boolean
  roleId: string
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
        Object.assign(user, data)
        return { ...user }
      }),
      create: vi.fn(async ({ data }: { data: Omit<FakeUser, 'id'> }) => {
        if (store.users.some(u => u.email === data.email)) {
          const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
          throw err
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

import { toggleUserActive, changeUserRole, approveAccessRequest, rejectAccessRequest } from '@/app/(app)/users/actions'

beforeEach(() => {
  store.users = [
    { id: CURRENT_USER_ID, email: 'admin@damask.gr', name: 'Admin', passwordHash: 'x', active: true, roleId: 'role-admin' },
    { id: 'u2', email: 'sales@damask.gr', name: 'Νίκος Πωλητής', passwordHash: 'x', active: true, roleId: 'role-sales' },
    { id: 'u3', email: 'inactive@damask.gr', name: 'Ανενεργός Χρήστης', passwordHash: 'x', active: false, roleId: 'role-sales' },
  ]
  store.roles = [
    { id: 'role-admin', name: 'ADMIN' },
    { id: 'role-sales', name: 'SALES' },
    { id: 'role-architect', name: 'ARCHITECT' },
    { id: 'role-customer', name: 'CUSTOMER' },
  ]
  store.requests = [
    { id: 'req-1', type: 'CUSTOMER', name: 'Νίκος Σταύρου', company: 'Interior Concept', afm: '123456789', phone: '2101234567', email: 'nikos@interior.gr', status: 'PENDING' },
    { id: 'req-2', type: 'ARCHITECT', name: 'Μαρία Παπαδάκη', company: 'Atelier Nord', afm: '987654321', phone: '2109876543', email: 'maria@atelier.gr', status: 'PENDING' },
    { id: 'req-3', type: 'CUSTOMER', name: 'Ήδη εγκεκριμένος', company: 'X', afm: '111111111', phone: '210', email: 'approved@x.gr', status: 'APPROVED' },
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
