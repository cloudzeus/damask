import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/settings', () => ({
  getIntegration: vi.fn(async () => ({})),
  isIntegrationConfigured: vi.fn(() => false),
}))
vi.mock('@/lib/gemini', () => ({ geminiGenerate: vi.fn() }))
vi.mock('@/lib/deepseek', () => ({ generateText: vi.fn() }))

import { getIntegration, isIntegrationConfigured } from '@/lib/settings'
import { geminiGenerate } from '@/lib/gemini'
import { generateText } from '@/lib/deepseek'
import { extractDocument, parseJsonLoose, buildOcrPrompt, GEMINI_NOT_CONFIGURED_MESSAGE } from '@/lib/ocr/extract'

const IMAGE = { base64: 'QUJD', mimeType: 'image/png' }

beforeEach(() => {
  vi.mocked(getIntegration).mockReset().mockResolvedValue({})
  vi.mocked(isIntegrationConfigured).mockReset().mockReturnValue(false)
  vi.mocked(geminiGenerate).mockReset()
  vi.mocked(generateText).mockReset()
})

describe('parseJsonLoose', () => {
  it('parses plain JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 })
  })
  it('strips ```json code fences', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('strips bare ``` fences', () => {
    expect(parseJsonLoose('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('extracts the first {...} block when there is surrounding prose', () => {
    expect(parseJsonLoose('Here you go:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 })
  })
  it('throws a friendly error on empty input', () => {
    expect(() => parseJsonLoose('')).toThrow(/Κενή απάντηση/)
  })
  it('throws when there is no JSON object at all', () => {
    expect(() => parseJsonLoose('not json at all')).toThrow()
  })
})

describe('buildOcrPrompt', () => {
  it('mentions Greek ΑΦΜ and the standard ΦΠΑ rates', () => {
    const p = buildOcrPrompt('auto')
    expect(p).toMatch(/ΑΦΜ/)
    expect(p).toMatch(/24%/)
    expect(p).toMatch(/13%/)
    expect(p).toMatch(/6%/)
  })
  it('includes the strict-JSON keys the schema expects', () => {
    const p = buildOcrPrompt('auto')
    for (const key of ['docType', 'issuer', 'counterparty', 'documentNumber', 'lines', 'totals', 'confidence']) {
      expect(p).toContain(key)
    }
  })
  it('adds a hint line only when docTypeHint is not "auto"', () => {
    expect(buildOcrPrompt('auto')).not.toMatch(/υποδεικνύει/)
    expect(buildOcrPrompt('receipt')).toMatch(/υποδεικνύει.*receipt/)
  })
})

describe('extractDocument — Gemini configured (vision, primary path)', () => {
  beforeEach(() => vi.mocked(isIntegrationConfigured).mockReturnValue(true))

  it('sends images as inlineData parts + systemInstruction + json:true, and parses the result', async () => {
    vi.mocked(geminiGenerate).mockResolvedValue({
      text: JSON.stringify({
        docType: 'invoice',
        issuer: { name: 'Προμηθευτής ΑΕ', afm: '094014201', address: null },
        counterparty: null,
        documentNumber: 'ΤΠΥ-1',
        date: '2026-07-10',
        currency: 'EUR',
        lines: [{ description: 'Α', quantity: 1, unitPrice: '10,00', vatPct: 24, total: '10,00' }],
        totals: { net: '10,00', vat: '2,40', gross: '12,40' },
        confidence: 0.92,
        notes: null,
      }),
      model: 'gemini-2.5-flash',
      tokensUsed: 123,
    })

    const result = await extractDocument({ images: [IMAGE], docType: 'invoice' })

    expect(result.usedFallback).toBe(false)
    expect(result.model).toBe('gemini-2.5-flash')
    expect(result.data.issuer.afm).toBe('094014201')
    expect(result.data.totals).toEqual({ net: 10, vat: 2.4, gross: 12.4 }) // comma-decimal coercion
    expect(result.mismatches).toEqual([]) // 10 + 2.40 == 12.40

    const call = vi.mocked(geminiGenerate).mock.calls[0][0]
    expect(call.json).toBe(true)
    expect(call.systemInstruction).toContain('ΑΦΜ')
    expect(call.parts?.[0]).toEqual({ inlineData: { data: 'QUJD', mimeType: 'image/png' } })
    expect(generateText).not.toHaveBeenCalled()
  })

  it('surfaces invoice-math mismatches from a wrong total', async () => {
    vi.mocked(geminiGenerate).mockResolvedValue({
      text: JSON.stringify({
        docType: 'invoice',
        issuer: { name: 'X', afm: null, address: null },
        lines: [{ description: 'Α', quantity: 1, unitPrice: 10, vatPct: 24, total: 10 }],
        totals: { net: 10, vat: 2.4, gross: 999 },
        confidence: 0.8,
      }),
      model: 'gemini-2.5-flash',
      tokensUsed: null,
    })

    const result = await extractDocument({ images: [IMAGE] })
    expect(result.mismatches.some(f => f.code === 'total_mismatch')).toBe(true)
  })

  it('includes already-extracted digital text as extra context alongside the images', async () => {
    vi.mocked(geminiGenerate).mockResolvedValue({ text: '{}', model: 'gemini-2.5-flash', tokensUsed: null })
    await extractDocument({ images: [IMAGE], text: 'ψηφιακό κείμενο pdf' })
    const call = vi.mocked(geminiGenerate).mock.calls[0][0]
    const textPart = call.parts?.find((p): p is { text: string } => 'text' in p)
    expect(textPart?.text).toContain('ψηφιακό κείμενο pdf')
  })
})

describe('extractDocument — Gemini NOT configured', () => {
  beforeEach(() => vi.mocked(isIntegrationConfigured).mockReturnValue(false))

  it('throws the documented friendly error for images with no text fallback available', async () => {
    await expect(extractDocument({ images: [IMAGE] })).rejects.toThrow(GEMINI_NOT_CONFIGURED_MESSAGE)
    expect(geminiGenerate).not.toHaveBeenCalled()
    expect(generateText).not.toHaveBeenCalled()
  })

  it('falls back to DeepSeek text when images are present but digital text was also extracted', async () => {
    vi.mocked(generateText).mockResolvedValue(JSON.stringify({
      docType: 'invoice',
      issuer: { name: 'X', afm: null, address: null },
      lines: [],
      totals: { net: null, vat: null, gross: null },
      confidence: 0.6,
    }))

    const result = await extractDocument({ images: [IMAGE], text: 'digital pdf text layer' })

    expect(result.usedFallback).toBe(true)
    expect(result.model).toBe('deepseek (text fallback)')
    expect(geminiGenerate).not.toHaveBeenCalled()
    expect(vi.mocked(generateText).mock.calls[0][0]).toContain('digital pdf text layer')
  })

  it('uses DeepSeek directly for a pure-text (no images) input', async () => {
    vi.mocked(generateText).mockResolvedValue(JSON.stringify({
      docType: 'receipt',
      issuer: { name: 'Καφετέρια', afm: null, address: null },
      lines: [],
      totals: { net: null, vat: null, gross: null },
      confidence: 0.7,
    }))

    const result = await extractDocument({ images: [], text: 'κάποιο κείμενο' })
    expect(result.usedFallback).toBe(true)
    expect(result.data.docType).toBe('receipt')
  })

  it('throws a generic error when there are neither images nor text', async () => {
    await expect(extractDocument({ images: [] })).rejects.toThrow()
    expect(generateText).not.toHaveBeenCalled()
  })
})
