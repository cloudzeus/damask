import { describe, it, expect } from 'vitest'
import { normalizeCompanyName, nameSimilarity, isNameMismatch } from '@/lib/ocr/name-similarity'

describe('normalizeCompanyName', () => {
  it('uppercases and strips Greek τόνοι/diacritics', () => {
    expect(normalizeCompanyName('Άλφα Εμπορική')).toBe('ΑΛΦΑ ΕΜΠΟΡΙΚΗ')
  })
  it('collapses "Α.Ε." into a single ΑΕ token, then strips it as a legal form', () => {
    expect(normalizeCompanyName('ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.')).toBe('ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ')
  })
  it('strips other common legal forms (ΕΠΕ, ΙΚΕ, ΟΕ, ΕΕ, LTD)', () => {
    expect(normalizeCompanyName('ΠΑΠΑΔΟΠΟΥΛΟΣ ΕΠΕ')).toBe('ΠΑΠΑΔΟΠΟΥΛΟΣ')
    expect(normalizeCompanyName('ΝΙΚΟΛΑΟΥ ΙΚΕ')).toBe('ΝΙΚΟΛΑΟΥ')
    expect(normalizeCompanyName('Α & Β ΟΕ')).toBe('Α Β')
    expect(normalizeCompanyName('Acme LTD')).toBe('ACME')
  })
  it('collapses punctuation and whitespace', () => {
    expect(normalizeCompanyName('  Acme,  Inc.   ')).toBe('ACME')
  })
  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeCompanyName(null)).toBe('')
    expect(normalizeCompanyName(undefined)).toBe('')
    expect(normalizeCompanyName('   ')).toBe('')
  })
})

describe('nameSimilarity', () => {
  it('scores 1 for names identical after normalization', () => {
    expect(nameSimilarity('ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ ΑΕ', 'ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.')).toBe(1)
  })
  it('scores high for a close variant (extra/missing word)', () => {
    const score = nameSimilarity('ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ', 'ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ ΚΑΙ ΕΙΔΗ ΡΑΠΤΙΚΗΣ')
    expect(score).toBeGreaterThan(0.4)
  })
  it('scores low/zero for unrelated names', () => {
    expect(nameSimilarity('ΔΑΜΑΣΚ', 'ΤΕΛΕΙΩΣ ΑΛΛΗ ΕΤΑΙΡΙΑ')).toBeLessThan(0.3)
  })
  it('returns 0 when either side is empty', () => {
    expect(nameSimilarity('', 'ΔΑΜΑΣΚ')).toBe(0)
    expect(nameSimilarity('ΔΑΜΑΣΚ', null)).toBe(0)
  })
})

describe('isNameMismatch', () => {
  it('is false when the OCR name matches one of the official names well', () => {
    expect(isNameMismatch('ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ', ['ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.', null])).toBe(false)
  })
  it('is true when the OCR name matches none of the official names', () => {
    expect(isNameMismatch('Τελείως άλλη επωνυμία', ['ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.', 'DAMASK'])).toBe(true)
  })
  it('is false (nothing to compare) when the OCR name is missing', () => {
    expect(isNameMismatch(null, ['ΔΑΜΑΣΚ'])).toBe(false)
    expect(isNameMismatch('', ['ΔΑΜΑΣΚ'])).toBe(false)
  })
  it('is false (nothing to compare) when there are no official names at all', () => {
    expect(isNameMismatch('ΔΑΜΑΣΚ', [null, undefined])).toBe(false)
    expect(isNameMismatch('ΔΑΜΑΣΚ', [])).toBe(false)
  })
})
