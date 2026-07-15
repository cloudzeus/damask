import { describe, it, expect } from 'vitest'
import { PERMISSIONS, ROLE_DEFAULTS } from '@/lib/permissions'

describe('permissions catalog', () => {
  it('has unique keys', () => {
    const keys = PERMISSIONS.map(p => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every role default references existing permissions', () => {
    const keys = new Set(PERMISSIONS.map(p => p.key))
    for (const [role, perms] of Object.entries(ROLE_DEFAULTS)) {
      for (const p of perms) expect(keys.has(p), `${role}: ${p}`).toBe(true)
    }
  })

  it('ADMIN has all permissions', () => {
    expect(ROLE_DEFAULTS.ADMIN.length).toBe(PERMISSIONS.length)
  })
})
