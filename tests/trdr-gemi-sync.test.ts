import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Same vi.hoisted(h.db) idiom as tests/pm-c2g-match-actions.test.ts / tests/pm-replace-expense.test.ts.
const h = vi.hoisted(() => ({ db: {} as any, bunny: { uploads: [] as Array<{ key: string; contentType?: string }> } }))

// Same helper idiom as tests/partners-actions.test.ts.
function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
}

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({ user: { id: 'u1', permissions: ['customer.view', 'customer.edit', 'settings.manage'] } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/bunny-storage', () => ({
  bunnyUploadPrivate: vi.fn(async ({ key, contentType }: { key: string; contentType?: string }) => {
    h.bunny.uploads.push({ key, contentType })
    return { key }
  }),
  bunnyDownload: vi.fn(),
}))
// Keep mapGemiCompany REAL (pure, no prisma) — only stub the network calls.
vi.mock('@/lib/trdr/gemi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/trdr/gemi')>('@/lib/trdr/gemi')
  return {
    ...actual,
    searchGemiCompanies: vi.fn(),
    getGemiCompany: vi.fn(),
    getGemiCompanyDocuments: vi.fn(),
    downloadGemiFile: vi.fn(),
    gemiMetadata: {
      legalTypes: vi.fn(),
      gemiOffices: vi.fn(),
      companyStatuses: vi.fn(),
      prefectures: vi.fn(),
      municipalities: vi.fn(),
    },
  }
})
vi.mock('@/lib/trdr/aade', () => ({ aadeLookup: vi.fn(), AadeError: class AadeError extends Error {} }))
// resolveKadForActivity mocked so we control canonical-code collisions deterministically
// (both '47.11' and '47.19' resolve to the same canonical '47.00' — simulates two AADE/GEMI
// activity codes that fold to the same KadCode entry).
vi.mock('@/lib/registries/kad', () => ({
  resolveKadForActivity: vi.fn(async () => ({
    code: '47.00',
    codeWithoutDots: '4700',
    codeAade: '47000000',
    description: 'Λιανικό εμπόριο',
  })),
}))
vi.mock('@/lib/registries/regions', () => ({ matchRegion: vi.fn() }))

import {
  getGemiCompany,
  getGemiCompanyDocuments,
  downloadGemiFile,
  gemiMetadata,
  type GemiCompanyRaw,
} from '@/lib/trdr/gemi'
import { aadeLookup } from '@/lib/trdr/aade'
import { matchRegion } from '@/lib/registries/regions'
import { requirePermission } from '@/lib/rbac-server'
import {
  gemiSyncTrdr,
  applyAadeToTrdr,
  matchTrdrRegionAction,
  bulkMatchTrdrRegions,
  saveTrdrGemiDocument,
  refreshGemiMetadata,
} from '@/lib/trdr/enrich-actions'

function freshDb() {
  h.db.trdr = {
    findUnique: vi.fn(async () => ({ id: 't1', AFM: '999863881', arGemi: null, ADDRESS: null, CITY: null, DISTRICT: null, ZIP: null, appLat: null, appLng: null, gemiData: null })),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
  }
  h.db.trdrKad = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
  }
  h.db.trdrDocument = {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async ({ where, create }: any) => ({ id: 'doc-1', ...where, ...create })),
    findMany: vi.fn(async () => []),
  }
  h.db.legalType = { upsert: vi.fn(async ({ where }: any) => ({ ...where })) }
  h.db.gemiOfficeRef = { upsert: vi.fn(async ({ where }: any) => ({ ...where })) }
  h.db.companyStatusRef = { upsert: vi.fn(async ({ where }: any) => ({ ...where })) }
  h.db.prefectureRef = { upsert: vi.fn(async ({ where }: any) => ({ ...where })) }
  h.db.municipalityRef = { upsert: vi.fn(async ({ where }: any) => ({ ...where })) }
  h.db.$transaction = vi.fn(async (fn: any) => fn(h.db))
  h.bunny.uploads = []
}

