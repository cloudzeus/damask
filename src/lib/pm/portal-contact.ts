'use server'

import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { resolvePortalContact as resolveContact, portalApplicationsWhere } from '@/lib/pm/portal-session'
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
  /** Επιλέξιμες δαπάνες από το περιεχόμενο του προγράμματος (για τον οδηγό του έργου). */
  eligibleExpenses: string[]
  programSlug: string | null
}
export type ContactPortalDashboard =
  | { ok: true; contactName: string; companyName: string; central: boolean; preview: boolean; applications: PortalApp[] }
  | { ok: false }

const PAYMENT_LABELS: Record<string, string> = { DRAFT: 'Σε προετοιμασία', SUBMITTED: 'Υποβλήθηκε', APPROVED: 'Εγκρίθηκε', PAID: 'Πληρώθηκε', REJECTED: 'Απορρίφθηκε' }
const num = (v: unknown) => (v == null ? null : Number(v))

export async function getContactPortalDashboard(previewContactId?: string): Promise<ContactPortalDashboard> {
  const contact = await resolveContact(previewContactId)
  if (!contact) return { ok: false }

  const where = portalApplicationsWhere(contact)

  const apps = await prisma.programApplication.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, stage: true, lifecycle: true, opskeSubmittedAt: true,
      program: { select: { id: true, title: true, fundingRate: true, submissionEnd: true, durationMonths: true, cmsContent: true, publicSlug: true } },
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
      eligibleExpenses: ((a.program?.cmsContent as { eligibleExpenses?: unknown } | null)?.eligibleExpenses as unknown[] | undefined ?? []).filter((x): x is string => typeof x === 'string').slice(0, 12),
      programSlug: a.program?.publicSlug ?? null,
    }
  })

  return { ok: true, contactName: contact.name, companyName: contact.trdr?.NAME ?? '', central: contact.portalAllPrograms, preview: contact.preview, applications }
}

/** Ανέβασμα δικαιολογητικού για μια εκκρεμότητα (FORM) — από τη συνδεδεμένη επαφή. */
export async function submitObligationUpload(
  obligationId: string,
  file: { filename: string; base64: string; mimeType: string },
  /** Αποτέλεσμα του ελέγχου AI (checkPortalDocument) — σημείωση για τον σύμβουλο + αντίγραφο στην αποθήκη όταν ταιριάζει. */
  ai?: { verdict: string; message: string; detectedTypeId?: string | null; issuedAt?: string | null; expiresAt?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const contact = await resolveContact()
  if (!contact || contact.preview) return { ok: false, reason: 'unauthorized' }

  const obl = await prisma.applicationObligation.findUnique({
    where: { id: obligationId },
    select: {
      id: true, kind: true, name: true, sourceId: true, notes: true,
      application: { select: { id: true, trdrId: true, programId: true, contactLinks: { select: { contactId: true } } } },
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
  // ΥΠΟΧΡΕΩΤΙΚΟΣ έλεγχος AI (server-side): μόνο το ζητούμενο έγγραφο της επιχείρησης γίνεται δεκτό.
  const { verifyRequestedUpload } = await import('@/lib/file-requests/verify-upload')
  const trdrRow = await prisma.trdr.findUnique({ where: { id: app.trdrId }, select: { NAME: true, AFM: true } })
  const verdict = await verifyRequestedUpload({ bytes: body, mimeType: file.mimeType, fileName: file.filename, expected: { label: obl.name }, company: { name: trdrRow?.NAME ?? '', afm: trdrRow?.AFM } })
  if (!verdict.ok) return { ok: false, reason: verdict.reason }
  const ext = (file.filename.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
  const key = `portal/${app.id}/obl-${obl.id}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: file.mimeType })
  const name = file.filename.slice(0, 200)

  const existingDocId = obl.documents[0]?.id
  const doc = existingDocId
    ? await prisma.applicationDocument.update({ where: { id: existingDocId }, data: { name, storageKey: key, mimeType: file.mimeType, size: body.length } })
    : await prisma.applicationDocument.create({ data: { applicationId: app.id, obligationId: obl.id, name, storageKey: key, mimeType: file.mimeType, size: body.length } })

  const aiLine = `[${new Date().toLocaleDateString('el-GR')}] ${verdict.note}`
  await prisma.applicationObligation.update({
    where: { id: obl.id },
    data: { status: 'SUBMITTED', notes: [aiLine, obl.notes].filter(Boolean).join('\n').slice(0, 2000) },
  })
  // Σωστό έγγραφο με γνωστό τύπο → και στην αποθήκη της επιχείρησης (δεν θα ξαναζητηθεί σε άλλο πρόγραμμα).
  {
    const typeId = (obl.sourceId ? (await prisma.programRequiredForm.findUnique({ where: { id: obl.sourceId }, select: { documentTypeId: true } }))?.documentTypeId : null) ?? ai?.detectedTypeId ?? null
    if (typeId && (await prisma.documentType.findUnique({ where: { id: typeId }, select: { id: true } }))) {
      const d = (s?: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)
      await prisma.trdrDossierDocument.create({
        data: { trdrId: app.trdrId, documentTypeId: typeId, name, storageKey: key, mimeType: file.mimeType, sizeBytes: body.length, issuedAt: d(ai?.issuedAt), expiresAt: d(ai?.expiresAt), programId: app.programId },
      }).catch(() => null)
    }
  }
  if (obl.documentRequests[0]) {
    await prisma.documentRequest.update({ where: { id: obl.documentRequests[0].id }, data: { status: 'UPLOADED', uploadedDocumentId: doc.id, uploadedAt: new Date() } })
  }
  return { ok: true }
}
