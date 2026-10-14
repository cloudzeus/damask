/**
 * (Plain module.) Διασταύρωση παραστατικού υλοποίησης με τις πληρωμές του (αποδεικτικά/εξτρέ — μία ή περισσότερες δόσεις) και τη βεβαίωση προμηθευτή.
 * Δεν αποφασίζει επιλεξιμότητα — δείχνει στον σύμβουλο τι ταιριάζει και τι όχι, με λόγια.
 */

export type MatchVerdict = 'OK' | 'PARTIAL' | 'MISMATCH'

export type MatchInput = {
  invoice: { total: number | null; date: string | null; supplier: string | null; supplierAfm: string | null; number: string | null }
  payments: { amount: number | null; date: string | null; payee: string | null }[]
  cert: { present: boolean; invoiceNumbers?: string[] | null; amount?: number | null } | null
}

export type MatchResult = { verdict: MatchVerdict | null; checks: { ok: boolean; text: string }[] }

/**
 * Χρειάζεται βεβαίωση προμηθευτή («καινούργιο – αμεταχείριστο – μη παρακράτηση κυριότητας»); Ναι για αγορές υλικών
 * αγαθών (εξοπλισμός/μηχανήματα/όργανα/οχήματα/λογισμικό)· όχι για μισθοδοσία, έμμεσες, υπηρεσίες, κτίρια.
 */
export function certNeededFor(category: string | null, description: string): boolean {
  const t = fold(`${category ?? ''} ${description}`)
  if (/μισθ|προσωπικ|εμμεσ|συμβουλ|υπηρεσι|προβολ|εξωστρεφ|μελετ|πιστοποιησ|εκθεσ|κτιρι|εγκαταστασεων/.test(t) && !/εξοπλισμ|μηχαν|οργαν/.test(t)) return false
  return /εξοπλισμ|μηχαν|οργαν|συσκευ|οχημ|μεταφορικ|λογισμικ|software|hardware|υπολογιστ|φωτοβολτα|green/.test(t)
}

/** Δαπάνη μισθολογικού κόστους (μισθοδοσία αντί για παραστατικά). */
export function isPayrollExpense(category: string | null, description: string): boolean {
  return /μισθ|προσωπικ|εργαζομεν/.test(fold(`${category ?? ''} ${description}`))
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()
const STOP = new Set(['ικε', 'επε', 'οε', 'εε', 'αε', 'μικε', 'ae', 'ike', 'ltd', 'και', 'the'])
function sameParty(a: string, b: string): boolean {
  const A = fold(a).split(' ').filter(w => w.length > 2 && !STOP.has(w))
  const B = new Set(fold(b).split(' ').filter(w => w.length > 2 && !STOP.has(w)))
  if (!A.length || !B.size) return false
  return A.filter(w => B.has(w)).length / Math.min(A.length, B.size) >= 0.5
}
const eur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const digits = (s: string) => s.replace(/\D/g, '')

export function matchInvoice({ invoice, payments, cert }: MatchInput): MatchResult {
  const checks: MatchResult['checks'] = []
  if (!payments.length) return { verdict: null, checks: [{ ok: false, text: 'Λείπει η πληρωμή — ανεβάστε το αποδεικτικό πληρωμής ή το εξτρέ.' }] }

  let hard = false // ασυμφωνία
  let soft = false // εκκρεμότητα / μερικό
  const known = payments.filter(p => p.amount != null)
  const paid = Math.round(known.reduce((a, p) => a + (p.amount ?? 0), 0) * 100) / 100
  const dosis = payments.length > 1 ? ` σε ${payments.length} πληρωμές` : ''

  if (known.length < payments.length) { soft = true; checks.push({ ok: false, text: `Σε ${payments.length - known.length} πληρωμή/ές δεν διαβάστηκε ποσό — συμπληρώστε το.` }) }
  if (invoice.total != null && known.length) {
    const diff = Math.round((paid - invoice.total) * 100) / 100
    if (Math.abs(diff) <= 0.01) checks.push({ ok: true, text: `Εξοφλήθηκε${dosis}: ${eur(paid)} — ίδιο με το παραστατικό.` })
    else if (diff < 0) { soft = true; checks.push({ ok: false, text: `Μερική εξόφληση${dosis}: ${eur(paid)} από ${eur(invoice.total)} (υπόλοιπο ${eur(-diff)}).` }) }
    else { hard = true; checks.push({ ok: false, text: `Οι πληρωμές (${eur(paid)}) ξεπερνούν το παραστατικό (${eur(invoice.total)}) — ίσως αφορούν και άλλα παραστατικά.` }) }
  } else if (invoice.total == null) { soft = true; checks.push({ ok: false, text: 'Δεν διαβάστηκε το σύνολο του παραστατικού — συμπληρώστε το.' }) }

  if (invoice.supplier) {
    const wrong = payments.filter(p => p.payee && !sameParty(p.payee, invoice.supplier!))
    if (wrong.length) { hard = true; checks.push({ ok: false, text: `Ο δικαιούχος πληρωμής («${wrong[0].payee}») δεν φαίνεται να είναι ο προμηθευτής «${invoice.supplier}».` }) }
    else if (payments.some(p => p.payee)) checks.push({ ok: true, text: `Ο δικαιούχος των πληρωμών είναι ο προμηθευτής (${invoice.supplier}).` })
  }

  const dates = payments.map(p => p.date).filter((d): d is string => !!d).sort()
  if (dates.length && invoice.date) {
    const last = Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(invoice.date)) / 86_400_000)
    const first = Math.round((Date.parse(dates[0]) - Date.parse(invoice.date)) / 86_400_000)
    if (!Number.isNaN(last)) {
      const span = dates.length > 1 ? `από ${new Date(dates[0]).toLocaleDateString('el-GR')} έως ${new Date(dates[dates.length - 1]).toLocaleDateString('el-GR')}` : `στις ${new Date(dates[0]).toLocaleDateString('el-GR')}`
      checks.push({ ok: true, text: `Πληρωμές ${span}${first < 0 ? ' (με προκαταβολή πριν το παραστατικό)' : ''}.` })
    }
  }

  if (cert) {
    if (!cert.present) { soft = true; checks.push({ ok: false, text: 'Λείπει η βεβαίωση προμηθευτή.' }) }
    else {
      // Ομάδες ψηφίων («16019/15-10-24» → 16019, 15, 10, 24): ταιριάζει αν κάποια ομάδα = ο αριθμός του παραστατικού.
      const groups = (cert.invoiceNumbers ?? []).flatMap(x => x.split(/\D+/)).map(g => g.replace(/^0+/, '')).filter(Boolean)
      const own = digits(invoice.number ?? '').replace(/^0+/, '')
      if (own && groups.length && !groups.includes(own) && !(cert.invoiceNumbers ?? []).some(x => digits(x).replace(/^0+/, '') === own)) { hard = true; checks.push({ ok: false, text: `Η βεβαίωση αναφέρει άλλο παραστατικό (${(cert.invoiceNumbers ?? []).join(', ')}).` }) }
      else if (cert.amount != null && invoice.total != null && Math.abs(cert.amount - invoice.total) > 0.01 && Math.abs(cert.amount - paid) > 0.01) { hard = true; checks.push({ ok: false, text: `Η βεβαίωση γράφει ${eur(cert.amount)} — διαφορετικό ποσό.` }) }
      else checks.push({ ok: true, text: 'Η βεβαίωση προμηθευτή υπάρχει και αναφέρεται στο παραστατικό.' })
    }
  }

  return { verdict: hard ? 'MISMATCH' : soft ? 'PARTIAL' : 'OK', checks }
}
