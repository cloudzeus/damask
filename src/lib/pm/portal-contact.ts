'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { can } from '@/lib/rbac'
import { stageLabel, lifecycleLabel, obligationStatusLabel, type StageStr, type LifecycleStr, type ObligationStatusStr } from '@/lib/pm/types'
import { buildJourney, type Journey } from '@/lib/pm/portal-journey'

/**
 * Authenticated portal (logged-in CUSTOMER επαφή) — ΕΣΠΑ προγράμματα & δικαιολογητικά.
 * Scope: «κεντρική» επαφή (Contact.portalAllPrograms) βλέπει ΟΛΑ τα προγράμματα του
 * πελάτη· διαφορετικά ΜΟΝΟ όσα είναι συνδεδεμένη (ApplicationContact).
 */

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export type PortalObligation = {
  id: string
  name: string
  statusLabel: string
  status: ObligationStatusStr
  dueDate: string | null
  hasDocument: boolean
  documentName: string | null
}
export type PortalPayment = { ordinal: number; title: string | null; status: string; statusLabel: string; amount: number | null; paidAt: string | null }
export type PortalApp = {
  applicationId: string
  programId: string
  programTitle: string
  stageLabel: string
  lifecycle: LifecycleStr
  lifecycleLabel: string
  obligations: PortalObligation[]
  openRequests: number
  journey: Journey
  /** Ποσά σε € (null = άγνωστο ακόμα). */
  money: { budget: number | null; rate: number | null; subsidy: number | null; expensesCount: number; expensesAmount: number; certifiedAmount: number; paidAmount: number }
  payments: PortalPayment[]
  dates: { deadline: string | null; submittedAt: string | null; nextDue: string | null; durationMonths: number | null }
  manager: { name: string; email: string | null } | null
}
export type ContactPortalDashboard =
  | { ok: true; contactName: string; companyName: string; central: boolean; preview: boolean; applications: PortalApp[] }
  | { ok: false }

const PAYMENT_LABELS: Record<string, string> = { DRAFT: 'Σε προετοιμασία', SUBMITTED: 'Υποβλήθηκε', APPROVED: 'Εγκρίθηκε', PAID: 'Πληρώθηκε', REJECTED: 'Απορρίφθηκε' }
const num = (v: unknown) => (v == null ? null : Number(v))

const CONTACT_SELECT = { id: true, name: true, trdrId: true, portalAllPrograms: true, trdr: { select: { NAME: true } } } as const

/**
 * Βρίσκει την επαφή του συνδεδεμένου χρήστη + το scope της. Με `previewContactId` ένας χρήστης της
 * εφαρμογής (customer.view) βλέπει το portal ΑΚΡΙΒΩΣ όπως η επαφή — μόνο ανάγνωση.
 */
async function resolveContact(previewContactId?: string) {
  const session = await auth()
  if (!session?.user?.id) return null
  if (previewContactId) {
    if (session.user.portalHome || !can(session, 'customer.view')) return null
    const c = await prisma.contact.findUnique({ where: { id: previewContactId }, select: CONTACT_SELECT })
    return c ? { ...c, preview: true } : null
  }
  const contact = await prisma.contact.findFirst({ where: { userId: session.user.id }, select: CONTACT_SELECT })
  return contact ? { ...contact, preview: false } : null
}

