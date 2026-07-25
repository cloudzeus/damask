import { describe, it, expect, vi } from 'vitest'

// Τα pure preparePartnerRows/buildPartnerUpdateData δεν αγγίζουν αυτά τα modules —
// mock-άρονται μόνο για να κοπεί η αλυσίδα imports (enrich-actions → @/auth → next-auth).
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/trdr/irsdata', () => ({ resolveIrsdataCode: vi.fn() }))
vi.mock('@/lib/trdr/enrich-actions', () => ({ applyAadeToTrdr: vi.fn(), gemiSyncTrdr: vi.fn(), matchTrdrRegionAction: vi.fn() }))
vi.mock('@/lib/geocode', () => ({ geocodeSearch: vi.fn() }))
vi.mock('@/lib/settings', () => ({ getIntegration: vi.fn() }))

import { preparePartnerRows, buildPartnerUpdateData } from '@/lib/ingestion/commit/partner-upsert'

describe('preparePartnerRows', () => {
  it('maps parsed fields to Trdr create-data with first phone/email + default sodtype', () => {
    const founding = new Date('2007-10-08')
    const parsed = [{ rowNum: 1, ok: true as const, data: {
      afm: '094014201', name: 'Damask', doy: "Α' ΑΘΗΝΩΝ", legalForm: 'ΑΕ', jobtype: 'Εμπόριο',
      address: 'Οδός 1', city: 'Αθήνα', district: 'Κέντρο', zip: '11111',
      phone: '2101234567', phone2: '6971234567', fax: '2107654321',
      email: 'info@damask.gr', emailAcc: 'logistirio@damask.gr', website: 'damask.gr',
      foundingDate: founding, employees: 5, annualRevenue: 26357713.5, notes: 'σημείωση', sodtype: 12,
    } }]
    const prepared = preparePartnerRows(parsed)
    expect(prepared).toEqual([{ rowNum: 1, afm: '094014201', doy: "Α' ΑΘΗΝΩΝ", data: {
      NAME: 'Damask', AFM: '094014201', ADDRESS: 'Οδός 1', CITY: 'Αθήνα', DISTRICT: 'Κέντρο', ZIP: '11111',
      PHONE01: '2101234567', PHONE02: '6971234567', FAX: '2107654321',
      EMAIL: 'info@damask.gr', EMAILACC: 'logistirio@damask.gr', WEBPAGE: 'damask.gr',
      JOBTYPETRD: 'Εμπόριο', appLegalForm: 'ΑΕ', foundingDate: founding,
      appEmployees: 5, appAnnualRevenue: 26357713.5, appNotes: 'σημείωση', SODTYPE: 12,
    } }])
  })
  it('skips invalid rows and nulls empty optionals', () => {
    const parsed = [
      { rowNum: 1, ok: false as const, errors: [] },
      { rowNum: 2, ok: true as const, data: { afm: '999999999', name: 'B', sodtype: 13 } },
    ]
    const prepared = preparePartnerRows(parsed)
    expect(prepared).toHaveLength(1)
    expect(prepared[0].doy).toBeNull()
    expect(prepared[0].data).toMatchObject({
      NAME: 'B', AFM: '999999999', ADDRESS: null, PHONE01: null, PHONE02: null,
      EMAILACC: null, FAX: null, foundingDate: null, appEmployees: null, appAnnualRevenue: null, SODTYPE: 13,
    })
  })
})

describe('buildPartnerUpdateData', () => {
  const base = {
    NAME: 'Damask', AFM: '094014201', ADDRESS: null, CITY: 'Αθήνα', DISTRICT: null, ZIP: null,
    PHONE01: null, PHONE02: '6971234567', FAX: null, EMAIL: 'a@b.gr', EMAILACC: null,
    WEBPAGE: null, JOBTYPETRD: null, appLegalForm: null, foundingDate: null,
    appEmployees: null, appAnnualRevenue: null, appNotes: null, SODTYPE: 13,
  }
  it('omits SODTYPE and skips null/blank optionals, keeps NAME + provided values', () => {
    expect(buildPartnerUpdateData(base, null)).toEqual({
      NAME: 'Damask', AFM: '094014201', CITY: 'Αθήνα', PHONE02: '6971234567', EMAIL: 'a@b.gr',
    })
  })
  it('includes IRSDATA when the ΔΟΥ resolved to a code — never clears it otherwise', () => {
    expect(buildPartnerUpdateData(base, '1131')).toMatchObject({ IRSDATA: '1131' })
    expect(buildPartnerUpdateData(base, null)).not.toHaveProperty('IRSDATA')
  })
})
