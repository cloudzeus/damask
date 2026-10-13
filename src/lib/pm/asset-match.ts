/**
 * (Plain/isomorphic.) Διασταύρωση δαπάνης ↔ μητρώο παγίων. Το μητρώο συνήθως ΔΕΝ έχει αρ. παραστατικού,
 * οπότε συνδυάζονται: αρ. παραστατικού (αν υπάρχει) · ημερομηνία κτήσης ≈ ημ. τιμολογίου · αξία κτήσης ≈ καθαρό
 * ποσό (και άθροισμα ειδών ίδιας ημερομηνίας — ένα τιμολόγιο με πολλά είδη) · περιγραφή · σειριακός (S/N).
 */

export type AssetItem = { code: string | null; description: string; date: string | null; qty: number | null; value: number | null; docNo: string | null; serial: string | null }
export type ExpenseForMatch = {
  id: string
  description: string
  categoryName: string | null
  net: number
  invoiceNumber: string | null
  invoiceDate: string | null
  /** Περιγραφές/κωδικοί/σειριακοί από τις γραμμές του παραστατικού ή της δαπάνης. */
  lineTexts: string[]
  serials: string[]
}
export type AssetMatchStatus = 'OK' | 'AMOUNT_DIFF' | 'DATE_DIFF' | 'NOT_FOUND' | 'NO_INVOICE' | 'NOT_REQUIRED'
export type AssetMatch = { expenseId: string; status: AssetMatchStatus; items: AssetItem[]; reasons: string[]; registered: number | null }

/** Κατηγορίες που ΔΕΝ γίνονται πάγια (υπηρεσίες, προσωπικό, έμμεσες, προβολή, συμβουλευτική). */
export function assetRequired(categoryName: string | null, description: string): boolean {
  const f = fold(`${categoryName ?? ''} ${description}`)
  if (/προσωπικ|μισθολογ|εμμεσ|συμβουλευτ|παρακολουθησ|προβολ|εξωστρεφ|μελετ|πιστοποιησ|εκπαιδευσ|υπηρεσι|αμοιβ/.test(f)) return false
  return true
}

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()
}
const words = (s: string) => new Set(fold(s).split(' ').filter(w => w.length > 2 && !/^\d+$/.test(w)))
function overlap(a: string, b: string) {
  const A = words(a), B = words(b)
  if (!A.size || !B.size) return 0
  let h = 0
  for (const w of A) if (B.has(w)) h++
  return h / Math.min(A.size, B.size)
}
const day = (iso: string | null) => (iso ? Math.round(Date.parse(iso.slice(0, 10)) / 864e5) : null)
const close = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * tol)
const normDoc = (s: string | null) => (s ?? '').replace(/[^0-9a-zα-ω]/gi, '').replace(/^0+/, '').toLowerCase()

export function matchExpenseToAssets(e: ExpenseForMatch, items: AssetItem[], used: Set<AssetItem> = new Set()): AssetMatch {
  if (!assetRequired(e.categoryName, e.description)) return { expenseId: e.id, status: 'NOT_REQUIRED', items: [], reasons: ['Η κατηγορία δεν καταχωρείται ως πάγιο.'], registered: null }
  const inv = day(e.invoiceDate)
  const text = [e.description, ...e.lineTexts].join(' ')
  const free = items.filter(i => !used.has(i))

  // 1. Ρητός αρ. παραστατικού ή σειριακός.
  const byDoc = e.invoiceNumber ? free.filter(i => i.docNo && normDoc(i.docNo) === normDoc(e.invoiceNumber)) : []
  // Σειριακός: στη στήλη S/N ή μέσα στην περιγραφή του παγίου (π.χ. «DELL Server … S/N 9BL1YK2»).
  const bySerial = e.serials.length ? free.filter(i => e.serials.some(sn => fold(`${i.serial ?? ''} ${i.description}`).includes(fold(sn)))) : []
  let picked = byDoc.length ? byDoc : bySerial

  // 2. Ίδια ημερομηνία (±7 ημέρες) + αξία· ένα είδος ή άθροισμα ειδών της ίδιας ημερομηνίας.
  if (!picked.length && inv != null) {
    const near = free.filter(i => { const d = day(i.date); return d != null && Math.abs(d - inv) <= 7 })
    const single = near.filter(i => i.value != null && close(i.value, e.net)).sort((a, b) => overlap(text, b.description) - overlap(text, a.description))[0]
    if (single) picked = [single]
    else {
      const byDate = new Map<string, AssetItem[]>()
      for (const i of near) byDate.set(i.date!, [...(byDate.get(i.date!) ?? []), i])
      for (const group of byDate.values()) {
        if (close(group.reduce((a, i) => a + (i.value ?? 0), 0), e.net)) { picked = group; break }
      }
      if (!picked.length) {
        // Ίδιο είδος (περιγραφή) κοντά στην ημερομηνία, ακόμη και με διαφορετική αξία.
        const desc = near.map(i => ({ i, s: overlap(text, i.description) })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s)
        if (desc.length) picked = [desc[0].i]
      }
    }
  }
  // 3. Χωρίς ημ. τιμολογίου: μόνο ισχυρό ταίριασμα περιγραφής + αξίας.
  if (!picked.length) {
    const strong = free.filter(i => i.value != null && close(i.value, e.net) && overlap(text, i.description) >= 0.5)
    if (strong.length === 1) picked = strong
  }

  if (!picked.length) {
    return { expenseId: e.id, status: e.invoiceNumber || e.invoiceDate ? 'NOT_FOUND' : 'NO_INVOICE', items: [], reasons: [e.invoiceNumber || e.invoiceDate ? 'Δεν βρέθηκε πάγιο με αντίστοιχη ημερομηνία/αξία/περιγραφή.' : 'Δεν έχει καταχωριστεί παραστατικό στη δαπάνη.'], registered: null }
  }
  picked.forEach(i => used.add(i))
  const registered = Math.round(picked.reduce((a, i) => a + (i.value ?? 0), 0) * 100) / 100
  const reasons: string[] = []
  let status: AssetMatchStatus = 'OK'
  if (!close(registered, e.net)) { status = 'AMOUNT_DIFF'; reasons.push(`Αξία κτήσης ${registered.toFixed(2)} € ≠ καθαρό ποσό δαπάνης ${e.net.toFixed(2)} €.`) }
  const dates = picked.map(i => day(i.date)).filter((d): d is number => d != null)
  if (inv != null && dates.some(d => Math.abs(d - inv) > 7)) { if (status === 'OK') status = 'DATE_DIFF'; reasons.push('Η ημερομηνία κτήσης απέχει από την ημερομηνία του τιμολογίου.') }
  if (byDoc.length) reasons.unshift('Ίδιος αρ. παραστατικού.')
  else if (bySerial.length) reasons.unshift('Ίδιος σειριακός αριθμός.')
  return { expenseId: e.id, status, items: picked, reasons, registered }
}

/** Διασταύρωση όλων των δαπανών (κάθε πάγιο αντιστοιχεί σε μία μόνο δαπάνη· πρώτα όσες έχουν αρ. παραστατικού). */
export function matchAll(expenses: ExpenseForMatch[], items: AssetItem[]): AssetMatch[] {
  const used = new Set<AssetItem>()
  const order = [...expenses].sort((a, b) => Number(!!b.invoiceNumber) - Number(!!a.invoiceNumber))
  const res = new Map(order.map(e => [e.id, matchExpenseToAssets(e, items, used)]))
  return expenses.map(e => res.get(e.id)!)
}