export async function getContactPortalDashboard(previewContactId?: string): Promise<ContactPortalDashboard> {
  const contact = await resolveContact(previewContactId)
  if (!contact) return { ok: false }

  const where = contact.portalAllPrograms
    ? { trdrId: contact.trdrId }
    : { trdrId: contact.trdrId, contactLinks: { some: { contactId: contact.id } } }

  const apps = await prisma.programApplication.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, stage: true, lifecycle: true, opskeSubmittedAt: true,
      program: { select: { id: true, title: true, fundingRate: true, submissionEnd: true, durationMonths: true } },
      manager: { select: { name: true, email: true } },
      proposalSubmissions: { where: { status: 'APPROVED' }, orderBy: { version: 'desc' }, take: 1, select: { totalAmount: true, submittedAt: true } },
      expenses: { where: { status: 'ACTIVE' }, select: { amount: true, certification: { select: { verified: true } } } },
      paymentRequests: { orderBy: { ordinal: 'asc' }, select: { ordinal: true, title: true, status: true, targetAmount: true, paidAmount: true, paidAt: true } },
      obligations: {
        where: { kind: 'FORM' },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, status: true, dueDate: true, documents: { select: { name: true }, take: 1 } },
      },
      documentRequests: { where: { status: { in: ['PENDING', 'UPLOADED'] } }, select: { id: true } },
    },
  })

  const applications: PortalApp[] = apps.map(a => {
    const expensesAmount = a.expenses.reduce((t, e) => t + Number(e.amount), 0)
    const certifiedAmount = a.expenses.filter(e => e.certification?.verified).reduce((t, e) => t + Number(e.amount), 0)
    const paid = a.paymentRequests.filter(p => p.status === 'PAID')
    const paidAmount = paid.reduce((t, p) => t + Number(p.paidAmount ?? p.targetAmount ?? 0), 0)
    const budget = num(a.proposalSubmissions[0]?.totalAmount) ?? (expensesAmount || null)
    const rate = num(a.program?.fundingRate)
    const open = a.obligations.filter(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'REJECTED')
    const nextDue = open.map(o => o.dueDate).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime())[0]
    return {
      applicationId: a.id,
      programId: a.program?.id ?? '',
      programTitle: a.program?.title ?? '—',
      stageLabel: stageLabel(a.stage as StageStr),
      lifecycle: a.lifecycle as LifecycleStr,
      lifecycleLabel: lifecycleLabel(a.lifecycle as LifecycleStr),
      openRequests: a.documentRequests.length,
      obligations: a.obligations.map(o => ({
        id: o.id,
        name: o.name,
        status: o.status as ObligationStatusStr,
        statusLabel: obligationStatusLabel(o.status as ObligationStatusStr),
        dueDate: o.dueDate ? o.dueDate.toISOString() : null,
        hasDocument: o.documents.length > 0,
        documentName: o.documents[0]?.name ?? null,
      })),
      journey: buildJourney({
        lifecycle: a.lifecycle as LifecycleStr, stage: a.stage as StageStr, opskeSubmitted: !!a.opskeSubmittedAt,
        paymentRequestsInProgress: a.paymentRequests.filter(p => p.status === 'SUBMITTED' || p.status === 'APPROVED').length,
        paymentsPaid: paid.length,
      }),
      money: { budget, rate, subsidy: budget != null && rate != null ? Math.round(budget * rate) / 100 : null, expensesCount: a.expenses.length, expensesAmount, certifiedAmount, paidAmount },
      payments: a.paymentRequests.filter(p => p.status !== 'DRAFT' || p.targetAmount != null).map(p => ({
        ordinal: p.ordinal, title: p.title, status: p.status, statusLabel: PAYMENT_LABELS[p.status] ?? p.status,
        amount: num(p.paidAmount) ?? num(p.targetAmount), paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      })),
      dates: {
        deadline: a.lifecycle === 'POTENTIAL' || a.lifecycle === 'SUBMITTING' ? a.program?.submissionEnd?.toISOString() ?? null : null,
        submittedAt: a.opskeSubmittedAt ? a.opskeSubmittedAt.toISOString() : null,
        nextDue: nextDue ? nextDue.toISOString() : null,
        durationMonths: a.program?.durationMonths ?? null,
      },
      manager: a.manager?.name ? { name: a.manager.name, email: a.manager.email } : null,
    }
  })

  return { ok: true, contactName: contact.name, companyName: contact.trdr?.NAME ?? '', central: contact.portalAllPrograms, preview: contact.preview, applications }
}

/** Ανέβασμα δικαιολογητικού για μια εκκρεμότητα (FORM) — από τη συνδεδεμένη επαφή. */
export async function submitObligationUpload(
  obligationId: string,
  file: { filename: string; base64: string; mimeType: string },
): Promise<{ ok: boolean; reason?: string }> {
  const contact = await resolveContact()
  if (!contact) return { ok: false, reason: 'unauthorized' }

  const obl = await prisma.applicationObligation.findUnique({
    where: { id: obligationId },
    select: {
      id: true, kind: true,
      application: { select: { id: true, trdrId: true, contactLinks: { select: { contactId: true } } } },
      documents: { select: { id: true }, take: 1 },
      documentRequests: { where: { status: { in: ['PENDING'] } }, select: { id: true }, take: 1 },
    },
  })
  if (!obl || obl.kind !== 'FORM') return { ok: false, reason: 'not_found' }

  // Έλεγχος πρόσβασης: ίδιος πελάτης + (κεντρική ή συνδεδεμένη με το έργο).
  const app = obl.application
  if (app.trdrId !== contact.trdrId) return { ok: false, reason: 'forbidden' }
  if (!contact.portalAllPrograms && !app.contactLinks.some(l => l.contactId === contact.id)) return { ok: false, reason: 'forbidden' }

  const body = Buffer.from(file.base64, 'base64')
  if (body.length === 0) return { ok: false, reason: 'empty' }
  if (body.length > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_large' }
  const ext = (file.filename.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
  const key = `portal/${app.id}/obl-${obl.id}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: file.mimeType })
  const name = file.filename.slice(0, 200)

  const existingDocId = obl.documents[0]?.id
  const doc = existingDocId
    ? await prisma.applicationDocument.update({ where: { id: existingDocId }, data: { name, storageKey: key, mimeType: file.mimeType, size: body.length } })
    : await prisma.applicationDocument.create({ data: { applicationId: app.id, obligationId: obl.id, name, storageKey: key, mimeType: file.mimeType, size: body.length } })

  await prisma.applicationObligation.update({ where: { id: obl.id }, data: { status: 'SUBMITTED' } })
  if (obl.documentRequests[0]) {
    await prisma.documentRequest.update({ where: { id: obl.documentRequests[0].id }, data: { status: 'UPLOADED', uploadedDocumentId: doc.id, uploadedAt: new Date() } })
  }
  return { ok: true }
}