const GEMI_FIXTURE: GemiCompanyRaw = {
  arGemi: 123456789000,
  afm: '999863881',
  coNameEl: 'ΔΟΚΙΜΗ ΑΕ',
  status: { id: 1, descr: 'Ενεργή', isActive: true },
  city: 'ΑΘΗΝΑ',
  street: 'Ερμού',
  streetNumber: '10',
  zipCode: '10563',
  activities: [
    { activity: { id: '47.11', descr: 'Λιανικό εμπόριο ειδών' }, type: '2' }, // SECONDARY
    { activity: { id: '47.19', descr: 'Άλλο λιανικό εμπόριο' }, type: '1' }, // PRIMARY
  ],
}

// Same arGemi/afm/name as GEMI_FIXTURE but no address/office/status/etc — simulates
// a ΓΕΜΗ company payload where those fields are simply absent (mapper → null).
const GEMI_FIXTURE_NO_ADDRESS: GemiCompanyRaw = {
  arGemi: 123456789000,
  afm: '999863881',
  coNameEl: 'ΔΟΚΙΜΗ ΑΕ',
  activities: [],
}

describe('gemiSyncTrdr', () => {
  beforeEach(freshDb)

  it('FIX1: omits ADDRESS/ZIP/CITY (and other nullable GEMI fields) from the update payload when GEMI has no such data', async () => {
    vi.mocked(getGemiCompany).mockResolvedValue(GEMI_FIXTURE_NO_ADDRESS)
    vi.mocked(getGemiCompanyDocuments).mockResolvedValue({ decision: [], publication: [] })

    await gemiSyncTrdr('t1', { arGemi: '123456789000', syncDocuments: false })

    const updateData = h.db.trdr.update.mock.calls[0][0].data
    for (const key of [
      'ADDRESS', 'ZIP', 'CITY',
      'gemiOffice', 'gemiStatus', 'gemiObjective', 'gemiIsBranch', 'gemiAutoRegistered', 'gemiLastStatusChange',
      'foundingDate', 'appLegalForm',
    ]) {
      expect(updateData).not.toHaveProperty(key)
    }
    // Fields that SHOULD always be written stay explicit even when the source has no address.
    expect(updateData.gemiSyncedAt).toBeInstanceOf(Date)
    expect(updateData.gemiData).toEqual(GEMI_FIXTURE_NO_ADDRESS)
    expect(updateData.arGemi).toBe('123456789000')
  })

  it('FIX1: includes ADDRESS/ZIP/CITY in the update payload when GEMI returns them', async () => {
    vi.mocked(getGemiCompany).mockResolvedValue(GEMI_FIXTURE)
    vi.mocked(getGemiCompanyDocuments).mockResolvedValue({ decision: [], publication: [] })

    await gemiSyncTrdr('t1', { arGemi: '123456789000', syncDocuments: false })

    const updateData = h.db.trdr.update.mock.calls[0][0].data
    expect(updateData.ADDRESS).toBe('Ερμού 10')
    expect(updateData.ZIP).toBe('10563')
    expect(updateData.CITY).toBe('ΑΘΗΝΑ')
  })

  it('FIX2: surfaces a Greek message when arGemi collides with another Trdr (P2002)', async () => {
    vi.mocked(getGemiCompany).mockResolvedValue(GEMI_FIXTURE)
    vi.mocked(getGemiCompanyDocuments).mockResolvedValue({ decision: [], publication: [] })
    h.db.trdr.update = vi.fn(async () => {
      throw p2002Error()
    })

    await expect(gemiSyncTrdr('t1', { arGemi: '123456789000', syncDocuments: false })).rejects.toThrow(
      'Ο αριθμός ΓΕΜΗ έχει ήδη συνδεθεί με άλλον συναλλασσόμενο.',
    )
  })

  it('resolves arGemi via AFM search when not given/stored, updates Trdr, replaces TrdrKad with PRIMARY dedupe', async () => {
    vi.mocked(getGemiCompany).mockResolvedValue(GEMI_FIXTURE)
    vi.mocked(getGemiCompanyDocuments).mockResolvedValue({ decision: [], publication: [] })

    const result = await gemiSyncTrdr('t1', { arGemi: '123456789000', syncDocuments: false })

    expect(result.ok).toBe(true)
    expect(result.arGemi).toBe('123456789000')
    // Trdr updated with mapped fields + gemiSyncedAt + raw gemiData
    expect(h.db.trdr.update).toHaveBeenCalledTimes(1)
    const updateData = h.db.trdr.update.mock.calls[0][0].data
    expect(updateData.NAME).toBe('ΔΟΚΙΜΗ ΑΕ')
    expect(updateData.arGemi).toBe('123456789000')
    expect(updateData.gemiSyncedAt).toBeInstanceOf(Date)
    expect(updateData.gemiData).toEqual(GEMI_FIXTURE)

    // TrdrKad replaced: deleteMany then createMany, deduped by canonical code (both
    // activities resolve to '47.00') — PRIMARY (type '1', order 1) wins over SECONDARY.
    expect(h.db.trdrKad.deleteMany).toHaveBeenCalledWith({ where: { trdrId: 't1' } })
    expect(h.db.trdrKad.createMany).toHaveBeenCalledTimes(1)
    const kadRows = h.db.trdrKad.createMany.mock.calls[0][0].data
    expect(kadRows).toHaveLength(1)
    expect(kadRows[0]).toMatchObject({ trdrId: 't1', code: '47.00', kind: 'PRIMARY' })
    expect(result.kads).toBe(1)
  })

  it('imports documents per-doc, isolates failures, and uses the trdr/{id}/gemi/{kak}.{ext} key scheme', async () => {
    vi.mocked(getGemiCompany).mockResolvedValue(GEMI_FIXTURE)
    vi.mocked(getGemiCompanyDocuments).mockResolvedValue({
      decision: [
        { kak: 'D1', assemblyDecisionUrl: 'https://businessportal.gr/doc1', decisionSubject: 'Απόφαση Α' },
        { kak: 'D2', assemblyDecisionUrl: 'https://businessportal.gr/doc2', decisionSubject: 'Απόφαση Β' },
      ],
      publication: [],
    })
    vi.mocked(downloadGemiFile).mockImplementation(async (url: string) => {
      if (url.endsWith('doc2')) throw new Error('network down')
      return { buffer: Buffer.from('pdf-bytes'), contentType: 'application/pdf' }
    })

    const result = await gemiSyncTrdr('t1', { arGemi: '123456789000', syncDocuments: true })

    expect(result.documentsImported).toBe(1)
    expect(result.documentsFailed).toBe(1)
    expect(h.db.trdrDocument.upsert).toHaveBeenCalledTimes(1)
    const call = h.db.trdrDocument.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ trdrId_kak: { trdrId: 't1', kak: 'D1' } })
    expect(h.bunny.uploads).toHaveLength(1)
    expect(h.bunny.uploads[0].key).toBe('trdr/t1/gemi/D1.pdf')
  })

  it('throws a Greek error when no arGemi is given/stored and the AFM search finds nothing', async () => {
    h.db.trdr.findUnique = vi.fn(async () => ({ id: 't1', AFM: '999863881', arGemi: null }))
    const { searchGemiCompanies } = await import('@/lib/trdr/gemi')
    vi.mocked(searchGemiCompanies).mockResolvedValue({ results: [], totalResults: 0 })

    await expect(gemiSyncTrdr('t1', {})).rejects.toThrow()
  })
})

