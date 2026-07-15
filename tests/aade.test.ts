import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/settings', () => ({ getIntegration: vi.fn(async () => ({})) }))

import { getIntegration } from '@/lib/settings'
import { parseAadeXml, lookupAfm } from '@/lib/aade'

describe('parseAadeXml', () => {
  it('parses a typical success fixture (namespaced tags)', () => {
    const xml = `<?xml version="1.0"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
      <soapenv:Body>
        <ns:rgWsPublic2AfmMethodResponse xmlns:ns="http://rgwspublic2.gsis.gr/RgWsPublic2Service">
          <ns:RG_WS_PUBLIC2_RESULT>
            <ns:afm>094019245</ns:afm>
            <ns:onomasia>ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.</ns:onomasia>
            <ns:commer_title>DAMASK</ns:commer_title>
            <ns:postal_address>ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ</ns:postal_address>
            <ns:postal_address_no>100</ns:postal_address_no>
            <ns:postal_zip_code>15125</ns:postal_zip_code>
            <ns:postal_area_description>ΜΑΡΟΥΣΙ</ns:postal_area_description>
            <ns:doy>1148</ns:doy>
            <ns:doy_descr>ΦΑΕ ΑΘΗΝΩΝ</ns:doy_descr>
            <ns:firm_act_descr>ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΥΦΑΣΜΑΤΩΝ</ns:firm_act_descr>
          </ns:RG_WS_PUBLIC2_RESULT>
        </ns:rgWsPublic2AfmMethodResponse>
      </soapenv:Body>
    </soapenv:Envelope>`

    const data = parseAadeXml(xml)

    expect(data).not.toBeNull()
    expect(data!.afm).toBe('094019245')
    expect(data!.onomasia).toBe('ΔΑΜΑΣΚ ΥΦΑΣΜΑΤΑ Α.Ε.')
    expect(data!.commerTitle).toBe('DAMASK')
    expect(data!.postalAddress).toBe('ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ')
    expect(data!.postalAddressNo).toBe('100')
    expect(data!.postalZipCode).toBe('15125')
    expect(data!.postalAreaDescription).toBe('ΜΑΡΟΥΣΙ')
    expect(data!.doy).toBe('1148')
    expect(data!.doyDescr).toBe('ΦΑΕ ΑΘΗΝΩΝ')
    expect(data!.firmActDescr).toBe('ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΥΦΑΣΜΑΤΩΝ')
  })

  it('is tolerant of responses with no namespace prefix at all', () => {
    const xml = `<result><afm>123456789</afm><onomasia>Χωρίς namespace</onomasia></result>`
    const data = parseAadeXml(xml)
    expect(data!.afm).toBe('123456789')
    expect(data!.onomasia).toBe('Χωρίς namespace')
  })

  it('decodes XML entities in text content', () => {
    const xml = `<result><afm>123456789</afm><onomasia>Α &amp; Β Ο.Ε. &lt;test&gt; "quoted"</onomasia></result>`
    const data = parseAadeXml(xml)
    expect(data!.onomasia).toBe('Α & Β Ο.Ε. <test> "quoted"')
  })

  it('returns null when the response has neither afm nor onomasia (unrecognized shape)', () => {
    const xml = `<result><doy>1148</doy></result>`
    expect(parseAadeXml(xml)).toBeNull()
  })

  it('treats self-closing / empty tags as absent (null), not empty string', () => {
    const xml = `<result><afm>123456789</afm><onomasia>Test ΑΕ</onomasia><commer_title/><doy_descr></doy_descr></result>`
    const data = parseAadeXml(xml)
    expect(data!.commerTitle).toBeNull()
    expect(data!.doyDescr).toBeNull()
  })
})

describe('lookupAfm', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(getIntegration).mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rejects a malformed AFM before making any network call', async () => {
    const result = await lookupAfm('123')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_afm')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a friendly Greek message pointing to aade.gr when credentials are not configured', async () => {
    vi.mocked(getIntegration).mockResolvedValue({})

    const result = await lookupAfm('094019245')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('missing_credentials')
      expect(result.message).toMatch(/aade\.gr/)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parses a successful SOAP response into structured data and sends the target AFM in the request', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ username: 'u', password: 'p', afmCalledFor: '999999999' })
    fetchMock.mockResolvedValueOnce(
      new Response(`<result><afm>094019245</afm><onomasia>ΔΑΜΑΣΚ Α.Ε.</onomasia></result>`, { status: 200 }),
    )

    const result = await lookupAfm('094019245')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.onomasia).toBe('ΔΑΜΑΣΚ Α.Ε.')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2')
    expect(init.method).toBe('POST')
    expect(init.body).toContain('094019245')
    expect(init.body).toContain('<ns:username>u</ns:username>')
    expect(init.body).toContain('<ns:password>p</ns:password>')
  })

  it('surfaces a SOAP Fault as a Greek-prefixed error message', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ username: 'u', password: 'p' })
    fetchMock.mockResolvedValueOnce(
      new Response(
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultstring>Invalid credentials</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`,
        { status: 200 },
      ),
    )

    const result = await lookupAfm('094019245')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('soap_fault')
      expect(result.message).toContain('Invalid credentials')
      expect(result.message).toMatch(/ΑΑΔΕ/)
    }
  })

  it('reports "not found" when the response has no onomasia', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ username: 'u', password: 'p' })
    fetchMock.mockResolvedValueOnce(new Response(`<result></result>`, { status: 200 }))

    const result = await lookupAfm('094019245')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })

  it('handles network failure gracefully instead of throwing', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ username: 'u', password: 'p' })
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))

    const result = await lookupAfm('094019245')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('network_error')
  })
})
