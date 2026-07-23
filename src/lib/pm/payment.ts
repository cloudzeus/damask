export type PaymentStatusStr = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'REJECTED'
export type PaymentEligibilityInput = { status: 'ACTIVE' | 'REPLACED'; confirmed: boolean; verified: boolean; paymentRequestId: string | null }

export function expenseEligibleForPayment(e: PaymentEligibilityInput, currentRequestId: string | null = null): { eligible: boolean; reason: string | null } {
  if (e.status === 'REPLACED') return { eligible: false, reason: 'αντικαταστάθηκε' }
  if (!e.confirmed) return { eligible: false, reason: 'μη επιβεβαιωμένη κατηγορία' }
  if (!e.verified) return { eligible: false, reason: 'λείπει πιστοποίηση' }
  if (e.paymentRequestId != null && e.paymentRequestId !== currentRequestId) return { eligible: false, reason: 'σε άλλη δόση' }
  return { eligible: true, reason: null }
}

export function paymentRequestTotal(amounts: number[]): number {
  return amounts.reduce((s, a) => s + a, 0)
}

const TRANSITIONS: Record<PaymentStatusStr, PaymentStatusStr[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  PAID: [],
  REJECTED: ['DRAFT'],
}
export function canTransition(from: PaymentStatusStr, to: PaymentStatusStr): boolean {
  return TRANSITIONS[from].includes(to)
}

const STATUS_LABELS: Record<PaymentStatusStr, string> = {
  DRAFT: 'Πρόχειρη', SUBMITTED: 'Υποβλήθηκε', APPROVED: 'Εγκρίθηκε', PAID: 'Πληρώθηκε', REJECTED: 'Απορρίφθηκε',
}
export const paymentStatusLabel = (s: PaymentStatusStr) => STATUS_LABELS[s]
export const nextPaymentStatuses = (s: PaymentStatusStr): PaymentStatusStr[] => TRANSITIONS[s]
