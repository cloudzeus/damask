'use server'

import { revalidatePath } from 'next/cache'
import { Prisma, type ApplicationLifecycle } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { computeSinglePair, type SinglePairEligibility } from '@/lib/prospects/evaluate-pair'
import { logActivity } from '@/lib/activity/log'
import type { LifecycleStr, StageStr, VerdictStr } from '@/lib/pm/types'

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
      await prisma.programApplication.upsert({
        where: { trdrId_programId: { trdrId, programId } },
        create: {
          trdrId,
          programId,
          lifecycle: 'POTENTIAL',
          eligibilitySnapshot: snapshot as unknown as Prisma.InputJsonValue,
          createdById: session.user.id,
        },
        update: { eligibilitySnapshot: snapshot as unknown as Prisma.InputJsonValue },
      })
      await logActivity('application.associate', { entityType: 'application', entityId: `${trdrId}:${programId}`, userId: session.user.id, meta: { programId, eligible: snapshot.eligible } })
      linked++
    } catch (err) {
      console.error(`associateTrdrPrograms: αποτυχία για program ${programId}`, err)
    }
  }
  revalidatePath(`/partners/${trdrId}`)
  return { linked }
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
