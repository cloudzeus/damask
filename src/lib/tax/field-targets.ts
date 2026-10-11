// src/lib/tax/field-targets.ts — ISOMORPHIC (χωρίς prisma/react)
import type { FinancialValueTypeStr } from '@/lib/tax/greek-format'

/**
 * «Πού καταχωρείται» μια τιμή που βρίσκει ο Οδηγός Εντύπου. ΚΑΘΕ τιμή κρατιέται πάντα στο ιστορικό
 * της εταιρίας ανά έτος (Οικονομικά στοιχεία)· ο προορισμός ορίζει ΕΠΙΠΛΕΟΝ καταχώριση σε στοιχείο
 * της εταιρίας ή του ίδιου του εγγράφου. Το «Έτος αναφοράς» ορίζει σε ποιο έτος μπαίνουν οι τιμές.
 */
export type FieldTarget = {
  key: string
  label: string
  group: 'Εταιρία' | 'Έγγραφο'
  /** Ο τύπος τιμής που ταιριάζει (προτείνεται αυτόματα όταν επιλέγεται ο προορισμός). */
  valueType: FinancialValueTypeStr
}

export const FIELD_TARGETS: FieldTarget[] = [
  { key: 'trdr.appEmployees', label: 'Αριθμός εργαζομένων', group: 'Εταιρία', valueType: 'INTEGER' },
  { key: 'trdr.appEme', label: 'ΕΜΕ (μέσος όρος εργαζομένων)', group: 'Εταιρία', valueType: 'NUMBER' },
  { key: 'trdr.appAnnualRevenue', label: 'Κύκλος εργασιών (ετήσια έσοδα)', group: 'Εταιρία', valueType: 'CURRENCY' },
  { key: 'trdr.appLegalForm', label: 'Νομική μορφή', group: 'Εταιρία', valueType: 'TEXT' },
  { key: 'trdr.foundingDate', label: 'Ημερομηνία ίδρυσης', group: 'Εταιρία', valueType: 'DATE' },
  { key: 'trdr.arGemi', label: 'Αριθμός ΓΕΜΗ', group: 'Εταιρία', valueType: 'TEXT' },
  { key: 'doc.issuedAt', label: 'Ημερομηνία έκδοσης', group: 'Έγγραφο', valueType: 'DATE' },
  { key: 'doc.expiresAt', label: 'Ημερομηνία λήξης / ισχύς έως', group: 'Έγγραφο', valueType: 'DATE' },
  { key: 'record.year', label: 'Έτος αναφοράς (σε ποιο έτος μπαίνουν οι τιμές)', group: 'Έγγραφο', valueType: 'INTEGER' },
]

export const TARGET_BY_KEY = new Map(FIELD_TARGETS.map(t => [t.key, t]))
export const HISTORY_ONLY_LABEL = 'Μόνο στο ιστορικό ανά έτος'
export function targetLabel(key: string | null | undefined): string {
  return (key && TARGET_BY_KEY.get(key)?.label) || HISTORY_ONLY_LABEL
}
