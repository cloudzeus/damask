import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'

const user = {
  id: 'u1', email: 'a@b.gr', name: 'A', active: true, customerId: null,
  passwordHash: bcrypt.hashSync('secret123', 4),
  role: { name: 'ADMIN', permissions: [{ permission: { key: 'user.manage' } }] },
}
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(async ({ where }: any) => (where.email === 'a@b.gr' ? user : null)) } },
}))

import { verifyCredentials } from '@/auth.config'

describe('verifyCredentials', () => {
  it('returns user payload with role & permissions on valid creds', async () => {
    const res = await verifyCredentials('a@b.gr', 'secret123')
    expect(res).toMatchObject({ id: 'u1', role: 'ADMIN', permissions: ['user.manage'] })
  })
  it('returns null on wrong password', async () => {
    expect(await verifyCredentials('a@b.gr', 'nope')).toBeNull()
  })
  it('returns null on unknown email', async () => {
    expect(await verifyCredentials('x@x.gr', 'secret123')).toBeNull()
  })
  it('returns null on inactive user', async () => {
    user.active = false
    try {
      expect(await verifyCredentials('a@b.gr', 'secret123')).toBeNull()
    } finally {
      user.active = true
    }
  })
})