describe('applyAadeToTrdr', () => {
  beforeEach(freshDb)

  it('throws when the Trdr has no AFM', async () => {
    h.db.trdr.findUnique = vi.fn(async () => ({ id: 't1', AFM: null }))
    await expect(applyAadeToTrdr('t1')).rejects.toThrow()
    expect(h.db.trdr.update).not.toHaveBeenCalled()
  })

  it('FIX1: omits ADDRESS/ZIP/CITY (and other nullable AADE fields) from the update payload when AADE has no such data', async () => {
    vi.mocked(aadeLookup).mockResolvedValue({
      mapped: {
        NAME: 'ΔΟΚΙΜΗ ΑΕ', ADDRESS: null, ZIP: null, CITY: null,
        foundingDate: null, aadeStatus: null, aadeFirmKind: null, appLegalForm: null,
      },
      activities: [],
    })

    await applyAadeToTrdr('t1')

    const updateData = h.db.trdr.update.mock.calls[0][0].data
    for (const key of ['ADDRESS', 'ZIP', 'CITY', 'foundingDate', 'aadeStatus', 'aadeFirmKind', 'appLegalForm']) {
      expect(updateData).not.toHaveProperty(key)
    }
    expect(updateData.aadeSyncedAt).toBeInstanceOf(Date)
  })

  it('FIX1: includes ADDRESS/ZIP/CITY in the update payload when AADE returns them', async () => {
    vi.mocked(aadeLookup).mockResolvedValue({
      mapped: {
        NAME: 'ΔΟΚΙΜΗ ΑΕ', ADDRESS: 'Ερμού 10', ZIP: '10563', CITY: 'ΑΘΗΝΑ',
        foundingDate: null, aadeStatus: 'Ενεργός', aadeFirmKind: 'Φυσικό πρόσωπο', appLegalForm: 'ΑΕ',
      },
      activities: [],
    })

    await applyAadeToTrdr('t1')

    const updateData = h.db.trdr.update.mock.calls[0][0].data
    expect(updateData.ADDRESS).toBe('Ερμού 10')
    expect(updateData.ZIP).toBe('10563')
    expect(updateData.CITY).toBe('ΑΘΗΝΑ')
    expect(updateData.aadeStatus).toBe('Ενεργός')
    expect(updateData.aadeFirmKind).toBe('Φυσικό πρόσωπο')
    expect(updateData.appLegalForm).toBe('ΑΕ')
  })
})

