import { describe, it, expect } from 'vitest'
import { applicationDocKey } from '@/lib/pm/doc-prep'

describe('applicationDocKey', () => {
  it('builds a private pm key with the ext', () => {
    expect(applicationDocKey('app1', 'abc', 'pdf')).toBe('pm/app1/abc.pdf')
  })

  it('strips a leading dot from the ext', () => {
    expect(applicationDocKey('app1', 'abc', '.pdf')).toBe('pm/app1/abc.pdf')
  })
})
