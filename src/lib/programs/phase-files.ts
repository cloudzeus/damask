'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import type { DeliverablePhase } from '@prisma/client'
import { DELIVERABLE_PHASE_ORDER } from '@/lib/pm/deliverable-phases'

/**
 * Απαιτούμενα αρχεία ΑΠΟ ΤΟΝ ΠΕΛΑΤΗ ανά πρόγραμμα × φάση. Ο admin τα ορίζει στον
 * program editor· τροφοδοτούν ως πρότυπο τα αιτήματα δικαιολογητικών (FileRequest).
 * Gated programs.manage (config) / customer.view (ανάγνωση προτύπου για έργο).
 */

export type PhaseFileRow = {
  id: string
  phase: string
  label: string
  description: string | null
  required: boolean
  order: number
}

export type PhaseFileInput = { phase: string; label: string; description?: string | null; required?: boolean }

const VALID_PHASES = new Set<string>(DELIVERABLE_PHASE_ORDER)

export async function listProgramPhaseFiles(programId: string): Promise<PhaseFileRow[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programPhaseFile.findMany({ where: { programId }, orderBy: [{ order: 'asc' }] })
  const phaseIdx = (p: string) => DELIVERABLE_PHASE_ORDER.indexOf(p as (typeof DELIVERABLE_PHASE_ORDER)[number])
  return rows
    .map(r => ({ id: r.id, phase: r.phase, label: r.label, description: r.description, required: r.required, order: r.order }))
    .sort((a, b) => phaseIdx(a.phase) - phaseIdx(b.phase) || a.order - b.order)
}

/** Αντικαθιστά ΟΛΑ τα απαιτούμενα αρχεία του προγράμματος (ανά φάση). */
export async function setProgramPhaseFiles(programId: string, items: PhaseFileInput[]): Promise<{ ok: boolean; count: number }> {
  await requirePermission('programs.manage')
  const clean = items
    .filter(i => i.label?.trim() && VALID_PHASES.has(i.phase))
    .map((i, idx) => ({
      programId,
      phase: i.phase as DeliverablePhase,
      label: i.label.trim(),
      description: i.description?.trim() || null,
      required: i.required ?? true,
      order: idx,
    }))

  await prisma.$transaction([
    prisma.programPhaseFile.deleteMany({ where: { programId } }),
    ...(clean.length ? [prisma.programPhaseFile.createMany({ data: clean })] : []),
  ])
  revalidatePath(`/programs/${programId}`)
  return { ok: true, count: clean.length }
}

/** Πρότυπο απαιτούμενων αρχείων για μια φάση — για prefill ενός FileRequest. */
export async function getPhaseFileTemplate(programId: string, phase: string): Promise<{ label: string; description: string | null; required: boolean }[]> {
  await requirePermission('customer.view')
  const rows = await prisma.programPhaseFile.findMany({
    where: { programId, phase: phase as DeliverablePhase },
    orderBy: { order: 'asc' },
    select: { label: true, description: true, required: true },
  })
  return rows
}
