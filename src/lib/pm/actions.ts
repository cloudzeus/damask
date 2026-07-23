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
import { certificationScalarsComplete, certFileKey, certKeyField, CERT_FILE_KINDS, type CertFileKind } from '@/lib/pm/cert-prep'
import { expenseEligibleForPayment, paymentRequestTotal, canTransition, type PaymentStatusStr } from '@/lib/pm/payment'
import { newToken } from '@/lib/pm/portal-token'
import { sendMail, isMailerConfigured, escapeHtml } from '@/lib/mailer'
import { buildAutoDependencyPairs, OPTIONAL_PHASES, taskBlocked, taskCanClose, hasCycle, verifiedFromTasks, type DagTask, type DependencyPair, type DeliverablePhaseStr, type DeliverableScopeStr, type DeliverableStatusStr } from '@/lib/pm/deliverable-phases'

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
    select: {
      applicationId: true,
      status: true,
      paymentRequestId: true,
      paymentRequest: { select: { status: true } },
    },
  })
  await requireVisibleApplication(old.applicationId)
  if (old.status === 'REPLACED') throw new Error('Η δαπάνη έχει ήδη αντικατασταθεί.')
  if (old.paymentRequestId && old.paymentRequest?.status !== 'DRAFT') {
    throw new Error('Η δαπάνη ανήκει σε υποβληθείσα δόση — δεν αντικαθίσταται.')
  }

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
    await tx.programExpense.update({
      where: { id: oldExpenseId },
      data: { status: 'REPLACED', paymentRequestId: null },
    })
    return neo
  })

  try {
    const { suggestExpenseCategory } = await import('@/lib/programs/actions')
    await suggestExpenseCategory(created.id)
  } catch (err) {
    console.error('[replaceExpense] suggest failed', err)
  }

  // C2g (Task 4): re-materialize deliverable groups for the replacement
  // expense (same module — direct call, no dynamic import needed). Non-fatal.
  try {
    await generateExpenseDeliverables(old.applicationId)
  } catch (err) {
    console.error('[replaceExpense] deliverable generation failed', err)
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
  notes: string | null
}

export async function listCertifications(applicationId: string): Promise<CertificationItem[]> {
  await requireVisibleApplication(applicationId)
  const expenses = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: { id: true, description: true, amount: true, certification: true },
    orderBy: { createdAt: 'asc' },
  })

  // Batch-load cert-phase tasks for ALL expenses in one query (C2g: verifiedFromTasks input),
  // grouped by expenseId — avoids an N+1 findMany per expense row.
  const expenseIds = expenses.map((e) => e.id)
  const taskRows = expenseIds.length > 0
    ? await prisma.expenseDeliverableTask.findMany({
        where: { deliverable: { expenseId: { in: expenseIds } }, phase: { in: ['PHASE_A_CERTIFICATION', 'FULL_CERTIFICATION'] } },
        select: { phase: true, mandatory: true, status: true, deliverable: { select: { expenseId: true } } },
      })
    : []
  const tasksByExpenseId = new Map<string, { phase: DeliverablePhaseStr; mandatory: boolean; status: DeliverableStatusStr }[]>()
  for (const t of taskRows) {
    const eid = t.deliverable.expenseId
    if (!eid) continue
    const list = tasksByExpenseId.get(eid) ?? []
    list.push({ phase: t.phase as DeliverablePhaseStr, mandatory: t.mandatory, status: t.status as DeliverableStatusStr })
    tasksByExpenseId.set(eid, list)
  }

  return expenses.map((e) => {
    const c = e.certification
    const scalars = {
      serialNumber: c?.serialNumber ?? null,
      location: c?.location ?? null,
      assetRegistryRef: c?.assetRegistryRef ?? null,
      paid: c?.paid ?? false,
    }
    const scalarsOk = certificationScalarsComplete(scalars)
    const tasksOk = verifiedFromTasks(tasksByExpenseId.get(e.id) ?? [])
    return {
      expenseId: e.id,
      expenseDescription: e.description,
      amount: Number(e.amount),
      serialNumber: scalars.serialNumber,
      location: scalars.location,
      assetRegistryRef: scalars.assetRegistryRef,
      assetRegistryDate: c?.assetRegistryDate ? c.assetRegistryDate.toISOString() : null,
      // Legacy file-key columns — no longer part of the completeness formula (superseded by
      // deliverable tasks), kept as-is so pre-C2g data still displays.
      photoKey: c?.photoKey ?? null,
      bankStatementKey: c?.bankStatementKey ?? null,
      newUnusedCertKey: c?.newUnusedCertKey ?? null,
      paid: scalars.paid,
      verified: c?.verified ?? false,
      complete: scalarsOk && tasksOk,
      notes: c?.notes ?? null,
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
  const existing = await prisma.programExpenseCertification.findUnique({ where: { expenseId } })
  const data: Record<string, unknown> = {}
  if (patch.serialNumber !== undefined) data.serialNumber = patch.serialNumber?.trim() || null
  if (patch.location !== undefined) data.location = patch.location?.trim() || null
  if (patch.assetRegistryRef !== undefined) data.assetRegistryRef = patch.assetRegistryRef?.trim() || null
  if (patch.assetRegistryDate !== undefined) data.assetRegistryDate = patch.assetRegistryDate ? new Date(patch.assetRegistryDate) : null
  if (patch.paid !== undefined) data.paid = patch.paid
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null

  /**
   * ΚΡΙΣΙΜΟ (spec §3ζ, C2g update): verified=true ΜΟΝΟ αν το merged cert
   * είναι complete. Το UI κλειδώνει το toggle αλλά ΔΕΝ αρκεί — ένα direct
   * server-action call (π.χ. από devtools) μπορεί να παρακάμψει το UI. Άρα
   * το invariant πρέπει να επιβάλλεται ΕΔΩ, σε ΚΑΘΕ write: χτίζουμε το
   * merged scalar state (existing row + αυτό το patch) και ελέγχουμε ΚΑΙ
   * τα deliverable tasks (C2g migration: photo/bankStatement/newUnusedCert
   * file keys μετακόμισαν σε ExpenseDeliverableTask/DeliverableFile — η
   * πληρότητα πλέον παράγεται από verifiedFromTasks πάνω στα
   * PHASE_A_CERTIFICATION+FULL_CERTIFICATION mandatory tasks, όχι από τα
   * (πλέον νεκρά) key πεδία). complete = scalarsOk && tasksOk, και
   * γράφουμε verified = desiredVerified && complete — ΠΑΝΤΑ, ανεξάρτητα αν
   * το patch αυτό αγγίζει καν το verified. Αυτό καλύπτει ΚΑΙ το «clear
   * ενός mandatory field σε ήδη verified cert»: αν το merged γίνει
   * incomplete, το verified ξαναγράφεται false αυτόματα.
   */
  const mergedScalars = {
    serialNumber: patch.serialNumber !== undefined ? (patch.serialNumber?.trim() || null) : (existing?.serialNumber ?? null),
    location: patch.location !== undefined ? (patch.location?.trim() || null) : (existing?.location ?? null),
    assetRegistryRef: patch.assetRegistryRef !== undefined ? (patch.assetRegistryRef?.trim() || null) : (existing?.assetRegistryRef ?? null),
    paid: patch.paid !== undefined ? patch.paid : (existing?.paid ?? false),
  }
  const scalarsOk = certificationScalarsComplete(mergedScalars)
  const taskRows = await prisma.expenseDeliverableTask.findMany({
    where: { deliverable: { expenseId }, phase: { in: ['PHASE_A_CERTIFICATION', 'FULL_CERTIFICATION'] } },
    select: { phase: true, mandatory: true, status: true },
  })
  const tasksOk = verifiedFromTasks(taskRows.map((t) => ({
    phase: t.phase as DeliverablePhaseStr,
    mandatory: t.mandatory,
    status: t.status as DeliverableStatusStr,
  })))
  const complete = scalarsOk && tasksOk
  const desiredVerified = patch.verified !== undefined ? patch.verified : (existing?.verified ?? false)
  const finalVerified = desiredVerified && complete
  data.verified = finalVerified
  data.verifiedById = finalVerified ? session.user.id : null

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

/**
 * C2f — δόσεις πληρωμής (PaymentRequest). requireVisibleRequest είναι το
 * αντίστοιχο του requireVisibleRequest/requireVisibleExpense για PaymentRequest:
 * φορτώνει τη γραμμή, μετά περνάει το applicationId της από
 * requireVisibleApplication (το ΜΟΝΑΔΙΚΟ σημείο ελέγχου ορατότητας) — ποτέ
 * δεν εμπιστευόμαστε το applicationId που στέλνει ο client.
 */
async function requireVisibleRequest(requestId: string) {
  const req = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: requestId }, select: { id: true, applicationId: true, status: true } })
  await requireVisibleApplication(req.applicationId)
  return req
}

