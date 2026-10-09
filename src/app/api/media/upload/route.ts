import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { storeMediaBuffer, sanitizeMediaPath, MediaStoreError } from '@/lib/media-store'
import { MEDIA_MAX_BYTES, tooLargeMessage } from '@/lib/media-limits'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const session = await auth()
  if (!can(session, 'media.manage')) {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα μεταφόρτωσης.' }, { status: 403 })
  }

  if (!process.env.BUNNY_STORAGE_API || !process.env.BUNNY_STORAGE_ZONE || !process.env.BUNNY_STORAGE_PASSWORD || !process.env.BUNNY_PULL_ZONE_URL) {
    return NextResponse.json(
      { error: 'Λείπουν ρυθμίσεις BunnyCDN στον server.' },
      { status: 500 },
    )
  }

  // Έλεγχος μεγέθους ΠΡΙΝ το parse: ένα body πάνω από το όριο buffer του proxy
  // κόβεται και το formData() σκάει με γενικό σφάλμα — δώσε σαφές μήνυμα.
  const contentLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: tooLargeMessage(contentLength) }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Η ανάγνωση του αρχείου απέτυχε — δοκίμασε ξανά ή με μικρότερο αρχείο.' }, { status: 400 })
  }

  const file = formData.get('file')
  const path = formData.get('path')
  const folderIdRaw = formData.get('folderId')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο για μεταφόρτωση.' }, { status: 400 })
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: tooLargeMessage(file.size) }, { status: 413 })
  }
  if (typeof path !== 'string') {
    return NextResponse.json({ error: 'Λείπει η διαδρομή προορισμού.' }, { status: 400 })
  }

  const safePath = sanitizeMediaPath(path)
  if (!safePath) {
    return NextResponse.json({ error: 'Μη έγκυρη διαδρομή προορισμού.' }, { status: 400 })
  }

  // Προαιρετικός φάκελος (Media Gallery) — αν δοθεί, πρέπει να υπάρχει.
  let folderId: string | null = null
  let folderName = ''
  if (typeof folderIdRaw === 'string' && folderIdRaw.trim() !== '') {
    const folder = await prisma.mediaFolder.findUnique({ where: { id: folderIdRaw } })
    if (!folder) {
      return NextResponse.json({ error: 'Ο φάκελος προορισμού δεν βρέθηκε.' }, { status: 400 })
    }
    folderId = folder.id
    folderName = folder.name
  }

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Αδυναμία ανάγνωσης του αρχείου.' }, { status: 400 })
  }

  try {
    const stored = await storeMediaBuffer({ body: arrayBuffer, filename: file.name, mimeType: file.type, path: safePath, folderId, userId: session?.user?.id })
    // Φάκελος «Envato Elements»: η AI περιγράφει κάθε φωτογραφία (alt + tags) ώστε τα άρθρα να τη βρίσκουν πρώτη.
    if ((/elements/i.test(folderName) || /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-utc/i.test(file.name)) && file.type.startsWith('image/')) {
      void import('@/lib/media/elements').then(m => m.tagElementsAsset(stored.id, Buffer.from(arrayBuffer), file.type)).catch(() => {})
    }
    return NextResponse.json({ id: stored.id, url: stored.url, path: stored.path, size: stored.size })
  } catch (err) {
    if (err instanceof MediaStoreError) return NextResponse.json({ error: err.message, ...(err.detail ? { detail: err.detail } : {}) }, { status: err.status })
    throw err
  }
}
