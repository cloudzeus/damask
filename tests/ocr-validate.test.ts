import { describe, it, expect } from 'vitest'
import { isValidAfm, normalizeAfm, validateExtractedDocument } from '@/lib/ocr/validate'
import { emptyExtractedDocument, type ExtractedDocument } from '@/lib/ocr/schema'

const VALID_AFM = '094014201' // ΟΤΕ Α.Ε. — real valid ΑΦΜ (mod-11 check digit)
const INVALID_AFM = '094014202' // one digit off the check digit

describe('isValidAfm', () => {
  it('accepts a valid 9-digit ΑΦΜ', () => {
    expect(isValidAfm(VALID_AFM)).toBe(true)
  })
  it('rejects a number that fails the mod-11 check digit', () => {
    expect(isValidAfm(INVALID_AFM)).toBe(false)
  })
  it('rejects wrong length / non-digits / all zeros', () => {
    expect(isValidAfm('12345678')).toBe(false)
    expect(isValidAfm('12345678a')).toBe(false)
    expect(isValidAfm('000000000')).toBe(false)
  })
  it('strips spaces and non-digit noise before checking', () => {
    expect(isValidAfm('094 014 201')).toBe(true)
  })
  it('rejects null/undefined/empty without throwing', () => {
    expect(isValidAfm(null)).toBe(false)
    expect(isValidAfm(undefined)).toBe(false)
    expect(isValidAfm('')).toBe(false)
  })
})

describe('normalizeAfm', () => {
  it('strips the EL country prefix', () => {
    expect(normalizeAfm('EL999863881')).toBe('999863881')
  })
  it('strips spaces, dots and other formatting', () => {
    expect(normalizeAfm('ΑΦΜ: 999 863.881')).toBe('999863881')
  })
  it('leaves a bare ΑΦΜ untouched', () => {
    expect(normalizeAfm(VALID_AFM)).toBe(VALID_AFM)
  })
  it('returns null when there are no digits', () => {
    expect(normalizeAfm('')).toBeNull()
    expect(normalizeAfm(null)).toBeNull()
    expect(normalizeAfm('EL')).toBeNull()
  })
})

function invoiceDoc(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return { ...emptyExtractedDocument('invoice'), confidence: 0.9, ...overrides }
}

function party(overrides: Partial<ExtractedDocument['issuer']>): ExtractedDocument['issuer'] {
  return { name: null, afm: null, address: null, phones: [], emails: [], website: null, ...overrides }
}

describe('validateExtractedDocument', () => {
  it('returns no flags for a clean, consistent, high-confidence invoice', () => {
    const doc = invoiceDoc({
      issuer: party({ name: 'Εκδότης', afm: VALID_AFM }),
      lines: [{ description: 'Α', quantity: 1, unitPrice: 100, vatPct: 24, total: 100 }],
      totals: { net: 100, vat: 24, gross: 124 },
    })
    expect(validateExtractedDocument(doc)).toEqual([])
  })

  it('flags an invalid issuer ΑΦΜ as a warning', () => {
    const doc = invoiceDoc({ issuer: party({ name: 'X', afm: INVALID_AFM }) })
    const flags = validateExtractedDocument(doc)
    const flag = flags.find(f => f.code === 'issuer_afm_invalid')
    expect(flag).toBeDefined()
    expect(flag!.severity).toBe('warning')
  })

  it('flags an invalid counterparty ΑΦΜ independently of the issuer', () => {
    const doc = invoiceDoc({
      issuer: party({ name: 'X', afm: VALID_AFM }),
      counterparty: party({ name: 'Y', afm: INVALID_AFM }),
    })
    const flags = validateExtractedDocument(doc)
    expect(flags.map(f => f.code)).toContain('counterparty_afm_invalid')
    expect(flags.map(f => f.code)).not.toContain('issuer_afm_invalid')
  })

  it('does not flag a null/absent ΑΦΜ (nothing to validate yet)', () => {
    const doc = invoiceDoc({ issuer: party({ name: 'X', afm: null }) })
    expect(validateExtractedDocument(doc).map(f => f.code)).not.toContain('issuer_afm_invalid')
  })

  it('includes invoice-math mismatches for invoice/receipt docTypes', () => {
    const doc = invoiceDoc({
      lines: [{ description: 'Α', quantity: 1, unitPrice: 100, vatPct: 24, total: 100 }],
      totals: { net: 100, vat: 24, gross: 999 },
    })
    expect(validateExtractedDocument(doc).map(f => f.code)).toContain('total_mismatch')
  })

  it('skips invoice-math checks entirely for packing_list (no prices expected)', () => {
    const doc = {
      ...emptyExtractedDocument('packing_list'),
      confidence: 0.9,
      lines: [{ description: 'Κιβώτια', quantity: 5, unitPrice: null, vatPct: null, total: null }],
      totals: { net: null, vat: 999, gross: null }, // would be a mismatch if checked as an invoice
    }
    expect(validateExtractedDocument(doc)).toEqual([])
  })

  it('flags low_confidence below the threshold, not at/above it', () => {
    const low = invoiceDoc({ confidence: 0.2 })
    expect(validateExtractedDocument(low).map(f => f.code)).toContain('low_confidence')

    const high = invoiceDoc({ confidence: 0.5 })
    expect(validateExtractedDocument(high).map(f => f.code)).not.toContain('low_confidence')
  })
})
