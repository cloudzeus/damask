import { describe, it, expect } from 'vitest'
import { emptyExtractedProgram, coerceMoney, coercePercent } from '@/lib/programs/types'

describe('program types helpers', () => {
  it('coerceMoney parses Greek numbers, coercePercent clamps', () => {
    expect(coerceMoney('1.000.000,00')).toBeCloseTo(1000000, 2)
    expect(coerceMoney(null)).toBeNull()
    expect(coercePercent('65')).toBe(65)
    expect(coercePercent('250')).toBe(100)
    expect(coercePercent('-5')).toBe(0)
  })

  it('emptyExtractedProgram has the array fields', () => {
    const e = emptyExtractedProgram()
    expect(e.expenseCategories).toEqual([])
    expect(e.deliverables).toEqual([])
    expect(e.deliverableGroups).toEqual([])
  })
})
