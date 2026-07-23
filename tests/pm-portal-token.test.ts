import { describe, it, expect } from 'vitest'
import { newToken, hashToken, isExpired } from '@/lib/pm/portal-token'
describe('portal-token', () => {
  it('hashToken deterministic 64-hex', () => {
    const h = hashToken('abc'); expect(h).toMatch(/^[0-9a-f]{64}$/); expect(hashToken('abc')).toBe(h)
  })
  it('newToken raw != hash and hash matches hashToken(raw)', () => {
    const { raw, hash } = newToken(); expect(raw).not.toBe(hash); expect(hash).toBe(hashToken(raw)); expect(raw).toMatch(/^[0-9a-f]{64}$/)
  })
  it('isExpired boundary', () => {
    const now = 1_000_000; expect(isExpired(new Date(now - 1), now)).toBe(true); expect(isExpired(new Date(now + 1), now)).toBe(false)
  })
})