export type PaymentRequestItem = {
  id: string; ordinal: number; title: string | null; status: PaymentStatusStr
  targetAmount: number | null; total: number; expenseCount: number
  submittedAt: string | null; approvedAt: string | null; paidAt: string | null; paidAmount: number | null
}

export async function listPaymentRequests(applicationId: string): Promise<PaymentRequestItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.paymentRequest.findMany({
    where: { applicationId }, orderBy: { ordinal: 'asc' },
    include: { expenses: { where: { status: 'ACTIVE' }, select: { amount: true } } },
  })
  return rows.map(r => ({
    id: r.id, ordinal: r.ordinal, title: r.title, status: r.status as PaymentStatusStr,
    targetAmount: r.targetAmount != null ? Number(r.targetAmount) : null,
    total: paymentRequestTotal(r.expenses.map(e => Number(e.amount))),
    expenseCount: r.expenses.length,
    submittedAt: r.submittedAt?.toISOString() ?? null, approvedAt: r.approvedAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null, paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
  }))
}

export async function createPaymentRequest(applicationId: string, input: { title?: string | null; targetAmount?: number | null }): Promise<{ id: string }> {
  const { session } = await requireVisibleApplication(applicationId)
  const max = await prisma.paymentRequest.aggregate({ where: { applicationId }, _max: { ordinal: true } })
  const r = await prisma.paymentRequest.create({
    data: { applicationId, ordinal: (max._max.ordinal ?? 0) + 1, title: input.title?.trim() || null, targetAmount: input.targetAmount ?? null, createdById: session.user.id },
  })
  revalidatePath(`/pm/applications/${applicationId}`)
  return { id: r.id }
}

export async function updatePaymentRequest(id: string, patch: { title?: string | null; targetAmount?: number | null; notes?: string | null }): Promise<void> {
  const req = await requireVisibleRequest(id)
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) data.title = patch.title?.trim() || null
  if (patch.targetAmount !== undefined) data.targetAmount = patch.targetAmount
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null
  await prisma.paymentRequest.update({ where: { id }, data })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function deletePaymentRequest(id: string): Promise<void> {
  const req = await requireVisibleRequest(id)
  if (req.status !== 'DRAFT') throw new Error('Μόνο πρόχειρες δόσεις διαγράφονται.')
  await prisma.paymentRequest.delete({ where: { id } })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function setPaymentRequestStatus(id: string, to: PaymentStatusStr, opts?: { paidAmount?: number | null }): Promise<void> {
  const req = await prisma.paymentRequest.findUniqueOrThrow({ where: { id }, select: { applicationId: true, status: true, _count: { select: { expenses: true } } } })
  await requireVisibleApplication(req.applicationId)
  const from = req.status as PaymentStatusStr
  if (!canTransition(from, to)) throw new Error('Μη έγκυρη μετάβαση κατάστασης.')
  if (to === 'SUBMITTED' && req._count.expenses === 0) throw new Error('Η δόση δεν έχει δαπάνες.')
  const data: Record<string, unknown> = { status: to }
  if (to === 'SUBMITTED') data.submittedAt = new Date()
  if (to === 'APPROVED') data.approvedAt = new Date()
  if (to === 'PAID') {
    data.paidAt = new Date()
    if (opts?.paidAmount != null) data.paidAmount = opts.paidAmount
    else { const sum = await prisma.programExpense.aggregate({ where: { paymentRequestId: id }, _sum: { amount: true } }); data.paidAmount = sum._sum.amount != null ? Number(sum._sum.amount) : 0 }
  }
  if (to === 'DRAFT') { data.submittedAt = null; data.approvedAt = null }
  await prisma.paymentRequest.update({ where: { id }, data })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export type PaymentEligibleExpenseItem = { id: string; description: string; amount: number; eligible: boolean; reason: string | null; inThisRequest: boolean }

export async function listPaymentEligibleExpenses(applicationId: string, requestId?: string | null): Promise<PaymentEligibleExpenseItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: { id: true, description: true, amount: true, confirmed: true, status: true, paymentRequestId: true, certification: { select: { verified: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(r => {
    const { eligible, reason } = expenseEligibleForPayment(
      { status: r.status as 'ACTIVE' | 'REPLACED', confirmed: r.confirmed, verified: r.certification?.verified ?? false, paymentRequestId: r.paymentRequestId },
      requestId ?? null,
    )
    return { id: r.id, description: r.description, amount: Number(r.amount), eligible, reason, inThisRequest: !!requestId && r.paymentRequestId === requestId }
  })
}

export async function addExpenseToRequest(requestId: string, expenseId: string): Promise<void> {
  const req = await requireVisibleRequest(requestId)
  if (req.status !== 'DRAFT') throw new Error('Η δόση δεν είναι πρόχειρη — δεν προστίθενται δαπάνες.')
  const exp = await prisma.programExpense.findUniqueOrThrow({
    where: { id: expenseId },
    select: { id: true, applicationId: true, confirmed: true, status: true, paymentRequestId: true, certification: { select: { verified: true } } },
  })
  if (exp.applicationId !== req.applicationId) throw new Error('Η δαπάνη ανήκει σε άλλο έργο.')
  const { eligible, reason } = expenseEligibleForPayment(
    { status: exp.status as 'ACTIVE' | 'REPLACED', confirmed: exp.confirmed, verified: exp.certification?.verified ?? false, paymentRequestId: exp.paymentRequestId },
    requestId,
  )
  if (!eligible) throw new Error(`Μη επιλέξιμη δαπάνη: ${reason}.`)
  await prisma.programExpense.update({ where: { id: expenseId }, data: { paymentRequestId: requestId } })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function removeExpenseFromRequest(expenseId: string): Promise<void> {
  const exp = await prisma.programExpense.findUniqueOrThrow({ where: { id: expenseId }, select: { id: true, applicationId: true, paymentRequestId: true } })
  await requireVisibleApplication(exp.applicationId)
  if (exp.paymentRequestId) {
    const req = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: exp.paymentRequestId }, select: { status: true } })
    if (req.status !== 'DRAFT') throw new Error('Η δόση δεν είναι πρόχειρη — δεν αφαιρούνται δαπάνες.')
  }
  await prisma.programExpense.update({ where: { id: expenseId }, data: { paymentRequestId: null } })
  revalidatePath(`/pm/applications/${exp.applicationId}`)
}

/**
 * C2b — global Kanban + deadline radar πάνω σε ApplicationObligation.
 * Read-only context-rich DTO (BoardObligation) που κουβαλάει μαζί με την
 * υποχρέωση και τα στοιχεία πλαισίου (πελάτης/πρόγραμμα/ανάθεση) ώστε το
 * board να μη χρειάζεται επιπλέον fetch ανά κάρτα. Καμία μετάβαση/mutation
 * εδώ — το drag-and-drop του board ξαναχρησιμοποιεί το ήδη scoped
 * updateObligation παραπάνω.
 */
export type BoardObligation = {
  id: string
  name: string
  stage: StageStr
  kind: ObligationKindStr
  status: ObligationStatusStr
  dueDate: string | null
  mandatory: boolean
  templateId: string | null
  assigneeId: string | null
  assigneeName: string | null
  applicationId: string
  programId: string
  customerName: string
  programTitle: string
}

const BOARD_INCLUDE = {
  application: { select: { id: true, programId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } } } },
  assignee: { select: { name: true } },
} as const

