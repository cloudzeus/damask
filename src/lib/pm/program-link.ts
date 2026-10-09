'use server'

import { revalidatePath } from 'next/cache'
import { Prisma, type ApplicationLifecycle } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { computeSinglePair, type SinglePairEligibility } from '@/lib/prospects/evaluate-pair'
import { ensureTrdrProgramFolder } from '@/lib/trdr/cdn-folder'
import { seedFormObligationsForApplication } from '@/lib/pm/form-obligations'
import { logActivity } from '@/lib/activity/log'
import type { LifecycleStr, StageStr, VerdictStr, ObligationStatusStr } from '@/lib/pm/types'

/**
 * Σύνδεση πελάτη ↔ Ευρωπαϊκού προγράμματος με κύκλο ζωής (κάρτες στην καρτέλα
 * πελάτη). Reads: 'customer.view'. Mutations: 'programs.manage'.
 * Το association ΔΕΝ παράγει PM obligations (αυτό γίνεται από το createApplication
 * στη ροή PM) — εδώ κρατάμε ελαφριά «δυνητική» εγγραφή + snapshot αξιολόγησης.
 */

export type TrdrProgramCard = {
  id: string
  programId: string
  programTitle: string
  lifecycle: LifecycleStr
  stage: StageStr
  verdict: VerdictStr
  snapshot: SinglePairEligibility | null
}

/** Ενεργά προγράμματα ως {value,label} για τον picker στην καρτέλα πελάτη. */
export async function listActivePrograms(): Promise<{ value: string; label: string }[]> {
  await requirePermission('customer.view')
  const rows = await prisma.program.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
  })
  return rows.map(p => ({ value: p.id, label: p.title }))
}

/** Live αξιολόγηση πελάτη×προγράμματος (πριν τη σύνδεση — «αν μπορεί να ενταχθεί»). */
export async function evaluateTrdrForProgram(trdrId: string, programId: string): Promise<SinglePairEligibility> {
  await requirePermission('customer.view')
  return computeSinglePair(trdrId, programId)
}

/** Οι κάρτες προγραμμάτων ενός πελάτη (με το αποθηκευμένο snapshot). */
export async function listTrdrProgramCards(trdrId: string): Promise<TrdrProgramCard[]> {
  await requirePermission('customer.view')
  const apps = await prisma.programApplication.findMany({
    where: { trdrId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      programId: true,
      lifecycle: true,
      stage: true,
      assessmentVerdict: true,
      eligibilitySnapshot: true,
      program: { select: { title: true } },
    },
  })
  return apps.map(a => ({
    id: a.id,
    programId: a.programId,
    programTitle: a.program.title,
    lifecycle: a.lifecycle as LifecycleStr,
    stage: a.stage as StageStr,
    verdict: a.assessmentVerdict as VerdictStr,
    snapshot: (a.eligibilitySnapshot as unknown as SinglePairEligibility | null) ?? null,
  }))
}

