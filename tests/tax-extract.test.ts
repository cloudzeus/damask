import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/gemini', () => ({
  geminiGenerate: vi.fn(async () => ({
    text: JSON.stringify({ kerdi: '1.234,50', tziros: [{ year: 2024, value: '5.000,00' }] }),
    model: 'gemini-2.5-flash', tokensUsed: 321,
  })),
}))
import { extractFields } from '@/lib/tax/tax-extract'

describe('extractFields', () => {
  it('returns values + series + model/tokens from the vision JSON', async () => {
    const r = await extractFields([{ base64: 'x', mimeType: 'image/png' }], [
      { fieldKey: 'kerdi', label: 'Κέρδη', valueType: 'CURRENCY', kind: 'SINGLE' },
      { fieldKey: 'tziros', label: 'Τζίρος', valueType: 'CURRENCY', kind: 'SERIES' },
    ])
    expect(r.model).toBe('gemini-2.5-flash')
    expect(r.tokensUsed).toBe(321)
    expect(r.values.kerdi).toBe('1.234,50')
    expect(r.series.tziros).toEqual([{ year: 2024, value: '5.000,00' }])
  })
})
