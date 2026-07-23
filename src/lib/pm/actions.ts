'use server'

import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { visibleApplicationWhere } from '@/lib/pm/scoping'
import { computeAssessmentScore } from '@/lib/pm/assessment'
import { buildObligationRows, buildCriterionScoreRows, buildTaskObligationRows } from '@/lib/pm/obligations-gen'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { applicationDocKey } from '@/lib/pm/doc-prep'
import { STAGE_ORDER, type StageStr, type ObligationKindStr, type ObligationStatusStr, type VerdictStr, type TaskAssignToStr } from '@/lib/pm/types'
import { checkBudgetCompliance, type ComplianceExpense } from '@/lib/pm/budget-compliance'
import { certificationComplete, certFileKey, certKeyField, CERT_FILE_KINDS, type CertFileKind } from '@/lib/pm/cert-prep'

/**
 * Server orchestration για το Program PM module (C2a.1 — Task 6):
 * ανάθεση διαχειριστή/εισηγητή, scoped ανάγνωση αιτήσεων, δημιουργία
 * υποχρεώσεων/κριτηρίων από το πρόγραμμα, αξιολόγηση με βαθμολογία.
 * (Task 7 — υποχρεώσεις CRUD, ανέβασμα εγγράφων, στάδιο αίτησης, ΟΠΣΚΕ —
 * προστίθεται στο τέλος αυτού του ίδιου module.)
 *
 * ΚΡΙΣΙΜΟ (security): ΚΑΘΕ ενέργεια πρέπει να επιβεβαιώνει ότι η
 * applicationId που στέλνει ο client είναι ΟΡΑΤΗ στον χρήστη — ποτέ
 * τυφλή εμπιστοσύνη στο id μόνο του (δες node_modules/next/dist/docs/
 * 01-app/02-guides/server-actions.md#security: «a well-formed object can
 * still refer to a row the caller does not own»). Το requireVisibleApplication
 * παρακάτω είναι το ΜΟΝΑΔΙΚΟ σημείο ελέγχου ορατότητας — κάθε action που
 * αγγίζει μια συγκεκριμένη αίτηση (είτε άμεσα είτε μέσω ενός child row όπως
 * obligation/document/score) περνάει από εκεί πριν οποιοδήποτε read/write.
 */

/**
 * requirePmAccess: αποδέχεται όποιον έχει `pm.work` (ανάθεση δουλειάς) Ή
 * `pm.manage` (πλήρης πρόσβαση PM — βλ. visibleApplicationWhere: pm.manage
 * βλέπει τα πάντα, ενώ pm.work μόνο τα δικά του assigned). Το requirePermission
 * ελέγχει ΕΝΑ permission και πετάει αν λείπει· εδώ δοκιμάζουμε πρώτα το
 * `pm.work` (η κοινή περίπτωση — ο εργαζόμενος βλέπει τις αναθέσεις του) και
 * μόνο αν αποτύχει δοκιμάζουμε `pm.manage` (ο super/admin manager). Αν και τα
 * δύο αποτύχουν, πετάμε το ΑΡΧΙΚΟ σφάλμα (pm.work) — απλούστερο από να
 * φτιάξουμε ξεχωριστό `can()`/`auth()` μονοπάτι, και αρκετό αφού το
 * `requirePermission` ήδη κάνει throw με σαφές μήνυμα.
 */
async function requirePmAccess(): Promise<Session> {
  try {
    return await requirePermission('pm.work')
  } catch (err) {
    try {
      return await requirePermission('pm.manage')
    } catch {
      throw err
    }
  }
}

async function requireVisibleApplication(applicationId: string) {
  const session = await requirePmAccess()
  const app = await prisma.programApplication.findFirst({
    where: { id: applicationId, ...visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) },
  })
  if (!app) notFound()
  return { session, app }
}

