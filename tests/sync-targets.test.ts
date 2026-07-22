import { describe, it, expect } from 'vitest'
import {
  SYNC_TARGETS, FREQUENCY_MINUTES, defaultSyncConfig, isDue, dueTargetKeys,
  type ObjectSyncConfig,
} from '@/lib/sync-targets'

describe('SYNC_TARGETS', () => {
  it('has unique keys and exactly one engine-backed target (s1-references)', () => {
    const keys = SYNC_TARGETS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(SYNC_TARGETS.filter(t => t.hasEngine).map(t => t.key)).toEqual(['s1-references'])
  })
  it('reference target supports only pull; object targets support all three', () => {
    const ref = SYNC_TARGETS.find(t => t.key === 's1-references')!
    expect(ref.supportedDirections).toEqual(['pull'])
    const products = SYNC_TARGETS.find(t => t.key === 'products')!
    expect(products.supportedDirections).toEqual(['pull', 'push', 'bidirectional'])
    expect(products.s1Object).toBe('MTRL')
  })
})

describe('defaultSyncConfig', () => {
  it('is disabled/manual/pull/softone by default', () => {
    expect(defaultSyncConfig()).toEqual({
      syncEnabled: false, direction: 'pull', master: 'softone', frequency: 'manual',
    })
  })
})

describe('isDue', () => {
  const now = Date.parse('2026-07-22T12:00:00.000Z')
  const base: ObjectSyncConfig = { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '1h' }
  it('is false when disabled', () => {
    expect(isDue({ ...base, syncEnabled: false }, now)).toBe(false)
  })
  it('is false when frequency is manual', () => {
    expect(isDue({ ...base, frequency: 'manual' }, now)).toBe(false)
  })
  it('is true when enabled+scheduled and never run', () => {
    expect(isDue(base, now)).toBe(true)
  })
  it('is false when the interval has not elapsed', () => {
    expect(isDue({ ...base, lastRunAt: '2026-07-22T11:30:00.000Z' }, now)).toBe(false)
  })
  it('is true when the interval has elapsed', () => {
    expect(isDue({ ...base, lastRunAt: '2026-07-22T10:30:00.000Z' }, now)).toBe(true)
  })
})

describe('dueTargetKeys', () => {
  it('returns only enabled+due target keys', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z')
    const configs = {
      's1-references': { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '15m' } as ObjectSyncConfig,
      products: { syncEnabled: false, direction: 'pull', master: 'softone', frequency: '15m' } as ObjectSyncConfig,
    }
    expect(dueTargetKeys(configs, now)).toEqual(['s1-references'])
  })
})

describe('FREQUENCY_MINUTES', () => {
  it('maps presets to minutes, manual to null', () => {
    expect(FREQUENCY_MINUTES).toEqual({ manual: null, '15m': 15, '1h': 60, '6h': 360, daily: 1440 })
  })
})
