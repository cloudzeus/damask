import { describe, it, expect } from 'vitest'
import { slugFieldKey, isValidBbox } from '@/lib/tax/template'

describe('slugFieldKey', () => {
  it('slugs a Greek label to an ascii-ish key', () => {
    expect(slugFieldKey('Καθαρά Κέρδη')).toMatch(/^[a-z0-9_]+$/)
    expect(slugFieldKey('Κύκλος Εργασιών 2024')).toContain('2024')
    expect(slugFieldKey('  ')).toBe('')
  })
})

describe('isValidBbox', () => {
  it('accepts a normalized 0-1 bbox and rejects out-of-range', () => {
    expect(isValidBbox([0.1, 0.2, 0.3, 0.05])).toBe(true)
    expect(isValidBbox([0, 0, 1, 1])).toBe(true)
    expect(isValidBbox([-0.1, 0, 0.2, 0.2])).toBe(false)
    expect(isValidBbox([0.5, 0.5, 0.7, 0.2])).toBe(false)
    expect(isValidBbox([0.1, 0.1, 0, 0.1])).toBe(false)
  })
})