describe('matchTrdrRegionAction', () => {
  beforeEach(freshDb)

  it('writes regionCode on the Trdr when matchRegion finds a hit', async () => {
    h.db.trdr.findUnique = vi.fn(async () => ({
      id: 't1', ADDRESS: 'Ερμού 10', CITY: 'Αθήνα', DISTRICT: null, ZIP: '10563', appLat: null, appLng: null, gemiData: null,
    }))
    vi.mocked(matchRegion).mockResolvedValue({
      regionCode: '1110202',
      breadcrumb: { region: null, regionalUnit: null, municipality: { code: '1110202', nameEL: 'Αθηναίων' } },
      confidence: 'name',
    })

    const result = await matchTrdrRegionAction('t1')

    expect(result).toMatchObject({ regionCode: '1110202', confidence: 'name' })
    expect(h.db.trdr.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { regionCode: '1110202' } })
  })

  it('returns null and does not write when matchRegion finds nothing', async () => {
    vi.mocked(matchRegion).mockResolvedValue(null)
    const result = await matchTrdrRegionAction('t1')
    expect(result).toBeNull()
    expect(h.db.trdr.update).not.toHaveBeenCalled()
  })
})

describe('bulkMatchTrdrRegions', () => {
  beforeEach(freshDb)

  it('tallies confidence per row and isolates per-row failures', async () => {
    h.db.trdr.findMany = vi.fn(async () => [
      { id: 'r1', ADDRESS: null, CITY: null, DISTRICT: null, ZIP: null, appLat: null, appLng: null, gemiData: null },
      { id: 'r2', ADDRESS: null, CITY: null, DISTRICT: null, ZIP: null, appLat: null, appLng: null, gemiData: null },
      { id: 'r3', ADDRESS: null, CITY: null, DISTRICT: null, ZIP: null, appLat: null, appLng: null, gemiData: null },
    ])
    vi.mocked(matchRegion)
      .mockResolvedValueOnce({ regionCode: 'r1code', breadcrumb: { region: null, regionalUnit: null, municipality: null }, confidence: 'gemi' })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('geocode down'))

    const tallies = await bulkMatchTrdrRegions()

    expect(tallies).toEqual({ gemi: 1, name: 0, geo: 0, none: 1, failed: 1 })
    expect(h.db.trdr.update).toHaveBeenCalledTimes(1)
    expect(h.db.trdr.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { regionCode: 'r1code' } })
  })
})

