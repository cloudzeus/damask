import { describe, it, expect } from 'vitest'
import { groupUsageRows, computeKpis, costForRow, rangeFromParam, cutoffForRange, type AiUsageRow } from '@/app/(app)/costs/costs-data'
import { DEFAULT_AI_MARKUP } from '@/lib/ai/markup'

function row(overrides: Partial<AiUsageRow> = {}): AiUsageRow {
  return {
    id: 'row-1', scope: 'TRANSLATION', provider: 'deepseek', model: 'deepseek-chat', operation: null,
    inputTokens: 100, outputTokens: 50, totalTokens: 150, totalCost: 0.001, durationMs: 200,
    userId: null, refType: null, refId: null, createdAt: new Date('2026-07-15T10:00:00Z'),
    ...overrides,
  }
}

const series = { '2026-07-15': 0.90 }
const latest = 0.90

describe('costForRow', () => {
  it('applies the provider markup % and converts to EUR using the day rate', () => {
    const markup = { ...DEFAULT_AI_MARKUP, deepseek: 20 }
    const result = costForRow(row({ totalCost: 10 }), markup, series, latest)
    expect(result.baseCostUsd).toBe(10)
    expect(result.markupPct).toBe(20)
    expect(result.finalCostUsd).toBeCloseTo(12, 6)
    expect(result.finalCostEur).toBeCloseTo(10.8, 6) // 12 * 0.90
  })

  it('treats a null totalCost (unmatched pricing) as zero base cost', () => {
    const result = costForRow(row({ totalCost: null }), DEFAULT_AI_MARKUP, series, latest)
    expect(result.baseCostUsd).toBe(0)
    expect(result.finalCostUsd).toBe(0)
    expect(result.finalCostEur).toBe(0)
  })

  it('falls back to the latest FX rate when the row day is missing from the series', () => {
    const result = costForRow(row({ totalCost: 10, createdAt: new Date('2026-01-01T00:00:00Z') }), DEFAULT_AI_MARKUP, {}, 0.5)
    expect(result.finalCostEur).toBeCloseTo(5, 6)
  })
})

describe('groupUsageRows', () => {
  it('groups by provider+model+scope, summing tokens and costs', () => {
    const rows = [
      row({ id: '1', totalCost: 1 }),
      row({ id: '2', totalCost: 2 }),
      row({ id: '3', provider: 'gemini', model: 'gemini-2.5-flash', totalCost: 3 }),
    ]
    const grouped = groupUsageRows(rows, DEFAULT_AI_MARKUP, series, latest)
    expect(grouped).toHaveLength(2)

    const deepseekGroup = grouped.find(g => g.provider === 'deepseek')!
    expect(deepseekGroup.calls).toBe(2)
    expect(deepseekGroup.inputTokens).toBe(200)
    expect(deepseekGroup.baseCostUsd).toBeCloseTo(3, 6)
  })

  it('keeps scope as a separate grouping dimension even for the same provider+model', () => {
    const rows = [
      row({ id: '1', scope: 'TRANSLATION' }),
      row({ id: '2', scope: 'CMS_GENERATE' }),
    ]
    const grouped = groupUsageRows(rows, DEFAULT_AI_MARKUP, series, latest)
    expect(grouped).toHaveLength(2)
  })

  it('sorts groups from most to least expensive (final EUR cost)', () => {
    const rows = [
      row({ id: '1', model: 'cheap', totalCost: 0.1 }),
      row({ id: '2', model: 'expensive', totalCost: 100 }),
    ]
    const grouped = groupUsageRows(rows, DEFAULT_AI_MARKUP, series, latest)
    expect(grouped[0].model).toBe('expensive')
    expect(grouped[1].model).toBe('cheap')
  })

  it('returns an empty array for no rows', () => {
    expect(groupUsageRows([], DEFAULT_AI_MARKUP, series, latest)).toEqual([])
  })
})

describe('computeKpis', () => {
  it('sums calls/tokens/cost across all groups and breaks down by provider', () => {
    const rows = [
      row({ id: '1', provider: 'deepseek', totalCost: 1 }),
      row({ id: '2', provider: 'gemini', model: 'gemini-2.5-flash', totalCost: 2 }),
    ]
    const grouped = groupUsageRows(rows, DEFAULT_AI_MARKUP, series, latest)
    const kpis = computeKpis(grouped)
    expect(kpis.calls).toBe(2)
    expect(kpis.totalTokens).toBe(300)
    expect(kpis.finalCostEur).toBeCloseTo((1 + 2) * 0.90, 6)
    expect(kpis.byProvider).toHaveLength(2)
  })

  it('returns zeroed KPIs for an empty grouping', () => {
    const kpis = computeKpis([])
    expect(kpis).toEqual({ calls: 0, totalTokens: 0, finalCostEur: 0, byProvider: [] })
  })
})

describe('rangeFromParam', () => {
  it('accepts the 4 documented values', () => {
    expect(rangeFromParam('7')).toBe('7')
    expect(rangeFromParam('30')).toBe('30')
    expect(rangeFromParam('month')).toBe('month')
    expect(rangeFromParam('all')).toBe('all')
  })
  it('defaults to "30" for anything else (undefined, garbage)', () => {
    expect(rangeFromParam(undefined)).toBe('30')
    expect(rangeFromParam('bogus')).toBe('30')
  })
})

describe('cutoffForRange', () => {
  const now = new Date('2026-07-15T12:00:00Z')

  it('"7" → 7 days before now', () => {
    const cutoff = cutoffForRange('7', now)
    expect(cutoff?.toISOString()).toBe('2026-07-08T12:00:00.000Z')
  })
  it('"30" → 30 days before now', () => {
    const cutoff = cutoffForRange('30', now)
    expect(cutoff?.toISOString().slice(0, 10)).toBe('2026-06-15')
  })
  it('"month" → start of the current calendar month', () => {
    const cutoff = cutoffForRange('month', now)
    expect(cutoff?.getDate()).toBe(1)
    expect(cutoff?.getMonth()).toBe(now.getMonth())
  })
  it('"all" → null (no date filter)', () => {
    expect(cutoffForRange('all', now)).toBeNull()
  })
})
