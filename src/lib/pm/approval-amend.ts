import { prisma } from '@/lib/prisma'
import type { ApprovalExtract } from '@/lib/pm/approval-extract'

/**
 * (Plain module.) Τροποποίηση εγκεκριμένου έργου: σύγκριση νεότερης εγκριτικής με την καταχωρισμένη και τις ενεργές
 * δαπάνες του έργου. Καλείται από τα actions του approval.ts (μετά από έλεγχο δικαιωμάτων).
 */

export function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()
}
export function overlap(a: string, b: string): number {
  const A = new Set(fold(a).split(' ').filter(w => w.length > 3))
  const B = new Set(fold(b).split(' ').filter(w => w.length > 3))
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const w of A) if (B.has(w)) hit++
  return hit / Math.min(A.size, B.size)
}

export type AmendmentChange = 'same' | 'changed' | 'new' | 'removed'
export type AmendmentRow = {
  /** Θέση στις δαπάνες της νέας απόφασης (null για όσες καταργούνται). */
  index: number | null
  expenseId: string | null
  title: string
  before: number | null
  after: number | null
  change: AmendmentChange
  /** Δεν καταργείται αυτόματα: έχει ήδη αγορά/πιστοποίηση/αίτημα αποπληρωμής. */
  blocked: string | null
}
export type AmendmentPlan = {
  previous: { decisionRef: string | null; decisionDate: string | null; totalBudget: number | null; publicAmount: number | null; aidPct: number | null; durationMonths: number | null; endsAt: string | null }
  rows: AmendmentRow[]
}

export type ExistingApproval = NonNullable<Awaited<ReturnType<typeof prisma.applicationApproval.findUnique>>>
export type ApprovalHistoryEntry = { decisionRef: string | null; decisionDate: string | null; ada: string | null; totalBudget: number | null; publicAmount: number | null; aidPct: number | null; durationMonths: number | null; endsAt: string | null; docKey: string | null; docName: string | null; expenses: unknown }

export const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
export const numOrNull = (v: unknown) => (v == null ? null : Number(v))

/** Έναρξη υλοποίησης = ημερομηνία της ΑΡΧΙΚΗΣ εγκριτικής (οι τροποποιήσεις αλλάζουν τη διάρκεια, όχι την έναρξη). */
export function originalStart(a: ExistingApproval): string | null {
  const hist = ((a.extra as { history?: ApprovalHistoryEntry[] } | null)?.history ?? [])
  return hist[0]?.decisionDate ?? isoDay(a.decisionDate)
}

/** Είναι το έγγραφο νεότερη απόφαση (τροποποίηση) της καταχωρισμένης; */
export function isAmendmentOf(x: ApprovalExtract, a: ExistingApproval | null): 'newer' | 'older' | 'same' | null {
  if (!a) return null
  if (x.applicationCode && a.applicationCode && x.applicationCode !== a.applicationCode) return null
  if (x.decisionRef && a.decisionRef && fold(x.decisionRef) === fold(a.decisionRef)) return 'same'
  const nd = x.decisionDate ? Date.parse(x.decisionDate) : NaN
  const od = a.decisionDate?.getTime() ?? NaN
  if (Number.isNaN(nd) || Number.isNaN(od) || nd === od) return 'same'
  return nd > od ? 'newer' : 'older'
}

/**
 * Διαφορές νέας απόφασης ↔ ενεργών δαπανών του έργου. Ταίριασμα με τίτλο/περιγραφή (+ μικρό βάρος για ίδια κατηγορία),
 * άπληστα από το καλύτερο ζεύγος — ώστε μια ΝΕΑ δαπάνη ίδιας κατηγορίας να μη «κλέβει» μια παλιά με άλλο αντικείμενο.
 */
export async function buildAmendmentPlan(applicationId: string, x: ApprovalExtract, categoryIds: (string | null)[], a: ExistingApproval): Promise<AmendmentPlan> {
  const existing = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: { id: true, description: true, amount: true, categoryId: true, paymentRequestId: true, purchase: { select: { id: true } }, certification: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const pairs: { i: number; e: number; s: number }[] = []
  x.expenses.forEach((ne, i) => existing.forEach((ex, e) => {
    const ov = Math.max(overlap(ne.title, ex.description), overlap(ne.description ?? '', ex.description) * 0.9, overlap(ne.subcategory ?? '', ex.description) * 0.8)
    const s = ov + (categoryIds[i] && categoryIds[i] === ex.categoryId ? 0.25 : 0)
    if (s >= 0.6) pairs.push({ i, e, s })
  }))
  pairs.sort((p, q) => q.s - p.s)
  const byNew = new Map<number, number>()
  const usedOld = new Set<number>()
  for (const p of pairs) if (!byNew.has(p.i) && !usedOld.has(p.e)) { byNew.set(p.i, p.e); usedOld.add(p.e) }

  const rows: AmendmentRow[] = x.expenses.map((ne, i) => {
    const e = byNew.get(i)
    if (e == null) return { index: i, expenseId: null, title: ne.title, before: null, after: ne.net, change: 'new', blocked: null }
    const ex = existing[e]
    const before = Number(ex.amount)
    return { index: i, expenseId: ex.id, title: ne.title, before, after: ne.net, change: Math.abs(before - ne.net) < 0.01 ? 'same' : 'changed', blocked: null }
  })
  existing.forEach((ex, e) => {
    if (usedOld.has(e)) return
    const blocked = ex.purchase ? 'έχει ήδη καταχωρισμένη αγορά' : ex.certification ? 'έχει πιστοποίηση' : ex.paymentRequestId ? 'είναι σε αίτημα αποπληρωμής' : null
    rows.push({ index: null, expenseId: ex.id, title: ex.description, before: Number(ex.amount), after: null, change: 'removed', blocked })
  })
  return {
    previous: {
      decisionRef: a.decisionRef, decisionDate: isoDay(a.decisionDate), totalBudget: numOrNull(a.totalBudget), publicAmount: numOrNull(a.publicAmount),
      aidPct: a.aidPct, durationMonths: a.durationMonths, endsAt: isoDay(a.endsAt),
    },
    rows,
  }
}