function toBoardObligation(r: any): BoardObligation {
  return {
    id: r.id,
    name: r.name,
    stage: r.stage as StageStr,
    kind: r.kind as ObligationKindStr,
    status: r.status as ObligationStatusStr,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    mandatory: r.mandatory,
    templateId: r.templateId ?? null,
    assigneeId: r.assigneeId ?? null,
    assigneeName: r.assignee?.name ?? null,
    applicationId: r.applicationId,
    programId: r.application?.programId ?? r.application?.id ?? '',
    customerName: r.application?.trdr?.NAME ?? '—',
    programTitle: r.application?.program?.title ?? '—',
  }
}

/** Όλες οι ΟΡΑΤΕΣ υποχρεώσεις στον τρέχοντα χρήστη — global board, ΟΧΙ
 * scoped σε μια αίτηση (ίδιο idiom με listVisibleApplications: pm.manage
 * βλέπει τα πάντα, pm.work μόνο τις δικές του αναθέσεις). */
export async function listVisibleObligations(): Promise<BoardObligation[]> {
  const session = await requirePmAccess()
  const rows = await prisma.applicationObligation.findMany({
    where: { application: visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) },
    include: BOARD_INCLUDE,
    orderBy: [{ dueDate: 'asc' }, { order: 'asc' }],
  })
  return rows.map(toBoardObligation)
}

/** Board obligations μιας ΣΥΓΚΕΚΡΙΜΕΝΗΣ αίτησης — περνάει από
 * requireVisibleApplication (το μοναδικό σημείο ελέγχου ορατότητας). */
export async function listApplicationBoardObligations(applicationId: string): Promise<BoardObligation[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.applicationObligation.findMany({
    where: { applicationId },
    include: BOARD_INCLUDE,
    orderBy: [{ stage: 'asc' }, { order: 'asc' }],
  })
  return rows.map(toBoardObligation)
}

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

async function requireVisibleRequestRow(id: string) {
  const req = await prisma.documentRequest.findUniqueOrThrow({ where: { id }, select: { id: true, applicationId: true, trdrId: true, email: true, title: true, description: true, status: true, expiresAt: true } })
  await requireVisibleApplication(req.applicationId)
  return req
}

export type DocumentRequestItem = { id: string; title: string; description: string | null; email: string; status: string; expiresAt: string; uploadedAt: string | null; obligationId: string | null; uploadedDocumentId: string | null }

export async function listTrdrContactEmails(applicationId: string): Promise<{ label: string; email: string }[]> {
  const { app } = await requireVisibleApplication(applicationId)
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: app.trdrId }, select: { EMAIL: true, NAME: true, contacts: { select: { name: true, email: true, position: true } } } })
  const out: { label: string; email: string }[] = []
  if (trdr.EMAIL) out.push({ label: `${trdr.NAME} (πελάτης)`, email: trdr.EMAIL })
  for (const c of trdr.contacts) if (c.email) out.push({ label: `${c.name}${c.position ? ` — ${c.position}` : ''}`, email: c.email })
  return out
}

async function emailRequestLink(to: string, title: string, url: string, customerName: string): Promise<void> {
  if (!(await isMailerConfigured())) return
  const html = `<p>Καλησπέρα,</p><p>Το γραφείο σας ζητά το εξής έγγραφο για το έργο σας:</p><p><b>${escapeHtml(title)}</b></p><p>Ανεβάστε το εδώ (χωρίς σύνδεση): <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>— ${escapeHtml(customerName)}</p>`
  await sendMail({ to, subject: `Αίτημα εγγράφου: ${title}`, html, refType: 'pm-doc-request' }).catch(() => {})
}

