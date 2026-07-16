'use server'

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

const DUPLICATE_FOLDER_NAME_MESSAGE = 'Υπάρχει ήδη φάκελος με αυτό το όνομα εδώ.'

const folderNameSchema = z.string().trim().min(1, 'Συμπλήρωσε όνομα φακέλου.').max(80, 'Πολύ μεγάλο όνομα.')
const assetNameSchema = z.string().trim().min(1, 'Συμπλήρωσε όνομα αρχείου.').max(150, 'Πολύ μεγάλο όνομα.')

/**
 * Prisma's @@unique([parentId, name]) δεν πιάνει διπλότυπα ΡΙΖΑΣ (parentId
 * null) — η Postgres θεωρεί κάθε NULL διαφορετικό από κάθε άλλο NULL σε
 * unique index, άρα δύο root φακέλους με το ίδιο όνομα η DB θα τους δεχόταν.
 * Γι' αυτό ο έλεγχος μοναδικότητας γίνεται πάντα ρητά εδώ (σε επίπεδο
 * εφαρμογής) — ισχύει εξίσου σε ρίζα και σε υποφακέλους. Το P2002 catch στα
 * create/update παρακάτω μένει μόνο ως δίχτυ ασφαλείας για race conditions.
 */
async function isFolderNameTaken(parentId: string | null, name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.mediaFolder.findFirst({
    where: { parentId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  return existing !== null
}

// ── BunnyCDN storage helpers (κοινόχρηστα από folders ΚΑΙ assets) ─────

/** cdnUrl = `${BUNNY_PULL_ZONE_URL}/${storagePath}` (βλ. api/media/upload/route.ts) — αφαιρούμε
 * το pull-zone prefix για να πάρουμε το storage path που περιμένει το Bunny Storage API. */
function storagePathFromCdnUrl(cdnUrl: string): string {
  const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL
  if (pullZoneUrl && cdnUrl.startsWith(pullZoneUrl)) {
    return cdnUrl.slice(pullZoneUrl.length).replace(/^\/+/, '')
  }
  try {
    return new URL(cdnUrl).pathname.replace(/^\/+/, '')
  } catch {
    return cdnUrl.replace(/^\/+/, '')
  }
}

async function deleteFromBunny(storagePath: string): Promise<void> {
  const storageApi = process.env.BUNNY_STORAGE_API
  const storageZone = process.env.BUNNY_STORAGE_ZONE
  const storagePassword = process.env.BUNNY_STORAGE_PASSWORD
  if (!storageApi || !storageZone || !storagePassword) {
    throw new Error('Λείπουν ρυθμίσεις BunnyCDN στον server.')
  }
  const res = await fetch(`${storageApi}/${storageZone}/${storagePath}`, {
    method: 'DELETE',
    headers: { AccessKey: storagePassword },
  })
  // 404 = ήδη δεν υπάρχει στο storage — δεν εμποδίζει τη διαγραφή της εγγραφής.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny DELETE ${res.status}`)
  }
}

const BUNNY_DELETE_BATCH = 50

/**
 * Διαγράφει πολλά αρχεία από το BunnyCDN ανά παρτίδες των BUNNY_DELETE_BATCH
 * (παράλληλα μέσα σε κάθε παρτίδα). Αν αποτύχει έστω ένα, σταματά αμέσως και
 * επιστρέφει σφάλμα — χωρίς να αγγίξει τη DB. Ιδιότητα idempotency: όσα
 * αρχεία ΠΡΟΛΑΒΑΝ να διαγραφούν σε προηγούμενες παρτίδες θα γυρίσουν 404 σε
 * ένα επόμενο ξαναπάτημα της ίδιας ενέργειας — το deleteFromBunny αγνοεί το
 * 404, άρα ένα retry είναι πάντα ασφαλές.
 */
async function deleteManyFromBunny(cdnUrls: string[]): Promise<{ ok: false; message: string } | null> {
  for (let i = 0; i < cdnUrls.length; i += BUNNY_DELETE_BATCH) {
    const batch = cdnUrls.slice(i, i + BUNNY_DELETE_BATCH)
    const results = await Promise.allSettled(batch.map(url => deleteFromBunny(storagePathFromCdnUrl(url))))
    if (results.some(r => r.status === 'rejected')) {
      return { ok: false, message: 'Η διαγραφή κάποιων αρχείων από το BunnyCDN απέτυχε. Δοκίμασε ξανά.' }
    }
  }
  return null
}

// ── Φάκελοι ──────────────────────────────────────────────────────────

export async function createFolder(input: { name: string; parentId?: string | null }): Promise<ActionResult> {
  await requirePermission('media.manage')

  const parsed = folderNameSchema.safeParse(input.name)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Μη έγκυρο όνομα.'
    return { ok: false, message, fieldErrors: { name: message } }
  }
  const parentId = input.parentId ?? null

  if (parentId) {
    const parent = await prisma.mediaFolder.findUnique({ where: { id: parentId } })
    if (!parent) return { ok: false, message: 'Ο γονικός φάκελος δεν βρέθηκε.' }
  }

  if (await isFolderNameTaken(parentId, parsed.data)) {
    return { ok: false, message: DUPLICATE_FOLDER_NAME_MESSAGE, fieldErrors: { name: DUPLICATE_FOLDER_NAME_MESSAGE } }
  }

  try {
    const folder = await prisma.mediaFolder.create({ data: { name: parsed.data, parentId } })
    revalidatePath('/media')
    return { ok: true, message: `Ο φάκελος «${folder.name}» δημιουργήθηκε.`, id: folder.id }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: DUPLICATE_FOLDER_NAME_MESSAGE, fieldErrors: { name: DUPLICATE_FOLDER_NAME_MESSAGE } }
    }
    throw e
  }
}

