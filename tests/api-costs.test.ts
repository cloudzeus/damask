import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSettingMock = vi.fn()
vi.mock('@/lib/settings', () => ({ getSetting: (...args: unknown[]) => getSettingMock(...args) }))

import {
  DEFAULT_API_COSTS, getBilledCost, mergeApiCostConfig, loadApiCostConfig, loadAllApiCostConfigs,
  computeMonthlyCost,
} from '@/lib/api-costs'

beforeEach(() => { getSettingMock.mockReset() })

describe('getBilledCost', () => {
  it('applies a positive markup percentage on top of the real cost', () => {
    expect(getBilledCost(10, 20)).toBeCloseTo(12, 6)
  })
  it('returns the real cost unchanged for 0% markup', () => {
    expect(getBilledCost(10, 0)).toBe(10)
  })
  it('treats a non-finite markup as 0%', () => {
    expect(getBilledCost(10, NaN)).toBe(10)
  })
})

describe('mergeApiCostConfig', () => {
  it('returns the built-in defaults when there is no override', () => {
    const cfg = mergeApiCostConfig('mailgun', null)
    expect(cfg).toEqual({
      service: 'mailgun', displayName: 'Mailgun', costModel: 'per_email', unitLabel: 'emails',
      basePrice: 0.0005, freeQuota: 5000, quotaResetDay: 1, markupPercent: 0,
      documentationUrl: DEFAULT_API_COSTS.mailgun.documentationUrl,
    })
  })

  it('prefers override values for basePrice/freeQuota/markupPercent but keeps identity fields from defaults', () => {
    const cfg = mergeApiCostConfig('bunnycdn', { basePrice: 0.02, freeQuota: 20, markupPercent: 15 })
    expect(cfg.basePrice).toBe(0.02)
    expect(cfg.freeQuota).toBe(20)
    expect(cfg.markupPercent).toBe(15)
    expect(cfg.displayName).toBe('BunnyCDN')
    expect(cfg.costModel).toBe('per_gb')
  })

  it('partial override only replaces the given fields, others fall back to defaults', () => {
    const cfg = mergeApiCostConfig('mailgun', { markupPercent: 10 })
    expect(cfg.markupPercent).toBe(10)
    expect(cfg.basePrice).toBe(DEFAULT_API_COSTS.mailgun.basePrice)
    expect(cfg.freeQuota).toBe(DEFAULT_API_COSTS.mailgun.freeQuota)
  })

  it('falls back to safe generic defaults for a service unknown to DEFAULT_API_COSTS', () => {
    const cfg = mergeApiCostConfig('some-future-service', { basePrice: 1 })
    expect(cfg.displayName).toBe('some-future-service')
    expect(cfg.costModel).toBe('per_request')
    expect(cfg.basePrice).toBe(1)
    expect(cfg.freeQuota).toBe(0)
    expect(cfg.markupPercent).toBe(0)
  })
})

describe('loadApiCostConfig', () => {
  it('merges the DB "api.costConfig" override for the requested service', async () => {
    getSettingMock.mockResolvedValue({ mailgun: { markupPercent: 12 } })
    const cfg = await loadApiCostConfig('mailgun')
    expect(cfg.markupPercent).toBe(12)
    expect(cfg.basePrice).toBe(DEFAULT_API_COSTS.mailgun.basePrice)
    expect(getSettingMock).toHaveBeenCalledWith('api.costConfig')
  })

  it('returns pure defaults when no "api.costConfig" setting exists yet', async () => {
    getSettingMock.mockResolvedValue(null)
    const cfg = await loadApiCostConfig('viva')
    expect(cfg).toEqual(mergeApiCostConfig('viva', undefined))
  })
})

describe('loadAllApiCostConfigs', () => {
  it('resolves every known service from DEFAULT_API_COSTS', async () => {
    getSettingMock.mockResolvedValue(null)
    const all = await loadAllApiCostConfigs()
    expect(Object.keys(all).sort()).toEqual(Object.keys(DEFAULT_API_COSTS).sort())
  })

  it('also includes a service that only exists as a DB override (not in DEFAULT_API_COSTS)', async () => {
    getSettingMock.mockResolvedValue({ 'future-service': { basePrice: 5 } })
    const all = await loadAllApiCostConfigs()
    expect(all['future-service']).toBeDefined()
    expect(all['future-service'].basePrice).toBe(5)
  })
})

describe('computeMonthlyCost', () => {
  const config = { basePrice: 0.0005, freeQuota: 5000, markupPercent: 0 }

  it('below the free quota — no billable units, zero cost', () => {
    const result = computeMonthlyCost(3000, config)
    expect(result.billableUnits).toBe(0)
    expect(result.realCost).toBe(0)
    expect(result.billedCost).toBe(0)
  })

  it('exactly at the free quota — still zero cost', () => {
    const result = computeMonthlyCost(5000, config)
    expect(result.billableUnits).toBe(0)
  })

  it('above the free quota — only the excess is billed', () => {
    const result = computeMonthlyCost(5320, config)
    expect(result.billableUnits).toBe(320)
    expect(result.realCost).toBeCloseTo(320 * 0.0005, 10)
  })

  it('applies markup on top of the real cost for units above quota', () => {
    const result = computeMonthlyCost(6000, { basePrice: 0.01, freeQuota: 5000, markupPercent: 25 })
    expect(result.billableUnits).toBe(1000)
    expect(result.realCost).toBeCloseTo(10, 10)
    expect(result.billedCost).toBeCloseTo(12.5, 10)
  })

  it('handles decimal GB units correctly (bunnycdn-style)', () => {
    const result = computeMonthlyCost(10.7, { basePrice: 0.01, freeQuota: 10, markupPercent: 0 })
    expect(result.billableUnits).toBeCloseTo(0.7, 10)
    expect(result.realCost).toBeCloseTo(0.007, 10)
  })

  it('a service with 0 free quota (e.g. viva/aade) bills from the first unit', () => {
    const result = computeMonthlyCost(3, { basePrice: 0.05, freeQuota: 0, markupPercent: 0 })
    expect(result.billableUnits).toBe(3)
    expect(result.realCost).toBeCloseTo(0.15, 10)
  })

  it('treats negative/non-finite units as zero', () => {
    expect(computeMonthlyCost(-5, config).units).toBe(0)
    expect(computeMonthlyCost(NaN, config).units).toBe(0)
  })
})
