'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/activity/log'
import { createNotification } from '@/lib/notifications/service'

/**
 * Επιβεβαίωση (accept/reject) ανεβασμένων δικαιολογητικών από τον manager ή τους
 * ανατεθειμένους εκτελεστές του έργου. Καταγράφει ΠΟΙΟΣ επιβεβαίωσε (reviewedById)
 * — μπορεί να είναι περισσότεροι από ένας. + λίστα εκκρεμών προς επιβεβαίωση για
 * το dashboard του χρήστη (μόνο έργα που του έχουν ανατεθεί).
 */

/** Τα applicationIds όπου ο χρήστης είναι manager Ή ανατεθειμένος εκτελεστής. */
async function myApplicationIds(userId: string): Promise<string[]> {
  const [managed, assigned] = await Promise.all([
    prisma.programApplication.findMany({ where: { managerId: userId }, select: { id: true } }),
    prisma.applicationAssignment.findMany({ where: { userId }, select: { applicationId: true } }),
  ])
  return [...new Set([...managed.map(a => a.id), ...assigned.map(a => a.applicationId)])]
}

async function canReview(userId: string, permissions: string[], applicationId: string): Promise<boolean> {
  if (permissions.includes('programs.manage')) return true
  const app = await prisma.programApplication.findUnique({ where: { id: applicationId }, select: { managerId: true } })
  if (app?.managerId === userId) return true
  const a = await prisma.applicationAssignment.findUnique({ where: { applicationId_userId: { applicationId, userId } }, select: { id: true } })
  return !!a
}

export type PendingReviewRow = {
  itemId: string
  label: string
  fileName: string | null
  downloadUrl: string | null
  requestTitle: string
  trdrName: string
  programTitle: string
  applicationId: string
  programId: string | null
  uploadedAt: string | null
}

/** Δικαιολογητικά που ανέβασε ο πελάτης και εκκρεμούν επιβεβαίωση — για το dashboard. */
export async function listMyPendingReviews(): Promise<PendingReviewRow[]> {
  const session = await requirePermission('pm.work')
  const appIds = await myApplicationIds(session.user.id)
  if (appIds.length === 0) return []

  const items = await prisma.fileRequestItem.findMany({
    where: { status: 'UPLOADED', fileRequest: { applicationId: { in: appIds } } },
    orderBy: { uploadedAt: 'desc' },
    include: { fileRequest: { select: { title: true, trdrId: true, programId: true, applicationId: true } } },
    take: 100,
  })

  const trdrIds = [...new Set(items.map(i => i.fileRequest.trdrId))]
  const programIds = [...new Set(items.map(i => i.fileRequest.programId).filter((x): x is string => !!x))]
  const [trdrs, programs] = await Promise.all([
    prisma.trdr.findMany({ where: { id: { in: trdrIds } }, select: { id: true, NAME: true } }),
    prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, title: true } }),
  ])
  const trdrName = new Map(trdrs.map(t => [t.id, t.NAME]))
  const programTitle = new Map(programs.map(p => [p.id, p.title]))

  return items.map(i => ({
    itemId: i.id,
    label: i.label,
    fileName: i.fileName,
    downloadUrl: i.fileKey || i.fileUrl ? `/api/file-requests/items/${i.id}/download` : null,
    requestTitle: i.fileRequest.title,
    trdrName: trdrName.get(i.fileRequest.trdrId) ?? '—',
    programTitle: i.fileRequest.programId ? (programTitle.get(i.fileRequest.programId) ?? '—') : '—',
    applicationId: i.fileRequest.applicationId ?? '',
    programId: i.fileRequest.programId,
    uploadedAt: i.uploadedAt ? i.uploadedAt.toISOString() : null,
  }))
}

export type ReviewItem = {
  id: string
  label: string
  required: boolean
  status: string
  fileName: string | null
  downloadUrl: string | null
  uploadedAt: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNote: string | null
}
export type FileRequestGroup = { id: string; title: string; status: string; expiresAt: string; items: ReviewItem[] }

/** Όλα τα αιτήματα δικαιολογητικών ενός έργου + items (με ποιος επιβεβαίωσε). */
export async function listApplicationFileRequests(applicationId: string): Promise<FileRequestGroup[]> {
  await requirePermission('customer.view')
  const frs = await prisma.fileRequest.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: { order: 'asc' } } },
  })
  const reviewerIds = [...new Set(frs.flatMap(f => f.items.map(i => i.reviewedById).filter((x): x is string => !!x)))]
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(reviewers.map(u => [u.id, u.name]))

  return frs.map(f => ({
    id: f.id,
    title: f.title,
    status: f.status,
    expiresAt: f.expiresAt.toISOString(),
    items: f.items.map(i => ({
      id: i.id,
      label: i.label,
      required: i.required,
      status: i.status,
      fileName: i.fileName,
      downloadUrl: i.fileKey || i.fileUrl ? `/api/file-requests/items/${i.id}/download` : null,
      uploadedAt: i.uploadedAt ? i.uploadedAt.toISOString() : null,
      reviewedByName: i.reviewedById ? (nameById.get(i.reviewedById) ?? null) : null,
      reviewedAt: i.reviewedAt ? i.reviewedAt.toISOString() : null,
      reviewNote: i.reviewNote,
    })),
  }))
}

export async function reviewFileRequestItem(itemId: string, decision: 'ACCEPTED' | 'REJECTED', note?: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermission('pm.work')
  const item = await prisma.fileRequestItem.findUnique({
    where: { id: itemId },
    include: { fileRequest: { select: { applicationId: true, trdrId: true } } },
  })
  if (!item) return { ok: false, error: 'Το δικαιολογητικό δεν βρέθηκε.' }
  const applicationId = item.fileRequest.applicationId
  if (!applicationId) return { ok: false, error: 'Το αίτημα δεν συνδέεται με έργο.' }
  if (!(await canReview(session.user.id, session.user.permissions ?? [], applicationId))) {
    return { ok: false, error: 'Δεν έχεις δικαίωμα επιβεβαίωσης για αυτό το έργο.' }
  }

  await prisma.fileRequestItem.update({
    where: { id: itemId },
    data: { status: decision, reviewedById: session.user.id, reviewedAt: new Date(), reviewNote: note?.trim() || null },
  })

  await createNotification({
    type: 'GENERIC',
    title: `${decision === 'ACCEPTED' ? 'Εγκρίθηκε' : 'Απορρίφθηκε'} δικαιολογητικό — ${item.label}`,
    body: `${session.user.name ?? 'Χρήστης'} · ${item.fileName ?? ''}`.trim(),
    entityType: 'FileRequestItem',
    entityId: itemId,
    meta: { applicationId, decision, reviewerId: session.user.id },
  })
  await logActivity(decision === 'ACCEPTED' ? 'file_request.completed' : 'file_request.create', {
    userId: session.user.id, entityType: 'FileRequestItem', entityId: itemId, summary: `${decision}: ${item.label}`,
  })
  revalidatePath('/dashboard')
  if (applicationId) revalidatePath(`/partners/${item.fileRequest.trdrId}`)
  return { ok: true }
}
