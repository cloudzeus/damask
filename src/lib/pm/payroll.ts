'use server'

import crypto from 'node:crypto'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { logActivity } from '@/lib/activity/log'
import { requireExpenseAccess } from '@/lib/pm/access'
import { summarizePayroll, perEmeCapFrom, type PayrollSummary } from '@/lib/pm/payroll-calc'
import { ingestPayrollDocCore, type PayrollDocKind } from '@/lib/pm/payroll-core'
export type { PayrollDocKind } from '@/lib/pm/payroll-core'

/**
 * Μισθολογικό κόστος έργου (δαπάνη προσωπικού): μισθοδοτικές καταστάσεις → εργαζόμενοι × μήνες (AI), αναγγελίες
 * πρόσληψης → ποιοι είναι οι νέοι εργαζόμενοι του έργου, πληρωμές μισθοδοσίας → ποιοι μήνες εξοφλήθηκαν. Όριο από το
 * πρόγραμμα (ανά ΕΜΕ) και το εγκεκριμένο ποσό.
 */

type FileIn = { name: string; base64: string; mimeType: string }

export type PayrollView = {
  expenseId: string
  approved: number
  perEmeCap: number | null
  employees: { id: string; name: string; afm: string | null; hiredAt: string | null; projectHire: boolean; fte: number; months: number; cost: number; cap: number | null; eligible: number; missing: string[] }[]
  /** Πλέγμα: κόστος (μικτά+εργοδοτικές) ανά νέο εργαζόμενο και μήνα. */
  grid: { employeeId: string; period: string; cost: number }[]
  periods: PayrollSummary['periods']
  summary: { cost: number; eligible: number; paidCost: number }
  docs: { id: string; kind: PayrollDocKind; name: string; amount: number | null; paidAt: string | null; period: string | null; note: string | null; readError: string | null; lines: number }[]
}

const n = (v: unknown) => (v == null ? null : Number(v))
const toDate = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)

export async function getPayroll(expenseId: string): Promise<PayrollView> {
  await requireExpenseAccess(expenseId)
  return loadPayroll(expenseId)
}

async function loadPayroll(expenseId: string): Promise<PayrollView> {
  const e = await prisma.programExpense.findUniqueOrThrow({
    where: { id: expenseId },
    select: {
      amount: true, category: { select: { notes: true } },
      payrollEmployees: { orderBy: [{ projectHire: 'desc' }, { name: 'asc' }], include: { lines: true } },
      payrollDocs: { orderBy: [{ kind: 'asc' }, { period: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { lines: true } } } },
    },
  })
  const perEmeCap = perEmeCapFrom(e.category?.notes)
  const lines = e.payrollEmployees.flatMap(emp => emp.lines.map(l => ({ employeeId: emp.id, period: l.period, kind: l.kind, gross: Number(l.gross), employerContrib: Number(l.employerContrib), net: n(l.net) })))
  const s = summarizePayroll({
    employees: e.payrollEmployees.map(x => ({ id: x.id, name: x.name, projectHire: x.projectHire, fte: x.fte })),
    lines, payments: e.payrollDocs.filter(d => d.kind === 'PAYMENT').map(d => ({ period: d.period, amount: n(d.amount) })),
    perEmeCap, approved: Number(e.amount),
  })
  const byEmp = new Map(s.employees.map(x => [x.id, x]))
  const grid = new Map<string, number>()
  for (const l of lines) if (byEmp.has(l.employeeId)) grid.set(`${l.employeeId}|${l.period}`, (grid.get(`${l.employeeId}|${l.period}`) ?? 0) + l.gross + l.employerContrib)
  return {
    expenseId, approved: Number(e.amount), perEmeCap,
    employees: e.payrollEmployees.map(x => {
      const own = byEmp.get(x.id)
      const all = lines.filter(l => l.employeeId === x.id)
      return {
        id: x.id, name: x.name, afm: x.afm, hiredAt: x.hiredAt?.toISOString().slice(0, 10) ?? null, projectHire: x.projectHire, fte: x.fte,
        months: own?.months ?? new Set(all.map(l => l.period)).size,
        cost: own?.cost ?? Math.round(all.reduce((a, l) => a + l.gross + l.employerContrib, 0) * 100) / 100,
        cap: own?.cap ?? null, eligible: own?.eligible ?? 0, missing: own?.missing ?? [],
      }
    }),
    grid: [...grid].map(([k, cost]) => { const [employeeId, p] = k.split('|'); return { employeeId, period: p, cost: Math.round(cost * 100) / 100 } }),
    periods: s.periods,
    summary: { cost: s.cost, eligible: s.eligible, paidCost: s.paidCost },
    docs: e.payrollDocs.map(d => ({
      id: d.id, kind: d.kind as PayrollDocKind, name: d.name, amount: n(d.amount), paidAt: d.paidAt?.toISOString().slice(0, 10) ?? null,
      period: d.period, note: d.note, readError: d.readError, lines: d._count.lines,
    })),
  }
}

