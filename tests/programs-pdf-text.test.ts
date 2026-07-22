import { describe, it, expect } from 'vitest'
import { capText, MAX_PROGRAM_TEXT_CHARS } from '@/lib/programs/pdf-text'

describe('capText', () => {
  it('caps very long text and marks truncation', () => {
    const long = 'α'.repeat(MAX_PROGRAM_TEXT_CHARS + 100)
    const out = capText(long)
    expect(out.length).toBeLessThanOrEqual(MAX_PROGRAM_TEXT_CHARS + 40)
    expect(out).toMatch(/truncated/i)
  })

  it('leaves short text intact', () => {
    expect(capText('γεια')).toBe('γεια')
  })
})