export async function renameFolder(folderId: string, name: string): Promise<ActionResult> {
  await requirePermission('media.manage')

  const parsed = folderNameSchema.safeParse(name)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Μη έγκυρο όνομα.'
    return { ok: false, message, fieldErrors: { name: message } }
  }

  const folder = await prisma.mediaFolder.findUnique({ where: { id: folderId } })
  if (!folder) return { ok: false, message: 'Ο φάκελος δεν βρέθηκε.' }

  if (await isFolderNameTaken(folder.parentId, parsed.data, folderId)) {
    return { ok: false, message: DUPLICATE_FOLDER_NAME_MESSAGE, fieldErrors: { name: DUPLICATE_FOLDER_NAME_MESSAGE } }
  }

  try {
    await prisma.mediaFolder.update({ where: { id: folderId }, data: { name: parsed.data } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: DUPLICATE_FOLDER_NAME_MESSAGE, fieldErrors: { name: DUPLICATE_FOLDER_NAME_MESSAGE } }
    }
    throw e
  }

  revalidatePath('/media')
  return { ok: true, message: 'Ο φάκελος μετονομάστηκε.' }
}

/** Διαγραφή φακέλου — μόνο αν είναι εντελώς άδειος (χωρίς αρχεία ΚΑΙ χωρίς υποφακέλους). */
export async function deleteFolder(folderId: string): Promise<ActionResult> {
  await requirePermission('media.manage')

  const folder = await prisma.mediaFolder.findUnique({
    where: { id: folderId },
    include: { _count: { select: { assets: true, children: true } } },
  })
  if (!folder) return { ok: false, message: 'Ο φάκελος δεν βρέθηκε.' }

  if (folder._count.assets > 0 || folder._count.children > 0) {
    return {
      ok: false,
      message: 'Ο φάκελος δεν είναι άδειος — μετακίνησε ή διάγραψε πρώτα ό,τι περιέχει.',
    }
  }

  await prisma.mediaFolder.delete({ where: { id: folderId } })
  revalidatePath('/media')
  return { ok: true, message: `Ο φάκελος «${folder.name}» διαγράφηκε.` }
}

/**
 * Συλλέγει το folderId ρίζας ΚΑΙ όλους τους απογόνους του, επίπεδο-επίπεδο
 * (BFS) αντί για recursive SQL CTE — έτσι παραμένει εύκολα ελέγξιμο με
 * mocked prisma (κάθε "επίπεδο" είναι απλά ένα ακόμα findMany).
 */
async function collectFolderIds(rootId: string): Promise<string[]> {
  const ids = [rootId]
  let frontier = [rootId]
  while (frontier.length > 0) {
    const children = await prisma.mediaFolder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    if (children.length === 0) break
    frontier = children.map(c => c.id)
    ids.push(...frontier)
  }
  return ids
}

export type FolderDeletePreview =
  | { ok: true; assetCount: number; folderCount: number }
  | { ok: false; message: string }

/** Προεπισκόπηση πριν τη διαγραφή ΜΗ-άδειου φακέλου: πόσα αρχεία/υποφάκελοι θα χαθούν. */
export async function getFolderDeletePreview(folderId: string): Promise<FolderDeletePreview> {
  await requirePermission('media.manage')

  const folder = await prisma.mediaFolder.findUnique({ where: { id: folderId } })
  if (!folder) return { ok: false, message: 'Ο φάκελος δεν βρέθηκε.' }

  const folderIds = await collectFolderIds(folderId)
  const assetCount = await prisma.mediaAsset.count({ where: { folderId: { in: folderIds } } })

  return { ok: true, assetCount, folderCount: folderIds.length }
}

/**
 * Διαγραφή φακέλου ΜΑΖΙ με όλα τα περιεχόμενά του — αρχεία (Bunny + DB) και
 * υποφακέλους, αναδρομικά. Χρησιμοποιείται όταν ο φάκελος ΔΕΝ είναι άδειος
 * (βλ. deleteFolder() παραπάνω για τον απλό, άδειο περίπτωση).
 *
 * MediaAsset.folderId έχει onDelete: SetNull — δεν σβήνονται μόνα τους μαζί
 * με τον φάκελο, γι' αυτό διαγράφονται ΡΗΤΑ πρώτα (Bunny, μετά DB). Οι
 * υποφάκελοι όμως έχουν onDelete: Cascade στη σχέση parent, άρα η διαγραφή
 * του φακέλου-ρίζας αρκεί για αυτούς.
 */
