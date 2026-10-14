/**
 * (Plain module.) Μισθολογικό κόστος έργου: κόστος = μικτές αποδοχές + εργοδοτικές εισφορές, ΜΟΝΟ για τους νέους
 * εργαζόμενους του έργου, με το όριο του προγράμματος ανά ΕΜΕ (π.χ. «1 ΕΜΕ max 15.000€») και το εγκεκριμένο ποσό.
 * Οι πληρωμές μισθοδοσίας είναι για ΟΛΗ την εταιρία → συγκρίνονται με τα καθαρά πληρωτέα όλων, ανά μήνα.
 */

export type CalcEmployee = { id: string; name: string; projectHire: boolean; fte: number }
export type CalcLine = { employeeId: string; period: string; kind: string; gross: number; employerContrib: number; net: number | null }
export type CalcPayment = { period: string | null; amount: number | null }

export type EmployeeSummary = { id: string; months: number; cost: number; cap: number | null; eligible: number; /** Μήνες χωρίς μισθοδοσία ανάμεσα στον πρώτο και τον τελευταίο. */ missing: string[] }
export type PeriodSummary = { period: string; hireCost: number; netDue: number; paid: number; status: 'PAID' | 'PARTIAL' | 'UNPAID' }
export type PayrollSummary = {
  perEmeCap: number | null
  employees: EmployeeSummary[]
  periods: PeriodSummary[]
  cost: number
  eligible: number
  /** Κόστος νέων εργαζομένων σε μήνες που έχουν εξοφληθεί (αναλογικά). */
  paidCost: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Μήνες (YYYY-MM) από `from` έως `to` που λείπουν από το `have`. */
function gaps(from: string, to: string, have: Set<string>): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  for (let guard = 0; guard < 120; guard++) {
    const p = `${y}-${String(m).padStart(2, '0')}`
    if (p > to) break
    if (!have.has(p)) out.push(p)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

/** Όριο ανά ΕΜΕ από τις σημειώσεις της κατηγορίας («1 ΕΜΕ max 15.000€, 2 ΕΜΕ max 30.000€…»). */
export function perEmeCapFrom(notes: string | null | undefined): number | null {
  const m = (notes ?? '').match(/(\d+)\s*ΕΜΕ\D{0,20}?([\d.]+(?:,\d+)?)\s*€/i)
  if (!m) return null
  const n = Number(m[1])
  const amount = Number(m[2].replace(/\./g, '').replace(',', '.'))
  return n > 0 && Number.isFinite(amount) ? amount / n : null
}

export function summarizePayroll(input: { employees: CalcEmployee[]; lines: CalcLine[]; payments: CalcPayment[]; perEmeCap: number | null; approved: number }): PayrollSummary {
  const hires = new Map(input.employees.filter(e => e.projectHire).map(e => [e.id, e]))
  const employees: EmployeeSummary[] = input.employees.filter(e => e.projectHire).map(e => {
    const own = input.lines.filter(l => l.employeeId === e.id)
    const cost = r2(own.reduce((a, l) => a + l.gross + l.employerContrib, 0))
    const cap = input.perEmeCap != null ? r2(input.perEmeCap * (e.fte || 1)) : null
    const ps = [...new Set(own.map(l => l.period))].sort()
    return { id: e.id, months: ps.length, cost, cap, eligible: cap != null ? Math.min(cost, cap) : cost, missing: ps.length ? gaps(ps[0], ps[ps.length - 1], new Set(ps)) : [] }
  })

  const periods = [...new Set(input.lines.map(l => l.period))].sort().map(period => {
    const ls = input.lines.filter(l => l.period === period)
    const netDue = r2(ls.reduce((a, l) => a + (l.net ?? 0), 0))
    const hireCost = r2(ls.filter(l => hires.has(l.employeeId)).reduce((a, l) => a + l.gross + l.employerContrib, 0))
    const paid = r2(input.payments.filter(p => p.period === period).reduce((a, p) => a + (p.amount ?? 0), 0))
    const status: PeriodSummary['status'] = paid <= 0 ? 'UNPAID' : netDue > 0 && paid + 0.01 < netDue ? 'PARTIAL' : 'PAID'
    return { period, hireCost, netDue, paid, status }
  })

  const cost = r2(employees.reduce((a, e) => a + e.cost, 0))
  const eligible = r2(Math.min(employees.reduce((a, e) => a + e.eligible, 0), input.approved > 0 ? input.approved : Infinity))
  const paidCost = r2(periods.reduce((a, p) => a + (p.netDue > 0 ? p.hireCost * Math.min(1, p.paid / p.netDue) : 0), 0))
  return { perEmeCap: input.perEmeCap, employees, periods, cost, eligible, paidCost: Math.min(paidCost, eligible) }
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/**
 * Ίδιο πρόσωπο; ΑΦΜ αν υπάρχει και στα δύο· αλλιώς ίδιες λέξεις ονόματος (σειρά αδιάφορη) με ανοχή μικρών διαφορών
 * ορθογραφίας/OCR ανά λέξη (π.χ. «ΓΚΑΡΑΖΑΧΟΣ» ↔ «ΚΑΡΑΖΑΧΟΣ»).
 */
export function samePerson(a: { name: string; afm?: string | null }, b: { name: string; afm?: string | null }): boolean {
  const da = a.afm?.replace(/\D/g, ''), db = b.afm?.replace(/\D/g, '')
  if (da && db) return da === db
  const A = fold(a.name).split(' ').filter(w => w.length > 1).sort()
  const B = fold(b.name).split(' ').filter(w => w.length > 1).sort()
  if (!A.length || A.length !== B.length) return false
  if (A.join(' ') === B.join(' ')) return true
  // Κάθε λέξη του A ταιριάζει με διαφορετική λέξη του B (απόσταση ≤ 1, ή ≤ 2 για λέξεις ≥ 8 γραμμάτων).
  const used = new Set<number>()
  return A.every(w => {
    const j = B.findIndex((v, k) => !used.has(k) && lev(w, v) <= (Math.min(w.length, v.length) >= 7 ? 2 : 1))
    if (j < 0) return false
    used.add(j)
    return true
  })
}

/** «Προκαταβολή Νοέμβριος 2023» → 2023-11 (από όνομα αρχείου/αιτιολογία). */
const MONTHS = ['ιαν', 'φεβ', 'μαρ', 'απρ', 'μαι', 'ιουν', 'ιουλ', 'αυγ', 'σεπ', 'οκτ', 'νοε', 'δεκ']
export function periodFromText(t: string): string | null {
  const f = fold(t)
  const y = f.match(/\b(20\d{2})\b/)?.[1]
  if (!y) return null
  // «ιουν» πριν το «ιουλ»/«ιαν» — ψάχνουμε το μακρύτερο ταίριασμα πρώτα.
  const order = MONTHS.map((m, i) => ({ m, i })).sort((a, b) => b.m.length - a.m.length)
  // `\b` δεν αναγνωρίζει ελληνικά γράμματα → αρχή λέξης = αρχή κειμένου ή κενό.
  const hit = order.find(({ m }) => new RegExp(`(^|\\s)${m}`).test(f))
  return hit ? `${y}-${String(hit.i + 1).padStart(2, '0')}` : null
}
