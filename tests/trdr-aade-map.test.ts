import { describe, it, expect } from 'vitest'
import { s, normalizeAfm, isValidAfm, mapAadeResponse, type AadeRawResponse } from '@/lib/trdr/aade-map'

describe('s() — nil coercion', () => {
  it('passes through trimmed strings', () => {
    expect(s('  ΔΟΚΙΜΗ  ')).toBe('ΔΟΚΙΜΗ')
  })
  it('empty/whitespace-only strings become null', () => {
    expect(s('')).toBeNull()
    expect(s('   ')).toBeNull()
  })
  it('null/undefined stay null', () => {
    expect(s(null)).toBeNull()
    expect(s(undefined)).toBeNull()
  })
  it('numbers/booleans are stringified', () => {
    expect(s(42)).toBe('42')
    expect(s(true)).toBe('true')
  })
  it('xml2js attribute-prefix nil marker → null', () => {
    expect(s({ '@_xsi:nil': 'true' })).toBeNull()
  })
  it('SOAP→JSON $ nil marker → null', () => {
    expect(s({ $: { 'xsi:nil': 'true' } })).toBeNull()
    expect(s({ $: { nil: 'true' } })).toBeNull()
  })
  it('SOAP→JSON text node ($, _) → the trimmed text', () => {
    expect(s({ $: { type: 'string' }, _: '  τιμή  ' })).toBe('τιμή')
  })
  it('unrecognized object shape → null', () => {
    expect(s({ foo: 'bar' })).toBeNull()
  })
})

describe('normalizeAfm / isValidAfm', () => {
  it('strips a country prefix and non-digit characters', () => {
    expect(normalizeAfm('EL999863881')).toBe('999863881')
    expect(normalizeAfm(' 999-863-881 ')).toBe('999863881')
  })
  it('valid 9-digit AFM', () => {
    expect(isValidAfm('999863881')).toBe(true)
  })
  it('rejects a bad AFM (wrong length / non-numeric)', () => {
    expect(isValidAfm('12345')).toBe(false)
    expect(isValidAfm('99986388X')).toBe(false)
    expect(isValidAfm('')).toBe(false)
  })
})

const FULL_RAW: AadeRawResponse = {
  basic_rec: {
    afm: '999863881',
    onomasia: 'ΔΟΚΙΜΗ ΑΕ',
    commer_title: 'ΔΟΚΙΜΗ',
    postal_address: 'Ερμού',
    postal_address_no: '10',
    postal_zip_code: '10563',
    postal_area_description: 'ΑΘΗΝΑ',
    regist_date: '2010-05-01',
    doy_descr: "Α' ΑΘΗΝΩΝ",
    legal_status_descr: 'Α.Ε.',
    deactivation_flag: '1',
    deactivation_flag_descr: 'ΕΝΕΡΓΗ',
    firm_flag_descr: 'ΚΑΝΟΝΙΚΗ',
    stop_date: { '@_xsi:nil': 'true' },
  },
  firm_act_tab: {
    item: [
      { firm_act_code: '47.11', firm_act_descr: 'Λιανικό εμπόριο', firm_act_kind: '2' },
      { firm_act_code: '46.90', firm_act_descr: 'Χονδρικό εμπόριο', firm_act_kind: '1' },
    ],
  },
}

describe('mapAadeResponse', () => {
  it('maps the full fixture to { mapped, activities }', () => {
    const result = mapAadeResponse(FULL_RAW)!
    expect(result).not.toBeNull()
    expect(result.mapped).toEqual({
      NAME: 'ΔΟΚΙΜΗ ΑΕ',
      ADDRESS: 'Ερμού 10',
      ZIP: '10563',
      CITY: 'ΑΘΗΝΑ',
      foundingDate: new Date('2010-05-01'),
      aadeStatus: 'ΕΝΕΡΓΗ',
      aadeFirmKind: 'ΚΑΝΟΝΙΚΗ',
      appLegalForm: 'Α.Ε.',
    })
  })

  it('firm_act_kind "1" → PRIMARY, else SECONDARY', () => {
    const result = mapAadeResponse(FULL_RAW)!
    expect(result.activities).toEqual([
      { code: '47.11', description: 'Λιανικό εμπόριο', kind: 'SECONDARY', order: 0 },
      { code: '46.90', description: 'Χονδρικό εμπόριο', kind: 'PRIMARY', order: 1 },
    ])
  })

  it('promotes the first activity to PRIMARY when none is flagged "1"', () => {
    const result = mapAadeResponse({
      basic_rec: { afm: '999863881', onomasia: 'X' },
      firm_act_tab: { item: [{ firm_act_code: 'A', firm_act_descr: 'a', firm_act_kind: '2' }] },
    })!
    expect(result.activities[0].kind).toBe('PRIMARY')
  })

  it('normalizes a single (non-array) firm_act_tab.item into a one-element list', () => {
    const result = mapAadeResponse({
      basic_rec: { afm: '999863881', onomasia: 'X' },
      firm_act_tab: { item: { firm_act_code: 'A', firm_act_descr: 'a', firm_act_kind: '1' } },
    })!
    expect(result.activities).toHaveLength(1)
    expect(result.activities[0].code).toBe('A')
  })

  it('missing firm_act_tab → empty activities array', () => {
    const result = mapAadeResponse({ basic_rec: { afm: '999863881', onomasia: 'X' } })!
    expect(result.activities).toEqual([])
  })

  it('missing basic_rec → null (not found)', () => {
    expect(mapAadeResponse({})).toBeNull()
  })

  it('basic_rec without afm → null (not found)', () => {
    expect(mapAadeResponse({ basic_rec: { onomasia: 'X' } })).toBeNull()
  })

  it('missing optional fields on basic_rec map to null, not throwing', () => {
    const result = mapAadeResponse({ basic_rec: { afm: '999863881' } })!
    expect(result.mapped.NAME).toBe('')
    expect(result.mapped.ADDRESS).toBeNull()
    expect(result.mapped.ZIP).toBeNull()
    expect(result.mapped.CITY).toBeNull()
    expect(result.mapped.foundingDate).toBeNull()
    expect(result.mapped.aadeStatus).toBeNull()
    expect(result.mapped.aadeFirmKind).toBeNull()
    expect(result.mapped.appLegalForm).toBeNull()
  })

  it('ADDRESS is null when both postal_address and postal_address_no are missing', () => {
    const result = mapAadeResponse({ basic_rec: { afm: '999863881', postal_address: { '@_xsi:nil': 'true' } } })!
    expect(result.mapped.ADDRESS).toBeNull()
  })

  it('an invalid regist_date maps foundingDate to null instead of an Invalid Date', () => {
    const result = mapAadeResponse({ basic_rec: { afm: '999863881', regist_date: 'not-a-date' } })!
    expect(result.mapped.foundingDate).toBeNull()
  })
})