/** Ανέβασμα εγγράφου μισθοδοσίας + ανάγνωση ανάλογα με το είδος. */
export async function uploadPayrollDoc(expenseId: string, kind: PayrollDocKind, file: FileIn): Promise<{ ok: true; note: string; view: PayrollView } | { ok: false; message: string }> {
  const { session, app } = await requireExpenseAccess(expenseId)
  try {
    const body = Buffer.from(file.base64, 'base64')
    const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
    const key = `payroll/${expenseId}/${crypto.randomUUID()}.${ext}`
    await bunnyUploadPrivate({ key, body, contentType: file.mimeType || 'application/octet-stream' })
    const { recordFileHash } = await import('@/lib/import/existing')
    await recordFileHash({ key, body, trdrId: app.trdrId, kind: 'purchase', label: `Μισθοδοσία: ${file.name}`, ref: expenseId })
    const { docId, note } = await ingestPayrollDocCore({ expenseId, kind, file: { key, name: file.name, mime: file.mimeType, base64: file.base64 }, userId: session.user.id })
    await logActivity('expense.payroll', { entityType: 'expense', entityId: expenseId, userId: session.user.id, meta: { kind, docId } })
    return { ok: true, note, view: await loadPayroll(expenseId) }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.' }
  }
}

/** Σήμανση νέου εργαζόμενου του έργου / ποσοστό απασχόλησης. */
export async function updatePayrollEmployee(employeeId: string, input: { projectHire?: boolean; fte?: number }): Promise<PayrollView> {
  const emp = await prisma.payrollEmployee.findUnique({ where: { id: employeeId }, select: { expenseId: true } })
  if (!emp) notFound()
  await requireExpenseAccess(emp.expenseId)
  await prisma.payrollEmployee.update({
    where: { id: employeeId },
    data: { ...(input.projectHire !== undefined ? { projectHire: input.projectHire } : {}), ...(input.fte !== undefined ? { fte: Math.min(1, Math.max(0.05, input.fte)) } : {}) },
  })
  return loadPayroll(emp.expenseId)
}

/** Διόρθωση πληρωμής (ποσό/ημερομηνία/μήνας). */
export async function updatePayrollPayment(docId: string, input: { amount: number | null; paidAt: string | null; period: string | null }): Promise<PayrollView> {
  const d = await prisma.payrollDoc.findUnique({ where: { id: docId }, select: { expenseId: true } })
  if (!d) notFound()
  await requireExpenseAccess(d.expenseId)
  await prisma.payrollDoc.update({ where: { id: docId }, data: { amount: input.amount, paidAt: toDate(input.paidAt), period: input.period && /^\d{4}-\d{2}$/.test(input.period) ? input.period : null, readError: null } })
  return loadPayroll(d.expenseId)
}

/** Διαγραφή εγγράφου (και των γραμμών μισθοδοσίας που προήλθαν από αυτό). */
export async function deletePayrollDoc(docId: string): Promise<PayrollView> {
  const d = await prisma.payrollDoc.findUnique({ where: { id: docId }, select: { expenseId: true } })
  if (!d) notFound()
  const { session } = await requireExpenseAccess(d.expenseId)
  await prisma.payrollDoc.delete({ where: { id: docId } })
  // Εργαζόμενοι χωρίς γραμμές που δεν είναι νέοι του έργου → φεύγουν (ήρθαν μόνο από αυτή τη μισθοδοτική).
  await prisma.payrollEmployee.deleteMany({ where: { expenseId: d.expenseId, projectHire: false, lines: { none: {} } } })
  await logActivity('expense.payroll', { entityType: 'expense', entityId: d.expenseId, userId: session.user.id, meta: { deleted: docId } })
  return loadPayroll(d.expenseId)
}
