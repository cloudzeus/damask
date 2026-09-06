import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { logApiUsage } from '@/lib/api-usage'
import { hashToken } from '@/lib/pm/portal-token'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { attachUploadedFileToItem } from '@/lib/file-requests/public'
import { trdrUploadFolder } from '@/lib/trdr/cdn-folder'

/**
 * Public upload endpoint (token-gated, ΧΩΡΙΣ session — βλ. proxy.ts /api/file-requests/).
 * Ο πελάτης ανεβάζει ένα αρχείο και το συσχετίζει με ένα item του αιτήματος (itemId).
 * Αποθήκευση σε Bunny PRIVATE storage μέσα στον φάκελο του πελάτη (EuPrograms/<code>/
 * αν το αίτημα αφορά πρόγραμμα, αλλιώς documents/services/), μετά attach →
 * recompute/ολοκλήρωση. ΟΧΙ public URL — το staff κατεβάζει μέσω gated route.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE = 25 * 1024 * 1024 // 25MB

function slugify(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'file'
}

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // Έλεγχος token + expiry πριν δεχτούμε bytes.
  const fr = await prisma.fileRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, status: true, expiresAt: true, trdrId: true, programId: true, applicationId: true },
  })
  if (!fr) return NextResponse.json({ error: 'Το αίτημα δεν βρέθηκε.' }, { status: 404 })
  if (fr.status === 'CANCELLED') return NextResponse.json({ error: 'Το αίτημα ακυρώθηκε.' }, { status: 410 })
  if (fr.expiresAt.getTime() < Date.now() && fr.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Το αίτημα έληξε.' }, { status: 410 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα.' }, { status: 400 })
  }
  const file = formData.get('file')
  const itemId = formData.get('itemId')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο.' }, { status: 400 })
  if (typeof itemId !== 'string' || !itemId) return NextResponse.json({ error: 'Λείπει η αντιστοίχιση δικαιολογητικού.' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Το αρχείο ξεπερνά τα 25MB.' }, { status: 400 })

  // Αν το αίτημα δεν έχει programId αλλά έχει applicationId, ανέκτησε το πρόγραμμα.
  let programId = fr.programId
  if (!programId && fr.applicationId) {
    const app = await prisma.programApplication.findUnique({ where: { id: fr.applicationId }, select: { programId: true } })
    programId = app?.programId ?? null
  }
  const folder = (await trdrUploadFolder(fr.trdrId, programId)) ?? `file-requests/${fr.id}/`

  const extMatch = /\.[a-z0-9]+$/i.exec(file.name)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  const baseName = file.name.replace(/\.[a-z0-9]+$/i, '')
  const objectName = `${Date.now()}-${randomUUID().slice(0, 8)}-${slugify(baseName)}${ext}`
  const storageKey = `${folder}${objectName}`

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Αδυναμία ανάγνωσης αρχείου.' }, { status: 400 })
  }

  try {
    await bunnyUploadPrivate({ key: storageKey, body: Buffer.from(arrayBuffer), contentType: file.type || 'application/octet-stream' })
  } catch (err) {
    return NextResponse.json({ error: 'Αποτυχία αποθήκευσης.', detail: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }

  const res = await attachUploadedFileToItem({
    rawToken: token,
    itemId,
    fileName: file.name,
    fileKey: storageKey,
    mimeType: file.type || null,
    sizeBytes: file.size,
  })
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'Αποτυχία συσχέτισης.' }, { status: 400 })

  void logApiUsage({ service: 'bunnycdn', operation: 'upload', units: file.size / 1e9, refType: 'fileRequest', refId: fr.id })
  return NextResponse.json({ ok: true, name: file.name, size: file.size })
}