describe('saveTrdrGemiDocument', () => {
  beforeEach(freshDb)

  it('downloads + uploads to Bunny + upserts TrdrDocument with the trdr/{id}/gemi/{kak}.{ext} key', async () => {
    vi.mocked(downloadGemiFile).mockResolvedValue({ buffer: Buffer.from('pdf-bytes'), contentType: 'application/pdf' })

    const doc = await saveTrdrGemiDocument('t1', {
      kak: 'D9',
      docKind: 'DECISION',
      title: 'Απόφαση Δ9',
      sourceUrl: 'https://businessportal.gr/d9',
    })

    expect(doc).toBeTruthy()
    expect(h.bunny.uploads).toHaveLength(1)
    expect(h.bunny.uploads[0].key).toBe('trdr/t1/gemi/D9.pdf')
    expect(h.db.trdrDocument.upsert).toHaveBeenCalledTimes(1)
    const call = h.db.trdrDocument.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ trdrId_kak: { trdrId: 't1', kak: 'D9' } })
    expect(call.create.storageKey).toBe('trdr/t1/gemi/D9.pdf')
    expect(call.create.docKind).toBe('DECISION')
  })
})

describe('refreshGemiMetadata', () => {
  beforeEach(freshDb)

  it('FIX3: rejects when the caller lacks settings.manage, before hitting the network', async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error('Forbidden: απαιτείται settings.manage'))

    await expect(refreshGemiMetadata()).rejects.toThrow('Forbidden')

    expect(requirePermission).toHaveBeenCalledWith('settings.manage')
    expect(gemiMetadata.legalTypes).not.toHaveBeenCalled()
    expect(h.db.legalType.upsert).not.toHaveBeenCalled()
  })

  it('FIX3: fetches the 5 GEMI reference lists in parallel, upserts them, and returns counts', async () => {
    vi.mocked(gemiMetadata.legalTypes).mockResolvedValue([{ id: 1, descr: 'ΑΕ' }])
    vi.mocked(gemiMetadata.gemiOffices).mockResolvedValue([
      { id: 10, descr: 'ΓΕΜΗ Αθηνών', address: 'Ακαδημίας 7', city: 'Αθήνα', zipCode: '10671' },
    ])
    vi.mocked(gemiMetadata.companyStatuses).mockResolvedValue([{ id: 1, descr: 'Ενεργή', isActive: true }])
    vi.mocked(gemiMetadata.prefectures).mockResolvedValue([{ id: 'A1', descr: 'Αττικής' }])
    vi.mocked(gemiMetadata.municipalities).mockResolvedValue([{ id: 'M1', descr: 'Αθηναίων', prefectureId: 'A1' }])

    const result = await refreshGemiMetadata()

    expect(result).toEqual({
      ok: true,
      counts: { legalTypes: 1, gemiOffices: 1, companyStatuses: 1, prefectures: 1, municipalities: 1 },
    })
    expect(h.db.legalType.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }))
    expect(h.db.gemiOfficeRef.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        update: expect.objectContaining({ zip: '10671', city: 'Αθήνα' }),
      }),
    )
    expect(h.db.companyStatusRef.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }))
    expect(h.db.prefectureRef.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'A1' } }))
    expect(h.db.municipalityRef.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'M1' },
        update: expect.objectContaining({ prefectureId: 'A1' }),
      }),
    )
  })
})