export async function createDocumentRequest(applicationId: string, input: { obligationId?: string | null; title: string; description?: string | null; email: string; expiresInDays?: number }): Promise<{ id: string; url: string }> {
  const { session, app } = await requireVisibleApplication(applicationId)
  const title = input.title.trim(); const email = input.email.trim()
  if (!title) throw new Error('Ο τίτλος του αιτήματος είναι υποχρεωτικός.')
  if (!email) throw new Error('Το email παραλήπτη είναι υποχρεωτικό.')
  if (input.obligationId) { const ob = await prisma.applicationObligation.findUnique({ where: { id: input.obligationId }, select: { applicationId: true } }); if (ob?.applicationId !== applicationId) throw new Error('Η υποχρέωση ανήκει σε άλλο έργο.') }
  const { raw, hash } = newToken()
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 14) * 86_400_000)
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: app.trdrId }, select: { NAME: true } })
  const r = await prisma.documentRequest.create({ data: { applicationId, obligationId: input.obligationId ?? null, trdrId: app.trdrId, title, description: input.description?.trim() || null, email, tokenHash: hash, expiresAt, createdById: session.user.id } })
  const url = `${APP_URL}/portal/upload/${raw}`
  await emailRequestLink(email, title, url, trdr.NAME)
  revalidatePath(`/pm/applications/${applicationId}`)
  return { id: r.id, url }
}

export async function listDocumentRequests(applicationId: string): Promise<DocumentRequestItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.documentRequest.findMany({ where: { applicationId }, orderBy: { createdAt: 'desc' } })
  return rows.map(r => ({ id: r.id, title: r.title, description: r.description, email: r.email, status: r.status, expiresAt: r.expiresAt.toISOString(), uploadedAt: r.uploadedAt?.toISOString() ?? null, obligationId: r.obligationId, uploadedDocumentId: r.uploadedDocumentId }))
}

export async function resendDocumentRequest(id: string): Promise<{ url: string }> {
  const req = await requireVisibleRequestRow(id)
  if (req.status === 'CANCELLED' || req.status === 'FULFILLED') throw new Error('Το αίτημα έχει κλείσει.')
  const { raw, hash } = newToken()
  const expiresAt = new Date(Date.now() + 14 * 86_400_000)
  await prisma.documentRequest.update({ where: { id }, data: { tokenHash: hash, expiresAt, status: 'PENDING' } })
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: req.trdrId }, select: { NAME: true } })
  const url = `${APP_URL}/portal/upload/${raw}`
  await emailRequestLink(req.email, req.title, url, trdr.NAME)
  revalidatePath(`/pm/applications/${req.applicationId}`)
  return { url }
}

export async function cancelDocumentRequest(id: string): Promise<void> {
  const req = await requireVisibleRequestRow(id)
  await prisma.documentRequest.update({ where: { id }, data: { status: 'CANCELLED' } })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function fulfillDocumentRequest(id: string): Promise<void> {
  const req = await requireVisibleRequestRow(id)
  if (req.status !== 'UPLOADED') throw new Error('Δεν υπάρχει ανεβασμένο αρχείο προς επιβεβαίωση.')
  await prisma.documentRequest.update({ where: { id }, data: { status: 'FULFILLED' } })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function createPortalAccess(applicationId: string, input: { email: string; expiresInDays?: number }): Promise<{ url: string }> {
  const { session, app } = await requireVisibleApplication(applicationId)
  const email = input.email.trim(); if (!email) throw new Error('Το email είναι υποχρεωτικό.')
  const { raw, hash } = newToken()
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 30) * 86_400_000)
  await prisma.portalToken.create({ data: { tokenHash: hash, trdrId: app.trdrId, email, expiresAt, createdById: session.user.id } })
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: app.trdrId }, select: { NAME: true } })
  const url = `${APP_URL}/portal/access/${raw}`
  if (await isMailerConfigured()) { const html = `<p>Καλησπέρα,</p><p>Μπορείτε να δείτε την πρόοδο των έργων σας εδώ (χωρίς σύνδεση): <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>— ${escapeHtml(trdr.NAME)}</p>`; await sendMail({ to: email, subject: 'Πρόσβαση στο Portal έργων σας', html, refType: 'pm-portal-access' }).catch(() => {}) }
  return { url }
}

/**
 * C2g (Task 3, amended two-level) — admin-authored πρότυπα παραδοτέων
 * (ProgramDeliverableTemplate = GROUP) + τα tasks τους (ProgramDeliverableTask).
 * PROGRAM-GLOBAL config, όχι application-scoped — ίδιο idiom με τα
 * ProgramTaskTemplate actions του C2e παραπάνω: κλειδωμένα πίσω από
 * `programs.manage`, ΟΧΙ requirePmAccess/requireVisibleApplication.
 * Ο wizard (T7) καλεί saveDeliverableTemplate σε ΚΑΘΕ submit (create ή update)
 * με το πλήρες σύνολο tasks — βλ. διαφοροποίηση tasks στο update path.
 */

const VALID_DELIVERABLE_PHASES = new Set<DeliverablePhaseStr>([
  'ASSESSMENT', 'SUBMISSION', 'APPROVAL', 'FIRST_PAYMENT', 'PHASE_A_CERTIFICATION',
  'MODIFICATION', 'FINAL_PAYMENT', 'FULL_CERTIFICATION', 'AUTHORITY_AUDIT',
])

export type DeliverableTaskInput = {
  id?: string
  phase: DeliverablePhaseStr
  name: string
  description?: string | null
  mandatory: boolean
  onSiteVerification: boolean
  minFiles: number
  order: number
}

export type DeliverableTemplateItem = {
  id: string
  name: string
  description: string | null
  appliesTo: DeliverableScopeStr
  order: number
  active: boolean
  sourceTemplateId: string | null
  tasks: {
    id: string
    phase: DeliverablePhaseStr
    name: string
    description: string | null
    mandatory: boolean
    onSiteVerification: boolean
    minFiles: number
    order: number
  }[]
}

function mapDeliverableTemplateRow(r: any): DeliverableTemplateItem {
  return {
    id: r.id, name: r.name, description: r.description, appliesTo: r.appliesTo as DeliverableScopeStr,
    order: r.order, active: r.active, sourceTemplateId: r.sourceTemplateId,
    tasks: r.tasks.map((t: any) => ({
      id: t.id, phase: t.phase as DeliverablePhaseStr, name: t.name, description: t.description,
      mandatory: t.mandatory, onSiteVerification: t.onSiteVerification, minFiles: t.minFiles, order: t.order,
    })),
  }
}

export async function listDeliverableTemplates(programId: string): Promise<DeliverableTemplateItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programDeliverableTemplate.findMany({
    where: { programId },
    orderBy: { order: 'asc' },
    include: { tasks: { orderBy: [{ phase: 'asc' }, { order: 'asc' }] } },
  })
  return rows.map(mapDeliverableTemplateRow)
}