/** Συνδέει (upsert) πελάτη με πρόγραμμα ως «Δυνητικός» + αποθηκεύει snapshot αξιολόγησης. */
export async function associateTrdrProgram(trdrId: string, programId: string): Promise<{ id: string }> {
  const session = await requirePermission('programs.manage')
  const snapshot = await computeSinglePair(trdrId, programId)
  const app = await prisma.programApplication.upsert({
    where: { trdrId_programId: { trdrId, programId } },
    create: {
      trdrId,
      programId,
      lifecycle: 'POTENTIAL',
      eligibilitySnapshot: snapshot as unknown as Prisma.InputJsonValue,
      createdById: session.user.id,
    },
    update: {
      // Ανανέωση snapshot· ΔΕΝ αλλάζουμε το lifecycle αν υπάρχει ήδη.
      eligibilitySnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  })
  await ensureTrdrProgramFolder(trdrId, programId)
  await seedFormObligationsForApplication(app.id, programId) // εκκρεμότητες υποχρεωτικών εντύπων
  await logActivity('application.associate', { entityType: 'application', entityId: app.id, userId: session.user.id, meta: { programId, eligible: snapshot.eligible } })
  revalidatePath(`/partners/${trdrId}`)
  return { id: app.id }
}

/** Μαζική σύνδεση πελάτη με ΠΟΛΛΑ προγράμματα ταυτόχρονα (multiselect modal). */
export async function associateTrdrPrograms(trdrId: string, programIds: string[]): Promise<{ linked: number }> {
  const session = await requirePermission('programs.manage')
  let linked = 0
  for (const programId of programIds) {
    try {
      const snapshot = await computeSinglePair(trdrId, programId)
      const appRow = await prisma.programApplication.upsert({
        where: { trdrId_programId: { trdrId, programId } },
        create: {
          trdrId,
          programId,
          lifecycle: 'POTENTIAL',
          eligibilitySnapshot: snapshot as unknown as Prisma.InputJsonValue,
          createdById: session.user.id,
        },
        update: { eligibilitySnapshot: snapshot as unknown as Prisma.InputJsonValue },
        select: { id: true },
      })
      await ensureTrdrProgramFolder(trdrId, programId)
      await seedFormObligationsForApplication(appRow.id, programId)
      await logActivity('application.associate', { entityType: 'application', entityId: appRow.id, userId: session.user.id, meta: { programId, eligible: snapshot.eligible } })
      linked++
    } catch (err) {
      console.error(`associateTrdrPrograms: αποτυχία για program ${programId}`, err)
    }
  }
  revalidatePath(`/partners/${trdrId}`)
  return { linked }
}

/**
 * Αξιολόγηση εταιρίας για το πρόγραμμα μιας συμμετοχής — (ξανα)υπολογίζει την
 * επιλεξιμότητα (kad/region/legalForm) και αποθηκεύει το snapshot στην κάρτα.
 * Επιστρέφει το αποτέλεσμα ώστε το UI να ενημερωθεί άμεσα.
 */
export async function reevaluateApplication(applicationId: string): Promise<SinglePairEligibility> {
  const session = await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { trdrId: true, programId: true } })
  const snapshot = await computeSinglePair(app.trdrId, app.programId)
  await prisma.programApplication.update({
    where: { id: applicationId },
    data: { eligibilitySnapshot: snapshot as unknown as Prisma.InputJsonValue },
  })
  await logActivity('application.evaluate', { entityType: 'application', entityId: applicationId, userId: session.user.id, meta: { programId: app.programId, eligible: snapshot.eligible } })
  revalidatePath(`/partners/${app.trdrId}`)
  return snapshot
}

export type ApplicationPending = {
  stage: StageStr
  obligations: { id: string; name: string; kind: string; stage: StageStr; status: ObligationStatusStr; dueDate: string | null; mandatory: boolean; current: boolean }[]
  fileRequests: { id: string; title: string; status: string; itemCount: number; uploadedCount: number }[]
  openCount: number
}

/**
 * Εκκρεμότητες ενός έργου (για την καρτέλα πελάτη) — ανοιχτές υποχρεώσεις +
 * εκκρεμή αιτήματα δικαιολογητικών, με έμφαση σε αυτές της ΤΡΕΧΟΥΣΑΣ φάσης (stage).
 */
export async function getApplicationPending(applicationId: string): Promise<ApplicationPending> {
  await requirePermission('customer.view')
  const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { stage: true } })
  const [obligations, frs] = await Promise.all([
    prisma.applicationObligation.findMany({
      where: { applicationId, status: { in: ['PENDING', 'IN_PROGRESS', 'REJECTED'] } },
      orderBy: [{ order: 'asc' }],
      select: { id: true, name: true, kind: true, stage: true, status: true, dueDate: true, mandatory: true },
    }),
    prisma.fileRequest.findMany({
      where: { applicationId, status: { in: ['PENDING', 'PARTIAL'] } },
      include: { items: { select: { fileKey: true, fileUrl: true } } },
    }),
  ])
  const current = app.stage as StageStr
  return {
    stage: current,
    obligations: obligations
      .map(o => ({
        id: o.id, name: o.name, kind: o.kind as string, stage: o.stage as StageStr, status: o.status as ObligationStatusStr,
        dueDate: o.dueDate ? o.dueDate.toISOString() : null, mandatory: o.mandatory, current: (o.stage as StageStr) === current,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current)),
    fileRequests: frs.map(f => ({ id: f.id, title: f.title, status: f.status, itemCount: f.items.length, uploadedCount: f.items.filter(i => i.fileKey || i.fileUrl).length })),
    openCount: obligations.length + frs.length,
  }
}

