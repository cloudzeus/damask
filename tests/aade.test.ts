import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { aadeLookup, AadeLookupError } from '@/lib/aade'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const ACTIVE_FIXTURE = {
  basic_rec: {
    afm: '094019245',
    onomasia: 'ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.',
    commer_title: 'DAMASK',
    doy_descr: 'ΦΑΕ ΑΘΗΝΩΝ',
    legal_status_descr: 'ΑΕ',
    postal_address: 'ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ',
    postal_address_no: '100',
    postal_zip_code: '15125',
    postal_area_description: 'ΜΑΡΟΥΣΙ',
    regist_date: '1990-01-15',
    stop_date: null,
    deactivation_flag: '1',
    deactivation_flag_descr: 'ΕΝΕΡΓΟΣ ΑΦΜ',
    firm_flag_descr: 'ΚΑΝΟΝΙΚΟ ΚΑΘΕΣΤΩΣ',
  },
  firm_act_tab: {
    item: [
      { firm_act_code: '13200000', firm_act_descr: 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΥΦΑΣΜΑΤΩΝ', firm_act_kind: '1', firm_act_kind_descr: 'ΚΥΡΙΑ' },
      { firm_act_code: '46420000', firm_act_descr: 'ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΕΝΔΥΜΑΤΩΝ', firm_act_kind: '2', firm_act_kind_descr: 'ΔΕΥΤΕΡΕΥΟΥΣΑ' },
    ],
  },
}

const INACTIVE_FIXTURE = {
  basic_rec: {
    afm: '123456789',
    onomasia: 'ΚΛΕΙΣΤΗ ΕΠΙΧΕΙΡΗΣΗ Ο.Ε.',
    commer_title: null,
    doy_descr: 'Α ΑΘΗΝΩΝ',
    legal_status_descr: 'ΟΕ',
    postal_address: 'ΠΑΤΗΣΙΩΝ',
    postal_address_no: '5',
    postal_zip_code: '10434',
    postal_area_description: 'ΑΘΗΝΑ',
    regist_date: '2001-05-01',
    stop_date: '2020-12-31',
    deactivation_flag: '0',
    deactivation_flag_descr: 'ΔΙΑΚΟΨΑΣ',
    firm_flag_descr: 'ΚΑΝΟΝΙΚΟ ΚΑΘΕΣΤΩΣ',
  },
  firm_act_tab: {
    // single item (not array) — must be normalized to a 1-element array.
    item: { firm_act_code: '46420000', firm_act_descr: 'ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΕΝΔΥΜΑΤΩΝ', firm_act_kind: '2' },
  },
}

describe('aadeLookup', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rejects a malformed AFM before making any network call', async () => {
    await expect(aadeLookup('123')).rejects.toThrow(AadeLookupError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the AFM to vat.wwa.gr/afm2info and maps an active company with an array of activities', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(ACTIVE_FIXTURE))

    const result = await aadeLookup('094019245')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://vat.wwa.gr/afm2info')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ afm: '094019245' })

    expect(result).not.toBeNull()
    expect(result!.afm).toBe('094019245')
    expect(result!.name).toBe('ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.')
    expect(result!.shortName).toBe('DAMASK')
    expect(result!.doy).toBe('ΦΑΕ ΑΘΗΝΩΝ')
    expect(result!.legalForm).toBe('ΑΕ')
    expect(result!.address).toBe('ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ 100')
    expect(result!.zip).toBe('15125')
    expect(result!.city).toBe('ΜΑΡΟΥΣΙ')
    expect(result!.country).toBe('GR')
    expect(result!.foundingDate).toBe('1990-01-15')
    expect(result!.profession).toBe('ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΥΦΑΣΜΑΤΩΝ')
    expect(result!.activities).toHaveLength(2)
    expect(result!.activities[0]).toEqual({ code: '13200000', description: 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΥΦΑΣΜΑΤΩΝ', kind: 'PRIMARY' })
    expect(result!.activities[1].kind).toBe('SECONDARY')
    expect(result!.aadeStatus).toBe('ΕΝΕΡΓΟΣ ΑΦΜ')
    expect(result!.isActive).toBe(true)
  })

  it('normalizes a single (non-array) firm_act_tab.item and marks a stopped company inactive', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(INACTIVE_FIXTURE))

    const result = await aadeLookup('123456789')

    expect(result).not.toBeNull()
    expect(result!.isActive).toBe(false)
    expect(result!.activities).toHaveLength(1)
    expect(result!.activities[0].kind).toBe('SECONDARY')
    expect(result!.profession).toBe('ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΕΝΔΥΜΑΤΩΝ')
  })

  it('returns null when the AFM is not found in the registry (no basic_rec.afm)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ basic_rec: {}, firm_act_tab: {} }))

    const result = await aadeLookup('999999999')

    expect(result).toBeNull()
  })

  it('throws a Greek-language AadeLookupError on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502))

    await expect(aadeLookup('094019245')).rejects.toMatchObject({ message: expect.stringMatching(/ΑΑΔΕ/) })
  })

  it('throws a Greek-language AadeLookupError on network failure instead of hanging', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))

    await expect(aadeLookup('094019245')).rejects.toThrow(AadeLookupError)
  })

  it('handles empty (no activities) firm_act_tab gracefully', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      basic_rec: { ...ACTIVE_FIXTURE.basic_rec },
      firm_act_tab: {},
    }))

    const result = await aadeLookup('094019245')

    expect(result).not.toBeNull()
    expect(result!.activities).toEqual([])
    expect(result!.profession).toBeNull()
  })
})
