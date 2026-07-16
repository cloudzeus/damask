import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const requirePermissionMock = vi.fn()
vi.mock('@/lib/rbac-server', () => ({ requirePermission: (...args: unknown[]) => requirePermissionMock(...args) }))

const getSettingMock = vi.fn()
const setSettingMock = vi.fn()
vi.mock('@/lib/settings', () => ({
  getSetting: (...args: unknown[]) => getSettingMock(...args),
  setSetting: (...args: unknown[]) => setSettingMock(...args),
}))

import { saveAiMarkup, savePricingOverride, deletePricingOverride, saveApiCostConfig } from '@/app/(app)/costs/actions'

function sessionFor(role: string) {
  return { user: { id: 'u1', role, permissions: ['costs.view'], trdrId: null } }
}

beforeEach(() => {
  requirePermissionMock.mockReset()
  getSettingMock.mockReset().mockResolvedValue(null)
  setSettingMock.mockReset()
})

const VALID_MARKUP = { deepseek: '10', gemini: '20', claude: '30', other: '5', usdToEur: '' }
const VALID_OVERRIDE = { model: 'claude-sonnet-5', inputPerMTokens: '2.5', outputPerMTokens: '12.5' }

describe('saveAiMarkup — role gating (SUPER_ADMIN only, checked on session.user.role)', () => {
  it('SUPER_ADMIN can save', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    const res = await saveAiMarkup(VALID_MARKUP)
    expect(res.ok).toBe(true)
    expect(setSettingMock).toHaveBeenCalledWith('ai.markup', expect.objectContaining({ deepseek: 10, gemini: 20, claude: 30, other: 5 }))
  })

  it('ADMIN (has costs.view permission but is not SUPER_ADMIN) is rejected and nothing is saved', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('ADMIN'))
    const res = await saveAiMarkup(VALID_MARKUP)
    expect(res.ok).toBe(false)
    expect(setSettingMock).not.toHaveBeenCalled()
  })

  it('MANAGER (no costs.view at all — requirePermission itself throws) is rejected and nothing is saved', async () => {
    requirePermissionMock.mockRejectedValue(new Error('Forbidden: απαιτείται costs.view'))
    const res = await saveAiMarkup(VALID_MARKUP)
    expect(res.ok).toBe(false)
    expect(setSettingMock).not.toHaveBeenCalled()
  })

  it('rejects non-numeric markup values with field errors, without saving', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    const res = await saveAiMarkup({ ...VALID_MARKUP, deepseek: 'not-a-number' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors).toHaveProperty('deepseek')
    expect(setSettingMock).not.toHaveBeenCalled()
  })

  it('stores an explicit usdToEur override when provided', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    await saveAiMarkup({ ...VALID_MARKUP, usdToEur: '0.88' })
    expect(setSettingMock).toHaveBeenCalledWith('ai.markup', expect.objectContaining({ usdToEur: 0.88 }))
  })

  it('omits usdToEur entirely when left blank (falls back to Frankfurter at read time)', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    await saveAiMarkup(VALID_MARKUP)
    const saved = setSettingMock.mock.calls[0][1]
    expect(saved).not.toHaveProperty('usdToEur')
  })
})

describe('savePricingOverride — role gating', () => {
  it('SUPER_ADMIN can add/update a model override', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    const res = await savePricingOverride(VALID_OVERRIDE)
    expect(res.ok).toBe(true)
    expect(setSettingMock).toHaveBeenCalledWith('ai.pricingOverrides', {
      'claude-sonnet-5': { inputPerMTokens: 2.5, outputPerMTokens: 12.5 },
    })
  })

  it('ADMIN cannot add a model override', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('ADMIN'))
    const res = await savePricingOverride(VALID_OVERRIDE)
    expect(res.ok).toBe(false)
    expect(setSettingMock).not.toHaveBeenCalled()
  })

  it('merges into existing overrides rather than replacing the whole map', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    getSettingMock.mockResolvedValue({ 'existing-model': { inputPerMTokens: 1, outputPerMTokens: 1 } })
    await savePricingOverride(VALID_OVERRIDE)
    expect(setSettingMock).toHaveBeenCalledWith('ai.pricingOverrides', {
      'existing-model': { inputPerMTokens: 1, outputPerMTokens: 1 },
      'claude-sonnet-5': { inputPerMTokens: 2.5, outputPerMTokens: 12.5 },
    })
  })

  it('rejects a blank model name', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    const res = await savePricingOverride({ ...VALID_OVERRIDE, model: '  ' })
    expect(res.ok).toBe(false)
    expect(setSettingMock).not.toHaveBeenCalled()
  })
})

describe('deletePricingOverride — role gating', () => {
  it('ADMIN cannot delete an override', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('ADMIN'))
    const res = await deletePricingOverride('claude-sonnet-5')
    expect(res.ok).toBe(false)
    expect(setSettingMock).not.toHaveBeenCalled()
  })

  it('SUPER_ADMIN can delete an existing override', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    getSettingMock.mockResolvedValue({ 'claude-sonnet-5': { inputPerMTokens: 2.5, outputPerMTokens: 12.5 }, 'other-model': { inputPerMTokens: 1, outputPerMTokens: 1 } })
    const res = await deletePricingOverride('claude-sonnet-5')
    expect(res.ok).toBe(true)
    expect(setSettingMock).toHaveBeenCalledWith('ai.pricingOverrides', { 'other-model': { inputPerMTokens: 1, outputPerMTokens: 1 } })
  })
})

const VALID_API_COST_CONFIG = { service: 'mailgun', basePrice: '0.001', freeQuota: '10000', markupPercent: '15' }

describe('saveApiCostConfig — role gating (SUPER_ADMIN only)', () => {
  it('SUPER_ADMIN can save a service override', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    const res = await saveApiCostConfig(VALID_API_COST_CONFIG)
    expect(res.ok).toBe(true)
    expect(setSettingMock).toHaveBeenCalledWith('api.costConfig', {
      mailgun: { basePrice: 0.001, freeQuota: 10000, markupPercent: 15 },
    })
  })

  it('ADMIN cannot save an API cost override', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('ADMIN'))
    const res = await saveApiCostConfig(VALID_API_COST_CONFIG)
    expect(res.ok).toBe(false)
    expect(setSettingMock).not.toHaveBeenCalled()
  })

  it('merges into the existing per-service map rather than replacing it', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    getSettingMock.mockResolvedValue({ bunnycdn: { basePrice: 0.01, freeQuota: 10, markupPercent: 0 } })
    await saveApiCostConfig(VALID_API_COST_CONFIG)
    expect(setSettingMock).toHaveBeenCalledWith('api.costConfig', {
      bunnycdn: { basePrice: 0.01, freeQuota: 10, markupPercent: 0 },
      mailgun: { basePrice: 0.001, freeQuota: 10000, markupPercent: 15 },
    })
  })

  it('rejects a negative basePrice', async () => {
    requirePermissionMock.mockResolvedValue(sessionFor('SUPER_ADMIN'))
    const res = await saveApiCostConfig({ ...VALID_API_COST_CONFIG, basePrice: '-1' })
    expect(res.ok).toBe(false)
    expect(setSettingMock).not.toHaveBeenCalled()
  })
})
