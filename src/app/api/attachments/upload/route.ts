import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { logApiUsage } from '@/lib/api-usage'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { trdrUploadFolder } from '@/lib/trdr/cdn-folder'

/**
 * Staff attachment upload (gated customer.edit) → Bunny PRIVATE storage μέσα στον
 * φάκελο του πελάτη (EuPrograms/<code>/ αν δοθεί programId, αλλιώς documents/services/).
 * Χωρίς πελάτη → γενικό private prefix. Επιστρέφει { name, key, size, mime } — ΟΧΙ
 * public URL· το κατέβασμα στο ιστορικό γίνεται μέσω gated route.
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

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα.' }, { status: 400 })
  }
  const file = formData.get('file')
  const trdrId = formData.get('trdrId')
  const programId = formData.get('programId')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο.' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Το αρχείο ξεπερνά τα 25MB.' }, { status: 400 })

  const folder =
    (typeof trdrId === 'string' && trdrId
      ? await trdrUploadFolder(trdrId, typeof programId === 'string' ? programId : null)
      : null) ?? 'email-attachments/'

  const extMatch = /\.[a-z0-9]+$/i.exec(file.name)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  const baseName = file.name.replace(/\.[a-z0-9]+$/i, '')
  const objectName = `${Date.now()}-${randomUUID().slice(0, 8)}-${slugify(baseName)}${ext}`
  const key = `${folder}${objectName}`

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Αδυναμία ανάγνωσης αρχείου.' }, { status: 400 })
  }

  try {
    await bunnyUploadPrivate({ key, body: Buffer.from(arrayBuffer), contentType: file.type || 'application/octet-stream' })
  } catch (err) {
    return NextResponse.json({ error: 'Αποτυχία αποθήκευσης.', detail: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }

  void logApiUsage({ service: 'bunnycdn', operation: 'upload', units: file.size / 1e9, userId: session?.user?.id, refType: 'email-attachment', refId: objectName })
  return NextResponse.json({ name: file.name, key, size: file.size, mime: file.type || null })
}
