import { describe, it, expect } from 'vitest'
import { stripKadDots, formatKadDots, normalizeKad, ensurePrimaryActivity } from '@/lib/registries/kad-pure'

describe('stripKadDots', () => {
  it('strips all non-digit characters', () => {
    expect(stripKadDots('62.10.12.00')).toBe('62101200')
    expect(stripKadDots('56.90')).toBe('5690')
  })
  it('handles empty/undefined input', () => {
    expect(stripKadDots('')).toBe('')
  })
})

describe('normalizeKad', () => {
  it('strips all non-digit characters (same contract as stripKadDots)', () => {
    expect(normalizeKad('62.10.12.00')).toBe('62101200')
    expect(normalizeKad('  43-21.00 ')).toBe('432100')
  })
})

describe('formatKadDots', () => {
  it('inserts dots every 2 digits', () => {
    expect(formatKadDots('62101200')).toBe('62.10.12.00')
    expect(formatKadDots('5690')).toBe('56.90')
    expect(formatKadDots('568000')).toBe('56.80.00')
  })
  it('leaves an already-dotted code untouched (trimmed)', () => {
    expect(formatKadDots('62.10.12.00')).toBe('62.10.12.00')
    expect(formatKadDots(' 62.10 ')).toBe('62.10')
  })
  it('is the inverse of stripKadDots for canonical even-length codes', () => {
    const raw = '62101200'
    expect(stripKadDots(formatKadDots(raw))).toBe(raw)
  })
  it('returns the input unchanged for empty string', () => {
    expect(formatKadDots('')).toBe('')
  })
})

describe('ensurePrimaryActivity', () => {
  it('returns empty array unchanged', () => {
    expect(ensurePrimaryActivity([])).toEqual([])
  })

  it('promotes the first activity to PRIMARY when none is flagged', () => {
    const activities = [
      { code: '62.10', kind: 'SECONDARY' as const },
      { code: '62.20', kind: 'SECONDARY' as const },
    ]
    const result = ensurePrimaryActivity(activities)
    expect(result[0].kind).toBe('PRIMARY')
    expect(result[1].kind).toBe('SECONDARY')
  })

  it('preserves an existing PRIMARY and does not touch order/others', () => {
    const activities = [
      { code: '62.10', kind: 'SECONDARY' as const },
      { code: '62.20', kind: 'PRIMARY' as const },
    ]
    const result = ensurePrimaryActivity(activities)
    expect(result).toEqual(activities)
  })

  it('is idempotent when called twice', () => {
    const activities = [{ code: '62.10', kind: 'SECONDARY' as const }]
    const once = ensurePrimaryActivity(activities)
    const twice = ensurePrimaryActivity(once)
    expect(twice[0].kind).toBe('PRIMARY')
  })
})