function parseDateOrNull(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export type ApplicationDetail = {
  id: string
  trdrId: string
  trdrName: string
  programId: string
  programTitle: string
  stage: StageStr
  managerId: string | null
  managerName: string | null
  processorId: string | null
  processorName: string | null
  assessmentScore: number | null
  assessmentMaxScore: number | null
  assessmentVerdict: VerdictStr
  opskeStatus: string | null
  opskeRef: string | null
  opskeSubmittedAt: string | null
  canManage: boolean
}

export async function getApplication(applicationId: string): Promise<ApplicationDetail> {
  const { session } = await requireVisibleApplication(applicationId)
  const app = await prisma.programApplication.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      trdr: { select: { NAME: true } },
      program: { select: { title: true } },
      manager: { select: { name: true } },
      processor: { select: { name: true } },
    },
  })
  return {
    id: app.id,
    trdrId: app.trdrId,
    trdrName: app.trdr.NAME,
    programId: app.programId,
    programTitle: app.program.title,
    stage: app.stage as StageStr,
    managerId: app.managerId,
    managerName: app.manager?.name ?? null,
    processorId: app.processorId,
    processorName: app.processor?.name ?? null,
    assessmentScore: app.assessmentScore,
    assessmentMaxScore: app.assessmentMaxScore,
    assessmentVerdict: app.assessmentVerdict as VerdictStr,
    opskeStatus: app.opskeStatus,
    opskeRef: app.opskeRef,
    opskeSubmittedAt: app.opskeSubmittedAt ? app.opskeSubmittedAt.toISOString() : null,
    canManage: (session.user.permissions ?? []).includes('pm.manage'),
  }
}

export type VisibleApplicationItem = {
  id: string
  programId: string
  trdrName: string
  programTitle: string
  stage: StageStr
  assessmentVerdict: VerdictStr
  managerName: string | null
}

