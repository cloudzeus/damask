// Αριθμητικός έλεγχος συνέπειας παραστατικού: Σ(γραμμές) έναντι Καθαρής αξίας,
// ΦΠΑ ανά συντελεστή (ένα παραστατικό μπορεί να έχει πολλαπλούς συντελεστές
// 24/13/6%), και Καθαρή + ΦΠΑ == Σύνολο. Ανεκτικότητα (tolerance) απορροφά
// στρογγυλοποιήσεις ανά γραμμή — ΔΕΝ σημαίνει ότι τα ποσά είναι σωστά, μόνο
// ότι διαφέρουν λιγότερο από ένα λογικό όριο.

import type { OcrLine, OcrTotals } from './schema'

export const TOTALS_TOLERANCE = 0.02

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
/** Ανοχή που μεγαλώνει ελαφρώς με το μέγεθος του ποσού, ώστε να απορροφά στρογγυλοποιήσεις ανά γραμμή. */
const tol = (ref: number, extra = 0) => Math.max(TOTALS_TOLERANCE + extra, Math.abs(ref) * 0.001)

/** Το net μιας γραμμής: εμπιστεύεται ρητό `total` αν υπάρχει, αλλιώς quantity×unitPrice. */
export function lineNet(l: OcrLine): number {
  if (l.total != null) return l.total
  if (l.quantity == null || l.unitPrice == null) return 0
  return l.quantity * l.unitPrice
}

export function sumLines(lines: OcrLine[]): number {
  return round2(lines.reduce((s, l) => s + lineNet(l), 0))
}

export interface VatGroup { rate: number; net: number; vat: number }

/** Ομαδοποιεί τα line nets ανά συντελεστή ΦΠΑ (γραμμές χωρίς vatPct αγνοούνται). */
export function vatGroups(lines: OcrLine[]): VatGroup[] {
  const byRate = new Map<number, number>()
  for (const l of lines) {
    if (l.vatPct == null) continue
    byRate.set(l.vatPct, (byRate.get(l.vatPct) ?? 0) + lineNet(l))
  }
  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, net]) => ({ rate, net: round2(net), vat: round2((net * rate) / 100) }))
}

export function computeVat(lines: OcrLine[]): number {
  return round2(vatGroups(lines).reduce((s, g) => s + g.vat, 0))
}

export type MismatchSeverity = 'warning' | 'error'

export interface MismatchFlag {
  code: string
  message: string
  severity: MismatchSeverity
}

export interface Reconciliation {
  sumNet: number
  vatGroups: VatGroup[]
  vatComputed: number
  hasMultipleRates: boolean
  linesVsNet: { ok: boolean; diff: number } | null
  vatOk: boolean | null
  totalOk: boolean | null
}

/** Καθαρός αριθμητικός συμβιβασμός — χωρίς Ελληνικά μηνύματα, μόνο δεδομένα (για UI/άλλους callers). */
export function reconcile(lines: OcrLine[], totals: OcrTotals): Reconciliation {
  const sumNet = sumLines(lines)
  const groups = vatGroups(lines)
  const vatComputed = computeVat(lines)
  const hasMultipleRates = groups.length > 1
  const extra = hasMultipleRates ? 0.03 : 0 // λίγο slack πάνω από πολλαπλές στρογγυλοποιημένες ομάδες

  const linesVsNet = totals.net != null
    ? { ok: Math.abs(sumNet - totals.net) <= tol(totals.net, extra), diff: round2(sumNet - totals.net) }
    : null

  const vatOk = totals.vat != null && groups.length > 0
    ? Math.abs(vatComputed - totals.vat) <= tol(totals.vat, extra)
    : null

  const totalOk = totals.net != null && totals.vat != null && totals.gross != null
    ? Math.abs(round2(totals.net + totals.vat) - totals.gross) <= tol(totals.gross, extra)
    : null

  return { sumNet, vatGroups: groups, vatComputed, hasMultipleRates, linesVsNet, vatOk, totalOk }
}

/**
 * Έλεγχος συνέπειας → λίστα Ελληνικών mismatch flags έτοιμων για εμφάνιση
 * (⚠ badges στο review panel). Ποτέ δεν πετάει — neutral (καμία flag) όταν
 * λείπουν αρκετά δεδομένα για σύγκριση (π.χ. packing_list χωρίς σύνολα).
 */
export function checkInvoiceMath(lines: OcrLine[], totals: OcrTotals): MismatchFlag[] {
  const r = reconcile(lines, totals)
  const flags: MismatchFlag[] = []

  if (r.linesVsNet && !r.linesVsNet.ok) {
    flags.push({
      code: 'lines_vs_net',
      message: `Το άθροισμα των γραμμών (${r.sumNet.toFixed(2)}€) δεν ταιριάζει με την Καθαρή αξία (${totals.net!.toFixed(2)}€) — διαφορά ${r.linesVsNet.diff.toFixed(2)}€.`,
      severity: 'error',
    })
  }
  if (r.vatOk === false) {
    flags.push({
      code: 'vat_mismatch',
      message: `Ο υπολογισμένος ΦΠΑ (${r.vatComputed.toFixed(2)}€) δεν ταιριάζει με τον δηλωμένο (${totals.vat!.toFixed(2)}€).`,
      severity: 'error',
    })
  }
  if (r.totalOk === false) {
    flags.push({
      code: 'total_mismatch',
      message: `Καθαρή αξία + ΦΠΑ (${round2(totals.net! + totals.vat!).toFixed(2)}€) δεν ταιριάζει με το Σύνολο (${totals.gross!.toFixed(2)}€).`,
      severity: 'error',
    })
  }
  return flags
}
