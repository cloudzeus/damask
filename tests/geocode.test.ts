import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const logApiUsageMock = vi.fn()
vi.mock('@/lib/api-usage', () => ({ logApiUsage: (...args: unknown[]) => logApiUsageMock(...args) }))

import { geocodeSearch, geocodeSuggest, geocodeReverse, GeocodeError } from '@/lib/geocode'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const SEARCH_FIXTURE = [
  {
    lat: '38.0522288',
    lon: '23.7913131',
    display_name: 'Λεωφόρος Κηφισίας 100, Μαρούσι, Αττική, Ελλάδα',
    address: {
      road: 'Λεωφόρος Κηφισίας',
      house_number: '100',
      city: 'Μαρούσι',
      postcode: '15125',
      country: 'Ελλάδα',
      country_code: 'gr',
    },
  },
]

const REVERSE_FIXTURE = {
  lat: '38.0522288',
  lon: '23.7913131',
  display_name: 'Λεωφόρος Κηφισίας 100, Μαρούσι, Αττική, Ελλάδα',
  address: {
    road: 'Λεωφόρος Κηφισίας',
    house_number: '100',
    town: 'Μαρούσι',
    postcode: '15125',
    country: 'Ελλάδα',
    country_code: 'gr',
  },
}

describe('geocodeSearch', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    logApiUsageMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('throws without hitting the network when the api key is missing', async () => {
    await expect(geocodeSearch('Αθήνα', '')).rejects.toThrow(GeocodeError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logApiUsageMock).not.toHaveBeenCalled()
  })

  it('throws without hitting the network when the address is blank', async () => {
    await expect(geocodeSearch('   ', 'key123')).rejects.toThrow(GeocodeError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls geocode.maps.co/search with the address + api_key and parses the first result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SEARCH_FIXTURE))

    const results = await geocodeSearch('Λεωφόρος Κηφισίας 100, Μαρούσι', 'key123')

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('https://geocode.maps.co/search?q=')
    expect(String(url)).toContain('api_key=key123')

    expect(results).toHaveLength(1)
    expect(results[0].lat).toBeCloseTo(38.0522288)
    expect(results[0].lng).toBeCloseTo(23.7913131)
    expect(results[0].city).toBe('Μαρούσι')
    expect(results[0].zip).toBe('15125')
    expect(results[0].country).toBe('Ελλάδα')
  })

  it('logs 1 geocoding unit on a successful search response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SEARCH_FIXTURE))
    await geocodeSearch('Αθήνα', 'key123')
    expect(logApiUsageMock).toHaveBeenCalledWith({ service: 'geocoding', operation: 'search', units: 1 })
  })

  it('returns an empty array when the service finds nothing (empty array response)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const results = await geocodeSearch('ανύπαρκτη διεύθυνση', 'key123')
    expect(results).toEqual([])
  })

  it('throws a Greek-language GeocodeError on 401 (bad api key) without logging usage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))
    await expect(geocodeSearch('Αθήνα', 'bad-key')).rejects.toMatchObject({ message: expect.stringMatching(/κλειδί/) })
    expect(logApiUsageMock).not.toHaveBeenCalled()
  })

  it('throws a Greek-language GeocodeError on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(geocodeSearch('Αθήνα', 'key123')).rejects.toThrow(GeocodeError)
  })
})

describe('geocodeSuggest', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    logApiUsageMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('throws without hitting the network when the api key is missing', async () => {
    await expect(geocodeSuggest('Ερμού 12, Αθήνα', '')).rejects.toThrow(GeocodeError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logApiUsageMock).not.toHaveBeenCalled()
  })

  it('returns an empty array without hitting the network for a blank query', async () => {
    const results = await geocodeSuggest('   ', 'key123')
    expect(results).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls geocode.maps.co/search with q + default limit=6 + api_key and parses all results', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SEARCH_FIXTURE))

    const results = await geocodeSuggest('Λεωφόρος Κηφισίας', 'key123')

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('https://geocode.maps.co/search?q=')
    expect(String(url)).toContain('limit=6')
    expect(String(url)).toContain('api_key=key123')

    expect(results).toHaveLength(1)
    expect(results[0].lat).toBeCloseTo(38.0522288)
    expect(results[0].lng).toBeCloseTo(23.7913131)
    expect(results[0].displayName).toBe('Λεωφόρος Κηφισίας 100, Μαρούσι, Αττική, Ελλάδα')
    expect(results[0].city).toBe('Μαρούσι')
  })

  it('honors a custom limit in the request URL and truncates results to it', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...SEARCH_FIXTURE[0], lat: String(38 + i * 0.001) }))
    fetchMock.mockResolvedValueOnce(jsonResponse(many))

    const results = await geocodeSuggest('Αθήνα', 'key123', 3)

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('limit=3')
    expect(results).toHaveLength(3)
  })

  it('logs 1 geocoding "suggest" unit on a successful response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SEARCH_FIXTURE))
    await geocodeSuggest('Αθήνα', 'key123')
    expect(logApiUsageMock).toHaveBeenCalledWith({ service: 'geocoding', operation: 'suggest', units: 1 })
  })

  it('returns an empty array when the service finds nothing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const results = await geocodeSuggest('ανύπαρκτη διεύθυνση', 'key123')
    expect(results).toEqual([])
  })

  it('throws a Greek-language GeocodeError on 401 (bad api key) without logging usage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))
    await expect(geocodeSuggest('Αθήνα', 'bad-key')).rejects.toMatchObject({ message: expect.stringMatching(/κλειδί/) })
    expect(logApiUsageMock).not.toHaveBeenCalled()
  })
})

describe('geocodeReverse', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    logApiUsageMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('throws without hitting the network for non-finite coordinates', async () => {
    await expect(geocodeReverse(Number.NaN, 23.79, 'key123')).rejects.toThrow(GeocodeError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls geocode.maps.co/reverse with lat/lon + api_key and parses the address', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(REVERSE_FIXTURE))

    const result = await geocodeReverse(38.0522288, 23.7913131, 'key123')

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('https://geocode.maps.co/reverse?lat=38.0522288&lon=23.7913131')
    expect(String(url)).toContain('api_key=key123')

    expect(result).not.toBeNull()
    expect(result!.city).toBe('Μαρούσι')
    expect(result!.zip).toBe('15125')
  })

  it('logs 1 geocoding unit on a successful reverse response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(REVERSE_FIXTURE))
    await geocodeReverse(38.05, 23.79, 'key123')
    expect(logApiUsageMock).toHaveBeenCalledWith({ service: 'geocoding', operation: 'reverse', units: 1 })
  })

  it('returns null when the response has no usable lat/lon', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unable to geocode' }))
    const result = await geocodeReverse(0, 0, 'key123')
    expect(result).toBeNull()
  })
})
