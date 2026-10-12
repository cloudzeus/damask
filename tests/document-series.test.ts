import { describe, it, expect } from 'vitest'
import { lastPeriods, rangePeriods, normalizePeriod, seriesCoverage, coverageLabel, periodLabel } from '@/lib/documents/series'

describe('σειρές εγγράφων', () => {
  it('τελευταίοι 12 ολοκληρωμένοι μήνες (χωρίς τον τρέχοντα)', () => {
    const p = lastPeriods('MONTHLY', 12, new Date('2026-10-12'))
    expect(p[0]).toBe('2025-10')
    expect(p.at(-1)).toBe('2026-09')
    expect(p).toHaveLength(12)
  })
  it('τρίμηνα και έτη', () => {
    expect(lastPeriods('QUARTERLY', 4, new Date('2026-10-12'))).toEqual(['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'])
    expect(lastPeriods('YEARLY', 3, new Date('2026-10-12'))).toEqual(['2023', '2024', '2025'])
  })
  it('διάστημα από–έως', () => {
    expect(rangePeriods('MONTHLY', '2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02'])
  })
  it('κανονικοποίηση περιόδου', () => {
    expect(normalizePeriod('3/2025', 'MONTHLY')).toBe('2025-03')
    expect(normalizePeriod('2025-3', 'MONTHLY')).toBe('2025-03')
    expect(normalizePeriod('Α΄ τρίμηνο 2025', 'QUARTERLY')).toBe('2025-Q1')
    expect(normalizePeriod('2025-08', 'QUARTERLY')).toBe('2025-Q3')
    expect(normalizePeriod('13/2025', 'MONTHLY')).toBeNull()
  })
  it('κάλυψη + ετικέτα', () => {
    const c = seriesCoverage({ kind: 'MONTHLY', count: 3, from: null, to: null }, ['2026-07', '2026-09', '2026-01'], new Date('2026-10-05'))
    expect(c.missing).toEqual(['2026-08'])
    expect(c.complete).toBe(false)
    expect(coverageLabel(c, 'MONTHLY')).toBe('2/3 — λείπουν 08/2026')
    expect(periodLabel('2025-Q2')).toBe('Β΄ τρίμ. 2025')
    expect(seriesCoverage({ kind: 'LIST', count: 2, from: null, to: null }, [null, null]).complete).toBe(true)
  })
})
