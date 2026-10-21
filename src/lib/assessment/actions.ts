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
  // Πρώτα φρέσκο προφίλ (ΑΑΔΕ/ΚΑΔ/ΓΕΜΗ/περιφέρεια όπου λείπουν) — αλλιώς η αναφορά βγαίνει με κενά. Μετά ο agent.
  void (async () => {
    try {
      const { ensureTrdrRegistries, ensureTrdrRegion } = await import('@/lib/trdr/derive')
      await ensureTrdrRegistries(trdrId)
      await ensureTrdrRegion(trdrId)
    } catch (err) { console.warn('[assessment] φρεσκάρισμα προφίλ:', err) }
    await runEligibilityAssessment(a.id)
  })().catch(err => console.error('[assessment] failed', err))
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

export type AssessableProgram = {
  id: string; title: string; status: string; hasGuide: boolean
  /** Ο πελάτης ταιριάζει ήδη (δυνητικά προγράμματα): strong = με πραγματικό περιορισμό περιφέρειας/ΚΑΔ. */
  match: 'strong' | 'basic' | null
  matched: string[]
  /** Η υποβολή έχει λήξει. */
  expired: boolean
  submissionEnd: string | null
}

/**
 * Προγράμματα για επιλογή — με `trdrId`: ΠΡΩΤΑ όσα ταιριάζουν ήδη στον πελάτη (περιφέρεια/ΚΑΔ/μορφή), μετά τα
 * υπόλοιπα ανοιχτά, στο τέλος όσα έληξαν/έκλεισαν.
 */
export async function listAssessablePrograms(trdrId?: string): Promise<AssessableProgram[]> {
  await requirePermission('customer.view')
  const [rows, matches] = await Promise.all([
    prisma.program.findMany({ select: { id: true, title: true, status: true, storageKey: true, submissionEnd: true }, orderBy: { createdAt: 'desc' } }),
    trdrId ? prisma.trdrProgramMatch.findMany({ where: { trdrId, eligible: true }, select: { programId: true, restricted: true, matched: true } }) : Promise.resolve([]),
  ])
  const today = new Date(new Date().toISOString().slice(0, 10))
  const m = new Map(matches.map(x => [x.programId, x]))
  const out = rows.map(p => {
    const mm = m.get(p.id)
    return {
      id: p.id, title: p.title, status: p.status, hasGuide: !!p.storageKey,
      match: mm ? (mm.restricted ? 'strong' as const : 'basic' as const) : null, matched: mm?.matched ?? [],
      expired: p.status === 'CLOSED' || (!!p.submissionEnd && p.submissionEnd < today), submissionEnd: p.submissionEnd?.toISOString() ?? null,
    }
  })
  const rank = (p: AssessableProgram) => (p.expired ? 100 : 0) + (p.match === 'strong' ? 0 : p.match === 'basic' ? 10 : 20) + (p.status === 'ACTIVE' ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b))
}

export type ProfileReadiness = {
  items: { key: string; label: string; ok: boolean; value: string; fix: string | null }[]
  score: number
}

/** «Ετοιμότητα στοιχείων»: τι ξέρει η εφαρμογή για την επιχείρηση πριν την αξιολόγηση — και πώς συμπληρώνεται ό,τι λείπει. */
export async function getProfileReadiness(trdrId: string): Promise<ProfileReadiness> {
  await requirePermission('customer.view')
  const t = await prisma.trdr.findUniqueOrThrow({
    where: { id: trdrId },
    select: {
      AFM: true, appLegalForm: true, foundingDate: true, regionCode: true, aadeSyncedAt: true, gemiSyncedAt: true,
      appEme: true, appEmployeesYear: true, appAnnualRevenue: true, appRevenueYear: true,
      _count: { select: { kads: true, dossierDocs: true } },
    },
  })
  const yr = (y: number | null) => (y ? ` (${y})` : '')
  const eur = (v: unknown) => `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 }).format(Number(v))} €`
  const items = [
    { key: 'kad', label: 'ΚΑΔ', ok: t._count.kads > 0, value: t._count.kads ? `${t._count.kads} ΚΑΔ` : 'λείπουν', fix: t._count.kads ? null : 'Ενημερώνονται αυτόματα από ΑΑΔΕ/ΓΕΜΗ στην αξιολόγηση.' },
    { key: 'region', label: 'Περιφέρεια', ok: !!t.regionCode, value: t.regionCode ? 'ναι' : 'λείπει', fix: t.regionCode ? null : 'Βρίσκεται αυτόματα από τη διεύθυνση/ΓΕΜΗ.' },
    { key: 'form', label: 'Νομική μορφή & ίδρυση', ok: !!t.appLegalForm && !!t.foundingDate, value: [t.appLegalForm, t.foundingDate?.getFullYear()].filter(Boolean).join(' · ') || 'λείπει', fix: t.appLegalForm && t.foundingDate ? null : 'Από ΓΕΜΗ (αυτόματα) ή τη φόρμα του πελάτη.' },
    { key: 'eme', label: 'ΕΜΕ (εργαζόμενοι)', ok: t.appEme != null, value: t.appEme != null ? `${t.appEme}${yr(t.appEmployeesYear)}` : 'λείπει', fix: t.appEme != null ? null : 'Ανεβάστε ΕΜΕ ή Δήλωση ΜΜΕ στα δικαιολογητικά — εκτιμάται αλλιώς.' },
    { key: 'revenue', label: 'Κύκλος εργασιών', ok: t.appAnnualRevenue != null, value: t.appAnnualRevenue != null ? `${eur(t.appAnnualRevenue)}${yr(t.appRevenueYear)}` : 'λείπει', fix: t.appAnnualRevenue != null ? null : 'Ανεβάστε Ε3 (ή τα Φ2 της χρήσης) στα δικαιολογητικά.' },
    { key: 'docs', label: 'Δικαιολογητικά στην αποθήκη', ok: t._count.dossierDocs > 0, value: t._count.dossierDocs ? `${t._count.dossierDocs} έγγραφα` : 'κανένα', fix: t._count.dossierDocs ? null : 'Προαιρετικό — η αναφορά θα δείξει ποια χρειάζονται.' },
  ]
  return { items, score: Math.round((items.filter(i => i.ok).length / items.length) * 100) }
}
