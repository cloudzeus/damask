import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

/**
 * Πραγματικό PrismaClientKnownRequestError (όχι plain Error+code) — ίδιο σχόλιο
 * με tests/users-actions.test.ts: τα actions κάνουν instanceof check.
 */
function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

type FakeFolder = { id: string; name: string; parentId: string | null }
type FakeAsset = { id: string; name: string; folderId: string | null; cdnUrl: string; type: string }

const store: { folders: FakeFolder[]; assets: FakeAsset[] } = { folders: [], assets: [] }
let nextFolderId = 1

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['media.manage'], customerId: null },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaFolder: {
      findFirst: vi.fn(async ({ where }: { where: { parentId: string | null; name: string; id?: { not: string } } }) =>
        store.folders.find(f =>
          f.parentId === where.parentId
          && f.name === where.name
          && (!where.id || f.id !== where.id.not),
        ) ?? null,
      ),
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: { _count?: unknown } }) => {
        const folder = store.folders.find(f => f.id === where.id)
        if (!folder) return null
        if (include?._count) {
          return {
            ...folder,
            _count: {
              assets: store.assets.filter(a => a.folderId === folder.id).length,
              children: store.folders.filter(f => f.parentId === folder.id).length,
            },
          }
        }
        return { ...folder }
      }),
      create: vi.fn(async ({ data }: { data: { name: string; parentId: string | null } }) => {
        if (store.folders.some(f => f.parentId === data.parentId && f.name === data.name)) throw p2002Error()
        const created: FakeFolder = { id: `folder-${nextFolderId++}`, name: data.name, parentId: data.parentId }
        store.folders.push(created)
        return { ...created }
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeFolder> }) => {
        const folder = store.folders.find(f => f.id === where.id)
        if (!folder) throw new Error('not found')
        if (data.name && store.folders.some(f => f.id !== folder.id && f.parentId === folder.parentId && f.name === data.name)) {
          throw p2002Error()
        }
        Object.assign(folder, data)
        return { ...folder }
      }),
      // Mimics Prisma's onDelete: Cascade on MediaFolder.parent — διαγράφει και
      // όλους τους απογόνους, όπως θα έκανε η πραγματική Postgres FK cascade.
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const toRemove = new Set([where.id])
        let frontier = [where.id]
        while (frontier.length > 0) {
          const children = store.folders.filter(f => f.parentId !== null && frontier.includes(f.parentId)).map(f => f.id)
          if (children.length === 0) break
          children.forEach(id => toRemove.add(id))
          frontier = children
        }
        store.folders = store.folders.filter(f => !toRemove.has(f.id))
        return {}
      }),
      findMany: vi.fn(async ({ where }: { where: { parentId: { in: string[] } } }) =>
        store.folders.filter(f => f.parentId !== null && where.parentId.in.includes(f.parentId)).map(f => ({ id: f.id })),
      ),
    },
    mediaAsset: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.assets.find(a => a.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeAsset> }) => {
        const asset = store.assets.find(a => a.id === where.id)
        if (!asset) throw new Error('not found')
        Object.assign(asset, data)
        return { ...asset }
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        store.assets = store.assets.filter(a => a.id !== where.id)
        return {}
      }),
      findMany: vi.fn(async ({ where }: { where: { folderId?: { in: string[] }; id?: { in: string[] } } }) => {
        let result = store.assets
        if (where.folderId) result = result.filter(a => a.folderId !== null && where.folderId!.in.includes(a.folderId))
        if (where.id) result = result.filter(a => where.id!.in.includes(a.id))
        return result.map(a => ({ ...a }))
      }),
      count: vi.fn(async ({ where }: { where: { folderId: { in: string[] } } }) =>
        store.assets.filter(a => a.folderId !== null && where.folderId.in.includes(a.folderId)).length,
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = store.assets.length
        store.assets = store.assets.filter(a => !where.id.in.includes(a.id))
        return { count: before - store.assets.length }
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import {
  createFolder, renameFolder, deleteFolder, renameAsset, moveAsset, deleteAsset,
  getFolderDeletePreview, deleteFolderRecursive, bulkDeleteAssets,
} from '@/app/(app)/media/actions'

const fetchMock = vi.fn()

beforeEach(() => {
  store.folders = [
    { id: 'folder-living', name: 'Καθιστικό', parentId: null },
    { id: 'folder-bedroom', name: 'Υπνοδωμάτιο', parentId: null },
    { id: 'folder-living-sofas', name: 'Καναπέδες', parentId: 'folder-living' },
    { id: 'folder-living-sofas-leather', name: 'Δερμάτινοι', parentId: 'folder-living-sofas' },
  ]
  store.assets = [
    { id: 'asset-1', name: 'sofa-1', folderId: 'folder-living-sofas', cdnUrl: 'https://cdn.example.com/media-gallery/folder-living-sofas/sofa-1.webp', type: 'IMAGE' },
    { id: 'asset-2', name: 'root-file', folderId: null, cdnUrl: 'https://cdn.example.com/media-gallery/root/root-file.webp', type: 'IMAGE' },
    { id: 'asset-3', name: 'leather-sofa', folderId: 'folder-living-sofas-leather', cdnUrl: 'https://cdn.example.com/media-gallery/folder-living-sofas-leather/leather-sofa.webp', type: 'IMAGE' },
  ]
  nextFolderId = 100
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  process.env.BUNNY_STORAGE_API = 'https://storage.bunnycdn.com'
  process.env.BUNNY_STORAGE_ZONE = 'test-zone'
  process.env.BUNNY_STORAGE_PASSWORD = 'test-password'
  process.env.BUNNY_PULL_ZONE_URL = 'https://cdn.example.com'
})

afterEach(() => vi.unstubAllGlobals())

describe('createFolder()', () => {
  it('δημιουργεί φάκελο στη ρίζα', async () => {
    const res = await createFolder({ name: 'Τραπεζαρία' })
    expect(res).toMatchObject({ ok: true })
    expect(store.folders.some(f => f.name === 'Τραπεζαρία' && f.parentId === null)).toBe(true)
  })

  it('δημιουργεί υποφάκελο μέσα σε γονικό', async () => {
    const res = await createFolder({ name: 'Πολυθρόνες', parentId: 'folder-living' })
    expect(res).toMatchObject({ ok: true })
    expect(store.folders.some(f => f.name === 'Πολυθρόνες' && f.parentId === 'folder-living')).toBe(true)
  })

  it('απορρίπτει κενό όνομα', async () => {
    const res = await createFolder({ name: '   ' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.name).toBeTruthy()
  })

  it('απορρίπτει διπλότυπο όνομα στη ΡΙΖΑ (app-level guard — η DB unique(parentId,name) δεν πιάνει NULL vs NULL)', async () => {
    const res = await createFolder({ name: 'Καθιστικό' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.name).toBeTruthy()
    expect(store.folders.filter(f => f.name === 'Καθιστικό' && f.parentId === null)).toHaveLength(1)
  })

  it('απορρίπτει διπλότυπο όνομα μέσα στον ίδιο γονικό φάκελο', async () => {
    const res = await createFolder({ name: 'Καναπέδες', parentId: 'folder-living' })
    expect(res.ok).toBe(false)
  })

  it('επιτρέπει το ΙΔΙΟ όνομα σε ΔΙΑΦΟΡΕΤΙΚΟΥΣ γονικούς φακέλους', async () => {
    const res = await createFolder({ name: 'Καναπέδες', parentId: 'folder-bedroom' })
    expect(res).toMatchObject({ ok: true })
  })

  it('απορρίπτει άγνωστο γονικό φάκελο', async () => {
    const res = await createFolder({ name: 'Νέος', parentId: 'does-not-exist' })
    expect(res.ok).toBe(false)
  })
})

describe('renameFolder()', () => {
  it('μετονομάζει επιτυχώς', async () => {
    const res = await renameFolder('folder-bedroom', 'Κρεβατοκάμαρα')
    expect(res).toMatchObject({ ok: true })
    expect(store.folders.find(f => f.id === 'folder-bedroom')?.name).toBe('Κρεβατοκάμαρα')
  })

  it('επιτρέπει μετονομασία στο ΙΔΙΟ όνομα (δεν συγκρούεται με τον εαυτό του)', async () => {
    const res = await renameFolder('folder-bedroom', 'Υπνοδωμάτιο')
    expect(res).toMatchObject({ ok: true })
  })

  it('απορρίπτει διπλότυπο όνομα με αδερφό φάκελο', async () => {
    const res = await renameFolder('folder-bedroom', 'Καθιστικό')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.name).toBeTruthy()
    expect(store.folders.find(f => f.id === 'folder-bedroom')?.name).toBe('Υπνοδωμάτιο')
  })

  it('επιστρέφει σφάλμα για άγνωστο φάκελο', async () => {
    const res = await renameFolder('does-not-exist', 'Ό,τιδήποτε')
    expect(res.ok).toBe(false)
  })
})

describe('deleteFolder()', () => {
  it('διαγράφει άδειο φάκελο', async () => {
    const res = await deleteFolder('folder-bedroom')
    expect(res).toMatchObject({ ok: true })
    expect(store.folders.some(f => f.id === 'folder-bedroom')).toBe(false)
  })

  it('guard: αρνείται διαγραφή φακέλου με αρχεία μέσα', async () => {
    const res = await deleteFolder('folder-living-sofas')
    expect(res.ok).toBe(false)
    expect(store.folders.some(f => f.id === 'folder-living-sofas')).toBe(true)
  })

  it('guard: αρνείται διαγραφή φακέλου με υποφακέλους', async () => {
    const res = await deleteFolder('folder-living')
    expect(res.ok).toBe(false)
    expect(store.folders.some(f => f.id === 'folder-living')).toBe(true)
  })

  it('επιστρέφει σφάλμα για άγνωστο φάκελο', async () => {
    const res = await deleteFolder('does-not-exist')
    expect(res.ok).toBe(false)
  })
})

describe('renameAsset()', () => {
  it('μετονομάζει επιτυχώς', async () => {
    const res = await renameAsset('asset-1', 'sofa-chesterfield')
    expect(res).toMatchObject({ ok: true })
    expect(store.assets.find(a => a.id === 'asset-1')?.name).toBe('sofa-chesterfield')
  })

  it('απορρίπτει κενό όνομα', async () => {
    const res = await renameAsset('asset-1', '  ')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.name).toBeTruthy()
    expect(store.assets.find(a => a.id === 'asset-1')?.name).toBe('sofa-1')
  })

  it('επιστρέφει σφάλμα για άγνωστο αρχείο', async () => {
    const res = await renameAsset('does-not-exist', 'νέο όνομα')
    expect(res.ok).toBe(false)
  })
})

describe('moveAsset()', () => {
  it('μετακινεί αρχείο σε άλλον φάκελο', async () => {
    const res = await moveAsset('asset-2', 'folder-bedroom')
    expect(res).toMatchObject({ ok: true })
    expect(store.assets.find(a => a.id === 'asset-2')?.folderId).toBe('folder-bedroom')
  })

  it('μετακινεί αρχείο στη ρίζα (folderId=null)', async () => {
    const res = await moveAsset('asset-1', null)
    expect(res).toMatchObject({ ok: true })
    expect(store.assets.find(a => a.id === 'asset-1')?.folderId).toBeNull()
  })

  it('απορρίπτει άγνωστο φάκελο προορισμού', async () => {
    const res = await moveAsset('asset-1', 'does-not-exist')
    expect(res.ok).toBe(false)
    expect(store.assets.find(a => a.id === 'asset-1')?.folderId).toBe('folder-living-sofas')
  })

  it('επιστρέφει σφάλμα για άγνωστο αρχείο', async () => {
    const res = await moveAsset('does-not-exist', 'folder-bedroom')
    expect(res.ok).toBe(false)
  })
})

describe('deleteAsset()', () => {
  it('διαγράφει από Bunny (DELETE στο σωστό storage path) ΚΑΙ από τη DB', async () => {
    const res = await deleteAsset('asset-1')
    expect(res).toMatchObject({ ok: true })
    expect(store.assets.some(a => a.id === 'asset-1')).toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://storage.bunnycdn.com/test-zone/media-gallery/folder-living-sofas/sofa-1.webp')
    expect(init).toMatchObject({ method: 'DELETE', headers: { AccessKey: 'test-password' } })
  })

  it('404 από Bunny (ήδη διαγραμμένο εκεί) δεν εμποδίζει τη διαγραφή της εγγραφής', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    const res = await deleteAsset('asset-2')
    expect(res).toMatchObject({ ok: true })
    expect(store.assets.some(a => a.id === 'asset-2')).toBe(false)
  })

  it('σφάλμα Bunny (5xx) εμποδίζει τη διαγραφή — η εγγραφή ΜΕΝΕΙ', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    const res = await deleteAsset('asset-1')
    expect(res.ok).toBe(false)
    expect(store.assets.some(a => a.id === 'asset-1')).toBe(true)
  })

  it('επιστρέφει σφάλμα για άγνωστο αρχείο', async () => {
    const res = await deleteAsset('does-not-exist')
    expect(res.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ── getFolderDeletePreview() / deleteFolderRecursive() ──────────────────
// Δοκιμάζουν έμμεσα το εσωτερικό BFS collectFolderIds() πάνω σε δέντρο 3
// επιπέδων: folder-living > folder-living-sofas > folder-living-sofas-leather
// (asset-1 στο μεσαίο επίπεδο, asset-3 στο βαθύτερο).

describe('getFolderDeletePreview()', () => {
  it('μετράει αναδρομικά αρχεία/υποφακέλους σε δέντρο πολλών επιπέδων', async () => {
    const res = await getFolderDeletePreview('folder-living')
    expect(res).toMatchObject({ ok: true, assetCount: 2, folderCount: 3 })
  })

  it('μετράει σωστά ξεκινώντας από ενδιάμεσο επίπεδο (όχι τη ρίζα)', async () => {
    const res = await getFolderDeletePreview('folder-living-sofas')
    expect(res).toMatchObject({ ok: true, assetCount: 2, folderCount: 2 })
  })

  it('φύλλο χωρίς υποφακέλους/αρχεία → assetCount 0, folderCount 1 (μόνο ο εαυτός του)', async () => {
    const res = await getFolderDeletePreview('folder-bedroom')
    expect(res).toMatchObject({ ok: true, assetCount: 0, folderCount: 1 })
  })

  it('επιστρέφει σφάλμα για άγνωστο φάκελο', async () => {
    const res = await getFolderDeletePreview('does-not-exist')
    expect(res.ok).toBe(false)
  })
})

describe('deleteFolderRecursive()', () => {
  it('διαγράφει αρχεία (Bunny + DB) ΚΑΙ υποφακέλους αναδρομικά, αφήνει τον γονιό ανέπαφο', async () => {
    const res = await deleteFolderRecursive('folder-living-sofas')
    expect(res).toMatchObject({ ok: true })

    expect(store.assets.some(a => a.id === 'asset-1')).toBe(false)
    expect(store.assets.some(a => a.id === 'asset-3')).toBe(false)
    expect(store.assets.some(a => a.id === 'asset-2')).toBe(true) // άσχετο root asset — ανέπαφο

    expect(store.folders.some(f => f.id === 'folder-living-sofas')).toBe(false)
    expect(store.folders.some(f => f.id === 'folder-living-sofas-leather')).toBe(false)
    expect(store.folders.some(f => f.id === 'folder-living')).toBe(true) // ο γονιός ΔΕΝ διαγράφεται

    // 2 αρχεία διαγράφηκαν από το Bunny (μία παρτίδα, καθώς < 50)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map(call => call[0]).sort()
    expect(urls).toEqual([
      'https://storage.bunnycdn.com/test-zone/media-gallery/folder-living-sofas-leather/leather-sofa.webp',
      'https://storage.bunnycdn.com/test-zone/media-gallery/folder-living-sofas/sofa-1.webp',
    ].sort())
  })

  it('σφάλμα Bunny εμποδίζει ΟΛΟΚΛΗΡΗ τη διαγραφή — τίποτα δεν αλλάζει στη DB', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }))
    const res = await deleteFolderRecursive('folder-living-sofas')
    expect(res.ok).toBe(false)

    expect(store.assets.some(a => a.id === 'asset-1')).toBe(true)
    expect(store.assets.some(a => a.id === 'asset-3')).toBe(true)
    expect(store.folders.some(f => f.id === 'folder-living-sofas')).toBe(true)
    expect(store.folders.some(f => f.id === 'folder-living-sofas-leather')).toBe(true)
  })

  it('φάκελος χωρίς περιεχόμενο διαγράφεται κανονικά (μηδενικά Bunny calls)', async () => {
    const res = await deleteFolderRecursive('folder-bedroom')
    expect(res).toMatchObject({ ok: true })
    expect(store.folders.some(f => f.id === 'folder-bedroom')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('επιστρέφει σφάλμα για άγνωστο φάκελο', async () => {
    const res = await deleteFolderRecursive('does-not-exist')
    expect(res.ok).toBe(false)
  })
})

describe('bulkDeleteAssets()', () => {
  it('διαγράφει πολλαπλά αρχεία από Bunny + DB', async () => {
    const res = await bulkDeleteAssets(['asset-1', 'asset-2'])
    expect(res).toMatchObject({ ok: true })
    expect(store.assets.some(a => a.id === 'asset-1')).toBe(false)
    expect(store.assets.some(a => a.id === 'asset-2')).toBe(false)
    expect(store.assets.some(a => a.id === 'asset-3')).toBe(true) // δεν επιλέχθηκε — ανέπαφο
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('guard: άδειος πίνακας ids → σφάλμα, καμία κλήση Bunny', async () => {
    const res = await bulkDeleteAssets([])
    expect(res.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('guard: μόνο κενά strings → σφάλμα', async () => {
    const res = await bulkDeleteAssets(['', '   '])
    expect(res.ok).toBe(false)
  })

  it('guard: κανένα από τα ids δεν βρέθηκε → σφάλμα', async () => {
    const res = await bulkDeleteAssets(['does-not-exist-1', 'does-not-exist-2'])
    expect(res.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('αγνοεί διπλότυπα ids στην είσοδο (ίδιο αρχείο δύο φορές)', async () => {
    const res = await bulkDeleteAssets(['asset-1', 'asset-1'])
    expect(res).toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('προχωράει με τα ids που βρέθηκαν, αγνοώντας τα άγνωστα', async () => {
    const res = await bulkDeleteAssets(['asset-1', 'does-not-exist'])
    expect(res).toMatchObject({ ok: true })
    expect(store.assets.some(a => a.id === 'asset-1')).toBe(false)
  })

  it('σφάλμα Bunny εμποδίζει τη διαγραφή — οι εγγραφές ΜΕΝΟΥΝ', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }))
    const res = await bulkDeleteAssets(['asset-1', 'asset-2'])
    expect(res.ok).toBe(false)
    expect(store.assets.some(a => a.id === 'asset-1')).toBe(true)
    expect(store.assets.some(a => a.id === 'asset-2')).toBe(true)
  })
})
