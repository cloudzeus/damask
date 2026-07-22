import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSetting, setSetting, getIntegration } = vi.hoisted(() => ({
  getSetting: vi.fn(), setSetting: vi.fn(), getIntegration: vi.fn(),
}))
vi.mock('@/lib/settings', () => ({
  getSetting, setSetting, getIntegration,
  isIntegrationConfigured: (_n: string, m: Record<string, unknown>) =>
    ['serial', 'username', 'password', 'appId'].every(k => String(m[k] ?? '').trim() !== ''),
}))

import { getSyncConfigs, setSyncConfig, updateLastRun, isSoftOneConnected } from '@/lib/sync-config-server'

beforeEach(() => { getSetting.mockReset(); setSetting.mockReset(); getIntegration.mockReset() })

describe('getSyncConfigs', () => {
  it('returns defaults for every target, merged over stored values', async () => {
    getSetting.mockResolvedValue({ 's1-references': { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '1h' } })
    const cfg = await getSyncConfigs()
    expect(cfg['s1-references'].syncEnabled).toBe(true)
    expect(cfg['products']).toEqual({ syncEnabled: false, direction: 'pull', master: 'softone', frequency: 'manual' })
  })
})

describe('setSyncConfig', () => {
  it('merges a partial patch into the stored target config', async () => {
    getSetting.mockResolvedValue({})
    await setSyncConfig('s1-references', { syncEnabled: true, frequency: '15m' })
    const [, written] = setSetting.mock.calls[0]
    expect(written['s1-references']).toMatchObject({ syncEnabled: true, frequency: '15m', direction: 'pull' })
  })
  it('rejects an unknown target key', async () => {
    getSetting.mockResolvedValue({})
    await expect(setSyncConfig('bogus', { syncEnabled: true })).rejects.toThrow()
    expect(setSetting).not.toHaveBeenCalled()
  })
})

describe('updateLastRun', () => {
  it('writes only lastRunAt for the target, preserving other fields', async () => {
    getSetting.mockResolvedValue({ 's1-references': { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '1h' } })
    await updateLastRun('s1-references', '2026-07-22T12:00:00.000Z')
    const [, written] = setSetting.mock.calls[0]
    expect(written['s1-references'].lastRunAt).toBe('2026-07-22T12:00:00.000Z')
    expect(written['s1-references'].frequency).toBe('1h')
  })
})

describe('isSoftOneConnected', () => {
  it('is false when not configured', async () => {
    getIntegration.mockResolvedValue({})
    expect(await isSoftOneConnected()).toBe(false)
  })
  it('is false when configured but last check failed/absent', async () => {
    getIntegration.mockResolvedValue({ serial: 's', username: 'u', password: 'p', appId: '1' })
    expect(await isSoftOneConnected()).toBe(false)
  })
  it('is true when configured and last check ok', async () => {
    getIntegration.mockResolvedValue({ serial: 's', username: 'u', password: 'p', appId: '1', _lastCheck: { ok: true, message: '', at: 'x' } })
    expect(await isSoftOneConnected()).toBe(true)
  })
})
