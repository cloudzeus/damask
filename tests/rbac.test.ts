import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

const session = (perms: string[]) =>
  ({ user: { id: 'u', role: 'X', permissions: perms, trdrId: null } }) as any

describe('can()', () => {
  it('true όταν υπάρχει το permission', () => {
    expect(can(session(['product.edit']), 'product.edit')).toBe(true)
  })
  it('false όταν λείπει', () => {
    expect(can(session(['product.view']), 'product.edit')).toBe(false)
  })
  it('false για null session', () => {
    expect(can(null, 'product.edit')).toBe(false)
  })
})
