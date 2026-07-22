import { describe, it, expect } from 'vitest'
import { toProgramScalars, toRelatedRows } from '@/lib/programs/persist-map'
import { emptyExtractedProgram } from '@/lib/programs/types'

describe('persist mapping', () => {
  it('maps scalars + related rows from an ExtractedProgram', () => {
    const e = {
      ...emptyExtractedProgram(),
      title: 'T',
      totalBudget: 1000000,
      fundingRate: 65,
      submissionEnd: '2024-12-31',
      expenseCategories: [
        { name: 'Εξοπλισμός', minPercentage: null, maxPercentage: 50, minAmount: null, maxAmount: null, mandatory: true },
      ],
      deliverables: [{ name: 'Έκθεση', description: null, phase: 'Φάση Α', mandatory: true }],
    }
    const s = toProgramScalars(e)
    expect(s.title).toBe('T')
    expect(Number(s.totalBudget)).toBe(1000000)
    expect(Number(s.fundingRate)).toBe(65)
    expect(s.submissionEnd instanceof Date).toBe(true)

    const r = toRelatedRows(e)
    expect(r.expenseCats[0]).toMatchObject({ name: 'Εξοπλισμός', maxPercentage: 50, mandatory: true, order: 0 })
    expect(r.deliverables[0]).toMatchObject({ name: 'Έκθεση', mandatory: true, phaseName: 'Φάση Α' })
  })

  it('does NOT include kadRule in program scalars (no such column)', () => {
    expect('kadRule' in (toProgramScalars(emptyExtractedProgram()) as Record<string, unknown>)).toBe(false)
  })
})
