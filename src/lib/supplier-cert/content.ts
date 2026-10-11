// src/lib/supplier-cert/content.ts — ISOMORPHIC (χωρίς prisma/react): περιεχόμενο της «Βεβαίωσης προμηθευτή».
//
// Η διατύπωση καλύπτει ΤΑΥΤΟΧΡΟΝΑ τις απαιτήσεις όλων των οδηγών που έχουμε (ΕΣΠΑ περιφερειακά, ΕΣΔΙΜ,
// Αναπτυξιακός Αγροδιατροφή/Διπλή Χρήση, HORIZON, ΚΑΠ Σχέδια Βελτίωσης): καινούργιο ΚΑΙ αμεταχείριστο, σύγχρονης
// τεχνολογίας, μη παρακράτηση κυριότητας, αναλυτική αναφορά στα είδη με σειριακούς αριθμούς όπου υπάρχουν (ιδίως
// όταν δεν αναγράφονται στο τιμολόγιο), αντιστοιχία με το τιμολόγιο, σφραγίδα & υπογραφή προμηθευτή.
// Η εξόφληση ΔΕΝ μπαίνει αυτόματα (ψευδής δήλωση αν δεν έχει εξοφληθεί) — μόνο με ρητή επιλογή.

export type CertItem = { code: string; description: string; quantity: string; unit: string; serial: string }
export type CertParty = { name: string; afm: string; doy: string; address: string }

export type CertData = {
  supplier: CertParty
  buyer: CertParty
  programTitle: string
  invoiceNumber: string
  invoiceDate: string // YYYY-MM-DD
  items: CertItem[]
  place: string
  /** Προαιρετικές δηλώσεις (μόνο όταν ισχύουν). */
  paid: { enabled: boolean; amount: string; date: string; method: string }
  vehicle: { enabled: boolean; vin: string }
  software: boolean
  /** Εκδότης: προμηθευτής ή οίκος κατασκευής (δεκτό σε ΕΣΔΙΜ/Καινοτομώ). */
  issuerRole: 'supplier' | 'manufacturer'
}

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export type CertParagraphs = {
  title: string
  subtitle: string
  intro: string
  verb: string
  sale: string
  declarationsLead: string
  declarations: string[]
  noSerialNote: string | null
  closing: string
}

/** Το κείμενο της βεβαίωσης (ίδιο σε PDF και στη σελίδα υπογραφής). `signer` = όπως τα συμπληρώνει ο προμηθευτής. */
export function certParagraphs(d: CertData, signer: { name?: string | null; title?: string | null } = {}): CertParagraphs {
  const who = d.issuerRole === 'manufacturer' ? 'Ο οίκος κατασκευής' : 'Η εταιρεία'
  const rep = signer.name?.trim()
    ? `, νόμιμα εκπροσωπούμενη από τον/την ${signer.name.trim()}${signer.title?.trim() ? `, ${signer.title.trim()}` : ''}`
    : ''
  const supplierBits = [`ΑΦΜ ${d.supplier.afm || '—'}`, d.supplier.doy ? `ΔΟΥ ${d.supplier.doy}` : null, d.supplier.address ? `έδρα ${d.supplier.address}` : null].filter(Boolean).join(', ')
  const buyerBits = [`ΑΦΜ ${d.buyer.afm || '—'}`, d.buyer.address || null].filter(Boolean).join(', ')
  const declarations = [
    'Όλα τα ανωτέρω είδη είναι καινούργια, σύγχρονης τεχνολογίας και αμεταχείριστα· δεν έχουν χρησιμοποιηθεί ποτέ και δεν πρόκειται για μεταχειρισμένα ή ανακατασκευασμένα είδη.',
    'Δεν υφίσταται παρακράτηση κυριότητας ή οποιοδήποτε άλλο βάρος ή επιφύλαξη υπέρ του προμηθευτή ή τρίτου· η κυριότητα έχει μεταβιβαστεί πλήρως στην αγοράστρια επιχείρηση.',
    'Οι σειριακοί αριθμοί του πίνακα είναι οι πραγματικοί αριθμοί των ειδών που παραδόθηκαν και, μαζί με τις περιγραφές, αντιστοιχούν πλήρως στα είδη του ανωτέρω τιμολογίου.',
  ]
  if (d.vehicle.enabled) {
    declarations.push(`Το όχημα με αριθμό πλαισίου (VIN) ${d.vehicle.vin || '—'} είναι καινούργιο, δεν είχε ταξινομηθεί πριν την πώληση και δεν υφίσταται παρακράτηση κυριότητας ούτε σχετική σημείωση στην άδεια κυκλοφορίας.`)
  }
  if (d.software) {
    declarations.push('Οι άδειες χρήσης λογισμικού είναι νέες και η αγοράστρια επιχείρηση είναι νόμιμη κάτοχος των αδειών χρήσης.')
  }
  if (d.paid.enabled) {
    declarations.push(`Το ανωτέρω τιμολόγιο${d.paid.amount ? ` ποσού ${d.paid.amount} €` : ''} έχει εξοφληθεί ολοσχερώς${d.paid.date ? ` στις ${fmtDate(d.paid.date)}` : ''}${d.paid.method ? ` με ${d.paid.method}` : ''}.`)
  }
  const anyNoSerial = d.items.some(i => !i.serial.trim())
  return {
    title: 'ΒΕΒΑΙΩΣΗ ΠΡΟΜΗΘΕΥΤΗ',
    subtitle: 'καινούργιου – αμεταχείριστου – μη παρακράτησης κυριότητας',
    intro: `${who} ${d.supplier.name || '—'}, ${supplierBits}${rep},`,
    verb: 'ΒΕΒΑΙΩΝΕΙ',
    sale: `ότι με το υπ’ αριθμ. ${d.invoiceNumber || '—'} τιμολόγιο της ${fmtDate(d.invoiceDate)} πώλησε και παρέδωσε στην επιχείρηση ${d.buyer.name || '—'}, ${buyerBits}${d.programTitle ? `, στο πλαίσιο του επενδυτικού σχεδίου που υλοποιεί στο πρόγραμμα «${d.programTitle}»` : ''}, τα κάτωθι είδη:`,
    declarationsLead: 'και δηλώνει υπεύθυνα ότι:',
    declarations,
    noSerialNote: anyNoSerial ? 'Για τα είδη με ένδειξη «—» δεν υφίσταται σειριακός αριθμός από τον κατασκευαστή.' : null,
    closing: 'Η παρούσα χορηγείται για κάθε νόμιμη χρήση και ειδικότερα για την υποβολή της στον αρμόδιο Ενδιάμεσο Φορέα / Υπηρεσία στο πλαίσιο της επαλήθευσης του ανωτέρω προγράμματος.',
  }
}