export async function saveDeliverableTemplate(input: {
  id?: string
  programId: string
  name: string
  description?: string | null
  appliesTo: DeliverableScopeStr
  active?: boolean
  tasks: DeliverableTaskInput[]
}): Promise<{ id: string }> {
  await requirePermission('programs.manage')

  const name = input.name.trim()
  if (!name) throw new Error('Το όνομα του παραδοτέου είναι υποχρεωτικό.')
  if (!input.tasks || input.tasks.length === 0) throw new Error('Το παραδοτέο πρέπει να έχει τουλάχιστον ένα task.')

  const tasks = input.tasks.map((t) => {
    const taskName = t.name.trim()
    if (!taskName) throw new Error('Το όνομα κάθε task είναι υποχρεωτικό.')
    if (!VALID_DELIVERABLE_PHASES.has(t.phase)) throw new Error(`Άγνωστη φάση: ${t.phase}`)
    return {
      id: t.id,
      phase: t.phase,
      name: taskName,
      description: t.description?.trim() || null,
      mandatory: t.mandatory,
      onSiteVerification: t.onSiteVerification,
      minFiles: Math.max(1, Math.trunc(t.minFiles) || 1),
      order: t.order,
    }
  })

  const description = input.description?.trim() || null

  if (input.id) {
    const existing = await prisma.programDeliverableTemplate.findUniqueOrThrow({
      where: { id: input.id },
      select: { id: true, programId: true },
    })
    if (existing.programId !== input.programId) throw new Error('Το παραδοτέο ανήκει σε άλλο πρόγραμμα.')

    const existingTasks = await prisma.programDeliverableTask.findMany({
      where: { templateId: input.id },
      select: { id: true },
    })
    const existingIds = new Set(existingTasks.map((t) => t.id))
    const keptIds = new Set(tasks.filter((t) => t.id && existingIds.has(t.id)).map((t) => t.id as string))
    const removedIds = [...existingIds].filter((id) => !keptIds.has(id))

    await prisma.$transaction(async (tx) => {
      await tx.programDeliverableTemplate.update({
        where: { id: input.id },
        data: {
          name, description, appliesTo: input.appliesTo,
          active: input.active ?? true,
        },
      })
      if (removedIds.length > 0) {
        await tx.programDeliverableTask.deleteMany({ where: { id: { in: removedIds }, templateId: input.id } })
      }
      for (const t of tasks) {
        if (t.id && existingIds.has(t.id)) {
          await tx.programDeliverableTask.update({
            where: { id: t.id },
            data: {
              phase: t.phase, name: t.name, description: t.description, mandatory: t.mandatory,
              onSiteVerification: t.onSiteVerification, minFiles: t.minFiles, order: t.order,
            },
          })
        } else {
          await tx.programDeliverableTask.create({
            data: {
              templateId: input.id as string, phase: t.phase, name: t.name, description: t.description,
              mandatory: t.mandatory, onSiteVerification: t.onSiteVerification, minFiles: t.minFiles, order: t.order,
            },
          })
        }
      }
    })
    revalidatePath(`/programs/${input.programId}`)
    return { id: input.id }
  }

  const max = await prisma.programDeliverableTemplate.aggregate({
    where: { programId: input.programId }, _max: { order: true },
  })
  const created = await prisma.programDeliverableTemplate.create({
    data: {
      programId: input.programId, name, description, appliesTo: input.appliesTo,
      active: input.active ?? true, order: (max._max.order ?? -1) + 1,
      tasks: {
        create: tasks.map((t) => ({
          phase: t.phase, name: t.name, description: t.description, mandatory: t.mandatory,
          onSiteVerification: t.onSiteVerification, minFiles: t.minFiles, order: t.order,
        })),
      },
    },
  })
  revalidatePath(`/programs/${input.programId}`)
  return { id: created.id }
}

export async function deleteDeliverableTemplate(id: string): Promise<void> {
  await requirePermission('programs.manage')
  const t = await prisma.programDeliverableTemplate.delete({ where: { id } })
  revalidatePath(`/programs/${t.programId}`)
}

export async function reorderDeliverableTemplates(programId: string, orderedIds: string[]): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.programDeliverableTemplate.updateMany({ where: { id, programId }, data: { order: i } }),
    ),
  )
  revalidatePath(`/programs/${programId}`)
}

export async function listDeliverableTemplateLibrary(): Promise<{
  programId: string
  programTitle: string
  templates: DeliverableTemplateItem[]
}[]> {
  await requirePermission('programs.manage')
  const programs = await prisma.program.findMany({
    where: { deliverableTemplates: { some: {} } },
    select: {
      id: true, title: true,
      deliverableTemplates: {
        orderBy: { order: 'asc' },
        include: { tasks: { orderBy: [{ phase: 'asc' }, { order: 'asc' }] } },
      },
    },
  })
  return programs.map((p) => ({
    programId: p.id,
    programTitle: p.title,
    templates: p.deliverableTemplates.map(mapDeliverableTemplateRow),
  }))
}

export async function copyDeliverableTemplates(targetProgramId: string, templateIds: string[]): Promise<{ copied: number }> {
  await requirePermission('programs.manage')
  if (!templateIds || templateIds.length === 0) return { copied: 0 }

  const sources = await prisma.programDeliverableTemplate.findMany({
    where: { id: { in: templateIds } },
    include: { tasks: { orderBy: [{ phase: 'asc' }, { order: 'asc' }] } },
  })
  if (sources.length === 0) return { copied: 0 }

  const max = await prisma.programDeliverableTemplate.aggregate({
    where: { programId: targetProgramId }, _max: { order: true },
  })
  let nextOrder = (max._max.order ?? -1) + 1

  await prisma.$transaction(async (tx) => {
    for (const src of sources) {
      await tx.programDeliverableTemplate.create({
        data: {
          programId: targetProgramId, name: src.name, description: src.description, appliesTo: src.appliesTo,
          active: true, sourceTemplateId: src.id, order: nextOrder++,
          tasks: {
            create: src.tasks.map((t) => ({
              phase: t.phase, name: t.name, description: t.description, mandatory: t.mandatory,
              onSiteVerification: t.onSiteVerification, minFiles: t.minFiles, order: t.order,
            })),
          },
        },
      })
    }
  })
  revalidatePath(`/programs/${targetProgramId}`)
  return { copied: sources.length }
}