export async function listVisibleApplications(): Promise<VisibleApplicationItem[]> {
  const session = await requirePmAccess()
  const rows = await prisma.programApplication.findMany({
    where: visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }),
    include: {
      trdr: { select: { NAME: true } },
      program: { select: { title: true } },
      manager: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(r => ({
    id: r.id,
    programId: r.programId,
    trdrName: r.trdr.NAME,
    programTitle: r.program.title,
    stage: r.stage as StageStr,
    assessmentVerdict: r.assessmentVerdict as VerdictStr,
    managerName: r.manager?.name ?? null,
  }))
}

export type TrdrApplicationItem = {
  id: string
  programId: string
  programTitle: string
  stage: StageStr
  assessmentVerdict: VerdictStr
  managerName: string | null
}

/** Οι αιτήσεις προγραμμάτων ενός συγκεκριμένου συναλλασσόμενου, ΟΡΑΤΕΣ στον
 * τρέχοντα χρήστη — για το panel «Έργα» στην καρτέλα του /partners/[id]
 * (Task 13). Ίδιο scoping idiom με listVisibleApplications, απλά φιλτραρισμένο
 * επιπλέον σε trdrId. */
export async function listTrdrApplications(trdrId: string): Promise<TrdrApplicationItem[]> {
  const session = await requirePmAccess()
  const rows = await prisma.programApplication.findMany({
    where: { trdrId, ...visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) },
    include: {
      program: { select: { title: true } },
      manager: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(r => ({
    id: r.id,
    programId: r.programId,
    programTitle: r.program.title,
    stage: r.stage as StageStr,
    assessmentVerdict: r.assessmentVerdict as VerdictStr,
    managerName: r.manager?.name ?? null,
  }))
}

/**
 * Ανάθεση διαχειριστή/εισηγητή — gated ρητά στο `pm.manage` (όχι
 * requireVisibleApplication): μόνο ο pm.manage χρήστης αναθέτει, και το
 * visibleApplicationWhere({permissions:['pm.manage']}) === {} ήδη σημαίνει
 * ότι αυτός ο χρήστης βλέπει ΟΛΕΣ τις αιτήσεις — άρα δεν υπάρχει scoping
 * bypass να προστατευτεί εδώ πέρα από το ίδιο το permission gate.
 */
export async function assignApplication(
  applicationId: string,
  input: { managerId?: string | null; processorId?: string | null },
): Promise<void> {
  await requirePermission('pm.manage')
  await prisma.programApplication.update({
    where: { id: applicationId },
    data: {
      ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
      ...(input.processorId !== undefined ? { processorId: input.processorId } : {}),
    },
  })
  revalidatePath(`/pm/applications/${applicationId}`)
}

export type InternalUserOption = { id: string; name: string; email: string }

export async function listInternalUsers(): Promise<InternalUserOption[]> {
  await requirePermission('pm.manage')
  const rows = await prisma.user.findMany({
    where: { role: { name: { notIn: ['CUSTOMER', 'SUPPLIER', 'ARCHITECT'] } } },
    include: { role: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => ({ id: r.id, name: r.name, email: r.email }))
}

/**
 * Δημιουργεί υποχρεώσεις (από απαιτούμενα έντυπα + παραδοτέα) και γραμμές
 * βαθμολόγησης (από κριτήρια) του Program πάνω στη συγκεκριμένη αίτηση.
 * ΙΔΕΜΠΟΤΕΝΤ: τρέχει ξανά και ξανά χωρίς διπλότυπα — ελέγχει τι ήδη υπάρχει
 * (obligations με sourceId, criterionScores με criterionId — το τελευταίο
 * προστατεύεται επιπλέον από το @@unique([applicationId, criterionId]) στο
 * schema) και δημιουργεί ΜΟΝΟ τις γραμμές που λείπουν.
 */
function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export async function generateObligations(applicationId: string): Promise<{ addedObligations: number; addedScores: number; addedTasks: number }> {
  const { app } = await requireVisibleApplication(applicationId)
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: app.programId },
    include: { criteria: true, deliverables: true, requiredForms: true, taskTemplates: { where: { active: true } } },
  })

  const obligationRows = buildObligationRows({
    requiredForms: program.requiredForms.map(f => ({ id: f.id, name: f.name, mandatory: f.mandatory })),
    deliverables: program.deliverables.map(d => ({ id: d.id, name: d.name, mandatory: d.mandatory })),
  })
  const scoreRows = buildCriterionScoreRows(
    program.criteria.map(c => ({ id: c.id, name: c.name, weight: c.weight != null ? Number(c.weight) : null })),
  )

  const existingObligations = await prisma.applicationObligation.findMany({
    where: { applicationId, sourceId: { not: null } },
    select: { sourceId: true },
  })
  const existingSourceIds = new Set(existingObligations.map(o => o.sourceId))
  const newObligations = obligationRows.filter(r => !existingSourceIds.has(r.sourceId))

  const taskRows = buildTaskObligationRows(
    program.taskTemplates.map(t => ({
      id: t.id,
      stage: t.stage as StageStr,
      title: t.title,
      assignTo: t.assignTo as TaskAssignToStr,
      mandatory: t.mandatory,
      dueOffsetDays: t.dueOffsetDays,
      order: t.order,
    })),
  )
  const newTasks = taskRows.filter(r => !existingSourceIds.has(r.sourceId))

  const existingScores = await prisma.applicationCriterionScore.findMany({
    where: { applicationId, criterionId: { not: null } },
    select: { criterionId: true },
  })
  const existingCriterionIds = new Set(existingScores.map(s => s.criterionId))
  const newScores = scoreRows.filter(r => !existingCriterionIds.has(r.criterionId))

  if (newObligations.length > 0) {
    await prisma.applicationObligation.createMany({
      data: newObligations.map(r => ({
        applicationId,
        stage: r.stage,
        kind: r.kind,
        sourceId: r.sourceId,
        name: r.name,
        mandatory: r.mandatory,
        order: r.order,
      })),
    })
  }
  if (newScores.length > 0) {
    await prisma.applicationCriterionScore.createMany({
      data: newScores.map(r => ({
        applicationId,
        criterionId: r.criterionId,
        name: r.name,
        weight: r.weight,
        maxScore: r.maxScore,
        order: r.order,
      })),
    })
  }
  if (newTasks.length > 0) {
    await prisma.applicationObligation.createMany({
      data: newTasks.map(r => ({
        applicationId,
        stage: r.stage,
        kind: 'TASK' as const,
        sourceId: r.sourceId,
        templateId: r.templateId,
        name: r.name,
        mandatory: r.mandatory,
        order: r.order,
        assigneeId: r.assigneeSlot === 'MANAGER' ? (app.managerId ?? null) : (app.processorId ?? null),
        dueDate: r.dueOffsetDays != null ? addDays(app.createdAt, r.dueOffsetDays) : null,
      })),
    })
  }

  revalidatePath(`/pm/applications/${applicationId}`)
  return { addedObligations: newObligations.length, addedScores: newScores.length, addedTasks: newTasks.length }
}

export type CriterionScoreItem = {
  id: string
  name: string
  weight: number
  score: number | null
  maxScore: number
  note: string | null
  order: number
}

export async function listCriterionScores(applicationId: string): Promise<CriterionScoreItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.applicationCriterionScore.findMany({
    where: { applicationId },
    orderBy: { order: 'asc' },
  })
  return rows.map(r => ({ id: r.id, name: r.name, weight: r.weight, score: r.score, maxScore: r.maxScore, note: r.note, order: r.order }))
}

export async function saveCriterionScore(scoreId: string, input: { score?: number | null; note?: string | null }): Promise<void> {
  const row = await prisma.applicationCriterionScore.findUniqueOrThrow({ where: { id: scoreId }, select: { applicationId: true } })
  await requireVisibleApplication(row.applicationId)
  await prisma.applicationCriterionScore.update({
    where: { id: scoreId },
    data: {
      ...(input.score !== undefined ? { score: input.score } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  })
  revalidatePath(`/pm/applications/${row.applicationId}`)
}

export async function recomputeAssessment(applicationId: string): Promise<{ pct: number }> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.applicationCriterionScore.findMany({
    where: { applicationId },
    select: { weight: true, score: true, maxScore: true },
  })
  const { achieved, max, pct } = computeAssessmentScore(rows)
  await prisma.programApplication.update({
    where: { id: applicationId },
    data: { assessmentScore: achieved, assessmentMaxScore: max },
  })
  revalidatePath(`/pm/applications/${applicationId}`)
  return { pct }
}

export async function setAssessmentVerdict(applicationId: string, verdict: VerdictStr): Promise<void> {
  await requireVisibleApplication(applicationId)
  await prisma.programApplication.update({ where: { id: applicationId }, data: { assessmentVerdict: verdict } })
  revalidatePath(`/pm/applications/${applicationId}`)
}

/* ═══════════════════════════════════════════════════════════════════════
 * Task 7 — obligations CRUD + documents + στάδιο + ΟΠΣΚΕ
 * ═══════════════════════════════════════════════════════════════════════ */

export type ObligationItem = {
  id: string
  stage: StageStr
  kind: ObligationKindStr
  name: string
  mandatory: boolean
  status: ObligationStatusStr
  dueDate: string | null
  assigneeId: string | null
  assigneeName: string | null
  notes: string | null
  order: number
  templateId: string | null
}

export async function listObligations(applicationId: string): Promise<ObligationItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.applicationObligation.findMany({
    where: { applicationId },
    include: { assignee: { select: { name: true } } },
  })
  return rows
    .map(r => ({
      id: r.id,
      stage: r.stage as StageStr,
      kind: r.kind as ObligationKindStr,
      name: r.name,
      mandatory: r.mandatory,
      status: r.status as ObligationStatusStr,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      assigneeId: r.assigneeId,
      assigneeName: r.assignee?.name ?? null,
      notes: r.notes,
      order: r.order,
      templateId: r.templateId,
    }))
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.order - b.order)
}

