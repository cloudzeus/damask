import { describe, it, expect } from 'vitest'
import { summarizeApiUsageByService, totalApiCostEur, startOfCurrentMonth, type ApiUsageRow } from '@/app/(app)/costs/api-costs-data'
import { mergeApiCostConfig, type ResolvedApiCostConfig } from '@/lib/api-costs'

function row(overrides: Partial<ApiUsageRow> = {}): ApiUsageRow {
  return {
    id: 'row-1', service: 'mailgun', operation: 'send', units: 1, costEur: 0.0005,
    userId: null, refType: null, refId: null, createdAt: new Date('2026-07-15T10:00:00Z'),
    ...overrides,
  }
}

function configs(overrides: Record<string, Partial<ResolvedApiCostConfig>> = {}): Record<string, ResolvedApiCostConfig> {
  const base: Record<string, ResolvedApiCostConfig> = {
    mailgun: mergeApiCostConfig('mailgun', undefined),
    bunnycdn: mergeApiCostConfig('bunnycdn', undefined),
    viva: mergeApiCostConfig('viva', undefined),
    aade: mergeApiCostConfig('aade', undefined),
    geocoding: mergeApiCostConfig('geocoding', undefined),
  }
  for (const [service, patch] of Object.entries(overrides)) base[service] = { ...base[service], ...patch }
  return base
}

describe('summarizeApiUsageByService', () => {
  it('sums units/calls per service and applies the monthly free quota once', () => {
    const rows = [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })]
    const summaries = summarizeApiUsageByService(rows, configs())
    const mailgunSummary = summaries.find(s => s.service === 'mailgun')!
    expect(mailgunSummary.calls).toBe(3)
    expect(mailgunSummary.units).toBe(3)
    expect(mailgunSummary.freeQuota).toBe(5000)
    expect(mailgunSummary.billableUnits).toBe(0) // κάτω από το free quota
    expect(mailgunSummary.billedCostEur).toBe(0)
  })

  it('includes services with zero usage this month (so the settings/usage card always lists all known services)', () => {
    const summaries = summarizeApiUsageByService([], configs())
    const services = summaries.map(s => s.service).sort()
    expect(services).toEqual(['aade', 'bunnycdn', 'geocoding', 'mailgun', 'viva'])
    expect(summaries.every(s => s.units === 0 && s.billedCostEur === 0)).toBe(true)
  })

  it('bills only the excess above the free quota and applies markup for the final €', () => {
    const rows = Array.from({ length: 5320 }, (_, i) => row({ id: String(i) }))
    const summaries = summarizeApiUsageByService(rows, configs({ mailgun: { markupPercent: 20 } }))
    const mailgunSummary = summaries.find(s => s.service === 'mailgun')!
    expect(mailgunSummary.units).toBe(5320)
    expect(mailgunSummary.billableUnits).toBe(320)
    expect(mailgunSummary.realCostEur).toBeCloseTo(320 * 0.0005, 6)
    expect(mailgunSummary.billedCostEur).toBeCloseTo(320 * 0.0005 * 1.2, 6)
  })

  it('computes quotaPct as a percentage of the free quota consumed', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row({ id: String(i) }))
    const summaries = summarizeApiUsageByService(rows, configs())
    const mailgunSummary = summaries.find(s => s.service === 'mailgun')!
    expect(mailgunSummary.quotaPct).toBeCloseTo(20, 6) // 1000/5000
  })

  it('returns null quotaPct for a service with 0 free quota (progress bar makes no sense)', () => {
    const rows = [row({ id: '1', service: 'viva', operation: 'create_order' })]
    const summaries = summarizeApiUsageByService(rows, configs())
    const vivaSummary = summaries.find(s => s.service === 'viva')!
    expect(vivaSummary.quotaPct).toBeNull()
  })

  it('handles GB decimals correctly for bunnycdn', () => {
    const rows = [
      row({ id: '1', service: 'bunnycdn', units: 6, operation: 'upload' }),
      row({ id: '2', service: 'bunnycdn', units: 5.5, operation: 'backup' }),
    ]
    const summaries = summarizeApiUsageByService(rows, configs())
    const bunnySummary = summaries.find(s => s.service === 'bunnycdn')!
    expect(bunnySummary.units).toBeCloseTo(11.5, 10)
    expect(bunnySummary.billableUnits).toBeCloseTo(1.5, 10) // 11.5 - 10 free
    expect(bunnySummary.realCostEur).toBeCloseTo(0.015, 10)
  })

  it('sorts by final billed cost, most expensive first', () => {
    const rows = [
      ...Array.from({ length: 6000 }, (_, i) => row({ id: `m${i}`, service: 'mailgun' })),
      ...Array.from({ length: 12 }, (_, i) => row({ id: `b${i}`, service: 'bunnycdn', units: 1 })),
    ]
    const summaries = summarizeApiUsageByService(rows, configs())
    expect(summaries[0].billedCostEur).toBeGreaterThanOrEqual(summaries[1].billedCostEur)
  })

  it('skips a service row whose service has no resolvable config at all', () => {
    const rows = [row({ id: '1', service: 'mailgun' })]
    const partialConfigs = { mailgun: mergeApiCostConfig('mailgun', undefined) }
    const summaries = summarizeApiUsageByService(rows, partialConfigs)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].service).toBe('mailgun')
  })
})

describe('totalApiCostEur', () => {
  it('sums the billed cost across all service summaries', () => {
    const summaries = summarizeApiUsageByService(
      Array.from({ length: 6000 }, (_, i) => row({ id: String(i) })),
      configs(),
    )
    const total = totalApiCostEur(summaries)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeCloseTo(summaries.reduce((s, x) => s + x.billedCostEur, 0), 10)
  })

  it('returns 0 for an empty list', () => {
    expect(totalApiCostEur([])).toBe(0)
  })
})

describe('startOfCurrentMonth', () => {
  it('returns the 1st of the given month at local midnight', () => {
    const now = new Date('2026-07-15T18:45:00')
    const start = startOfCurrentMonth(now)
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(now.getMonth())
    expect(start.getFullYear()).toBe(now.getFullYear())
  })
})
