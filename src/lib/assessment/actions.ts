'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { logActivity } from '@/lib/activity/log'
import { runEligibilityAssessment, type AssessmentResult } from './agent'

export type AssessmentRow = {
  id: string
  programId: string
  programTitle: string
  status: 'RUNNING' | 'DONE' | 'ERROR'
  probability: number | null
  verdict: AssessmentResult['verdict'] | null
  score: number | null
  summary: string | null
  usedGuidePdf: boolean
  error: string | null
  createdAt: string
}

export type AssessmentDetail = AssessmentRow & { result: AssessmentResult | null; trdrName: string }

const toRow = (a: {
  id: string; programId: string; status: string; probability: number | null; verdict: string | null; score: unknown; summary: string | null
  usedGuidePdf: boolean; error: string | null; createdAt: Date; program: { title: string }
}): AssessmentRow => ({
  id: a.id, programId: a.programId, programTitle: a.program.title, status: a.status as AssessmentRow['status'],
  probability: a.probability, verdict: a.verdict as AssessmentRow['verdict'], score: a.score == null ? null : Number(a.score),
  summary: a.summary, usedGuidePdf: a.usedGuidePdf, error: a.error, createdAt: a.createdAt.toISOString(),
})

/** Ξεκινά αξιολόγηση (≈1′, στο παρασκήνιο) — ο client κάνει polling με getAssessment. */
export async function startEligibilityAssessment(trdrId: string, programId: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const session = await requirePermission('customer.view')
  const running = await prisma.eligibilityAssessment.findFirst({
    where: { trdrId, programId, status: 'RUNNING', createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
    select: { id: true },
  })
  if (running) return { ok: true, id: running.id }
  const a = await prisma.eligibilityAssessment.create({ data: { trdrId, programId, createdById: session.user.id }, select: { id: true } })
  void runEligibilityAssessment(a.id).catch(err => console.error('[assessment] failed', err))
  await logActivity('program.assess', { userId: session.user.id, entityType: 'EligibilityAssessment', entityId: a.id, summary: 'AI αξιολόγηση ένταξης' }).catch(() => {})
  return { ok: true, id: a.id }
}

export async function getAssessment(id: string): Promise<AssessmentDetail | null> {
  await requirePermission('customer.view')
  const a = await prisma.eligibilityAssessment.findUnique({
    where: { id },
    include: { program: { select: { title: true } }, trdr: { select: { NAME: true } } },
  })
  if (!a) return null
  return { ...toRow(a), result: (a.result as unknown as AssessmentResult) ?? null, trdrName: a.trdr.NAME }
}

export async function listAssessments(trdrId: string): Promise<AssessmentRow[]> {
  await requirePermission('customer.view')
  const rows = await prisma.eligibilityAssessment.findMany({
    where: { trdrId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { program: { select: { title: true } } },
  })
  return rows.map(toRow)
}

export async function deleteAssessment(id: string): Promise<void> {
  await requirePermission('customer.edit')
  await prisma.eligibilityAssessment.delete({ where: { id } })
}

/** Προγράμματα για επιλογή (ενεργά πρώτα). */
export async function listAssessablePrograms(): Promise<{ id: string; title: string; status: string; hasGuide: boolean }[]> {
  await requirePermission('customer.view')
  const rows = await prisma.program.findMany({
    where: {},
    select: { id: true, title: true, status: true, storageKey: true },
    orderBy: { createdAt: 'desc' },
  })
  const rank: Record<string, number> = { ACTIVE: 0, DRAFT: 1, CLOSED: 2 }
  return rows
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
    .map(p => ({ id: p.id, title: p.title, status: p.status, hasGuide: !!p.storageKey }))
}
