import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { hashToken, isExpired } from '@/lib/pm/portal-token'
import { stageLabel, type StageStr } from '@/lib/pm/types'

// 8MB file → ~11MB base64 body, under the 12mb serverActions bodySizeLimit
// (next.config.ts). Keep these two in sync.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export type UploadRequestView = { ok: true; request: { title: string; description: string | null; customerName: string; programTitle: string; status: string; alreadyUploaded: boolean } } | { ok: false; reason: 'invalid' | 'expired' | 'closed' }

export async function getUploadRequestByToken(raw: string): Promise<UploadRequestView> {
  const rec = await prisma.documentRequest.findUnique({ where: { tokenHash: hashToken(raw) }, include: { application: { select: { trdr: { select: { NAME: true } }, program: { select: { title: true } } } } } })
  if (!rec) return { ok: false, reason: 'invalid' }
  if (rec.status === 'CANCELLED' || rec.status === 'FULFILLED') return { ok: false, reason: 'closed' }
  if (isExpired(rec.expiresAt, Date.now())) return { ok: false, reason: 'expired' }
  return { ok: true, request: { title: rec.title, description: rec.description, customerName: rec.application.trdr?.NAME ?? '', programTitle: rec.application.program?.title ?? '', status: rec.status, alreadyUploaded: rec.status === 'UPLOADED' } }
}

export async function submitDocumentUpload(raw: string, file: { filename: string; base64: string; mimeType: string }): Promise<{ ok: boolean; reason?: string }> {
  const rec = await prisma.documentRequest.findUnique({ where: { tokenHash: hashToken(raw) }, select: { id: true, applicationId: true, obligationId: true, deliverableTaskId: true, status: true, expiresAt: true, uploadedDocumentId: true } })
  if (!rec) return { ok: false, reason: 'invalid' }
  if (rec.status === 'CANCELLED' || rec.status === 'FULFILLED') return { ok: false, reason: 'closed' }
  if (isExpired(rec.expiresAt, Date.now())) return { ok: false, reason: 'expired' }
  const body = Buffer.from(file.base64, 'base64')
  if (body.length === 0) return { ok: false, reason: 'empty' }
  if (body.length > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_large' }
  const ext = (file.filename.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
  const key = `portal/${rec.applicationId}/${rec.id}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: file.mimeType })
  const name = file.filename.slice(0, 200)
  const doc = rec.uploadedDocumentId
    ? await prisma.applicationDocument.update({ where: { id: rec.uploadedDocumentId }, data: { name, storageKey: key, mimeType: file.mimeType, size: body.length } })
    : await prisma.applicationDocument.create({ data: { applicationId: rec.applicationId, obligationId: rec.obligationId, name, storageKey: key, mimeType: file.mimeType, size: body.length, uploadedById: null } })
  await prisma.documentRequest.update({ where: { id: rec.id }, data: { status: 'UPLOADED', uploadedDocumentId: doc.id, uploadedAt: new Date() } })
  if (rec.deliverableTaskId) {
    try {
      await prisma.deliverableFile.create({ data: { taskId: rec.deliverableTaskId, name, storageKey: key, mimeType: file.mimeType, size: body.length, uploadedById: null } })
      await prisma.expenseDeliverableTask.updateMany({ where: { id: rec.deliverableTaskId, status: { in: ['PENDING', 'REJECTED'] } }, data: { status: 'UPLOADED' } })
    } catch (err) {
      console.error('submitDocumentUpload: deliverable-side write failed', err)
    }
  }
  return { ok: true }
}

/** Εκκρεμές αίτημα δικαιολογητικών (FileRequest) του πελάτη — read-only προβολή στο
 * portal. Το raw file-request token ΔΕΝ είναι διαθέσιμο στο portal context, οπότε
 * εδώ μόνο απαριθμούμε (χωρίς uploader — βλ. σχόλιο στη σελίδα portal). */
export type PortalFileRequest = {
  id: string
  title: string
  message: string | null
  status: string
  expiresAt: string
  itemsTotal: number
  itemsUploaded: number
  items: { id: string; label: string; required: boolean; uploaded: boolean }[]
}

export type PortalDashboard = { ok: true; customerName: string; applications: { programTitle: string; stage: string; openObligations: number; overdueObligations: number; openRequests: { title: string; status: string }[] }[]; fileRequests: PortalFileRequest[] } | { ok: false }

export async function getPortalDashboardByToken(raw: string): Promise<PortalDashboard> {
  const tok = await prisma.portalToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { trdr: { select: { NAME: true } } } })
  if (!tok || isExpired(tok.expiresAt, Date.now())) return { ok: false }
  await prisma.portalToken.update({ where: { id: tok.id }, data: { lastAccessAt: new Date() } }).catch(() => {})
  const apps = await prisma.programApplication.findMany({
    where: { trdrId: tok.trdrId },
    select: { stage: true, program: { select: { title: true } }, obligations: { select: { status: true, dueDate: true } }, documentRequests: { where: { status: { in: ['PENDING', 'UPLOADED'] } }, select: { title: true, status: true } } },
  })
  const todayMs = Date.now()
  const applications = apps.map(a => {
    const open = a.obligations.filter(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'SUBMITTED')
    const overdue = open.filter(o => o.dueDate && o.dueDate.getTime() < todayMs)
    return { programTitle: a.program?.title ?? '—', stage: stageLabel(a.stage as StageStr), openObligations: open.length, overdueObligations: overdue.length, openRequests: a.documentRequests.map(r => ({ title: r.title, status: r.status })) }
  })

  // Ενεργά αιτήματα δικαιολογητικών (FileRequest) του πελάτη — μόνο για ενημερωτική
  // λίστα στο portal (read-only). Το ανέβασμα γίνεται μέσω του δικού τους /r/{token}
  // one-time link (email), όχι εδώ — το raw token δεν υπάρχει στο portal context.
  const frs = await prisma.fileRequest.findMany({
    where: { trdrId: tok.trdrId, status: { in: ['PENDING', 'PARTIAL'] } },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: { order: 'asc' }, select: { id: true, label: true, required: true, fileUrl: true } } },
  })
  const fileRequests: PortalFileRequest[] = frs.map(fr => {
    const items = fr.items.map(i => ({ id: i.id, label: i.label, required: i.required, uploaded: Boolean(i.fileUrl) }))
    return { id: fr.id, title: fr.title, message: fr.message, status: fr.status, expiresAt: fr.expiresAt.toISOString(), itemsTotal: items.length, itemsUploaded: items.filter(i => i.uploaded).length, items }
  })

  return { ok: true, customerName: tok.trdr?.NAME ?? '', applications, fileRequests }
}