export async function addObligation(
  applicationId: string,
  input: { stage: StageStr; name: string; mandatory?: boolean; kind?: ObligationKindStr },
): Promise<{ id: string }> {
  await requireVisibleApplication(applicationId)
  const count = await prisma.applicationObligation.count({ where: { applicationId, stage: input.stage } })
  const row = await prisma.applicationObligation.create({
    data: {
      applicationId,
      stage: input.stage,
      kind: input.kind ?? 'CUSTOM',
      name: input.name.trim(),
      mandatory: input.mandatory ?? true,
      status: 'PENDING',
      order: count,
    },
  })
  revalidatePath(`/pm/applications/${applicationId}`)
  return { id: row.id }
}

export async function updateObligation(
  id: string,
  input: { status?: ObligationStatusStr; dueDate?: string | null; assigneeId?: string | null; notes?: string | null },
): Promise<void> {
  const row = await prisma.applicationObligation.findUniqueOrThrow({ where: { id }, select: { applicationId: true } })
  await requireVisibleApplication(row.applicationId)
  await prisma.applicationObligation.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.dueDate !== undefined ? { dueDate: parseDateOrNull(input.dueDate) } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  })
  revalidatePath(`/pm/applications/${row.applicationId}`)
}

export async function removeObligation(id: string): Promise<void> {
  const row = await prisma.applicationObligation.findUniqueOrThrow({ where: { id }, select: { applicationId: true } })
  await requireVisibleApplication(row.applicationId)
  await prisma.applicationObligation.delete({ where: { id } })
  revalidatePath(`/pm/applications/${row.applicationId}`)
}

export async function waiveObligation(id: string): Promise<void> {
  const row = await prisma.applicationObligation.findUniqueOrThrow({ where: { id }, select: { applicationId: true } })
  await requireVisibleApplication(row.applicationId)
  await prisma.applicationObligation.update({ where: { id }, data: { status: 'WAIVED' } })
  revalidatePath(`/pm/applications/${row.applicationId}`)
}

