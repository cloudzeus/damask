import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { apiUsage: { create: (...args: unknown[]) => createMock(...args) } } }))

const loadApiCostConfigMock = vi.fn()
vi.mock('@/lib/api-costs', () => ({ loadApiCostConfig: (...args: unknown[]) => loadApiCostConfigMock(...args) }))

import { logApiUsage } from '@/lib/api-usage'

beforeEach(() => {
  createMock.mockReset()
  loadApiCostConfigMock.mockReset()
  loadApiCostConfigMock.mockResolvedValue({
    service: 'mailgun', displayName: 'Mailgun', costModel: 'per_email', unitLabel: 'emails',
    basePrice: 0.0005, freeQuota: 5000, quotaResetDay: 1, markupPercent: 0,
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('logApiUsage', () => {
  it('writes a row with units + the raw per-row cost (units × basePrice, no markup/quota)', async () => {
    await logApiUsage({ service: 'mailgun', units: 1, operation: 'send', userId: 'u1', refType: 'accessRequest', refId: 'r1' })

    expect(createMock).toHaveBeenCalledTimes(1)
    const { data } = createMock.mock.calls[0][0]
    expect(data).toMatchObject({
      service: 'mailgun', operation: 'send', units: 1, costEur: 0.0005,
      userId: 'u1', refType: 'accessRequest', refId: 'r1',
    })
  })

  it('computes decimal costEur for a GB-metered service (bunnycdn)', async () => {
    loadApiCostConfigMock.mockResolvedValue({
      service: 'bunnycdn', displayName: 'BunnyCDN', costModel: 'per_gb', unitLabel: 'GB',
      basePrice: 0.01, freeQuota: 10, quotaResetDay: 1, markupPercent: 0,
    })
    await logApiUsage({ service: 'bunnycdn', units: 0.25, operation: 'upload' })
    const { data } = createMock.mock.calls[0][0]
    expect(data.units).toBe(0.25)
    expect(data.costEur).toBeCloseTo(0.0025, 10)
  })

  it('defaults optional fields (operation/userId/refType/refId) to null', async () => {
    await logApiUsage({ service: 'aade', units: 1 })
    const { data } = createMock.mock.calls[0][0]
    expect(data.operation).toBeNull()
    expect(data.userId).toBeNull()
    expect(data.refType).toBeNull()
    expect(data.refId).toBeNull()
  })

  it('treats a non-finite units value as 0', async () => {
    await logApiUsage({ service: 'mailgun', units: NaN })
    const { data } = createMock.mock.calls[0][0]
    expect(data.units).toBe(0)
    expect(data.costEur).toBe(0)
  })

  it('NEVER throws — swallows a prisma failure (e.g. DB unreachable)', async () => {
    createMock.mockRejectedValue(new Error('connection refused'))
    await expect(logApiUsage({ service: 'mailgun', units: 1 })).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('logApiUsage failed', expect.any(Error))
  })

  it('NEVER throws — swallows a cost-config lookup failure too', async () => {
    loadApiCostConfigMock.mockRejectedValue(new Error('settings lookup failed'))
    await expect(logApiUsage({ service: 'mailgun', units: 1 })).resolves.toBeUndefined()
    expect(createMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
