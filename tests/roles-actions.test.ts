import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeRole = { id: string; name: string }
type FakePermission = { id: string; key: string; description: string }
type FakeRolePermission = { roleId: string; permissionId: string }

const store: { roles: FakeRole[]; permissions: FakePermission[]; rolePermissions: FakeRolePermission[] } = {
  roles: [],
  permissions: [],
  rolePermissions: [],
}

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['user.manage'], customerId: null },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: {
      findUnique: vi.fn(async ({ where }: { where: { name: string } }) =>
        store.roles.find(r => r.name === where.name) ?? null,
      ),
    },
    permission: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        store.permissions.find(p => p.key === where.key) ?? null,
      ),
    },
    rolePermission: {
      findUnique: vi.fn(async ({ where }: { where: { roleId_permissionId: FakeRolePermission } }) =>
        store.rolePermissions.find(
          rp =>
            rp.roleId === where.roleId_permissionId.roleId &&
            rp.permissionId === where.roleId_permissionId.permissionId,
        ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: FakeRolePermission }) => {
        store.rolePermissions.push(data)
        return data
      }),
      delete: vi.fn(async ({ where }: { where: { roleId_permissionId: FakeRolePermission } }) => {
        const idx = store.rolePermissions.findIndex(
          rp =>
            rp.roleId === where.roleId_permissionId.roleId &&
            rp.permissionId === where.roleId_permissionId.permissionId,
        )
        if (idx === -1) throw new Error('not found')
        const [removed] = store.rolePermissions.splice(idx, 1)
        return removed
      }),
    },
  },
}))

import { togglePermission } from '@/app/(app)/roles/actions'

beforeEach(() => {
  store.roles = [
    { id: 'role-admin', name: 'ADMIN' },
    { id: 'role-sales', name: 'SALES' },
  ]
  store.permissions = [
    { id: 'perm-edit', key: 'product.edit', description: 'Επεξεργασία προϊόντων' },
    { id: 'perm-view', key: 'product.view', description: 'Προβολή προϊόντων' },
  ]
  store.rolePermissions = [{ roleId: 'role-sales', permissionId: 'perm-view' }]
})

describe('togglePermission()', () => {
  it('αρνείται να αλλάξει δικαιώματα για τον ρόλο ADMIN', async () => {
    const res = await togglePermission('ADMIN', 'product.edit')
    expect(res.ok).toBe(false)
    expect(store.rolePermissions.some(rp => rp.roleId === 'role-admin')).toBe(false)
  })

  it('προσθέτει το δικαίωμα όταν ο ρόλος δεν το έχει', async () => {
    const res = await togglePermission('SALES', 'product.edit')
    expect(res).toMatchObject({ ok: true })
    expect(store.rolePermissions).toContainEqual({ roleId: 'role-sales', permissionId: 'perm-edit' })
  })

  it('αφαιρεί το δικαίωμα όταν ο ρόλος το έχει ήδη', async () => {
    const res = await togglePermission('SALES', 'product.view')
    expect(res).toMatchObject({ ok: true })
    expect(store.rolePermissions).not.toContainEqual({ roleId: 'role-sales', permissionId: 'perm-view' })
  })

  it('επιστρέφει σφάλμα για άγνωστο ρόλο', async () => {
    const res = await togglePermission('DOES_NOT_EXIST', 'product.edit')
    expect(res.ok).toBe(false)
  })

  it('επιστρέφει σφάλμα για άγνωστο permission key', async () => {
    const res = await togglePermission('SALES', 'does.not.exist')
    expect(res.ok).toBe(false)
  })
})