export async function uploadApplicationDocument(
  applicationId: string,
  obligationId: string | null,
  input: { name: string; base64: string; mimeType: string; ext: string },
): Promise<{ id: string }> {
  const { session } = await requireVisibleApplication(applicationId)
  const id = crypto.randomUUID()
  const key = applicationDocKey(applicationId, id, input.ext)
  const body = Buffer.from(input.base64, 'base64')
  await bunnyUploadPrivate({ key, body, contentType: input.mimeType })
  await prisma.applicationDocument.create({
    data: {
      id,
      applicationId,
      obligationId: obligationId ?? null,
      name: input.name.trim(),
      storageKey: key,
      mimeType: input.mimeType,
      size: Buffer.byteLength(body),
      uploadedById: session.user.id,
    },
  })
  revalidatePath(`/pm/applications/${applicationId}`)
  return { id }
}

export type ApplicationDocumentItem = {
  id: string
  obligationId: string | null
  name: string
  mimeType: string | null
  size: number | null
  uploadedAt: string
}

export async function listApplicationDocuments(applicationId: string, obligationId?: string): Promise<ApplicationDocumentItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.applicationDocument.findMany({
    where: { applicationId, ...(obligationId !== undefined ? { obligationId } : {}) },
    orderBy: { uploadedAt: 'desc' },
  })
  return rows.map(r => ({
    id: r.id,
    obligationId: r.obligationId,
    name: r.name,
    mimeType: r.mimeType,
    size: r.size,
    uploadedAt: r.uploadedAt.toISOString(),
  }))
}

/** Αφαιρεί μόνο τη γραμμή DB — v1 δεν διαγράφει το αντικείμενο από το
 * BunnyCDN (bunnyDeleteOne θα μπορούσε να προστεθεί αργότερα αν χρειαστεί
 * σκληρό cleanup· προς το παρόν το ορφανό blob είναι αποδεκτό κόστος). */
export async function removeApplicationDocument(id: string): Promise<void> {
  const row = await prisma.applicationDocument.findUniqueOrThrow({ where: { id }, select: { applicationId: true } })
  await requireVisibleApplication(row.applicationId)
  await prisma.applicationDocument.delete({ where: { id } })
  revalidatePath(`/pm/applications/${row.applicationId}`)
}

/** Αλλάζει στάδιο αίτησης· πριν αλλάξει μετράει πόσες mandatory υποχρεώσεις
 * του ΤΡΕΧΟΝΤΟΣ σταδίου είναι ακόμα PENDING — καθαρά ενημερωτικό (δεν μπλοκάρει
 * τη μετάβαση), το UI αποφασίζει αν θα προειδοποιήσει τον χρήστη. */
export async function setApplicationStage(applicationId: string, stage: StageStr): Promise<{ pendingMandatory: number }> {
  const { app } = await requireVisibleApplication(applicationId)
  const pendingMandatory = await prisma.applicationObligation.count({
    where: { applicationId, stage: app.stage, mandatory: true, status: 'PENDING' },
  })
  await prisma.programApplication.update({ where: { id: applicationId }, data: { stage } })
  revalidatePath(`/pm/applications/${applicationId}`)
  return { pendingMandatory }
}

export async function updateOpske(
  applicationId: string,
  input: { opskeStatus?: string | null; opskeRef?: string | null; opskeSubmittedAt?: string | null },
): Promise<void> {
  await requireVisibleApplication(applicationId)
  await prisma.programApplication.update({
    where: { id: applicationId },
    data: {
      ...(input.opskeStatus !== undefined ? { opskeStatus: input.opskeStatus } : {}),
      ...(input.opskeRef !== undefined ? { opskeRef: input.opskeRef } : {}),
      ...(input.opskeSubmittedAt !== undefined ? { opskeSubmittedAt: parseDateOrNull(input.opskeSubmittedAt) } : {}),
    },
  })
  revalidatePath(`/pm/applications/${applicationId}`)
}

export type ExpenseCategoryOption = { id: string; name: string }

/** id+name λίστα των κατηγοριών δαπανών του ΠΡΟΓΡΑΜΜΑΤΟΣ μιας αίτησης — pm-scoped
 * mirror του getProgramExpenseCategories (src/lib/programs/actions.ts), που είναι
 * κλειδωμένο πίσω από programs.manage και άρα αχρησιμοποίητο από pm.work
 * (assigned MANAGER/EMPLOYEE) χρήστες. Το ExpensesTab (src/components/pm/
 * expenses-tab.tsx) περνάει applicationId αντί για programId ακριβώς για να
 * περάσει από requireVisibleApplication — ο χρήστης φορτώνει τις κατηγορίες
 * ΜΟΝΟ του δικού του ορατού προγράμματος, ποτέ ενός αυθαίρετου programId. */
