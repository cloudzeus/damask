import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()

// src/lib/ai/fx.ts caches `latest`/series results in module-scope variables
// (by design — one Frankfurter call per calendar day/range, see the file's
// header comment). That means tests must get a FRESH module instance each
// time, otherwise test N's successful fetch poisons the cache for test N+1
// and hides the fallback behaviour we're trying to assert.
beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function loadFx() {
  return import('@/lib/ai/fx')
}

describe('getUsdToEurLatest', () => {
  it('returns the Frankfurter rate on success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ date: '2026-07-15', base: 'USD', quote: 'EUR', rate: 0.9123 }]), { status: 200 }))
    const { getUsdToEurLatest } = await loadFx()
    const rate = await getUsdToEurLatest(0.5)
    expect(rate).toBe(0.9123)
  })

  it('falls back to the caller-supplied rate on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }))
    const { getUsdToEurLatest } = await loadFx()
    const rate = await getUsdToEurLatest(0.87)
    expect(rate).toBe(0.87)
  })

  it('falls back to the caller-supplied rate on a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const { getUsdToEurLatest } = await loadFx()
    const rate = await getUsdToEurLatest(0.87)
    expect(rate).toBe(0.87)
  })

  it('falls back when the response body is not an array', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ oops: true }), { status: 200 }))
    const { getUsdToEurLatest } = await loadFx()
    const rate = await getUsdToEurLatest(0.9)
    expect(rate).toBe(0.9)
  })

  it('falls back when the rate is zero/negative (defensive against malformed data)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ date: '2026-07-15', base: 'USD', quote: 'EUR', rate: 0 }]), { status: 200 }))
    const { getUsdToEurLatest } = await loadFx()
    const rate = await getUsdToEurLatest(0.9)
    expect(rate).toBe(0.9)
  })

  it('caches the rate for the calendar day — a second call does not re-fetch', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ date: '2026-07-15', base: 'USD', quote: 'EUR', rate: 0.91 }]), { status: 200 }))
    const { getUsdToEurLatest } = await loadFx()
    await getUsdToEurLatest(0.5)
    const second = await getUsdToEurLatest(0.5)
    expect(second).toBe(0.91)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('getUsdToEurSeries', () => {
  it('returns a { date: rate } map on success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      { date: '2026-07-01', base: 'USD', quote: 'EUR', rate: 0.90 },
      { date: '2026-07-02', base: 'USD', quote: 'EUR', rate: 0.91 },
    ]), { status: 200 }))
    const { getUsdToEurSeries } = await loadFx()
    const series = await getUsdToEurSeries('2026-07-01', '2026-07-02')
    expect(series).toEqual({ '2026-07-01': 0.90, '2026-07-02': 0.91 })
  })

  it('returns an empty map (not a throw) on failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down'))
    const { getUsdToEurSeries } = await loadFx()
    const series = await getUsdToEurSeries('2026-07-01', '2026-07-02')
    expect(series).toEqual({})
  })
})

describe('dayKey', () => {
  it('extracts the ISO calendar day from a Date', async () => {
    const { dayKey } = await loadFx()
    expect(dayKey(new Date('2026-07-15T18:40:00Z'))).toBe('2026-07-15')
  })
  it('extracts the ISO calendar day from a date string', async () => {
    const { dayKey } = await loadFx()
    expect(dayKey('2026-01-05T00:00:00.000Z')).toBe('2026-01-05')
  })
})

describe('usdToEurOnDay', () => {
  it('uses the day-specific rate from the series when available', async () => {
    const { usdToEurOnDay } = await loadFx()
    const series = { '2026-07-15': 0.90 }
    expect(usdToEurOnDay(10, '2026-07-15T12:00:00Z', series, 0.99)).toBeCloseTo(9.0, 6)
  })

  it('falls back to the latest rate when the day is missing from the series', async () => {
    const { usdToEurOnDay } = await loadFx()
    const series = { '2026-07-14': 0.90 }
    expect(usdToEurOnDay(10, '2026-07-15T12:00:00Z', series, 0.85)).toBeCloseTo(8.5, 6)
  })
})
