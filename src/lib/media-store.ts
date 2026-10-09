import { randomUUID } from 'node:crypto'
import type { MediaType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logApiUsage } from '@/lib/api-usage'

/**
 * (Plain module.) Αποθήκευση αρχείου στο Media Gallery: PUT στο BunnyCDN (δημόσιο pull zone) + εγγραφή MediaAsset.
 * Κοινό για το upload route (/api/media/upload) και τις εισαγωγές από τον server (π.χ. Envato).
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/bmp': '.bmp',
  'image/avif': '.avif', 'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'model/gltf-binary': '.glb', 'model/gltf+json': '.gltf', 'application/pdf': '.pdf',
}

export class MediaStoreError extends Error {
  constructor(message: string, public status = 502, public detail?: string) { super(message) }
}

export function sanitizeMediaPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '')
  if (!trimmed || trimmed.includes('..') || !/^[a-z0-9/_-]+$/.test(trimmed)) return null
  return trimmed
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'file'
}

function extensionFor(mimeType: string, filename: string): string {
  return EXT_BY_MIME[mimeType] ?? (/\.[a-z0-9]+$/i.exec(filename)?.[0].toLowerCase() ?? '')
}

/** Ίδια λογική ταξινόμησης τύπου με το client (mass-uploader.tsx detectAssetType). */
export function detectMediaType(mimeType: string, filename: string): MediaType {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  const lower = filename.toLowerCase()
  if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return 'MODEL_3D'
  return 'FILE'
}

export async function storeMediaBuffer(input: {
  body: ArrayBuffer | Buffer
  filename: string
  mimeType: string
  /** Ήδη καθαρισμένη διαδρομή (sanitizeMediaPath). */
  path: string
  folderId: string | null
  userId?: string | null
  name?: string
  alt?: string | null
  meta?: Prisma.InputJsonValue
}): Promise<{ id: string; url: string; path: string; size: number; name: string; type: MediaType }> {
  const storageApi = process.env.BUNNY_STORAGE_API
  const storageZone = process.env.BUNNY_STORAGE_ZONE
  const storagePassword = process.env.BUNNY_STORAGE_PASSWORD
  const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL
  if (!storageApi || !storageZone || !storagePassword || !pullZoneUrl) throw new MediaStoreError('Λείπουν ρυθμίσεις BunnyCDN στον server.', 500)

  const size = input.body.byteLength
  const baseName = input.name?.trim() || input.filename.replace(/\.[a-z0-9]+$/i, '')
  const objectName = `${Date.now()}-${randomUUID().slice(0, 8)}-${slugify(input.filename.replace(/\.[a-z0-9]+$/i, ''))}${extensionFor(input.mimeType, input.filename)}`
  const fullPath = `${input.path}/${objectName}`

  let res: Response
  try {
    res = await fetch(`${storageApi}/${storageZone}/${fullPath}`, {
      method: 'PUT',
      headers: { AccessKey: storagePassword, 'Content-Type': 'application/octet-stream' },
      body: input.body instanceof ArrayBuffer ? input.body : new Uint8Array(input.body),
    })
  } catch (err) {
    throw new MediaStoreError('Αποτυχία σύνδεσης με το BunnyCDN.', 502, err instanceof Error ? err.message : String(err))
  }
  if (res.status !== 201) throw new MediaStoreError('Το BunnyCDN απέρριψε τη μεταφόρτωση.', 502, await res.text().catch(() => ''))

  const cdnUrl = `${pullZoneUrl}/${fullPath}`
  void import('@/lib/search/live-index').then(m => m.notifyStorageChange({ key: fullPath, size, op: 'put' })).catch(() => {})

  const type = detectMediaType(input.mimeType, input.filename)
  const asset = await prisma.mediaAsset.create({
    data: { folderId: input.folderId, productId: null, name: baseName, alt: input.alt ?? null, type, cdnUrl, size, mimeType: input.mimeType || null, ...(input.meta ? { meta: input.meta } : {}) },
  })
  void logApiUsage({ service: 'bunnycdn', operation: 'upload', units: size / 1e9, userId: input.userId ?? null, refType: 'mediaAsset', refId: asset.id })
  return { id: asset.id, url: cdnUrl, path: fullPath, size, name: baseName, type }
}
