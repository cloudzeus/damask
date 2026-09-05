import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { logApiUsage } from '@/lib/api-usage'

/**
 * Staff attachment upload (gated customer.edit) → Bunny public cdnUrl. Χρησιμοποιείται
 * από τον composer email για συνημμένα, ανεξάρτητα από το media.manage. Επιστρέφει
 * { url, name, size, mime } — δεν δημιουργεί MediaAsset (τα συνημμένα δεν είναι gallery).
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE = 25 * 1024 * 1024

function slugify(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'file'
}

export async function POST(request: Request) {
  const session = await auth()
  if (!can(session, 'customer.edit')) {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα μεταφόρτωσης.' }, { status: 403 })
  }

  const storageApi = process.env.BUNNY_STORAGE_API
  const storageZone = process.env.BUNNY_STORAGE_ZONE
  const storagePassword = process.env.BUNNY_STORAGE_PASSWORD
  const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL
  if (!storageApi || !storageZone || !storagePassword || !pullZoneUrl) {
    return NextResponse.json({ error: 'Λείπουν ρυθμίσεις αποθήκευσης στον server.' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα.' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο.' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Το αρχείο ξεπερνά τα 25MB.' }, { status: 400 })

  const extMatch = /\.[a-z0-9]+$/i.exec(file.name)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  const baseName = file.name.replace(/\.[a-z0-9]+$/i, '')
  const objectName = `${Date.now()}-${randomUUID().slice(0, 8)}-${slugify(baseName)}${ext}`
  const fullPath = `email-attachments/${objectName}`

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Αδυναμία ανάγνωσης αρχείου.' }, { status: 400 })
  }

  let bunnyRes: Response
  try {
    bunnyRes = await fetch(`${storageApi}/${storageZone}/${fullPath}`, {
      method: 'PUT',
      headers: { AccessKey: storagePassword, 'Content-Type': 'application/octet-stream' },
      body: arrayBuffer,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Αποτυχία αποθήκευσης.', detail: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
  if (bunnyRes.status !== 201) {
    const detail = await bunnyRes.text().catch(() => '')
    return NextResponse.json({ error: 'Η αποθήκευση απορρίφθηκε.', detail }, { status: 502 })
  }

  const cdnUrl = `${pullZoneUrl}/${fullPath}`
  void logApiUsage({ service: 'bunnycdn', operation: 'upload', units: file.size / 1e9, userId: session?.user?.id, refType: 'email-attachment', refId: objectName })
  return NextResponse.json({ url: cdnUrl, name: file.name, size: file.size, mime: file.type || null })
}
