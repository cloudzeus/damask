import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSettingMock = vi.fn()
vi.mock('@/lib/settings', () => ({ getSetting: (...args: unknown[]) => getSettingMock(...args) }))

import { computeCost, getPricing, resolvePricing, computeCostAsync } from '@/lib/ai/pricing'

beforeEach(() => {
  getSettingMock.mockReset()
})

describe('getPricing', () => {
  it('matches an exact known model id', () => {
    expect(getPricing('deepseek-chat')).toEqual({ inputPerMTokens: 0.27, outputPerMTokens: 1.10 })
  })

  it('falls back to a prefix match for unlisted variants (e.g. dated gemini snapshots)', () => {
    expect(getPricing('gemini-2.5-flash-002')).toEqual({ inputPerMTokens: 0.30, outputPerMTokens: 2.50 })
  })

  it('matches the new Anthropic/Claude models added for DAMASK', () => {
    expect(getPricing('claude-sonnet-5')).toEqual({ inputPerMTokens: 2.5, outputPerMTokens: 12.5 })
    expect(getPricing('claude-opus-4-8')).toEqual({ inputPerMTokens: 12.0, outputPerMTokens: 60.0 })
    expect(getPricing('claude-haiku-4-5')).toEqual({ inputPerMTokens: 0.80, outputPerMTokens: 4.0 })
    expect(getPricing('claude-fable-5')).toEqual({ inputPerMTokens: 4.0, outputPerMTokens: 20.0 })
  })

  it('returns null for a completely unknown model', () => {
    expect(getPricing('made-up-model-xyz')).toBeNull()
  })

  it('returns null for an empty model string', () => {
    expect(getPricing('')).toBeNull()
  })
})

describe('computeCost', () => {
  it('computes input/output cost separately for a known model with explicit token counts', () => {
    const result = computeCost('deepseek-chat', { input: 1_000_000, output: 1_000_000 })
    expect(result.matched).toBe(true)
    expect(result.inputCost).toBeCloseTo(0.27, 6)
    expect(result.outputCost).toBeCloseTo(1.10, 6)
    expect(result.totalCost).toBeCloseTo(1.37, 6)
  })

  it('splits total-only tokens 70/30 input/output when per-direction counts are absent', () => {
    const result = computeCost('deepseek-chat', { total: 1000 })
    // 70% input (700) / 30% output (300)
    expect(result.inputCost).toBeCloseTo((700 / 1_000_000) * 0.27, 8)
    expect(result.outputCost).toBeCloseTo((300 / 1_000_000) * 1.10, 8)
    expect(result.totalCost).toBeCloseTo(result.inputCost + result.outputCost, 8)
  })

  it('returns zeroed, unmatched cost for an unknown model instead of throwing', () => {
    const result = computeCost('totally-unknown-model', { input: 100, output: 50 })
    expect(result).toEqual({ inputCost: 0, outputCost: 0, totalCost: 0, matched: false })
  })

  it('treats missing/zero token counts as zero cost for a known model', () => {
    const result = computeCost('gemini-2.5-flash', {})
    expect(result).toEqual({ inputCost: 0, outputCost: 0, totalCost: 0, matched: true })
  })
})

describe('resolvePricing', () => {
  it('prefers a DB override (ai.pricingOverrides) over the built-in table', async () => {
    getSettingMock.mockResolvedValue({ 'deepseek-chat': { inputPerMTokens: 999, outputPerMTokens: 999 } })
    const p = await resolvePricing('deepseek-chat')
    expect(p).toEqual({ inputPerMTokens: 999, outputPerMTokens: 999 })
  })

  it('falls back to the built-in table when no override exists for that model', async () => {
    getSettingMock.mockResolvedValue({ 'some-other-model': { inputPerMTokens: 1, outputPerMTokens: 1 } })
    const p = await resolvePricing('deepseek-chat')
    expect(p).toEqual({ inputPerMTokens: 0.27, outputPerMTokens: 1.10 })
  })

  it('falls back to the built-in table when the setting is entirely unset (null)', async () => {
    getSettingMock.mockResolvedValue(null)
    const p = await resolvePricing('deepseek-chat')
    expect(p).toEqual({ inputPerMTokens: 0.27, outputPerMTokens: 1.10 })
  })

  it('lets an override introduce pricing for a model unknown to the built-in table', async () => {
    getSettingMock.mockResolvedValue({ 'brand-new-model': { inputPerMTokens: 5, outputPerMTokens: 10 } })
    const p = await resolvePricing('brand-new-model')
    expect(p).toEqual({ inputPerMTokens: 5, outputPerMTokens: 10 })
  })
})

describe('computeCostAsync', () => {
  it('uses the resolved (override-aware) pricing to compute cost', async () => {
    getSettingMock.mockResolvedValue({ 'deepseek-chat': { inputPerMTokens: 10, outputPerMTokens: 20 } })
    const result = await computeCostAsync('deepseek-chat', { input: 1_000_000, output: 1_000_000 })
    expect(result).toEqual({ inputCost: 10, outputCost: 20, totalCost: 30, matched: true })
  })
})
