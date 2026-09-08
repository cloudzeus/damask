'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { stageLabel, lifecycleLabel, obligationStatusLabel, type StageStr, type LifecycleStr, type ObligationStatusStr } from '@/lib/pm/types'

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
export type PortalApp = {
  applicationId: string
  programTitle: string
  stageLabel: string
  lifecycleLabel: string
  obligations: PortalObligation[]
  openRequests: number
}
export type ContactPortalDashboard =
  | { ok: true; contactName: string; companyName: string; central: boolean; applications: PortalApp[] }
  | { ok: false }

/** Βρίσκει την επαφή του συνδεδεμένου χρήστη + το scope της. */
async function resolveContact() {
  const session = await auth()
  if (!session?.user?.id) return null
  const contact = await prisma.contact.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, trdrId: true, portalAllPrograms: true, trdr: { select: { NAME: true } } },
  })
  return contact
}

export async function getContactPortalDashboard(): Promise<ContactPortalDashboard> {
  const contact = await resolveContact()
  if (!contact) return { ok: false }

  const where = contact.portalAllPrograms
    ? { trdrId: contact.trdrId }
    : { trdrId: contact.trdrId, contactLinks: { some: { contactId: contact.id } } }

  const apps = await prisma.programApplication.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, stage: true, lifecycle: true,
      program: { select: { title: true } },
      obligations: {
        where: { kind: 'FORM' },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, status: true, dueDate: true, documents: { select: { name: true }, take: 1 } },
      },
      documentRequests: { where: { status: { in: ['PENDING', 'UPLOADED'] } }, select: { id: true } },
    },
  })

  const applications: PortalApp[] = apps.map(a => ({
    applicationId: a.id,
    programTitle: a.program?.title ?? '—',
    stageLabel: stageLabel(a.stage as StageStr),
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
  }))

  return { ok: true, contactName: contact.name, companyName: contact.trdr?.NAME ?? '', central: contact.portalAllPrograms, applications }
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
