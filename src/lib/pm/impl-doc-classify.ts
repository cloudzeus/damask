/**
 * (Plain module.) Γνώση γραφείου για τον φάκελο ΥΛΟΠΟΙΗΣΗΣ ενός έργου ΕΣΠΑ: τι ρόλο παίζει κάθε αρχείο.
 *
 * Πώς οργανώνεται συνήθως (π.χ. «Α ΔΟΣΗ - ΤΕΛΙΚΗ/…/2.1 - NETSCOPE/ΤΔΑ 14759/»): ένας φάκελος ανά παραστατικό με το
 * ίδιο το παραστατικό (ΤΔΑ/ΤΠΥ/τιμολόγιο), τις πληρωμές («Πληρωμή (1) - 4.000», εξτρέ), τη βεβαίωση προμηθευτή, τις
 * λογιστικές εγγραφές («Γεν. Ημερολόγιο», «ΚΑΡΤΕΛΑ» προμηθευτή) και φωτογραφίες εξοπλισμού/σειριακών· και ένας φάκελος
 * προσωπικού με μισθοδοτικές, αναγγελίες πρόσληψης, πληρωμές μισθοδοσίας, ΑΠΔ/e-ΕΦΚΑ.
 * Κανόνες με σειρά προτεραιότητας: μισθοδοσία → βεβαίωση → πληρωμή → λογιστική → φωτογραφία → παραστατικό → λοιπά.
 */

export type ImplDocRole =
  | 'INVOICE' | 'PAYMENT' | 'SUPPLIER_CERT' | 'ACCOUNTING' | 'PHOTO'
  | 'PAYSLIPS' | 'HIRING' | 'PAYROLL_PAYMENT' | 'PAYROLL_OTHER'
  | 'APPROVAL' | 'OTHER'

export const ROLE_LABEL: Record<ImplDocRole, string> = {
  INVOICE: 'Παραστατικό', PAYMENT: 'Πληρωμή / εξτρέ', SUPPLIER_CERT: 'Βεβαίωση προμηθευτή', ACCOUNTING: 'Λογιστική εγγραφή',
  PHOTO: 'Φωτογραφία εξοπλισμού', PAYSLIPS: 'Μισθοδοτική κατάσταση', HIRING: 'Αναγγελία πρόσληψης',
  PAYROLL_PAYMENT: 'Πληρωμή μισθοδοσίας', PAYROLL_OTHER: 'Λοιπά προσωπικού (ΑΠΔ/e-ΕΦΚΑ)', APPROVAL: 'Εγκριτική', OTHER: 'Λοιπό',
}

export type ClassifyInput = {
  fileName: string
  relPath?: string | null
  mimeType?: string | null
  /** Ήδη διαβασμένο (μαζική εισαγωγή): τύπος & εκδότης. */
  docType?: string | null
  issuerName?: string | null
  issuerAfm?: string | null
  gross?: number | null
  /** Ο δικαιούχος του έργου (για να αναγνωριστούν οι δικές του λογιστικές εγγραφές). */
  beneficiaryName?: string | null
  beneficiaryAfm?: string | null
  /** Ρόλος που έδωσε ήδη η μαζική εισαγωγή (π.χ. APPROVAL). */
  inboxKind?: string | null
}

export const foldText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9.]+/g, ' ').trim()
const has = (t: string, re: RegExp) => re.test(t)
const BANK = /τραπεζ|bank|eurobank|πειραι|alpha|εθνικη|optima|viva|attica|παγκρητ/

export function classifyImplDoc(x: ClassifyInput): ImplDocRole {
  const name = foldText(x.fileName)
  // Ο φάκελος «ΕΓΚΡΙΣΗ» περιέχει και συμβάσεις/τιμολόγιο συμβούλου — εγκριτική είναι μόνο το ίδιο το έγγραφο απόφασης.
  if (x.inboxKind === 'APPROVAL' && /proposal|εγκρισ|αποφασ|αποτελεσματ/.test(name)) return 'APPROVAL'
  if (/συμβασ|υπ\.? ?δ\.?|υπευθυν/.test(name)) return 'OTHER'
  const path = foldText(x.relPath ?? '')
  const all = `${path} ${name}`
  const issuer = foldText(x.issuerName ?? '')
  const ext = (x.fileName.split('.').pop() ?? '').toLowerCase()

  // Προσωπικό / μισθοδοσία
  if (has(name, /μισθοδοτικ/)) return 'PAYSLIPS'
  if (has(name, /αναγγ|προσληψ/)) return 'HIRING'
  const payrollArea = has(path, /προσωπικ|μισθοδοσ|μισθολογ/)
  if (payrollArea && has(name, /πληρωμ|προκαταβολ|εξοφλησ|extrait|εξτρε/)) return 'PAYROLL_PAYMENT'
  if (payrollArea || has(name, /(^|\s)απδ(\s|$)|εφκα|ενσημ|(^|\s)ε4(\s|$)/)) return 'PAYROLL_OTHER'
  // Λογιστικές εγγραφές με ρητό όνομα — πριν από «πληρωμ» (π.χ. «ΛΟΓ. ΕΓΓ TIM 16019 ΚΑΙ ΠΛΗΡΩΜΕΣ»).
  if (has(name, /ημερολογ|γεν\.? ?ημερ|γενικο ημερ|καρτελα|λογ\.? ?εγγ|αρθρο/)) return 'ACCOUNTING'

  // Παραστατικό & συνοδευτικά
  if (has(name, /βεβαιωσ/) && !has(name, /υποδειγμ/)) return 'SUPPLIER_CERT'
  if (has(name, /πληρωμ|extrait|εξτρε|αποδεικτικ|εμβασμ/) || (x.docType === 'receipt' && BANK.test(issuer)) || (BANK.test(issuer) && !has(name, /τδα|τπυ|τιμολογ/))) return 'PAYMENT'
  const own = (x.beneficiaryAfm && x.issuerAfm && x.beneficiaryAfm.replace(/\D/g, '') === x.issuerAfm.replace(/\D/g, ''))
    || (x.beneficiaryName && issuer && foldText(x.beneficiaryName).split(' ')[0] === issuer.split(' ')[0] && issuer.length > 2)
  if (own && !has(name, /τδα|τπυ|τιμολογ|παραστατικ/)) return 'ACCOUNTING'
  if (has(name, /φωτο|^img|signal |picture|^sn(\s|\d|\.|$)/) || x.docType === 'packing_list' || ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)) return 'PHOTO'
  if (['doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'].includes(ext)) return 'OTHER'
  if (has(name, /κατασταση|σχετ\.? ?παραστατ|δικαιολογητικ/)) return 'OTHER'
  if (has(all, /τδα|τπυ|τιμολογ|παραστατικ|(^|\s)απυ(\s|$)|(^|\s)τπ(\s|$)|invoice/) || (x.docType === 'invoice' && (x.gross ?? 0) > 0)) return 'INVOICE'
  return 'OTHER'
}

/** Ο αριθμός παραστατικού από όνομα αρχείου/φακέλου («ΤΔΑ 14759», «π1-16019», «ΤΠΥ-0000000179») → «14759». */
export function invoiceNumberHint(text: string): string | null {
  const m = text.match(/(?:τδα|τπυ|τιμ|π1|tim|απυ|αρ)[^0-9]{0,4}0*(\d{2,})/i)
  return m ? m[1] : null
}

/** Φάκελος του αρχείου (για ομαδοποίηση ανά παραστατικό). */
export function folderOf(relPath: string | null | undefined): string {
  const p = (relPath ?? '').replace(/\\/g, '/')
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : ''
}
