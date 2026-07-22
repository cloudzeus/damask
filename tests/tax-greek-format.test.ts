import { describe, it, expect } from 'vitest'
import { parseGreekNumber, parseGreekDate, coerceFinancialValue } from '@/lib/tax/greek-format'

describe('parseGreekNumber (dot=thousands, comma=decimal)', () => {
  it('parses Greek tax-form numbers', () => {
    expect(parseGreekNumber('1.556.540,27')).toBeCloseTo(1556540.27, 2)
    expect(parseGreekNumber('1.234')).toBe(1234)
    expect(parseGreekNumber('24,5%')).toBeCloseTo(24.5, 2)
    expect(parseGreekNumber('  ')).toBeNull()
    expect(parseGreekNumber('-')).toBeNull()
  })
})

describe('coerceFinancialValue', () => {
  it('coerces per valueType', () => {
    expect(coerceFinancialValue('12,50', 'CURRENCY')).toBeCloseTo(12.5, 2)
    expect(coerceFinancialValue('12,50', 'INTEGER')).toBe(13)
    expect(coerceFinancialValue('ΝΑΙ', 'BOOLEAN')).toBe(1)
    expect(coerceFinancialValue('όχι', 'BOOLEAN')).toBe(0)
    expect(coerceFinancialValue('nonsense', 'NUMBER')).toBeNull()
  })
  it('DATE → epoch ms', () => {
    const v = coerceFinancialValue('31/12/2024', 'DATE')
    expect(v).toBe(Date.UTC(2024, 11, 31))
  })
})
