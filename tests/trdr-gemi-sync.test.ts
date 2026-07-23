import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same vi.hoisted(h.db) idiom as tests/pm-c2g-match-actions.test.ts / tests/pm-replace-expense.test.ts.
const h = vi.hoisted(() => ({ db: {} as any, bunny: { uploads: [] as Array<{ key: string; contentType?: string }> } }))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({ user: { id: 'u1', permissions: ['customer.view', 'customer.edit'] } })),
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
  type GemiCompanyRaw,
} from '@/lib/trdr/gemi'
import { matchRegion } from '@/lib/registries/regions'
import {
  gemiSyncTrdr,
  applyAadeToTrdr,
  matchTrdrRegionAction,
  bulkMatchTrdrRegions,
  saveTrdrGemiDocument,
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

describe('gemiSyncTrdr', () => {
  beforeEach(freshDb)

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