export async function listApplicationExpenseCategories(applicationId: string): Promise<ExpenseCategoryOption[]> {
  const { app } = await requireVisibleApplication(applicationId)
  const rows = await prisma.programExpenseCategory.findMany({
    where: { programId: app.programId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true },
  })
  return rows
}

/**
 * C2a.2 (Task 3) — live ανάγνωση συμμόρφωσης προϋπολογισμού για μια αίτηση.
 * Τραβάει μόνο τις ACTIVE δαπάνες (οι REPLACED αγνοούνται — έχουν ήδη
 * αντικατασταθεί) + τις κατηγορίες δαπανών του προγράμματος, μετατρέπει
 * Decimal→Number ΕΔΩ (πριν το pure engine) και περνάει στο
 * checkBudgetCompliance (src/lib/pm/budget-compliance.ts).
 */
export async function getBudgetCompliance(applicationId: string) {
  const { app } = await requireVisibleApplication(applicationId)
  const [expenses, program] = await Promise.all([
    prisma.programExpense.findMany({
      where: { applicationId, status: 'ACTIVE' },
      select: { amount: true, categoryId: true, confirmed: true },
    }),
    prisma.program.findUniqueOrThrow({
      where: { id: app.programId },
      select: { totalBudget: true, expenseCats: { orderBy: { order: 'asc' } } },
    }),
  ])
  const active: ComplianceExpense[] = expenses.map(e => ({
    amount: Number(e.amount),
    categoryId: e.categoryId,
    confirmed: e.confirmed,
  }))
  const categories = program.expenseCats.map(c => ({
    id: c.id,
    name: c.name,
    minAmount: c.minAmount != null ? Number(c.minAmount) : null,
    maxAmount: c.maxAmount != null ? Number(c.maxAmount) : null,
    minPercentage: c.minPercentage != null ? Number(c.minPercentage) : null,
    maxPercentage: c.maxPercentage != null ? Number(c.maxPercentage) : null,
    mandatory: c.mandatory,
  }))
  return checkBudgetCompliance(active, categories, program.totalBudget != null ? Number(program.totalBudget) : null)
}

/**
 * C2a.2 (Task 3) — αντικατάσταση δαπάνης: η παλιά μαρκάρεται REPLACED (ποτέ
 * delete — διατηρεί ιστορικό/lineage για certification/audit), η νέα
 * δημιουργείται ACTIVE με replacesExpenseId→παλιά. Και τα δύο βήματα μέσα
 * σε $transaction ώστε να μη μείνει η αίτηση με δύο ACTIVE ή καμία.
 * Φορτώνει πρώτα την παλιά δαπάνη (χρειάζεται το applicationId της για το
 * visibility gate) και ΜΕΤΑ περνάει από requireVisibleApplication — καμία
 * write χωρίς να έχει επιβεβαιωθεί ότι ο χρήστης βλέπει αυτή την αίτηση.
 */
export async function replaceExpense(
  oldExpenseId: string,
  input: {
    description: string
    amount: number
    vatAmount?: number | null
    date?: string | null
    vendor?: string | null
    docNumber?: string | null
  },
): Promise<{ id: string }> {
  const old = await prisma.programExpense.findUniqueOrThrow({
    where: { id: oldExpenseId },
    select: { applicationId: true, status: true },
  })
  await requireVisibleApplication(old.applicationId)
  if (old.status === 'REPLACED') throw new Error('Η δαπάνη έχει ήδη αντικατασταθεί.')

  const created = await prisma.$transaction(async tx => {
    const neo = await tx.programExpense.create({
      data: {
        applicationId: old.applicationId,
        description: input.description.trim(),
        amount: input.amount,
        vatAmount: input.vatAmount ?? null,
        date: input.date ? new Date(input.date) : null,
        vendor: input.vendor ?? null,
        docNumber: input.docNumber ?? null,
        status: 'ACTIVE',
        replacesExpenseId: oldExpenseId,
      },
    })
    await tx.programExpense.update({ where: { id: oldExpenseId }, data: { status: 'REPLACED' } })
    return neo
  })

  try {
    const { suggestExpenseCategory } = await import('@/lib/programs/actions')
    await suggestExpenseCategory(created.id)
  } catch (err) {
    console.error('[replaceExpense] suggest failed', err)
  }

  revalidatePath(`/pm/applications/${old.applicationId}`)
  return { id: created.id }
}

