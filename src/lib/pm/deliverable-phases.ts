// Pure task-level DAG / gating / verified engine for C2g (Παραδοτέα ανά Δαπάνη ανά Φάση).
// No prisma/react/clock imports — string-union types mirror the Prisma enums so this stays testable
// in isolation. Spec: docs/superpowers/specs/2026-07-23-program-pm-c2g-deliverables-design.md
// (see «ΤΡΟΠΟΠΟΙΗΣΗ Α΄» — two-level model: Παραδοτέο group → Tasks; DAG/gating/verified operate on TASKS).

export type DeliverablePhaseStr =
  | 'ASSESSMENT'
  | 'SUBMISSION'
  | 'APPROVAL'
  | 'FIRST_PAYMENT'
  | 'PHASE_A_CERTIFICATION'
  | 'MODIFICATION'
  | 'FINAL_PAYMENT'
  | 'FULL_CERTIFICATION'
  | 'AUTHORITY_AUDIT'

export type DeliverableStatusStr = 'PENDING' | 'UPLOADED' | 'ACCEPTED' | 'REJECTED' | 'WAIVED'
export type DeliverableScopeStr = 'EXPENSE' | 'APPLICATION'

export const DELIVERABLE_PHASE_ORDER: DeliverablePhaseStr[] = [
  'ASSESSMENT',
  'SUBMISSION',
  'APPROVAL',
  'FIRST_PAYMENT',
  'PHASE_A_CERTIFICATION',
  'MODIFICATION',
  'FINAL_PAYMENT',
  'FULL_CERTIFICATION',
  'AUTHORITY_AUDIT',
]

export const OPTIONAL_PHASES: Set<DeliverablePhaseStr> = new Set(['FIRST_PAYMENT', 'MODIFICATION'])
export const APPLICATION_LEVEL_PHASES: Set<DeliverablePhaseStr> = new Set(['ASSESSMENT', 'APPROVAL', 'AUTHORITY_AUDIT'])

const PHASE_LABELS: Record<DeliverablePhaseStr, string> = {
  ASSESSMENT: 'Αξιολόγηση',
  SUBMISSION: 'Υποβολή',
  APPROVAL: 'Έγκριση',
  FIRST_PAYMENT: 'Πληρωμή Α΄ δόσης',
  PHASE_A_CERTIFICATION: 'Πιστοποίηση Α΄ φάσης',
  MODIFICATION: 'Τροποποίηση δαπάνης',
  FINAL_PAYMENT: 'Πλήρης αποπληρωμή',
  FULL_CERTIFICATION: 'Πιστοποίηση συνόλου',
  AUTHORITY_AUDIT: 'Έλεγχος αρχής',
}

const STATUS_LABELS: Record<DeliverableStatusStr, string> = {
  PENDING: 'Εκκρεμεί',
  UPLOADED: 'Ανέβηκε',
  ACCEPTED: 'Εγκρίθηκε',
  REJECTED: 'Απορρίφθηκε',
  WAIVED: 'Απαλλαγή',
}

export const deliverablePhaseLabel = (p: DeliverablePhaseStr) => PHASE_LABELS[p]
export const deliverableStatusLabel = (s: DeliverableStatusStr) => STATUS_LABELS[s]

// Full order minus any optional phase that isn't in use for this application/program.
export function effectivePhases(usedOptional: DeliverablePhaseStr[]): DeliverablePhaseStr[] {
  const used = new Set(usedOptional)
  return DELIVERABLE_PHASE_ORDER.filter((p) => !OPTIONAL_PHASES.has(p) || used.has(p))
}

// Walk backwards from `phase` through the full order, skipping unused optional phases, to find
// the nearest effective predecessor. FINAL_PAYMENT -> MODIFICATION when used, else -> PHASE_A_CERTIFICATION.
export function previousEffectivePhase(phase: DeliverablePhaseStr, usedOptional: DeliverablePhaseStr[]): DeliverablePhaseStr | null {
  const idx = DELIVERABLE_PHASE_ORDER.indexOf(phase)
  if (idx <= 0) return null
  const used = new Set(usedOptional)
  for (let i = idx - 1; i >= 0; i--) {
    const p = DELIVERABLE_PHASE_ORDER[i]
    if (!OPTIONAL_PHASES.has(p) || used.has(p)) return p
  }
  return null
}

