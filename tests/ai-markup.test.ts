import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSettingMock = vi.fn()
vi.mock('@/lib/settings', () => ({ getSetting: (...args: unknown[]) => getSettingMock(...args) }))

import { markupPctForProvider, applyMarkup, loadAiMarkup, DEFAULT_AI_MARKUP } from '@/lib/ai/markup'

beforeEach(() => { getSettingMock.mockReset() })

describe('markupPctForProvider', () => {
  const markup = { deepseek: 20, gemini: 15, claude: 30, other: 5 }
  it('maps each known provider id to its own field', () => {
    expect(markupPctForProvider(markup, 'deepseek')).toBe(20)
    expect(markupPctForProvider(markup, 'gemini')).toBe(15)
    expect(markupPctForProvider(markup, 'claude')).toBe(30)
  })
  it('maps "anthropic" to the same claude field (alias)', () => {
    expect(markupPctForProvider(markup, 'anthropic')).toBe(30)
  })
  it('falls back to "other" for an unrecognized provider', () => {
    expect(markupPctForProvider(markup, 'openai')).toBe(5)
  })
})

describe('applyMarkup', () => {
  it('applies a positive markup percentage on top of the base cost', () => {
    expect(applyMarkup(10, 20)).toBeCloseTo(12, 6)
  })
  it('returns the base cost unchanged for 0% markup', () => {
    expect(applyMarkup(10, 0)).toBe(10)
  })
  it('supports a negative markup (below-cost internal pricing)', () => {
    expect(applyMarkup(10, -50)).toBeCloseTo(5, 6)
  })
})

describe('loadAiMarkup', () => {
  it('merges the DB setting over DEFAULT_AI_MARKUP so unset fields default to 0', async () => {
    getSettingMock.mockResolvedValue({ deepseek: 25 })
    const markup = await loadAiMarkup()
    expect(markup).toEqual({ ...DEFAULT_AI_MARKUP, deepseek: 25 })
  })

  it('returns all-zero defaults when nothing is saved yet', async () => {
    getSettingMock.mockResolvedValue(null)
    const markup = await loadAiMarkup()
    expect(markup).toEqual(DEFAULT_AI_MARKUP)
  })

  it('preserves an explicit usdToEur override from the DB', async () => {
    getSettingMock.mockResolvedValue({ usdToEur: 0.88 })
    const markup = await loadAiMarkup()
    expect(markup.usdToEur).toBe(0.88)
  })
})
