import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

type FakeRole = { id: string; name: string; description: string | null; system: boolean; b2b: boolean }
type FakeRolePermission = { roleId: string; permissionId: string }
type FakeUser = { id: string; roleId: string }

const store: { roles: FakeRole[]; rolePermissions: FakeRolePermission[]; users: FakeUser[] } = {
  roles: [], rolePermissions: [], users: [],
}

let currentRole = 'SUPER_ADMIN'
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(),
  requireSuperAdmin: vi.fn(async () => {
    if (currentRole !== 'SUPER_ADMIN') throw new Error('Forbidden: απαιτείται ρόλος SUPER_ADMIN')
    return { user: { id: 'sa-1', role: currentRole, permissions: [], trdrId: null } }
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const role = store.roles.find(r => (where.id ? r.id === where.id : r.name === where.name)) ?? null
        if (!role) return null
        const out: any = { ...role }
        if (include?.permissions) out.permissions = store.rolePermissions.filter(rp => rp.roleId === role.id)
        if (include?._count?.select?.users) out._count = { users: store.users.filter(u => u.roleId === role.id).length }
        return out
      }),
      create: vi.fn(async ({ data }: any) => {
        if (store.roles.some(r => r.name === data.name)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'x' })
        }
        const role: FakeRole = { id: `role-${data.name}`, name: data.name, description: data.description ?? null, system: data.system, b2b: data.b2b }
        store.roles.push(role)
        for (const p of data.permissions?.create ?? []) store.rolePermissions.push({ roleId: role.id, permissionId: p.permissionId })
        return role
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = store.roles.findIndex(r => r.id === where.id)
        const [removed] = store.roles.splice(idx, 1)
        store.rolePermissions = store.rolePermissions.filter(rp => rp.roleId !== where.id)
        return removed
      }),
    },
    user: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0
        for (const u of store.users) if (u.roleId === where.roleId) { u.roleId = data.roleId; count++ }
        return { count }
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { createRole, deleteRole } from '@/app/(app)/roles/actions'

beforeEach(() => {
  currentRole = 'SUPER_ADMIN'
  store.roles = [
    { id: 'role-super-admin', name: 'SUPER_ADMIN', description: null, system: true, b2b: false },
    { id: 'role-manager', name: 'MANAGER', description: null, system: true, b2b: false },
    { id: 'role-customer', name: 'CUSTOMER', description: null, system: true, b2b: true },
  ]
  store.rolePermissions = [
    { roleId: 'role-manager', permissionId: 'perm-a' },
    { roleId: 'role-manager', permissionId: 'perm-b' },
  ]
  store.users = []
})

describe('createRole()', () => {
  it('δημιουργεί ρόλο και αντιγράφει δικαιώματα από τον ρόλο-πηγή', async () => {
    const res = await createRole({ name: 'shop lead', description: 'Υπεύθυνος καταστήματος', b2b: false, copyFromRoleId: 'role-manager' })
    expect(res.ok).toBe(true)
    const created = store.roles.find(r => r.name === 'SHOP_LEAD')
    expect(created).toMatchObject({ system: false, b2b: false, description: 'Υπεύθυνος καταστήματος' })
    expect(store.rolePermissions.filter(rp => rp.roleId === created!.id).map(rp => rp.permissionId).sort()).toEqual(['perm-a', 'perm-b'])
  })

  it('δημιουργεί κενό ρόλο χωρίς copyFromRoleId', async () => {
    const res = await createRole({ name: 'AUDITOR', b2b: true, copyFromRoleId: '' })
    expect(res.ok).toBe(true)
    const created = store.roles.find(r => r.name === 'AUDITOR')
    expect(created).toMatchObject({ b2b: true })
    expect(store.rolePermissions.filter(rp => rp.roleId === created!.id)).toHaveLength(0)
  })

  it('απορρίπτει μη-SUPER_ADMIN', async () => {
    currentRole = 'ADMIN'
    await expect(createRole({ name: 'X', b2b: false })).rejects.toThrow(/SUPER_ADMIN/)
  })

  it('απορρίπτει διπλότυπο όνομα με φιλικό μήνυμα', async () => {
    const res = await createRole({ name: 'MANAGER', b2b: false })
    expect(res.ok).toBe(false)
  })

  it('απορρίπτει μη έγκυρο όνομα', async () => {
    const res = await createRole({ name: '1', b2b: false })
    expect(res.ok).toBe(false)
  })
})

describe('deleteRole()', () => {
  it('διαγράφει custom ρόλο χωρίς χρήστες', async () => {
    store.roles.push({ id: 'role-x', name: 'X', description: null, system: false, b2b: false })
    const res = await deleteRole('role-x')
    expect(res.ok).toBe(true)
    expect(store.roles.some(r => r.id === 'role-x')).toBe(false)
  })

  it('αρνείται να διαγράψει system ρόλο', async () => {
    const res = await deleteRole('role-manager')
    expect(res.ok).toBe(false)
    expect(store.roles.some(r => r.id === 'role-manager')).toBe(true)
  })

  it('χωρίς reassignToRoleId όταν ο ρόλος έχει χρήστες → απόρριψη', async () => {
    store.roles.push({ id: 'role-x', name: 'X', description: null, system: false, b2b: false })
    store.users.push({ id: 'u1', roleId: 'role-x' })
    const res = await deleteRole('role-x')
    expect(res.ok).toBe(false)
    expect(store.roles.some(r => r.id === 'role-x')).toBe(true)
  })

  it('μετακινεί χρήστες στον αντικαταστάτη και μετά διαγράφει', async () => {
    store.roles.push({ id: 'role-x', name: 'X', description: null, system: false, b2b: false })
    store.users.push({ id: 'u1', roleId: 'role-x' }, { id: 'u2', roleId: 'role-x' })
    const res = await deleteRole('role-x', 'role-manager')
    expect(res.ok).toBe(true)
    expect(store.users.every(u => u.roleId === 'role-manager')).toBe(true)
    expect(store.roles.some(r => r.id === 'role-x')).toBe(false)
  })

  it('απορρίπτει μη-SUPER_ADMIN', async () => {
    currentRole = 'ADMIN'
    await expect(deleteRole('role-manager')).rejects.toThrow(/SUPER_ADMIN/)
  })
})