/** Αλλάζει τον κύκλο ζωής μιας συμμετοχής (χρώμα κάρτας). */
export async function setApplicationLifecycle(applicationId: string, lifecycle: ApplicationLifecycle): Promise<void> {
  await requirePermission('programs.manage')
  const app = await prisma.programApplication.update({
    where: { id: applicationId },
    data: { lifecycle },
    select: { trdrId: true },
  })
  await logActivity('application.lifecycle', { entityType: 'application', entityId: applicationId, meta: { lifecycle } })
  revalidatePath(`/partners/${app.trdrId}`)
}

/** Αφαιρεί τη σύνδεση πελάτη↔προγράμματος (διαγράφει το ProgramApplication). */
export async function removeTrdrProgram(applicationId: string): Promise<void> {
  await requirePermission('programs.manage')
  const app = await prisma.programApplication.delete({
    where: { id: applicationId },
    select: { trdrId: true },
  })
  await logActivity('application.remove', { entityType: 'application', entityId: applicationId })
  revalidatePath(`/partners/${app.trdrId}`)
}

export type ApplicationDeletionImpact = {
  trdrName: string; programTitle: string
  counts: { label: string; n: number }[]
}

/** Τι θα διαγραφεί μαζί με το έργο (για την οθόνη επιβεβαίωσης). */
export async function getApplicationDeletionImpact(applicationId: string): Promise<ApplicationDeletionImpact | null> {
  await requirePermission('programs.manage')
  const a = await prisma.programApplication.findUnique({
    where: { id: applicationId },
    select: {
      trdr: { select: { NAME: true } }, program: { select: { title: true } },
      _count: { select: { expenses: true, expenseDeliverables: true, obligations: true, documents: true, paymentRequests: true, proposalSubmissions: true, documentRequests: true, criterionScores: true, valueChecks: true, contactLinks: true } },
    },
  })
  if (!a) return null
  const c = a._count
  const counts = [
    { label: 'δαπάνες', n: c.expenses }, { label: 'παραδοτέα δαπανών', n: c.expenseDeliverables }, { label: 'υποχρεώσεις/εργασίες', n: c.obligations },
    { label: 'έγγραφα έργου', n: c.documents }, { label: 'αιτήματα πληρωμής', n: c.paymentRequests }, { label: 'υποβολές πρότασης', n: c.proposalSubmissions },
    { label: 'αιτήματα εγγράφων', n: c.documentRequests }, { label: 'βαθμολογίες αξιολόγησης', n: c.criterionScores }, { label: 'έλεγχοι τιμών', n: c.valueChecks },
    { label: 'συνδέσεις επαφών', n: c.contactLinks },
  ].filter(x => x.n > 0)
  return { trdrName: a.trdr.NAME, programTitle: a.program.title, counts }
}

/**
 * Οριστική διαγραφή έργου από το /pm. Απαιτεί programs.manage ΚΑΙ ρητή επιβεβαίωση «ΔΙΑΓΡΑΦΗ».
 * Σβήνει το έργο με όλα τα εξαρτώμενα (δαπάνες, παραδοτέα, υποχρεώσεις, πληρωμές…). Email, νήματα επικοινωνίας
 * και αιτήματα δικαιολογητικών μένουν ως ιστορικό· τα αρχεία του φακέλου στο CDN δεν αγγίζονται.
 */
export async function deleteApplication(applicationId: string, confirmText: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermission('programs.manage')
  if (confirmText.trim().toUpperCase() !== 'ΔΙΑΓΡΑΦΗ') return { ok: false, error: 'Πληκτρολογήστε «ΔΙΑΓΡΑΦΗ» για επιβεβαίωση.' }
  const app = await prisma.programApplication.findUnique({ where: { id: applicationId }, select: { trdrId: true, programId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } } } })
  if (!app) return { ok: false, error: 'Το έργο δεν βρέθηκε.' }
  await prisma.programApplication.delete({ where: { id: applicationId } })
  await logActivity('application.remove', { entityType: 'application', entityId: applicationId, userId: session.user.id, summary: `Διαγραφή έργου — ${app.trdr.NAME} · ${app.program.title}`, meta: { trdrId: app.trdrId, programId: app.programId } })
  revalidatePath('/pm')
  revalidatePath(`/partners/${app.trdrId}`)
  revalidatePath(`/programs/${app.programId}`)
  return { ok: true }
}
