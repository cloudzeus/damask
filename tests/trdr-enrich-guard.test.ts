import { describe, it, expect, vi } from 'vitest'

/**
 * Surface-only guard test: επιβεβαιώνει ότι ΚΑΘΕ enrich action απορρίπτει
 * (throws) όταν το requirePermission αποτυγχάνει — δηλαδή ότι το gate είναι
 * πραγματικά καλωδιωμένο ΠΡΙΝ από οποιαδήποτε lib/prisma κλήση. Ίδιο idiom
 * με tests/pm-c2a2-actions-guard.test.ts / tests/registries-actions-guard.test.ts:
 * mockάρουμε rbac-server (reject) + prisma/next-cache/next-navigation/bunny-storage
 * + τα εξωτερικά clients (gemi/aade) + τα W1 building blocks (kad/regions) ώστε
 * το import module-level να μη σκοντάψει σε live network/DB config.
 */
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => {
    throw new Error('Forbidden')
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/bunny-storage', () => ({ bunnyUploadPrivate: vi.fn(), bunnyDownload: vi.fn() }))
vi.mock('@/lib/trdr/gemi', () => ({
  searchGemiCompanies: vi.fn(),
  getGemiCompany: vi.fn(),
  getGemiCompanyDocuments: vi.fn(),
  downloadGemiFile: vi.fn(),
  mapGemiCompany: vi.fn(),
  GemiError: class GemiError extends Error {},
}))
vi.mock('@/lib/trdr/aade', () => ({ aadeLookup: vi.fn(), AadeError: class AadeError extends Error {} }))
vi.mock('@/lib/registries/kad', () => ({ resolveKadForActivity: vi.fn() }))
vi.mock('@/lib/registries/regions', () => ({ matchRegion: vi.fn() }))

const actions = await import('@/lib/trdr/enrich-actions')

describe('trdr enrich actions guard', () => {
  it('aadeLookupTrdr rejects without customer.view', async () => {
    await expect(actions.aadeLookupTrdr('999863881')).rejects.toThrow()
  })

  it('gemiLookupTrdr rejects without customer.view', async () => {
    await expect(actions.gemiLookupTrdr({ afm: '999863881' })).rejects.toThrow()
  })

  it('applyAadeToTrdr rejects without customer.edit', async () => {
    await expect(actions.applyAadeToTrdr('t1')).rejects.toThrow()
  })

  it('gemiSyncTrdr rejects without customer.edit', async () => {
    await expect(actions.gemiSyncTrdr('t1')).rejects.toThrow()
  })

  it('matchTrdrRegionAction rejects without customer.edit', async () => {
    await expect(actions.matchTrdrRegionAction('t1')).rejects.toThrow()
  })

  it('bulkMatchTrdrRegions rejects without customer.edit', async () => {
    await expect(actions.bulkMatchTrdrRegions()).rejects.toThrow()
  })

  it('listTrdrGemiDocuments rejects without customer.view', async () => {
    await expect(actions.listTrdrGemiDocuments('t1')).rejects.toThrow()
  })

  it('saveTrdrGemiDocument rejects without customer.edit', async () => {
    await expect(
      actions.saveTrdrGemiDocument('t1', { kak: 'k1', docKind: 'DECISION', title: 'x', sourceUrl: 'https://x/doc.pdf' }),
    ).rejects.toThrow()
  })

  it('listTrdrDocuments rejects without customer.view', async () => {
    await expect(actions.listTrdrDocuments('t1')).rejects.toThrow()
  })

  it('removeTrdrDocument rejects without customer.edit', async () => {
    await expect(actions.removeTrdrDocument('d1')).rejects.toThrow()
  })
})
