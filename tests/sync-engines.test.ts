import { describe, it, expect, vi, beforeEach } from 'vitest'

const { syncAllReferences } = vi.hoisted(() => ({ syncAllReferences: vi.fn() }))
vi.mock('@/lib/s1-sync', () => ({ syncAllReferences }))
const { updateLastRun } = vi.hoisted(() => ({ updateLastRun: vi.fn() }))
vi.mock('@/lib/sync-config-server', () => ({ updateLastRun }))
const { syncLogCreate } = vi.hoisted(() => ({ syncLogCreate: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { syncLog: { create: syncLogCreate } } }))

import { runSyncTarget } from '@/lib/sync-engines'

beforeEach(() => { syncAllReferences.mockReset(); updateLastRun.mockReset(); syncLogCreate.mockReset() })

describe('runSyncTarget', () => {
  it('runs the reference engine, updates lastRunAt, and writes a SyncLog on success', async () => {
    syncAllReferences.mockResolvedValue([{ table: 'VAT', ok: true, count: 3 }, { table: 'PAYMENT', ok: true, count: 2 }])
    const res = await runSyncTarget('s1-references', () => '2026-07-22T12:00:00.000Z')
    expect(res.ok).toBe(true)
    expect(res.pending).toBeFalsy()
    expect(res.count).toBe(5)
    expect(updateLastRun).toHaveBeenCalledWith('s1-references', '2026-07-22T12:00:00.000Z')
    expect(syncLogCreate).toHaveBeenCalled()
  })
  it('returns a pending result (no engine) for products — no lastRun, no throw', async () => {
    const res = await runSyncTarget('products', () => '2026-07-22T12:00:00.000Z')
    expect(res.pending).toBe(true)
    expect(res.ok).toBe(false)
    expect(updateLastRun).not.toHaveBeenCalled()
    expect(syncAllReferences).not.toHaveBeenCalled()
  })
  it('marks the run failed (still logs) when the engine throws', async () => {
    syncAllReferences.mockRejectedValue(new Error('S1 down'))
    const res = await runSyncTarget('s1-references', () => '2026-07-22T12:00:00.000Z')
    expect(res.ok).toBe(false)
    expect(res.pending).toBeFalsy()
    expect(syncLogCreate).toHaveBeenCalled()
  })
})
