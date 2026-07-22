import { describe, it, expect } from 'vitest'
import { providerFromModel, buildOcrCostView } from '@/lib/ingestion/ocr-cost'

describe('providerFromModel', () => {
  it('maps model id → provider', () => {
    expect(providerFromModel('gemini-2.5-flash')).toBe('gemini')
    expect(providerFromModel('deepseek (text fallback)')).toBe('deepseek')
    expect(providerFromModel('claude-opus-4-8')).toBe('claude')
    expect(providerFromModel('mystery')).toBe('other')
  })
})

describe('buildOcrCostView (pure core)', () => {
  const args = { model: 'gemini-2.5-flash', costUsd: 0.10, markupPct: 20, usdToEur: 0.9 }
  it('SUPER_ADMIN sees breakdown + final eur', () => {
    const v = buildOcrCostView('SUPER_ADMIN', args)
    expect(v).toMatchObject({ model: 'gemini-2.5-flash', showAmount: true, showBreakdown: true })
    expect(v.finalEur).toBeCloseTo(0.10 * 1.2 * 0.9, 6)
    expect(v.baseUsd).toBeCloseTo(0.10, 6)
  })
  it('ADMIN sees final eur, no breakdown', () => {
    const v = buildOcrCostView('ADMIN', args)
    expect(v).toMatchObject({ showAmount: true, showBreakdown: false })
    expect(v.baseUsd).toBeUndefined()
  })
  it('role without costs.view sees only the model name', () => {
    const v = buildOcrCostView('SALES', args)
    expect(v).toMatchObject({ model: 'gemini-2.5-flash', showAmount: false, showBreakdown: false })
    expect(v.finalEur).toBeUndefined()
  })
})