/**
 * C2g (Task 4, amended two-level) — υλοποίηση (materialization) των
 * ProgramDeliverableTemplate/ProgramDeliverableTask groups του προγράμματος
 * σε συγκεκριμένα ExpenseDeliverable/ExpenseDeliverableTask instances πάνω
 * σε μια αίτηση: ένα group EXPENSE υλοποιείται ΜΙΑ φορά ανά ενεργή δαπάνη,
 * ένα group APPLICATION ΜΙΑ φορά συνολικά (expenseId=null). Idempotent μέσω
 * ζεύγους (templateId, expenseId) — ΠΡΟΣΟΧΗ: το @@unique([applicationId,
 * expenseId, templateId]) στη Postgres θεωρεί τα NULL "distinct" (δύο NULL
 * expenseId ΔΕΝ συγκρούονται σε επίπεδο DB), άρα ο έλεγχος idempotency εδώ
 * ΠΡΕΠΕΙ να γίνεται σε επίπεδο κώδικα — Map keyed `${templateId}::${expenseId
 * ?? ''}` — όχι με βάση constraint violation. Για ΗΔΗ υλοποιημένα groups,
 * συμπληρώνει (top-up) task instances για template tasks που προστέθηκαν
 * ΜΕΤΑ την πρώτη υλοποίηση. Στο τέλος ξαναχτίζει το auto-DAG
 * (DeliverableDependency auto=true) για ΟΛΗ την αίτηση από το ΤΡΕΧΟΝ σύνολο
 * task instances — χειροκίνητα (auto=false) edges ΔΕΝ αγγίζονται ποτέ.
 * pm-scoped μέσω requireVisibleApplication (ίδιο idiom με generateObligations
 * παραπάνω) — όχι programs.manage, γιατί δουλεύει πάνω σε ΣΥΓΚΕΚΡΙΜΕΝΗ αίτηση.
 */
export async function generateExpenseDeliverables(applicationId: string): Promise<{
  addedDeliverables: number
  addedTasks: number
  rebuiltEdges: number
}> {
  const { app } = await requireVisibleApplication(applicationId)

  const groups = await prisma.programDeliverableTemplate.findMany({
    where: { programId: app.programId, active: true },
    include: { tasks: { orderBy: { order: 'asc' } } },
    orderBy: { order: 'asc' },
  })

  const activeExpenses = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: { id: true },
  })

  const existing = await prisma.expenseDeliverable.findMany({
    where: { applicationId },
    select: {
      id: true,
      templateId: true,
      expenseId: true,
      tasks: { select: { id: true, taskTemplateId: true } },
    },
  })
  const existingByKey = new Map(existing.map((d) => [`${d.templateId ?? ''}::${d.expenseId ?? ''}`, d]))

  type TemplateTask = (typeof groups)[number]['tasks'][number]
  type WantedGroup = { templateId: string; expenseId: string | null; name: string; tasks: TemplateTask[] }
  const wanted: WantedGroup[] = []
  for (const g of groups) {
    if (g.appliesTo === 'EXPENSE') {
      for (const exp of activeExpenses) {
        wanted.push({ templateId: g.id, expenseId: exp.id, name: g.name, tasks: g.tasks })
      }
    } else {
      wanted.push({ templateId: g.id, expenseId: null, name: g.name, tasks: g.tasks })
    }
  }

  let addedDeliverables = 0
  let addedTasks = 0

  for (const w of wanted) {
    const key = `${w.templateId}::${w.expenseId ?? ''}`
    const found = existingByKey.get(key)

    if (!found) {
      await prisma.expenseDeliverable.create({
        data: {
          applicationId,
          expenseId: w.expenseId,
          templateId: w.templateId,
          name: w.name,
          tasks: {
            create: w.tasks.map((t) => ({
              taskTemplateId: t.id,
              phase: t.phase,
              name: t.name,
              mandatory: t.mandatory,
              onSiteVerification: t.onSiteVerification,
              minFiles: t.minFiles,
              order: t.order,
            })),
          },
        },
      })
      addedDeliverables += 1
      addedTasks += w.tasks.length
      continue
    }

    // Top-up: template tasks added to the group AFTER this instance already materialized.
    const haveTaskTemplateIds = new Set(found.tasks.map((t) => t.taskTemplateId))
    const missing = w.tasks.filter((t) => !haveTaskTemplateIds.has(t.id))
    if (missing.length > 0) {
      await prisma.expenseDeliverableTask.createMany({
        data: missing.map((t) => ({
          deliverableId: found.id,
          taskTemplateId: t.id,
          phase: t.phase,
          name: t.name,
          mandatory: t.mandatory,
          onSiteVerification: t.onSiteVerification,
          minFiles: t.minFiles,
          order: t.order,
        })),
      })
      addedTasks += missing.length
    }
  }

  // Rebuild the auto-DAG for the whole application from the CURRENT task instance set.
  const allTasks = await prisma.expenseDeliverableTask.findMany({
    where: { deliverable: { applicationId } },
    select: { id: true, phase: true, mandatory: true, deliverable: { select: { expenseId: true } } },
  })
  const dagTasks: DagTask[] = allTasks.map((t) => ({
    id: t.id,
    phase: t.phase as DeliverablePhaseStr,
    expenseId: t.deliverable.expenseId,
    mandatory: t.mandatory,
  }))
  const usedOptional = [...new Set(dagTasks.map((t) => t.phase))].filter((p) => OPTIONAL_PHASES.has(p))
  const pairs = buildAutoDependencyPairs(dagTasks, usedOptional)

  await prisma.deliverableDependency.deleteMany({
    where: { auto: true, dependent: { deliverable: { applicationId } } },
  })
  if (pairs.length > 0) {
    await prisma.deliverableDependency.createMany({
      data: pairs.map((p) => ({ dependentId: p.dependentId, prerequisiteId: p.prerequisiteId, auto: true })),
      skipDuplicates: true,
    })
  }

  revalidatePath(`/pm/applications/${applicationId}`)
  return { addedDeliverables, addedTasks, rebuiltEdges: pairs.length }
}

/**
 * C2g (Task 5, SECURITY-CRITICAL two-level gating) — instance-level actions
 * on ExpenseDeliverableTask: file upload/removal, status transitions
 * (PENDING/UPLOADED/ACCEPTED/REJECTED/WAIVED), and manual (auto=false)
 * dependency edit. This is the C2a.2 lesson applied here: EVERY invariant
 * (blocked-by-DAG, minFiles floor, cycle/cross-application on manual edges)
 * is enforced SERVER-SIDE inside these actions — never trust a client that
 * merely didn't render the "blocked" badge. The UI may also show these
 * states for UX, but the actions below are the actual gate.
 *
 * 8MB cap mirrors src/lib/pm/portal-public.ts#MAX_UPLOAD_BYTES (same
 * next.config.ts serverActions bodySizeLimit budget) — keep in sync.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** requireVisibleTask: child (task) -> parent (deliverable.applicationId) ->
 * requireVisibleApplication, ίδιο idiom με requireVisibleExpense/
 * requireVisibleApplication παραπάνω — ΚΑΝΕΝΑ instance action δεν αγγίζει
 * task χωρίς να περάσει από εδώ πρώτα. */
async function requireVisibleTask(taskId: string) {
  const task = await prisma.expenseDeliverableTask.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true,
      deliverableId: true,
      status: true,
      minFiles: true,
      deliverable: { select: { applicationId: true, expenseId: true } },
    },
  })
  const { session, app } = await requireVisibleApplication(task.deliverable.applicationId)
  return { task, session, app }
}

