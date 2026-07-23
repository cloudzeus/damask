export type StageStr = 'ASSESSMENT' | 'DOCUMENTS' | 'EXPENSES_DELIVERABLES' | 'OPSKE_SUBMISSION' | 'INSPECTION' | 'MONITORING'
export type ObligationKindStr = 'DELIVERABLE' | 'FORM' | 'CRITERION' | 'TASK' | 'CUSTOM'
export type ObligationStatusStr = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WAIVED'
export type VerdictStr = 'PENDING' | 'ELIGIBLE' | 'INELIGIBLE'

export const STAGE_ORDER: StageStr[] = ['ASSESSMENT', 'DOCUMENTS', 'EXPENSES_DELIVERABLES', 'OPSKE_SUBMISSION', 'INSPECTION', 'MONITORING']

const STAGE_LABELS: Record<StageStr, string> = {
  ASSESSMENT: 'Αξιολόγηση',
  DOCUMENTS: 'Δικαιολογητικά',
  EXPENSES_DELIVERABLES: 'Δαπάνες & Παραδοτέα',
  OPSKE_SUBMISSION: 'Υποβολή ΟΠΣΚΕ',
  INSPECTION: 'Δελτία ελέγχου',
  MONITORING: 'Παρακολούθηση',
}

const KIND_LABELS: Record<ObligationKindStr, string> = {
  DELIVERABLE: 'Παραδοτέο',
  FORM: 'Έντυπο',
  CRITERION: 'Κριτήριο',
  TASK: 'Εργασία',
  CUSTOM: 'Άλλο',
}

const STATUS_LABELS: Record<ObligationStatusStr, string> = {
  PENDING: 'Εκκρεμεί',
  IN_PROGRESS: 'Σε εξέλιξη',
  SUBMITTED: 'Υποβλήθηκε',
  APPROVED: 'Εγκρίθηκε',
  REJECTED: 'Απορρίφθηκε',
  WAIVED: 'Απαλλαγή',
}

const VERDICT_LABELS: Record<VerdictStr, string> = {
  PENDING: 'Εκκρεμεί',
  ELIGIBLE: 'Εντάσσεται',
  INELIGIBLE: 'Δεν εντάσσεται',
}

export const stageLabel = (s: StageStr) => STAGE_LABELS[s]
export const obligationKindLabel = (k: ObligationKindStr) => KIND_LABELS[k]
export const obligationStatusLabel = (s: ObligationStatusStr) => STATUS_LABELS[s]
export const verdictLabel = (v: VerdictStr) => VERDICT_LABELS[v]

export function nextStage(s: StageStr): StageStr | null {
  const i = STAGE_ORDER.indexOf(s)
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
}

export function prevStage(s: StageStr): StageStr | null {
  const i = STAGE_ORDER.indexOf(s)
  return i > 0 ? STAGE_ORDER[i - 1] : null
}
