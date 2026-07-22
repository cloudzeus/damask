import { describe, it, expect } from 'vitest'
import { preparePartnerRows, buildPartnerUpdateData } from '@/lib/ingestion/commit/partner-upsert'

describe('preparePartnerRows', () => {
  it('maps parsed fields to Trdr create-data with first phone/email + default sodtype', () => {
    const parsed = [{ rowNum: 1, ok: true as const, data: { afm: '094014201', name: 'Damask', address: 'Οδός 1', city: 'Αθήνα', zip: '11111', phone: '2101234567', email: 'info@damask.gr', website: 'damask.gr', sodtype: 12 } }]
    const prepared = preparePartnerRows(parsed)
    expect(prepared).toEqual([{ rowNum: 1, afm: '094014201', data: {
      NAME: 'Damask', AFM: '094014201', ADDRESS: 'Οδός 1', CITY: 'Αθήνα', ZIP: '11111',
      PHONE01: '2101234567', EMAIL: 'info@damask.gr', WEBPAGE: 'damask.gr', SODTYPE: 12,
    } }])
  })
  it('skips invalid rows and nulls empty optionals', () => {
    const parsed = [
      { rowNum: 1, ok: false as const, errors: [] },
      { rowNum: 2, ok: true as const, data: { afm: '999999999', name: 'B', sodtype: 13 } },
    ]
    const prepared = preparePartnerRows(parsed)
    expect(prepared).toHaveLength(1)
    expect(prepared[0].data).toMatchObject({ NAME: 'B', AFM: '999999999', ADDRESS: null, PHONE01: null, SODTYPE: 13 })
  })
})

describe('buildPartnerUpdateData', () => {
  it('omits SODTYPE and skips null/blank optionals, keeps NAME + provided values', () => {
    const d = { NAME: 'Damask', AFM: '094014201', ADDRESS: null, CITY: 'Αθήνα', ZIP: null, PHONE01: null, EMAIL: 'a@b.gr', WEBPAGE: null, SODTYPE: 13 }
    expect(buildPartnerUpdateData(d)).toEqual({ NAME: 'Damask', AFM: '094014201', CITY: 'Αθήνα', EMAIL: 'a@b.gr' })
  })
})
