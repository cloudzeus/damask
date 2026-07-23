import { describe, it, expect } from 'vitest'
import { mapGemiCompany, type GemiCompanyRaw } from '@/lib/trdr/gemi-map'

const FULL_FIXTURE: GemiCompanyRaw = {
  arGemi: 123456789000,
  afm: '999863881',
  coNameEl: 'ΔΟΚΙΜΗ ΑΕ',
  coTitlesEl: ['ΔΟΚΙΜΗ'],
  status: { id: 1, descr: 'Ενεργή', isActive: true },
  city: 'ΑΘΗΝΑ',
  street: 'Ερμού',
  streetNumber: '10',
  zipCode: '10563',
  email: 'info@dokimi.gr',
  isBranch: false,
  objective: 'Εμπόριο',
  legalType: { id: 3, descr: 'Α.Ε.' },
  gemiOffice: { id: 7, descr: 'ΓΕΜΗ Αθηνών' },
  prefecture: { id: 'A1', descr: 'Αττικής' },
  municipality: { id: 'M1', descr: 'Αθηναίων' },
  incorporationDate: '2010-05-01T00:00:00Z',
  lastStatusChange: '2020-01-15T00:00:00Z',
  autoRegistered: true,
  activities: [
    { activity: { id: '47.11', descr: 'Λιανικό εμπόριο' }, type: '2' },
    { activity: { id: '46.90', descr: 'Χονδρικό εμπόριο' }, type: '1' },
  ],
}

describe('mapGemiCompany', () => {
  it('maps the full fixture to a Trdr-shaped patch', () => {
    const patch = mapGemiCompany(FULL_FIXTURE)
    expect(patch.NAME).toBe('ΔΟΚΙΜΗ ΑΕ')
    expect(patch.ADDRESS).toBe('Ερμού 10')
    expect(patch.ZIP).toBe('10563')
    expect(patch.CITY).toBe('ΑΘΗΝΑ')
    expect(patch.EMAIL).toBe('info@dokimi.gr')
    expect(patch.arGemi).toBe('123456789000')
    expect(patch.gemiOffice).toBe('ΓΕΜΗ Αθηνών')
    expect(patch.gemiStatus).toBe('Ενεργή')
    expect(patch.gemiObjective).toBe('Εμπόριο')
    expect(patch.gemiIsBranch).toBe(false)
    expect(patch.gemiAutoRegistered).toBe(true)
    expect(patch.appLegalForm).toBe('Α.Ε.')
    expect(patch.ISACTIVE).toBe(1)
  })

  it('CITY falls back to municipality.descr when city is missing', () => {
    const patch = mapGemiCompany({ ...FULL_FIXTURE, city: null })
    expect(patch.CITY).toBe('Αθηναίων')
  })

  it('ADDRESS is null when both street and streetNumber are missing', () => {
    const patch = mapGemiCompany({ ...FULL_FIXTURE, street: null, streetNumber: null })
    expect(patch.ADDRESS).toBeNull()
  })

  it('parses incorporationDate/lastStatusChange into real Date objects', () => {
    const patch = mapGemiCompany(FULL_FIXTURE)
    expect(patch.foundingDate).toBeInstanceOf(Date)
    expect(patch.foundingDate!.toISOString()).toBe('2010-05-01T00:00:00.000Z')
    expect(patch.gemiLastStatusChange).toBeInstanceOf(Date)
    expect(patch.gemiLastStatusChange!.toISOString()).toBe('2020-01-15T00:00:00.000Z')
  })

  it('ISACTIVE is 0 only when status.isActive is explicitly false', () => {
    expect(mapGemiCompany({ ...FULL_FIXTURE, status: { ...FULL_FIXTURE.status, isActive: false } }).ISACTIVE).toBe(0)
    expect(mapGemiCompany({ ...FULL_FIXTURE, status: undefined }).ISACTIVE).toBe(1)
  })

  it('missing optional fields map to null, not throwing', () => {
    const patch = mapGemiCompany({ coNameEl: 'ΜΟΝΟ ΟΝΟΜΑ' })
    expect(patch.NAME).toBe('ΜΟΝΟ ΟΝΟΜΑ')
    expect(patch.ADDRESS).toBeNull()
    expect(patch.ZIP).toBeNull()
    expect(patch.CITY).toBeNull()
    expect(patch.EMAIL).toBeUndefined()
    expect(patch.arGemi).toBeNull()
    expect(patch.gemiOffice).toBeNull()
    expect(patch.gemiStatus).toBeNull()
    expect(patch.foundingDate).toBeNull()
    expect(patch.gemiLastStatusChange).toBeNull()
    expect(patch.appLegalForm).toBeNull()
    expect(patch.activities).toEqual([])
  })

  it('EMAIL key is absent (not null) when the ΓΕΜΗ payload has no email', () => {
    const patch = mapGemiCompany({ ...FULL_FIXTURE, email: null })
    expect('EMAIL' in patch).toBe(false)
  })

  it('coerces numeric arGemi to a string', () => {
    expect(mapGemiCompany({ arGemi: 123 }).arGemi).toBe('123')
    expect(mapGemiCompany({ arGemi: '456' }).arGemi).toBe('456')
  })

  describe('activities → kind mapping', () => {
    it('type "1" is PRIMARY, anything else is SECONDARY', () => {
      const patch = mapGemiCompany(FULL_FIXTURE)
      expect(patch.activities).toEqual([
        { code: '47.11', description: 'Λιανικό εμπόριο', kind: 'SECONDARY', order: 0 },
        { code: '46.90', description: 'Χονδρικό εμπόριο', kind: 'PRIMARY', order: 1 },
      ])
    })

    it('promotes the first activity to PRIMARY when none is flagged type "1"', () => {
      const patch = mapGemiCompany({
        activities: [
          { activity: { id: '47.11', descr: 'Λιανικό' }, type: '2' },
          { activity: { id: '46.90', descr: 'Χονδρικό' }, type: '3' },
        ],
      })
      expect(patch.activities[0].kind).toBe('PRIMARY')
      expect(patch.activities[1].kind).toBe('SECONDARY')
    })

    it('filters out activities with no activity.id', () => {
      const patch = mapGemiCompany({
        activities: [
          { activity: { id: '47.11', descr: 'Λιανικό' }, type: '1' },
          { activity: undefined, type: '2' },
          { type: '2' },
        ],
      })
      expect(patch.activities).toHaveLength(1)
      expect(patch.activities[0].code).toBe('47.11')
    })

    it('empty/undefined activities list maps to an empty array', () => {
      expect(mapGemiCompany({ activities: [] }).activities).toEqual([])
      expect(mapGemiCompany({}).activities).toEqual([])
    })
  })

  it('invalid date strings map to null instead of an Invalid Date', () => {
    const patch = mapGemiCompany({ incorporationDate: 'not-a-date', lastStatusChange: 'also-not-a-date' })
    expect(patch.foundingDate).toBeNull()
    expect(patch.gemiLastStatusChange).toBeNull()
  })
})
