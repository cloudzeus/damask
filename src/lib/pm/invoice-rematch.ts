import { prisma } from '@/lib/prisma'
import { matchInvoice, certNeededFor } from '@/lib/pm/invoice-match'

/** (Plain module — actions, υπογραφή βεβαίωσης από τον προμηθευτή.) Νέα διασταύρωση ενός παραστατικού υλοποίησης. */

export type StoredMatch = { checks?: { ok: boolean; text: string }[]; cert?: { invoiceNumbers?: string[]; amount?: number | null } }

export function parseMatch(s: string | null): StoredMatch {
  if (!s) return {}
  try { return JSON.parse(s) as StoredMatch } catch { return { checks: [{ ok: false, text: s }] } }
}

const n = (v: unknown) => (v == null ? null : Number(v))
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

/** `cert` δίνεται όταν μόλις διαβάστηκε/υπογράφηκε βεβαίωση (τι παραστατικά/ποσό αναφέρει). */
export async function rematchInvoice(invoiceId: string, cert?: StoredMatch['cert'] | null): Promise<void> {
  const r = await prisma.expenseInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true, expense: { select: { description: true, category: { select: { name: true } } } } } })
  const needCert = certNeededFor(r.expense.category?.name ?? null, r.expense.description) || !!r.supplierCertKey
  const stored = parseMatch(r.matchNote)
  const c = cert !== undefined ? cert ?? undefined : stored.cert
  const res = matchInvoice({
    invoice: { total: n(r.totalAmount), date: day(r.date), supplier: r.supplier, supplierAfm: r.supplierAfm, number: r.number },
    payments: r.payments.map(p => ({ amount: n(p.amount), date: day(p.paidAt), payee: p.payee })),
    cert: needCert ? { present: !!r.supplierCertKey, invoiceNumbers: c?.invoiceNumbers ?? null, amount: c?.amount ?? null } : null,
  })
  await prisma.expenseInvoice.update({ where: { id: invoiceId }, data: { matchVerdict: res.verdict, matchNote: JSON.stringify({ checks: res.checks, cert: c }) } })
}