export type DagTask = { id: string; phase: DeliverablePhaseStr; expenseId: string | null; mandatory: boolean }
export type DependencyPair = { dependentId: string; prerequisiteId: string }

// Each task of phase N auto-depends on:
//  - every MANDATORY task of the previous effective phase with the SAME expenseId, if any exist;
//  - otherwise (or when the previous phase's same-expense set is empty), on the MANDATORY
//    application-level tasks (expenseId === null) of that previous phase.
// Deterministic: iterates `tasks` in input order for both dependents and prerequisites.
export function buildAutoDependencyPairs(tasks: DagTask[], usedOptional: DeliverablePhaseStr[]): DependencyPair[] {
  const pairs: DependencyPair[] = []
  for (const t of tasks) {
    const prevPhase = previousEffectivePhase(t.phase, usedOptional)
    if (!prevPhase) continue

    const prevMandatory = tasks.filter((p) => p.phase === prevPhase && p.mandatory)
    const sameExpense = prevMandatory.filter((p) => p.expenseId === t.expenseId)
    const appLevel = prevMandatory.filter((p) => p.expenseId === null)
    const includeAppLevel = APPLICATION_LEVEL_PHASES.has(prevPhase) || sameExpense.length === 0

    const seen = new Set<string>()
    const prereqs: DagTask[] = []
    for (const p of sameExpense) {
      if (!seen.has(p.id)) { seen.add(p.id); prereqs.push(p) }
    }
    if (includeAppLevel) {
      for (const p of appLevel) {
        if (!seen.has(p.id)) { seen.add(p.id); prereqs.push(p) }
      }
    }

    for (const pr of prereqs) {
      if (pr.id !== t.id) pairs.push({ dependentId: t.id, prerequisiteId: pr.id })
    }
  }
  return pairs
}

// Directed-graph cycle detection over {dependentId -> prerequisiteId} edges (3-color DFS).
export function hasCycle(edges: DependencyPair[]): boolean {
  const adj = new Map<string, string[]>()
  const nodes = new Set<string>()
  for (const e of edges) {
    nodes.add(e.dependentId)
    nodes.add(e.prerequisiteId)
    if (!adj.has(e.dependentId)) adj.set(e.dependentId, [])
    adj.get(e.dependentId)!.push(e.prerequisiteId)
  }

  const UNVISITED = 0, IN_PROGRESS = 1, DONE = 2
  const state = new Map<string, 0 | 1 | 2>()

  function visit(node: string): boolean {
    state.set(node, IN_PROGRESS)
    for (const next of adj.get(node) ?? []) {
      const s = state.get(next) ?? UNVISITED
      if (s === IN_PROGRESS) return true
      if (s === UNVISITED && visit(next)) return true
    }
    state.set(node, DONE)
    return false
  }

  for (const n of nodes) {
    if ((state.get(n) ?? UNVISITED) === UNVISITED && visit(n)) return true
  }
  return false
}

// A task is blocked while any of its prerequisites is neither ACCEPTED nor WAIVED.
export function taskBlocked(
  taskId: string,
  edges: DependencyPair[],
  statusById: Record<string, DeliverableStatusStr>,
): { blocked: boolean; blockingIds: string[] } {
  const blockingIds = edges
    .filter((e) => e.dependentId === taskId)
    .map((e) => e.prerequisiteId)
    .filter((id) => statusById[id] !== 'ACCEPTED' && statusById[id] !== 'WAIVED')
  return { blocked: blockingIds.length > 0, blockingIds }
}

// A task can close once it has enough files — WAIVED tasks are exempt from the file-count floor.
export function taskCanClose(task: { status: DeliverableStatusStr; filesCount: number; minFiles: number }): boolean {
  if (task.status === 'WAIVED') return true
  return task.filesCount >= task.minFiles
}

// `verified` is derived from the mandatory tasks of the certification phases only. Certification
// is not blocked by the absence of certification tasks (empty -> true; the scalar side of
// certification, e.g. C2f eligibility, still gates independently).
export function verifiedFromTasks(tasks: { phase: DeliverablePhaseStr; mandatory: boolean; status: DeliverableStatusStr }[]): boolean {
  const relevant = tasks.filter((t) => t.mandatory && (t.phase === 'PHASE_A_CERTIFICATION' || t.phase === 'FULL_CERTIFICATION'))
  return relevant.every((t) => t.status === 'ACCEPTED' || t.status === 'WAIVED')
}