/**
 * C2e — admin-authored ανά-πρόγραμμα/ανά-στάδιο πρότυπα εργασιών
 * (ProgramTaskTemplate). PROGRAM-GLOBAL config, όχι application-scoped — άρα
 * κλειδωμένα πίσω από `programs.manage` (ίδιο idiom με τα actions του
 * src/lib/programs/actions.ts), ΟΧΙ πίσω από requirePmAccess/requireVisibleApplication.
 * Η υλοποίηση των προτύπων σε συγκεκριμένες αιτήσεις (materialize σε
 * ApplicationObligation) είναι επόμενο task — εκτός scope εδώ.
 */

export type TaskTemplateItem = {
  id: string
  stage: StageStr
  title: string
  description: string | null
  assignTo: TaskAssignToStr
  mandatory: boolean
  dueOffsetDays: number | null
  order: number
  active: boolean
}

export async function listProgramTaskTemplates(programId: string): Promise<TaskTemplateItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programTaskTemplate.findMany({
    where: { programId },
    orderBy: [{ stage: 'asc' }, { order: 'asc' }],
  })
  return rows.map(r => ({
    id: r.id, stage: r.stage as StageStr, title: r.title, description: r.description,
    assignTo: r.assignTo as TaskAssignToStr, mandatory: r.mandatory, dueOffsetDays: r.dueOffsetDays,
    order: r.order, active: r.active,
  }))
}

export async function createProgramTaskTemplate(input: {
  programId: string; stage: StageStr; title: string; description?: string | null
  assignTo: TaskAssignToStr; mandatory: boolean; dueOffsetDays: number | null
}): Promise<{ id: string }> {
  const session = await requirePermission('programs.manage')
  const title = input.title.trim()
  if (!title) throw new Error('Ο τίτλος του βήματος είναι υποχρεωτικός.')
  const max = await prisma.programTaskTemplate.aggregate({
    where: { programId: input.programId, stage: input.stage }, _max: { order: true },
  })
  const t = await prisma.programTaskTemplate.create({
    data: {
      programId: input.programId, stage: input.stage, title, description: input.description?.trim() || null,
      assignTo: input.assignTo, mandatory: input.mandatory, dueOffsetDays: input.dueOffsetDays,
      order: (max._max.order ?? -1) + 1, createdById: session.user.id,
    },
  })
  revalidatePath(`/programs/${input.programId}`)
  return { id: t.id }
}

export async function updateProgramTaskTemplate(id: string, patch: {
  title?: string; description?: string | null; assignTo?: TaskAssignToStr
  mandatory?: boolean; dueOffsetDays?: number | null; active?: boolean
}): Promise<void> {
  await requirePermission('programs.manage')
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) { const t = patch.title.trim(); if (!t) throw new Error('Ο τίτλος του βήματος είναι υποχρεωτικός.'); data.title = t }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null
  if (patch.assignTo !== undefined) data.assignTo = patch.assignTo
  if (patch.mandatory !== undefined) data.mandatory = patch.mandatory
  if (patch.dueOffsetDays !== undefined) data.dueOffsetDays = patch.dueOffsetDays
  if (patch.active !== undefined) data.active = patch.active
  const t = await prisma.programTaskTemplate.update({ where: { id }, data })
  revalidatePath(`/programs/${t.programId}`)
}

export async function deleteProgramTaskTemplate(id: string): Promise<void> {
  await requirePermission('programs.manage')
  const t = await prisma.programTaskTemplate.delete({ where: { id } })
  revalidatePath(`/programs/${t.programId}`)
}

export async function reorderProgramTaskTemplates(programId: string, stage: StageStr, orderedIds: string[]): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.programTaskTemplate.updateMany({ where: { id, programId, stage }, data: { order: i } }),
    ),
  )
  revalidatePath(`/programs/${programId}`)
}

/**
 * C2a.2 (Task 5) — φυσική πιστοποίηση παγίων ανά δαπάνη (ProgramExpenseCertification,
 * 1:1 με ProgramExpense). requireVisibleExpense φορτώνει μόνο applicationId από τη
 * δαπάνη και ΜΕΤΑ περνάει από requireVisibleApplication — ίδιο idiom με
 * removeObligation/waiveObligation παραπάνω: καμία εγγραφή δεν διαβάζεται πριν
 * επιβεβαιωθεί η ορατότητα της γονικής αίτησης.
 */
async function requireVisibleExpense(expenseId: string) {
  const exp = await prisma.programExpense.findUniqueOrThrow({ where: { id: expenseId }, select: { id: true, applicationId: true } })
  const { session } = await requireVisibleApplication(exp.applicationId)
  return { session, expense: exp }
}