/** Loads every dependency edge + status/name of every task in the
 * application, then runs the pure `taskBlocked` (deliverable-phases.ts) for
 * ONE task. Shared by uploadDeliverableTaskFile (blocked check FIRST, before
 * any bunny call) and setDeliverableTaskStatus (ACCEPTED/UPLOADED gate). */
async function computeBlockedForTask(applicationId: string, taskId: string): Promise<{ blocked: boolean; blockingNames: string[] }> {
  const [edges, tasks] = await Promise.all([
    prisma.deliverableDependency.findMany({
      where: { dependent: { deliverable: { applicationId } } },
      select: { dependentId: true, prerequisiteId: true },
    }),
    prisma.expenseDeliverableTask.findMany({
      where: { deliverable: { applicationId } },
      select: { id: true, status: true, name: true },
    }),
  ])
  const statusById: Record<string, DeliverableStatusStr> = {}
  const nameById: Record<string, string> = {}
  for (const t of tasks) {
    statusById[t.id] = t.status as DeliverableStatusStr
    nameById[t.id] = t.name
  }
  const { blocked, blockingIds } = taskBlocked(taskId, edges as DependencyPair[], statusById)
  return { blocked, blockingNames: blockingIds.map((id) => nameById[id] ?? id) }
}

export type DeliverableMatrixItem = {
  id: string
  name: string
  expenseId: string | null
  templateId: string | null
  tasks: {
    id: string
    phase: DeliverablePhaseStr
    name: string
    mandatory: boolean
    onSiteVerification: boolean
    minFiles: number
    status: DeliverableStatusStr
    notes: string | null
    files: { id: string; name: string; size: number | null }[]
    blocked: boolean
    blockingNames: string[]
    canClose: boolean
  }[]
}

/** Παραδοτέα matrix μιας αίτησης — pm-scoped μέσω requireVisibleApplication.
 * Φορτώνει ΟΛΑ τα dependency edges (auto+manual) και statuses της αίτησης
 * μία φορά και τρέχει το pure taskBlocked/taskCanClose (deliverable-phases.ts)
 * server-side ανά task — το UI απλά εμφανίζει το ήδη υπολογισμένο αποτέλεσμα,
 * ΔΕΝ το ξαναϋπολογίζει (ώστε να μην υπάρχει κίνδυνος client/server drift). */
