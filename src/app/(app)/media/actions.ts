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