export async function deleteFolderRecursive(folderId: string): Promise<ActionResult> {
  await requirePermission('media.manage')

  const folder = await prisma.mediaFolder.findUnique({ where: { id: folderId } })
  if (!folder) return { ok: false, message: 'Ο φάκελος δεν βρέθηκε.' }

  const folderIds = await collectFolderIds(folderId)
  const assets = await prisma.mediaAsset.findMany({
    where: { folderId: { in: folderIds } },
    select: { id: true, cdnUrl: true },
  })

  const bunnyError = await deleteManyFromBunny(assets.map(a => a.cdnUrl))
  if (bunnyError) return bunnyError

  await prisma.$transaction([
    prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } }),
    prisma.mediaFolder.delete({ where: { id: folderId } }),
  ])

  revalidatePath('/media')
  const subfolders = folderIds.length - 1
  const parts = [
    assets.length > 0 ? `${assets.length} ${assets.length === 1 ? 'αρχείο' : 'αρχεία'}` : null,
    subfolders > 0 ? `${subfolders} ${subfolders === 1 ? 'υποφάκελο' : 'υποφακέλους'}` : null,
  ].filter(Boolean)
  const suffix = parts.length > 0 ? ` μαζί με ${parts.join(' και ')}` : ''
  return { ok: true, message: `Ο φάκελος «${folder.name}» διαγράφηκε${suffix}.` }
}

// ── Αρχεία (assets) ──────────────────────────────────────────────────

export async function renameAsset(assetId: string, name: string): Promise<ActionResult> {
  await requirePermission('media.manage')

  const parsed = assetNameSchema.safeParse(name)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Μη έγκυρο όνομα.'
    return { ok: false, message, fieldErrors: { name: message } }
  }

  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } })
  if (!asset) return { ok: false, message: 'Το αρχείο δεν βρέθηκε.' }

  await prisma.mediaAsset.update({ where: { id: assetId }, data: { name: parsed.data } })

  revalidatePath('/media')
  return { ok: true, message: 'Το αρχείο μετονομάστηκε.' }
}

/** Μετακίνηση αρχείου σε φάκελο — folderId=null μετακινεί στη ρίζα ("Όλα τα αρχεία"). */
export async function moveAsset(assetId: string, folderId: string | null): Promise<ActionResult> {
  await requirePermission('media.manage')

  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } })
  if (!asset) return { ok: false, message: 'Το αρχείο δεν βρέθηκε.' }

  if (folderId) {
    const folder = await prisma.mediaFolder.findUnique({ where: { id: folderId } })
    if (!folder) return { ok: false, message: 'Ο φάκελος προορισμού δεν βρέθηκε.' }
  }

  await prisma.mediaAsset.update({ where: { id: assetId }, data: { folderId } })

  revalidatePath('/media')
  return { ok: true, message: 'Το αρχείο μετακινήθηκε.' }
}

/** Διαγράφει και από το BunnyCDN storage ΚΑΙ την εγγραφή MediaAsset. */
export async function deleteAsset(assetId: string): Promise<ActionResult> {
  await requirePermission('media.manage')

  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } })
  if (!asset) return { ok: false, message: 'Το αρχείο δεν βρέθηκε.' }

  try {
    await deleteFromBunny(storagePathFromCdnUrl(asset.cdnUrl))
  } catch {
    return { ok: false, message: 'Η διαγραφή από το BunnyCDN απέτυχε. Δοκίμασε ξανά.' }
  }

  await prisma.mediaAsset.delete({ where: { id: assetId } })

  revalidatePath('/media')
  return { ok: true, message: `Το αρχείο «${asset.name}» διαγράφηκε.` }
}

/** Μαζική διαγραφή επιλεγμένων αρχείων (checkbox mode / shift-click στο grid) — Bunny + DB. */
export async function bulkDeleteAssets(assetIds: string[]): Promise<ActionResult> {
  await requirePermission('media.manage')

  const ids = Array.from(new Set(assetIds.filter(id => id.trim() !== '')))
  if (ids.length === 0) return { ok: false, message: 'Δεν επιλέχθηκαν αρχεία.' }

  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } } })
  if (assets.length === 0) return { ok: false, message: 'Τα αρχεία δεν βρέθηκαν.' }

  const bunnyError = await deleteManyFromBunny(assets.map(a => a.cdnUrl))
  if (bunnyError) return bunnyError

  await prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } })

  revalidatePath('/media')
  const word = assets.length === 1 ? 'αρχείο διαγράφηκε' : 'αρχεία διαγράφηκαν'
  return { ok: true, message: `${assets.length} ${word}.` }
}
