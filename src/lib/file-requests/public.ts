import { prisma } from '@/lib/prisma'
import { hashToken } from '@/lib/pm/portal-token'
import { recomputeFileRequestStatus } from '@/lib/file-requests/service'

/**
 * Public (token-only, ΧΩΡΙΣ permission gate) πρόσβαση σε αίτημα δικαιολογητικών.
 * Χρησιμοποιείται από τη σελίδα /r/[token] (RSC) και το public upload route.
 * Plain module (ΟΧΙ 'use server').
 */

export type PublicFileRequestItem = {
  id: string
  label: string
  description: string | null
  required: boolean
  status: string
  fileName: string | null
  uploaded: boolean
  uploadedAt: string | null
}

export type PublicFileRequest =
  | { ok: false; reason: 'not_found' | 'expired' | 'cancelled' }
  | {
      ok: true
      id: string
      title: string
      message: string | null
      status: string
      expiresAt: string
      completed: boolean
      items: PublicFileRequestItem[]
    }

export async function resolveFileRequestByToken(rawToken: string): Promise<PublicFileRequest> {
  const fr = await prisma.fileRequest.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { items: { orderBy: { order: 'asc' } } },
  })
  if (!fr) return { ok: false, reason: 'not_found' }
  if (fr.status === 'CANCELLED') return { ok: false, reason: 'cancelled' }
  if (fr.expiresAt.getTime() < Date.now() && fr.status !== 'COMPLETED') {
    if (fr.status !== 'EXPIRED') await prisma.fileRequest.update({ where: { id: fr.id }, data: { status: 'EXPIRED' } }).catch(() => {})
    return { ok: false, reason: 'expired' }
  }
  return {
    ok: true,
    id: fr.id,
    title: fr.title,
    message: fr.message,
    status: fr.status,
    expiresAt: fr.expiresAt.toISOString(),
    completed: fr.status === 'COMPLETED',
    items: fr.items.map(i => ({
      id: i.id,
      label: i.label,
      description: i.description,
      required: i.required,
      status: i.status,
      fileName: i.fileName,
      uploaded: Boolean(i.fileKey || i.fileUrl),
      uploadedAt: i.uploadedAt ? i.uploadedAt.toISOString() : null,
    })),
  }
}

/**
 * Συσχέτιση ανεβασμένου αρχείου (ήδη στο Bunny) με ένα item του αιτήματος. Καλείται
 * από το public upload route ΜΕΤΑ την αποθήκευση στο Bunny. Ελέγχει token+expiry+
 * ότι το item ανήκει στο αίτημα, μετά recompute status (→ ενδεχόμενη ολοκλήρωση/ειδοποίηση).
 */
export async function attachUploadedFileToItem(input: {
  rawToken: string
  itemId: string
  fileName: string
  fileKey: string
  mimeType?: string | null
  sizeBytes?: number | null
}): Promise<{ ok: boolean; error?: string }> {
  const fr = await prisma.fileRequest.findUnique({ where: { tokenHash: hashToken(input.rawToken) }, select: { id: true, status: true, expiresAt: true } })
  if (!fr) return { ok: false, error: 'Το αίτημα δεν βρέθηκε.' }
  if (fr.status === 'CANCELLED') return { ok: false, error: 'Το αίτημα ακυρώθηκε.' }
  if (fr.expiresAt.getTime() < Date.now() && fr.status !== 'COMPLETED') return { ok: false, error: 'Το αίτημα έληξε.' }

  const item = await prisma.fileRequestItem.findFirst({ where: { id: input.itemId, fileRequestId: fr.id } })
  if (!item) return { ok: false, error: 'Το ζητούμενο στοιχείο δεν βρέθηκε.' }

  await prisma.fileRequestItem.update({
    where: { id: item.id },
    data: {
      fileName: input.fileName,
      fileKey: input.fileKey,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      status: 'UPLOADED',
      uploadedAt: new Date(),
    },
  })

  await recomputeFileRequestStatus(fr.id)
  return { ok: true }
}
