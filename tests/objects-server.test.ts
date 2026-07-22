import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSetting, setSetting } = vi.hoisted(() => ({ getSetting: vi.fn(), setSetting: vi.fn() }))
vi.mock('@/lib/settings', () => ({ getSetting, setSetting }))
const { notFound } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
vi.mock('next/navigation', () => ({ notFound }))

import {
  getEnabledObjectKeys, isObjectEnabled, assertObjectEnabled, setEnabledObjectKeys,
} from '@/lib/objects-server'

beforeEach(() => { getSetting.mockReset(); setSetting.mockReset(); notFound.mockClear() })

describe('getEnabledObjectKeys', () => {
  it('unions stored keys with core and drops unknowns', async () => {
    getSetting.mockResolvedValue(['products', 'bogus'])
    const eff = await getEnabledObjectKeys()
    expect(eff.has('products')).toBe(true)
    expect(eff.has('bogus')).toBe(false)
    expect(eff.has('settings')).toBe(true) // core
  })
  it('treats a missing setting as empty (core still present)', async () => {
    getSetting.mockResolvedValue(null)
    const eff = await getEnabledObjectKeys()
    expect(eff.has('dashboard')).toBe(true)
    expect(eff.has('products')).toBe(false)
  })
})

describe('assertObjectEnabled', () => {
  it('calls notFound() for a disabled object', async () => {
    getSetting.mockResolvedValue([])
    await expect(assertObjectEnabled('products')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })
  it('passes for an enabled object', async () => {
    getSetting.mockResolvedValue(['products'])
    await expect(assertObjectEnabled('products')).resolves.toBeUndefined()
  })
  it('passes for a core object regardless of storage', async () => {
    getSetting.mockResolvedValue([])
    await expect(assertObjectEnabled('settings')).resolves.toBeUndefined()
  })
})

describe('setEnabledObjectKeys', () => {
  it('persists only known non-core keys under objects.enabled', async () => {
    getSetting.mockResolvedValue([])
    await setEnabledObjectKeys(['products', 'settings', 'bogus'])
    expect(setSetting).toHaveBeenCalledWith('objects.enabled', ['products'])
  })
})

describe('isObjectEnabled', () => {
  it('is true for enabled and core, false otherwise', async () => {
    getSetting.mockResolvedValue(['products'])
    expect(await isObjectEnabled('products')).toBe(true)
    expect(await isObjectEnabled('settings')).toBe(true)
    expect(await isObjectEnabled('orders')).toBe(false)
  })
})