export type CertificationItem = {
  expenseId: string
  expenseDescription: string
  amount: number
  serialNumber: string | null
  location: string | null
  assetRegistryRef: string | null
  assetRegistryDate: string | null
  photoKey: string | null
  bankStatementKey: string | null
  newUnusedCertKey: string | null
  paid: boolean
  verified: boolean
  complete: boolean
}

export async function listCertifications(applicationId: string): Promise<CertificationItem[]> {
  await requireVisibleApplication(applicationId)
  const expenses = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: { id: true, description: true, amount: true, certification: true },
    orderBy: { createdAt: 'asc' },
  })
  return expenses.map((e) => {
    const c = e.certification
    const state = {
      serialNumber: c?.serialNumber ?? null,
      location: c?.location ?? null,
      assetRegistryRef: c?.assetRegistryRef ?? null,
      photoKey: c?.photoKey ?? null,
      bankStatementKey: c?.bankStatementKey ?? null,
      newUnusedCertKey: c?.newUnusedCertKey ?? null,
      paid: c?.paid ?? false,
    }
    return {
      expenseId: e.id,
      expenseDescription: e.description,
      amount: Number(e.amount),
      serialNumber: state.serialNumber,
      location: state.location,
      assetRegistryRef: state.assetRegistryRef,
      assetRegistryDate: c?.assetRegistryDate ? c.assetRegistryDate.toISOString() : null,
      photoKey: state.photoKey,
      bankStatementKey: state.bankStatementKey,
      newUnusedCertKey: state.newUnusedCertKey,
      paid: state.paid,
      verified: c?.verified ?? false,
      complete: certificationComplete(state),
    }
  })
}

export async function upsertCertification(
  expenseId: string,
  patch: {
    serialNumber?: string | null
    location?: string | null
    assetRegistryRef?: string | null
    assetRegistryDate?: string | null
    paid?: boolean
    verified?: boolean
    notes?: string | null
  },
): Promise<void> {
  const { session, expense } = await requireVisibleExpense(expenseId)
  const data: Record<string, unknown> = {}
  if (patch.serialNumber !== undefined) data.serialNumber = patch.serialNumber?.trim() || null
  if (patch.location !== undefined) data.location = patch.location?.trim() || null
  if (patch.assetRegistryRef !== undefined) data.assetRegistryRef = patch.assetRegistryRef?.trim() || null
  if (patch.assetRegistryDate !== undefined) data.assetRegistryDate = patch.assetRegistryDate ? new Date(patch.assetRegistryDate) : null
  if (patch.paid !== undefined) data.paid = patch.paid
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null
  if (patch.verified !== undefined) {
    data.verified = patch.verified
    data.verifiedById = patch.verified ? session.user.id : null
  }
  await prisma.programExpenseCertification.upsert({
    where: { expenseId },
    create: { expenseId, ...data },
    update: data,
  })
  revalidatePath(`/pm/applications/${expense.applicationId}`)
}

export async function uploadCertificationFile(
  expenseId: string,
  kind: CertFileKind,
  file: { base64: string; mimeType: string; ext: string },
): Promise<void> {
  const { expense } = await requireVisibleExpense(expenseId)
  if (!CERT_FILE_KINDS.includes(kind)) throw new Error('Άγνωστος τύπος αρχείου.')
  const key = certFileKey(expense.applicationId, expenseId, kind, file.ext.replace(/[^a-z0-9]/gi, '') || 'bin')
  const body = Buffer.from(file.base64, 'base64')
  await bunnyUploadPrivate({ key, body, contentType: file.mimeType })
  const field = certKeyField(kind)
  await prisma.programExpenseCertification.upsert({
    where: { expenseId },
    create: { expenseId, [field]: key },
    update: { [field]: key },
  })
  revalidatePath(`/pm/applications/${expense.applicationId}`)
}

export async function certificationDownloadKey(expenseId: string, kind: CertFileKind): Promise<string | null> {
  await requireVisibleExpense(expenseId)
  const c = await prisma.programExpenseCertification.findUnique({
    where: { expenseId },
    select: { photoKey: true, bankStatementKey: true, newUnusedCertKey: true },
  })
  if (!c) return null
  const map: Record<CertFileKind, string | null> = { photo: c.photoKey, bankStatement: c.bankStatementKey, newUnusedCert: c.newUnusedCertKey }
  return map[kind]
}
