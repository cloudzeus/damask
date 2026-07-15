import type { ExtractedDocument } from './schema'
import { checkInvoiceMath, type MismatchFlag } from './invoice-math'

/**
 * Greek ΑΦΜ check-digit validation (mod-11 over the first 8 digits, weighted
 * by descending powers of two). Non-digit characters are stripped first.
 */
export function isValidAfm(input: string | null | undefined): boolean {
  const afm = String(input ?? '').replace(/\D+/g, '')
  if (!/^\d{9}$/.test(afm)) return false
  if (afm === '000000000') return false
  const d = afm.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 8; i++) sum += d[i] * 2 ** (8 - i)
  const check = (sum % 11) % 10
  return check === d[8]
}

/**
 * Normalize an ΑΦΜ / VAT string to the bare number AADE/SoftOne expect. Strips
 * an optional country prefix (EL/GR) and every other non-digit character:
 * "EL999863881" or "ΑΦΜ: 999 863 881" → "999863881". null if no digits remain.
 */
export function normalizeAfm(input: unknown): string | null {
  const digits = String(input ?? '').replace(/\D+/g, '')
  return digits || null
}

const LOW_CONFIDENCE_THRESHOLD = 0.5

/**
 * Πλήρης έλεγχος ενός εξαγόμενου εγγράφου → λίστα mismatch flags έτοιμων για
 * το review panel (⚠ badges). Συνδυάζει: ΑΦΜ εγκυρότητα (issuer/counterparty),
 * αριθμητικό συμβιβασμό γραμμών/ΦΠΑ/συνόλων (invoice-math.ts), και χαμηλό
 * confidence. ΠΟΤΕ δεν πετάει — πάντα επιστρέφει (πιθανώς άδεια) λίστα flags.
 */
export function validateExtractedDocument(doc: ExtractedDocument): MismatchFlag[] {
  const flags: MismatchFlag[] = []

  if (doc.issuer.afm && !isValidAfm(doc.issuer.afm)) {
    flags.push({
      code: 'issuer_afm_invalid',
      message: `Το ΑΦΜ εκδότη "${doc.issuer.afm}" δεν είναι έγκυρο (έλεγχος ψηφίου ελέγχου).`,
      severity: 'warning',
    })
  }
  if (doc.counterparty?.afm && !isValidAfm(doc.counterparty.afm)) {
    flags.push({
      code: 'counterparty_afm_invalid',
      message: `Το ΑΦΜ παραλήπτη "${doc.counterparty.afm}" δεν είναι έγκυρο (έλεγχος ψηφίου ελέγχου).`,
      severity: 'warning',
    })
  }

  // packing_list: δεν έχει νόημα ο έλεγχος ΦΠΑ/συνόλων (κατά κανόνα null) — μόνο invoice/receipt.
  if (doc.docType !== 'packing_list') {
    flags.push(...checkInvoiceMath(doc.lines, doc.totals))
  }

  if (doc.confidence < LOW_CONFIDENCE_THRESHOLD) {
    flags.push({
      code: 'low_confidence',
      message: `Χαμηλή εμπιστοσύνη ανάγνωσης (${Math.round(doc.confidence * 100)}%) — έλεγξε προσεκτικά τα πεδία πριν την επιβεβαίωση.`,
      severity: 'warning',
    })
  }

  return flags
}

export type { MismatchFlag, MismatchSeverity } from './invoice-math'
