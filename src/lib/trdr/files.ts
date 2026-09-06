'use server'

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { bunnyList, bunnyUploadPrivate, bunnyDeleteOne, bunnyDownload } from '@/lib/bunny-storage'
import { buildTrdrFolderPath } from '@/lib/trdr/cdn-folder'

/**
 * Staff file browser για την καρτέλα πελάτη — περιηγείται στο πραγματικό δέντρο
 * φακέλων του πελάτη στο Bunny (private). ΟΛΕΣ οι διαδρομές περιορίζονται μέσα
 * στη ρίζα του πελάτη (partners/<type>/<ΑΦΜ>/) — καμία πρόσβαση εκτός.
 */

const SAFE_SEG = /^[A-Za-z0-9._-]+$/

/** Ρίζα πελάτη (με trailing slash). Πετάει notFound αν δεν υπάρχει ο πελάτης. */
async function rootFor(trdrId: string): Promise<string> {
  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true } })
  if (!trdr) notFound()
  return trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
}

/** Καθαρίζει σχετικό subPath (χωρίς .. / leading-trailing slash)· επιστρέφει '' ή 'a/b/'. */
function safeSub(sub: string | undefined | null): string {
  const s = (sub ?? '').replace(/^\/+|\/+$/g, '')
  if (!s) return ''
  const parts = s.split('/')
  for (const p of parts) {
    if (p === '' || p === '.' || p === '..' || !SAFE_SEG.test(p)) throw new Error('Μη έγκυρη διαδρομή.')
  }
  return `${parts.join('/')}/`
}

export type BrowserFolder = { name: string; path: string }
export type BrowserFile = { name: string; key: string; size: number; lastChanged: string; downloadUrl: string }
export type TrdrFilesListing = {
  subPath: string
  folders: BrowserFolder[]
  files: BrowserFile[]
}

export async function listTrdrFiles(trdrId: string, subPath = ''): Promise<TrdrFilesListing> {
  await requirePermission('customer.view')
  const root = await rootFor(trdrId)
  const rel = safeSub(subPath)
  const prefix = `${root}${rel}`
  const entries = await bunnyList(prefix)

  const folders: BrowserFolder[] = entries
    .filter(e => e.isDirectory)
    .map(e => ({ name: e.objectName, path: `${rel}${e.objectName}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'el'))

  const files: BrowserFile[] = entries
    .filter(e => !e.isDirectory && e.objectName !== '.keep')
    .map(e => {
      const key = `${prefix}${e.objectName}`
      return {
        name: e.objectName,
        key,
        size: e.length,
        lastChanged: e.lastChanged,
        downloadUrl: `/api/partners/${trdrId}/files/download?key=${encodeURIComponent(key)}`,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'el'))

  return { subPath: rel, folders, files }
}

export async function deleteTrdrFile(trdrId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('customer.edit')
  const root = await rootFor(trdrId)
  if (!key.startsWith(root) || key.includes('..')) return { ok: false, error: 'Μη έγκυρο αρχείο.' }
  await bunnyDeleteOne(key)
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true }
}

/** Μετονομασία αρχείου (Bunny: copy bytes σε νέο key + delete παλιό). Ίδιος φάκελος. */
export async function renameTrdrFile(trdrId: string, key: string, newName: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('customer.edit')
  const root = await rootFor(trdrId)
  if (!key.startsWith(root) || key.includes('..')) return { ok: false, error: 'Μη έγκυρο αρχείο.' }
  const safe = newName.trim().replace(/[/\\]/g, '').replace(/\.\.+/g, '.')
  if (!safe) return { ok: false, error: 'Μη έγκυρο όνομα.' }
  const dir = key.slice(0, key.lastIndexOf('/') + 1)
  const newKey = `${dir}${safe}`
  if (newKey === key) return { ok: true }
  try {
    const buf = await bunnyDownload(key)
    await bunnyUploadPrivate({ key: newKey, body: buf })
    await bunnyDeleteOne(key)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Η μετονομασία απέτυχε.' }
  }
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true }
}

export async function createTrdrSubfolder(trdrId: string, subPath: string, name: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('customer.edit')
  const clean = name.trim()
  if (!SAFE_SEG.test(clean)) return { ok: false, error: 'Το όνομα φακέλου επιτρέπει μόνο γράμματα/αριθμούς/._-' }
  const root = await rootFor(trdrId)
  const rel = safeSub(subPath)
  await bunnyUploadPrivate({ key: `${root}${rel}${clean}/.keep`, body: Buffer.from(''), contentType: 'text/plain' })
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true }
}