export async function listApplicationDeliverables(applicationId: string): Promise<DeliverableMatrixItem[]> {
  await requireVisibleApplication(applicationId)

  const deliverables = await prisma.expenseDeliverable.findMany({
    where: { applicationId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      expenseId: true,
      templateId: true,
      tasks: {
        orderBy: [{ phase: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          phase: true,
          name: true,
          mandatory: true,
          onSiteVerification: true,
          minFiles: true,
          status: true,
          notes: true,
          files: { select: { id: true, name: true, size: true } },
        },
      },
    },
  })

  const edges = await prisma.deliverableDependency.findMany({
    where: { dependent: { deliverable: { applicationId } } },
    select: { dependentId: true, prerequisiteId: true },
  })

  const statusById: Record<string, DeliverableStatusStr> = {}
  const nameById: Record<string, string> = {}
  for (const d of deliverables) {
    for (const t of d.tasks) {
      statusById[t.id] = t.status as DeliverableStatusStr
      nameById[t.id] = t.name
    }
  }

  return deliverables.map((d) => ({
    id: d.id,
    name: d.name,
    expenseId: d.expenseId,
    templateId: d.templateId,
    tasks: d.tasks.map((t) => {
      const { blocked, blockingIds } = taskBlocked(t.id, edges as DependencyPair[], statusById)
      const status = t.status as DeliverableStatusStr
      return {
        id: t.id,
        phase: t.phase as DeliverablePhaseStr,
        name: t.name,
        mandatory: t.mandatory,
        onSiteVerification: t.onSiteVerification,
        minFiles: t.minFiles,
        status,
        notes: t.notes,
        files: t.files,
        blocked,
        blockingNames: blockingIds.map((id) => nameById[id] ?? id),
        canClose: taskCanClose({ status, filesCount: t.files.length, minFiles: t.minFiles }),
      }
    }),
  }))
}

/** Ανέβασμα αρχείου σε task. Ο έλεγχος blocked τρέχει ΠΡΩΤΑ — πριν από
 * ΟΠΟΙΑΔΗΠΟΤΕ επαφή με το Bunny/DB write — ώστε ένα μπλοκαρισμένο task να
 * μην μπορεί ποτέ να αποκτήσει αρχείο, ΑΣΧΕΤΑ με το τι εμφανίζει το UI. */
export async function uploadDeliverableTaskFile(
  taskId: string,
  input: { filename: string; base64: string; mimeType: string },
): Promise<{ id: string }> {
  const { task, session } = await requireVisibleTask(taskId)
  const applicationId = task.deliverable.applicationId

  const { blocked, blockingNames } = await computeBlockedForTask(applicationId, taskId)
  if (blocked) {
    throw new Error(`Προηγούμενο παραδοτέο εκκρεμεί: ${blockingNames.join(', ')}`)
  }

  const body = Buffer.from(input.base64, 'base64')
  if (body.length === 0) throw new Error('Το αρχείο είναι κενό.')
  if (body.length > MAX_UPLOAD_BYTES) throw new Error('Το αρχείο υπερβαίνει το όριο των 8MB.')

  const ext = (input.filename.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
  const fileKeyId = crypto.randomUUID()
  const key = `pm/${applicationId}/deliverables/${taskId}/${fileKeyId}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: input.mimeType })

  const file = await prisma.deliverableFile.create({
    data: {
      taskId,
      name: input.filename.slice(0, 200),
      storageKey: key,
      mimeType: input.mimeType,
      size: body.length,
      uploadedById: session.user.id,
    },
  })

  if (task.status === 'PENDING' || task.status === 'REJECTED') {
    await prisma.expenseDeliverableTask.update({ where: { id: taskId }, data: { status: 'UPLOADED' } })
  }

  revalidatePath(`/pm/applications/${applicationId}`)
  return { id: file.id }
}

/** Αφαιρεί μόνο τη γραμμή DB — το αντικείμενο στο BunnyCDN μένει ορφανό
 * (ίδιο trade-off με removeApplicationDocument παραπάνω· v1 δεν κάνει hard
 * delete storage). Αν το task ήταν UPLOADED και δεν έμειναν ΚΑΘΟΛΟΥ αρχεία,
 * υποβιβάζεται σε PENDING — κρατάει το matrix ειλικρινές (ένα task δεν
 * μπορεί να δείχνει "ανέβηκε" χωρίς κανένα αρχείο). ΔΕΝ υποβιβάζει ΑLLΟ
 * status (π.χ. ACCEPTED/WAIVED/REJECTED) — αυτά είναι ρητές αποφάσεις. */
export async function removeDeliverableTaskFile(fileId: string): Promise<void> {
  const file = await prisma.deliverableFile.findUniqueOrThrow({
    where: { id: fileId },
    select: {
      id: true,
      taskId: true,
      task: { select: { id: true, status: true, deliverable: { select: { applicationId: true } } } },
    },
  })
  const applicationId = file.task.deliverable.applicationId
  await requireVisibleApplication(applicationId)

  await prisma.deliverableFile.delete({ where: { id: fileId } })

  const remaining = await prisma.deliverableFile.count({ where: { taskId: file.taskId } })
  if (remaining === 0 && file.task.status === 'UPLOADED') {
    await prisma.expenseDeliverableTask.update({ where: { id: file.taskId }, data: { status: 'PENDING' } })
  }

  revalidatePath(`/pm/applications/${applicationId}`)
}

/**
 * Status transition ενός task — ΟΛΟΙ οι κανόνες είναι server-side (SECURITY-
 * CRITICAL, βλ. C2a.2 lesson):
 *  - ACCEPTED: ΔΕΝ επιτρέπεται αν το task είναι blocked ΟΥΤΕ αν τα αρχεία
 *    είναι λιγότερα από minFiles· σφραγίζει acceptedById/acceptedAt.
 *  - UPLOADED: ΔΕΝ επιτρέπεται αν το task είναι blocked.
 *  - REJECTED: απαιτεί μη κενή σημείωση (αποθηκεύεται σε notes).
 *  - WAIVED: απαιτεί το δικαίωμα pm.manage (ξεχωριστό απο το ήδη περασμένο
 *    pm.work-or-pm.manage visibility gate — τυλίγουμε σε try/catch για
 *    καθαρό ελληνικό μήνυμα αντί για το ακατέργαστο requirePermission throw).
 *  - PENDING: πάντα επιτρέπεται (reset).
 */
export async function setDeliverableTaskStatus(
  taskId: string,
  status: DeliverableStatusStr,
  note?: string,
): Promise<void> {
  const { task, session } = await requireVisibleTask(taskId)
  const applicationId = task.deliverable.applicationId

  if (status === 'ACCEPTED' || status === 'UPLOADED') {
    const { blocked, blockingNames } = await computeBlockedForTask(applicationId, taskId)
    if (blocked) {
      throw new Error(`Προηγούμενο παραδοτέο εκκρεμεί: ${blockingNames.join(', ')}`)
    }
  }

  const data: Record<string, unknown> = { status }

  if (status === 'ACCEPTED') {
    const filesCount = await prisma.deliverableFile.count({ where: { taskId } })
    if (filesCount < task.minFiles) {
      throw new Error(`Απαιτούνται τουλάχιστον ${task.minFiles} αρχεία.`)
    }
    data.acceptedById = session.user.id
    data.acceptedAt = new Date()
  }

  if (status === 'REJECTED') {
    if (!note || !note.trim()) throw new Error('Απαιτείται σημείωση απόρριψης.')
  }

  if (status === 'WAIVED') {
    try {
      await requirePermission('pm.manage')
    } catch {
      throw new Error('Μόνο διαχειριστής PM μπορεί να δώσει απαλλαγή παραδοτέου.')
    }
  }

  if (note !== undefined) data.notes = note.trim() || null

  await prisma.expenseDeliverableTask.update({ where: { id: taskId }, data })
  revalidatePath(`/pm/applications/${applicationId}`)
}

/** Χειροκίνητη εξάρτηση (auto=false) μεταξύ δύο tasks — ΚΑΙ τα δύο περνάνε
 * από requireVisibleTask (ξεχωριστά, ώστε το ένα να μην μπορεί να «δανειστεί»
 * ορατότητα από το άλλο). Cross-application link απορρίπτεται ρητά (δεν
 * αρκεί να είναι και τα δύο ορατά στον χρήστη — πρέπει να είναι στην ΙΔΙΑ
 * αίτηση, αλλιώς το DAG/gating δεν έχει νόημα). Πριν το create, ξαναχτίζει
 * ΟΛΑ τα edges της αίτησης + το υποψήφιο νέο και τρέχει το pure hasCycle. */
export async function addTaskDependency(dependentId: string, prerequisiteId: string): Promise<void> {
  if (dependentId === prerequisiteId) {
    throw new Error('Ένα παραδοτέο δεν μπορεί να εξαρτάται από τον εαυτό του.')
  }

  const { task: dependent } = await requireVisibleTask(dependentId)
  const { task: prerequisite } = await requireVisibleTask(prerequisiteId)

  const applicationId = dependent.deliverable.applicationId
  if (prerequisite.deliverable.applicationId !== applicationId) {
    throw new Error('Η εξάρτηση πρέπει να είναι μεταξύ παραδοτέων της ΙΔΙΑΣ αίτησης.')
  }

  const existingEdges = await prisma.deliverableDependency.findMany({
    where: { dependent: { deliverable: { applicationId } } },
    select: { dependentId: true, prerequisiteId: true },
  })
  const candidateEdges: DependencyPair[] = [...(existingEdges as DependencyPair[]), { dependentId, prerequisiteId }]
  if (hasCycle(candidateEdges)) {
    throw new Error('Η εξάρτηση δημιουργεί κύκλο.')
  }

  await prisma.deliverableDependency.create({ data: { dependentId, prerequisiteId, auto: false } })
  revalidatePath(`/pm/applications/${applicationId}`)
}

/** Διαγράφει ΜΟΝΟ χειροκίνητα (auto=false) edges — τα auto edges ξαναχτίζονται
 * κάθε φορά από το generateExpenseDeliverables (βλ. παραπάνω) και διαγραφή
 * τους εδώ θα ήταν ένα no-op state που θα επανεμφανιζόταν αμέσως στο επόμενο
 * materialize, μπερδεύοντας τον χρήστη — γι' αυτό απορρίπτεται ρητά. */
export async function removeTaskDependency(id: string): Promise<void> {
  const edge = await prisma.deliverableDependency.findUniqueOrThrow({
    where: { id },
    select: { id: true, auto: true, dependent: { select: { deliverable: { select: { applicationId: true } } } } },
  })
  const applicationId = edge.dependent.deliverable.applicationId
  await requireVisibleApplication(applicationId)

  if (edge.auto) {
    throw new Error('Αυτόματες εξαρτήσεις δεν διαγράφονται χειροκίνητα — ξαναχτίζονται από το σύστημα.')
  }

  await prisma.deliverableDependency.delete({ where: { id } })
  revalidatePath(`/pm/applications/${applicationId}`)
}
