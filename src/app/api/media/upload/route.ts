import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import type { MediaType } from '@prisma/client'

export const runtime = 'nodejs'
export const maxDuration = 60

const EXT_BY_MIME: Record<string, string> = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'model/gltf-binary': '.glb',
  'model/gltf+json': '.gltf',
  'application/pdf': '.pdf',
}

function sanitizePath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '')
  if (!trimmed) return null
  if (trimmed.includes('..')) return null
  if (!/^[a-z0-9/_-]+$/.test(trimmed)) return null
  return trimmed
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'file'
}

function extensionFor(file: File): string {
  const fromMime = EXT_BY_MIME[file.type]
  if (fromMime) return fromMime
  const match = /\.[a-z0-9]+$/i.exec(file.name)
  return match ? match[0].toLowerCase() : ''
}

/** Ίδια λογική ταξινόμησης τύπου με το client (mass-uploader.tsx detectAssetType). */
function detectMediaType(mimeType: string, filename: string): MediaType {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  const lower = filename.toLowerCase()
  if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return 'MODEL_3D'
  return 'FILE'
}

export async function POST(request: Request) {
  const session = await auth()
  if (!can(session, 'media.manage')) {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα μεταφόρτωσης.' }, { status: 403 })
  }

  const storageApi = process.env.BUNNY_STORAGE_API
  const storageZone = process.env.BUNNY_STORAGE_ZONE
  const storagePassword = process.env.BUNNY_STORAGE_PASSWORD
  const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL
  if (!storageApi || !storageZone || !storagePassword || !pullZoneUrl) {
    return NextResponse.json(
      { error: 'Λείπουν ρυθμίσεις BunnyCDN στον server.' },
      { status: 500 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα φόρμας.' }, { status: 400 })
  }

  const file = formData.get('file')
  const path = formData.get('path')
  const folderIdRaw = formData.get('folderId')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο για μεταφόρτωση.' }, { status: 400 })
  }
  if (typeof path !== 'string') {
    return NextResponse.json({ error: 'Λείπει η διαδρομή προορισμού.' }, { status: 400 })
  }

  const safePath = sanitizePath(path)
  if (!safePath) {
    return NextResponse.json({ error: 'Μη έγκυρη διαδρομή προορισμού.' }, { status: 400 })
  }

  // Προαιρετικός φάκελος (Media Gallery) — αν δοθεί, πρέπει να υπάρχει.
  let folderId: string | null = null
  if (typeof folderIdRaw === 'string' && folderIdRaw.trim() !== '') {
    const folder = await prisma.mediaFolder.findUnique({ where: { id: folderIdRaw } })
    if (!folder) {
      return NextResponse.json({ error: 'Ο φάκελος προορισμού δεν βρέθηκε.' }, { status: 400 })
    }
    folderId = folder.id
  }

  const ext = extensionFor(file)
  const baseName = file.name.replace(/\.[a-z0-9]+$/i, '')
  const objectName = `${Date.now()}-${randomUUID().slice(0, 8)}-${slugify(baseName)}${ext}`
  const fullPath = `${safePath}/${objectName}`

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Αδυναμία ανάγνωσης του αρχείου.' }, { status: 400 })
  }

  let bunnyRes: Response
  try {
    bunnyRes = await fetch(`${storageApi}/${storageZone}/${fullPath}`, {
      method: 'PUT',
      headers: {
        AccessKey: storagePassword,
        'Content-Type': 'application/octet-stream',
      },
      body: arrayBuffer,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Αποτυχία σύνδεσης με το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  if (bunnyRes.status !== 201) {
    const detail = await bunnyRes.text().catch(() => '')
    return NextResponse.json(
      { error: 'Το BunnyCDN απέρριψε τη μεταφόρτωση.', detail },
      { status: 502 },
    )
  }

  const cdnUrl = `${pullZoneUrl}/${fullPath}`

  const asset = await prisma.mediaAsset.create({
    data: {
      folderId,
      productId: null,
      name: baseName,
      type: detectMediaType(file.type, file.name),
      cdnUrl,
      size: file.size,
      mimeType: file.type || null,
    },
  })

  return NextResponse.json({
    id: asset.id,
    url: cdnUrl,
    path: fullPath,
    size: file.size,
  })
}
