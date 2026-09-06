'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { newToken } from '@/lib/pm/portal-token'
import { logActivity } from '@/lib/activity/log'
import { sendMail, isMailerConfigured } from '@/lib/mailer'
import { fileRequestInviteEmail } from '@/lib/file-requests/emails'

/**
 * Staff-side αιτήματα δικαιολογητικών (gated customer.edit/view). Δημιουργία με
 * λίστα ζητούμενων items + one-time link (+ προαιρετική αποστολή email πρόσκλησης).
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

export type CreateFileRequestInput = {
  trdrId: string
  programId?: string
  applicationId?: string
  obligationId?: string
  title: string
  message?: string
  email?: string
  expiresAt: string // ISO
  items: { label: string; description?: string; required?: boolean }[]
  sendEmail?: boolean
}

export async function createFileRequest(input: CreateFileRequestInput): Promise<{ ok: boolean; error?: string; id?: string; url?: string }> {
  const session = await requirePermission('customer.edit')
  if (!input.title?.trim()) return { ok: false, error: 'Λείπει ο τίτλος.' }
  if (!input.items?.length) return { ok: false, error: 'Πρόσθεσε τουλάχιστον ένα δικαιολογητικό.' }

  const { raw, hash } = newToken()
  const fr = await prisma.fileRequest.create({
    data: {
      tokenHash: hash,
      title: input.title,
      message: input.message ?? null,
      email: input.email ?? null,
      expiresAt: new Date(input.expiresAt),
      trdrId: input.trdrId,
      programId: input.programId ?? null,
      applicationId: input.applicationId ?? null,
      obligationId: input.obligationId ?? null,
      createdById: session.user.id,
      items: {
        create: input.items.map((it, i) => ({ label: it.label, description: it.description ?? null, required: it.required ?? true, order: i })),
      },
    },
  })
  const url = `${APP_URL}/r/${raw}`

  if (input.sendEmail && input.email && (await isMailerConfigured())) {
    const trdr = await prisma.trdr.findUnique({ where: { id: input.trdrId }, select: { NAME: true } })
    const mail = fileRequestInviteEmail({
      customerName: trdr?.NAME ?? null,
      title: input.title,
      message: input.message,
      items: input.items.map(i => ({ label: i.label, required: i.required ?? true })),
      url,
      expiresAt: new Date(input.expiresAt),
    })
    await sendMail({ to: input.email, subject: mail.subject, html: mail.html, tracking: false, refType: 'file-request-invite', refId: fr.id }).catch(() => {})
  }

  await logActivity('file_request.create', { entityType: 'FileRequest', entityId: fr.id, summary: input.title, meta: { items: input.items.length } })
  if (input.trdrId) revalidatePath(`/partners/${input.trdrId}`)
  return { ok: true, id: fr.id, url }
}

export type FileRequestRow = {
  id: string
  title: string
  status: string
  itemCount: number
  uploadedCount: number
  expiresAt: string
  createdAt: string
  completedAt: string | null
}

async function listFileRequests(where: { trdrId?: string; programId?: string; applicationId?: string }): Promise<FileRequestRow[]> {
  await requirePermission('customer.view')
  const rows = await prisma.fileRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { items: { select: { fileKey: true, fileUrl: true } } },
    take: 100,
  })
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    status: r.status,
    itemCount: r.items.length,
    uploadedCount: r.items.filter(i => i.fileKey || i.fileUrl).length,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }))
}

export async function listFileRequestsForTrdr(trdrId: string) {
  return listFileRequests({ trdrId })
}
export async function listFileRequestsForApplication(applicationId: string) {
  return listFileRequests({ applicationId })
}

export type FileRequestDetail = {
  id: string
  title: string
  message: string | null
  status: string
  expiresAt: string
  items: { id: string; label: string; description: string | null; required: boolean; status: string; fileName: string | null; downloadUrl: string | null; uploadedAt: string | null }[]
}

export async function getFileRequestDetail(id: string): Promise<FileRequestDetail | null> {
  await requirePermission('customer.view')
  const fr = await prisma.fileRequest.findUnique({ where: { id }, include: { items: { orderBy: { order: 'asc' } } } })
  if (!fr) return null
  return {
    id: fr.id,
    title: fr.title,
    message: fr.message,
    status: fr.status,
    expiresAt: fr.expiresAt.toISOString(),
    items: fr.items.map(i => ({ id: i.id, label: i.label, description: i.description, required: i.required, status: i.status, fileName: i.fileName, downloadUrl: (i.fileKey || i.fileUrl) ? `/api/file-requests/items/${i.id}/download` : null, uploadedAt: i.uploadedAt ? i.uploadedAt.toISOString() : null })),
  }
}

export async function cancelFileRequest(id: string): Promise<{ ok: boolean }> {
  const session = await requirePermission('customer.edit')
  const fr = await prisma.fileRequest.update({ where: { id }, data: { status: 'CANCELLED' } })
  await logActivity('file_request.create', { userId: session.user.id, entityType: 'FileRequest', entityId: id, summary: `Ακύρωση: ${fr.title}` })
  if (fr.trdrId) revalidatePath(`/partners/${fr.trdrId}`)
  return { ok: true }
}
