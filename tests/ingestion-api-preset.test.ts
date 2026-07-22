import { describe, it, expect } from 'vitest'
import { presetToPersist } from '@/lib/ingestion/api-preset'

describe('presetToPersist', () => {
  it('keeps only name/url/headerName and drops any smuggled secret field', () => {
    const dirty = { name: 'p', url: 'https://api.example.com/x', headerName: 'Authorization', headerValue: 'Bearer SECRET', token: 'SECRET2' } as any
    const clean = presetToPersist(dirty)
    expect(clean).toEqual({ name: 'p', url: 'https://api.example.com/x', headerName: 'Authorization' })
    expect(Object.keys(clean)).not.toContain('headerValue')
    expect(Object.keys(clean)).not.toContain('token')
  })
})
