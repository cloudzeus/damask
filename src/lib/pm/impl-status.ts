import { prisma } from '@/lib/prisma'
import { isPayrollExpense, isIndirectExpense, indirectRate } from '@/lib/pm/invoice-match'
import { summarizePayroll, perEmeCapFrom } from '@/lib/pm/payroll-calc'

/**
 * (Plain module.) Κατάσταση τεκμηρίωσης υλοποίησης ανά εγκεκριμένη δαπάνη — για αποπληρωμές/αναφορές:
 *  · παραστατικά: «πλήρης» όταν υπάρχει ≥1 παραστατικό και ΟΛΑ ταιριάζουν (πληρωμές + βεβαίωση όπου χρειάζεται)·
 *    τεκμηριωμένο = καθαρή αξία των εξοφλημένων (OK) παραστατικών.
 *  · μισθολογικό κόστος: «πλήρης» όταν έχουν εξοφληθεί μήνες νέων εργαζομένων χωρίς ανοιχτούς μήνες·
 *    τεκμηριωμένο = εξοφλημένο κόστος εντός ορίου προγράμματος.
 * Τεκμηριωμένο ποτέ πάνω από το εγκεκριμένο.
 */

export type ImplDocStatus = {
  kind: 'invoices' | 'payroll' | 'indirect'
  hasDocs: boolean
  complete: boolean
  documented: number
  /** Σύντομη αιτία όταν δεν είναι πλήρης. */
  reason: string | null
}

const r2 = (v: number) => Math.round(v * 100) / 100

export async function implStatusFor(applicationId: string): Promise<Map<string, ImplDocStatus>> {
  const rows = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: {
      id: true, description: true, amount: true, category: { select: { name: true, notes: true } },
      application: { select: { approval: { select: { expenses: true } } } },
      invoices: { select: { netAmount: true, totalAmount: true, matchVerdict: true } },
      payrollEmployees: { include: { lines: true } },
      payrollDocs: { where: { kind: 'PAYMENT' }, select: { period: true, amount: true } },
    },
  })
  const out = new Map<string, ImplDocStatus>()
  const indirect = rows.filter(e => isIndirectExpense(e.category?.name ?? null, e.description))
  for (const e of rows) {
    const approved = Number(e.amount)
    if (indirect.includes(e)) continue
    if (isPayrollExpense(e.category?.name ?? null, e.description)) {
      const s = summarizePayroll({
        employees: e.payrollEmployees.map(x => ({ id: x.id, name: x.name, projectHire: x.projectHire, fte: x.fte })),
        lines: e.payrollEmployees.flatMap(x => x.lines.map(l => ({ employeeId: x.id, period: l.period, kind: l.kind, gross: Number(l.gross), employerContrib: Number(l.employerContrib), net: l.net == null ? null : Number(l.net) }))),
        payments: e.payrollDocs.map(d => ({ period: d.period, amount: d.amount == null ? null : Number(d.amount) })),
        perEmeCap: perEmeCapFrom(e.category?.notes), approved,
      })
      const open = s.periods.filter(p => p.status !== 'PAID').length
      const hasDocs = s.employees.length > 0 && s.periods.length > 0
      out.set(e.id, {
        kind: 'payroll', hasDocs, complete: hasDocs && s.paidCost > 0 && open === 0, documented: r2(Math.min(s.paidCost, approved)),
        reason: !hasDocs ? 'λείπει η μισθοδοσία' : open ? `${open} μήνες μισθοδοσίας χωρίς πλήρη πληρωμή` : null,
      })
      continue
    }
    const inv = e.invoices
    const ok = inv.filter(i => i.matchVerdict === 'OK')
    const notOk = inv.length - ok.length
    out.set(e.id, {
      kind: 'invoices', hasDocs: inv.length > 0, complete: inv.length > 0 && notOk === 0,
      documented: r2(Math.min(ok.reduce((a, i) => a + Number(i.netAmount ?? i.totalAmount ?? 0), 0), approved)),
      reason: !inv.length ? 'λείπουν παραστατικά' : notOk ? `${notOk} παραστατικά με εκκρεμότητα (πληρωμή/βεβαίωση)` : null,
    })
  }
  // Έμμεσες: κατ' αποκοπή ποσοστό επί των ΤΕΚΜΗΡΙΩΜΕΝΩΝ άμεσων δαπανών (χωρίς δικά τους παραστατικά).
  const direct = [...out.values()]
  const directDocumented = direct.reduce((a, s) => a + s.documented, 0)
  const directOpen = direct.filter(s => !s.complete).length
  for (const e of indirect) {
    const approvalText = JSON.stringify(e.application.approval?.expenses ?? '').match(/[^"]{0,80}(?:Έμμεσες|ΕΜΜΕΣΕΣ|έμμεσ)[^"]{0,120}/)?.[0]
    const rate = indirectRate(e.category?.notes, e.category?.name, e.description, approvalText)
    out.set(e.id, {
      kind: 'indirect', hasDocs: directDocumented > 0, complete: directDocumented > 0 && directOpen === 0,
      documented: r2(Math.min(directDocumented * rate, Number(e.amount))),
      reason: directOpen ? `υπολογίζεται ${Math.round(rate * 1000) / 10}% επί των άμεσων — ${directOpen} άμεσες δαπάνες με εκκρεμότητα` : null,
    })
  }
  return out
}
