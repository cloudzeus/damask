import { prisma } from '@/lib/prisma'
import { sendMail, isMailerConfigured } from '@/lib/mailer'
import { logActivity } from '@/lib/activity/log'
import { createNotification } from '@/lib/notifications/service'
import { fileRequestCompletedCustomerEmail, fileRequestCompletedStaffEmail } from '@/lib/file-requests/emails'

/**
 * Κοινή λογική αιτημάτων δικαιολογητικών (χρησιμοποιείται από staff actions +
 * public upload route). Non-'use server' ώστε να καλείται και από μη-gated ροές.
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

/**
 * Επαναϋπολογίζει την κατάσταση του αιτήματος από τα items και, όταν ΟΛΑ τα
 * υποχρεωτικά έχουν ανέβει, το σημαδεύει COMPLETED και ειδοποιεί πελάτη + ομάδα
 * (μία φορά — idempotent μέσω customerNotifiedAt/staffNotifiedAt).
 */
export async function recomputeFileRequestStatus(fileRequestId: string): Promise<void> {
  const fr = await prisma.fileRequest.findUnique({
    where: { id: fileRequestId },
    include: { items: true },
  })
  if (!fr || fr.status === 'CANCELLED' || fr.status === 'EXPIRED') return

  const required = fr.items.filter(i => i.required)
  const uploaded = fr.items.filter(i => i.fileUrl)
  const requiredDone = required.every(i => i.fileUrl)
  const anyUploaded = uploaded.length > 0

  const nextStatus = requiredDone && required.length > 0 ? 'COMPLETED' : anyUploaded ? 'PARTIAL' : 'PENDING'
  const justCompleted = nextStatus === 'COMPLETED' && fr.status !== 'COMPLETED'

  await prisma.fileRequest.update({
    where: { id: fr.id },
    data: {
      status: nextStatus,
      completedAt: justCompleted ? new Date() : fr.completedAt,
    },
  })

  if (justCompleted) await notifyCompletion(fr.id)
}

async function notifyCompletion(fileRequestId: string): Promise<void> {
  const fr = await prisma.fileRequest.findUnique({ where: { id: fileRequestId }, include: { items: true } })
  if (!fr) return

  const trdr = await prisma.trdr.findUnique({ where: { id: fr.trdrId }, select: { NAME: true } })
  const customerName = trdr?.NAME ?? null

  // In-app ειδοποίηση στην ομάδα.
  await createNotification({
    type: 'GENERIC',
    title: `Ολοκληρώθηκαν δικαιολογητικά — ${customerName ?? fr.title}`,
    body: `${fr.items.filter(i => i.fileUrl).length} αρχεία για «${fr.title}»`,
    entityType: 'FileRequest',
    entityId: fr.id,
    meta: { trdrId: fr.trdrId, programId: fr.programId, applicationId: fr.applicationId },
  })

  if (!(await isMailerConfigured())) {
    await stampNotified(fr.id, true, true)
    await logActivity('file_request.completed', { userId: null, entityType: 'FileRequest', entityId: fr.id, summary: fr.title, meta: { items: fr.items.length } })
    return
  }

  // Email στον πελάτη.
  if (fr.email && !fr.customerNotifiedAt) {
    const mail = fileRequestCompletedCustomerEmail({ customerName, title: fr.title })
    await sendMail({ to: fr.email, subject: mail.subject, html: mail.html, tracking: false, refType: 'file-request-done', refId: fr.id }).catch(() => {})
  }

  // Email στην ομάδα (δημιουργός ή admins/managers).
  if (!fr.staffNotifiedAt) {
    const recipients = await staffRecipients(fr.createdById)
    if (recipients.length > 0) {
      const adminUrl = fr.applicationId
        ? `${APP_URL}/programs/${fr.programId ?? ''}/applications/${fr.applicationId}`
        : `${APP_URL}/partners/${fr.trdrId}`
      const mail = fileRequestCompletedStaffEmail({ title: fr.title, customerName, adminUrl, itemCount: fr.items.filter(i => i.fileUrl).length })
      await sendMail({ to: recipients.join(','), subject: mail.subject, html: mail.html, tracking: false, refType: 'file-request-done-staff', refId: fr.id }).catch(() => {})
    }
  }

  await stampNotified(fr.id, true, true)
  await logActivity('file_request.completed', { userId: null, entityType: 'FileRequest', entityId: fr.id, summary: fr.title, meta: { items: fr.items.length } })
}

async function stampNotified(id: string, customer: boolean, staff: boolean): Promise<void> {
  await prisma.fileRequest.update({
    where: { id },
    data: {
      customerNotifiedAt: customer ? new Date() : undefined,
      staffNotifiedAt: staff ? new Date() : undefined,
    },
  })
}

async function staffRecipients(createdById?: string | null): Promise<string[]> {
  if (createdById) {
    const creator = await prisma.user.findUnique({ where: { id: createdById }, select: { email: true, active: true } })
    if (creator?.active && creator.email) return [creator.email]
  }
  const staff = await prisma.user.findMany({
    where: { active: true, role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] } } },
    select: { email: true },
  })
  return [...new Set(staff.map(s => s.email).filter(Boolean))]
}
