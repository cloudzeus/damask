import { describe, it, expect } from 'vitest'
import {
  coerceOcrNumber, coerceExtractedJson, parseExtractedDocument, emptyExtractedDocument,
  extractedDocumentSchema,
} from '@/lib/ocr/schema'

describe('coerceOcrNumber', () => {
  it('passes real numbers through', () => {
    expect(coerceOcrNumber(24)).toBe(24)
    expect(coerceOcrNumber(0)).toBe(0)
  })
  it('parses Greek/EU comma-decimal format', () => {
    expect(coerceOcrNumber('1.234,56')).toBe(1234.56)
    expect(coerceOcrNumber('29,10')).toBeCloseTo(29.1, 2)
  })
  it('parses plain dot-decimal strings', () => {
    expect(coerceOcrNumber('1234.56')).toBe(1234.56)
  })
  it('strips currency symbols and whitespace', () => {
    expect(coerceOcrNumber('24,00 €')).toBe(24)
    expect(coerceOcrNumber(' $ 5.00')).toBe(5)
  })
  it('returns null for empty/nullish/garbage input — never a silent 0', () => {
    expect(coerceOcrNumber(null)).toBeNull()
    expect(coerceOcrNumber(undefined)).toBeNull()
    expect(coerceOcrNumber('')).toBeNull()
    expect(coerceOcrNumber('n/a')).toBeNull()
  })
})

describe('coerceExtractedJson', () => {
  it('normalizes a realistic messy LLM payload (string numbers, snake_case aliases)', () => {
    const raw = {
      docType: 'invoice',
      issuer: { name: 'ΑΦΟΙ ΠΑΠΑΔΟΠΟΥΛΟΥ ΑΕ', afm: 'EL094014201', address: 'Αθήνα' },
      counterparty: null,
      documentNumber: 'ΤΙΜ-0001',
      date: '2026-07-10',
      currency: 'EUR',
      lines: [
        { description: 'Ύφασμα λινό', quantity: '2', unit_price: '29,10', vat_pct: '24', total: '58,20' },
      ],
      totals: { net: '58,20', vat: '13,97', gross: '72,17' },
      confidence: '0.9',
      notes: '',
    }
    const out = coerceExtractedJson(raw) as Record<string, unknown>
    expect(out.docType).toBe('invoice')
    expect(out.notes).toBeNull()
    const lines = out.lines as Record<string, unknown>[]
    expect(lines[0]).toEqual({ description: 'Ύφασμα λινό', quantity: 2, unitPrice: 29.1, vatPct: 24, total: 58.2 })
    expect(out.totals).toEqual({ net: 58.2, vat: 13.97, gross: 72.17 })
  })

  it('defaults docType to the hint when the model omits/mis-types it', () => {
    const out = coerceExtractedJson({ lines: [] }, 'receipt') as Record<string, unknown>
    expect(out.docType).toBe('receipt')
  })

  it('defaults docType to "invoice" when there is no hint either', () => {
    const out = coerceExtractedJson({}, 'auto') as Record<string, unknown>
    expect(out.docType).toBe('invoice')
  })

  it('clamps an out-of-range confidence into [0,1]', () => {
    expect((coerceExtractedJson({ confidence: 4 }) as Record<string, unknown>).confidence).toBe(1)
    expect((coerceExtractedJson({ confidence: -2 }) as Record<string, unknown>).confidence).toBe(0)
  })

  it('never throws on garbage input (missing fields, wrong types, non-array lines)', () => {
    expect(() => coerceExtractedJson(null)).not.toThrow()
    expect(() => coerceExtractedJson('a string, not an object')).not.toThrow()
    expect(() => coerceExtractedJson({ lines: 'not-an-array', totals: 'nope' })).not.toThrow()
  })
})

describe('parseExtractedDocument', () => {
  it('parses a well-formed fixture end-to-end', () => {
    const fixture = {
      docType: 'invoice',
      issuer: { name: 'Εκδότης ΑΕ', afm: '094014201', address: 'Οδός 1, Αθήνα' },
      counterparty: { name: 'Πελάτης ΕΠΕ', afm: '090000045', address: 'Οδός 2, Θεσσαλονίκη' },
      documentNumber: 'ΤΠΥ-100',
      date: '2026-07-14',
      currency: 'EUR',
      lines: [
        { description: 'Είδος Α', quantity: 3, unitPrice: 10, vatPct: 24, total: 30 },
      ],
      totals: { net: 30, vat: 7.2, gross: 37.2 },
      confidence: 0.95,
      notes: null,
    }
    const doc = parseExtractedDocument(fixture)
    expect(doc.docType).toBe('invoice')
    expect(doc.issuer.afm).toBe('094014201')
    expect(doc.lines).toHaveLength(1)
    expect(doc.totals.gross).toBe(37.2)
  })

  it('produces a fully-defaulted valid document from a completely empty payload', () => {
    const doc = parseExtractedDocument({}, 'packing_list')
    expect(() => extractedDocumentSchema.parse(doc)).not.toThrow()
    expect(doc.docType).toBe('packing_list')
    expect(doc.lines).toEqual([])
    expect(doc.totals).toEqual({ net: null, vat: null, gross: null })
  })
})

describe('emptyExtractedDocument', () => {
  it('is itself a schema-valid document (round-trips through parse)', () => {
    const empty = emptyExtractedDocument('receipt')
    expect(() => extractedDocumentSchema.parse(empty)).not.toThrow()
    expect(empty.docType).toBe('receipt')
  })
})
