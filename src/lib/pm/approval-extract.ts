import { parseJsonLoose } from '@/lib/ocr/extract'

/**
 * (Plain module — worker/scripts.) Ανάγνωση εγκριτικής απόφασης / «Αποτελεσμάτων Αξιολόγησης» ΟΠΣΚΕ με AI.
 * Τα actions (approval.ts) την καλούν μετά από έλεγχο δικαιωμάτων.
 */

export type ApprovalExpense = {
  categoryCode: string | null
  category: string | null
  subcategoryCode: string | null
  subcategory: string | null
  title: string
  description: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  net: number
  vat: number | null
  gross: number | null
  eligible: number | null
  publicAmount: number | null
  aidPct: number | null
}
export type ApprovalIndicator = { code: string; description: string; value: string }
export type ApprovalExtract = {
  applicationCode: string | null
  beneficiaryCode: string | null
  beneficiaryAfm: string | null
  beneficiaryName: string | null
  submittedAt: string | null
  decisionRef: string | null
  ada: string | null
  decisionDate: string | null
  resultStatus: string | null
  projectTitle: string | null
  durationMonths: number | null
  regionCategory: string | null
  score: number | null
  totalBudget: number | null
  publicAmount: number | null
  privateAmount: number | null
  aidPct: number | null
  expenses: ApprovalExpense[]
  indicators: ApprovalIndicator[]
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[€%\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null)
/** «21/02/2024» ή «2024-02-21» → «2024-02-21». */
const isoDate = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

export async function extractApproval(file: { base64: string; mimeType: string }, ref: { applicationId: string; userId: string }): Promise<ApprovalExtract> {
  const { geminiGenerate } = await import('@/lib/gemini')
  const system = [
    'Διαβάζεις ελληνικό έγγραφο ΕΓΚΡΙΣΗΣ επενδυτικού σχεδίου ΕΣΠΑ («Αποτελέσματα Αξιολόγησης» ΟΠΣΚΕ / εγκριτική απόφαση ένταξης).',
    'Εξήγαγε ΜΟΝΟ ό,τι αναγράφεται (αλλιώς null):',
    'applicationCode = «Κωδικός Αίτησης Χρηματοδότησης» (π.χ. ΑΝΤ05ΠΠΕ-0010621)· beneficiaryCode = «Κωδικός Δικαιούχου»· beneficiaryAfm/beneficiaryName = ΑΦΜ/επωνυμία δικαιούχου·',
    'submittedAt = ημ. υποβολής αίτησης· decisionRef = «Εγκριτική Απόφαση» χωρίς το ΑΔΑ (π.χ. «Α.Π.: 818/21.02.2024»)· ada = ΑΔΑ· decisionDate = ημ. εγκριτικής απόφασης· resultStatus = κατάσταση αποτελέσματος (π.χ. «Έγκριση - Χρηματοδότηση»)·',
    'projectTitle = τίτλος πράξης· durationMonths = χρονοδιάγραμμα υλοποίησης σε μήνες· regionCategory = κωδικός κατηγορίας περιφέρειας· score = συνολική βαθμολογία κριτηρίων·',
    'totalBudget = συνολικός επιλέξιμος/επιχορηγούμενος προϋπολογισμός· publicAmount = δημόσια δαπάνη (επιχορήγηση)· privateAmount = ιδιωτική συμμετοχή· aidPct = ποσοστό ενίσχυσης %.',
    'expenses = ΚΑΘΕ γραμμή του «Αναλυτικού Πίνακα Δαπανών»: categoryCode, category, subcategoryCode, subcategory, title (Τίτλος Δαπάνης), description (Περιγραφή), quantity, unit, unitPrice, net (σύνολο χωρίς ΦΠΑ), vat, gross, eligible (επιλέξιμη), publicAmount (δημόσια δαπάνη), aidPct.',
    'indicators = οι «Δείκτες»: code, description, value (κείμενο).',
    'Ημερομηνίες YYYY-MM-DD, ποσά αριθμοί με τελεία δεκαδικών. ΑΥΣΤΗΡΑ JSON με αυτά τα κλειδιά.',
  ].join(' ')
  const res = await geminiGenerate({
    parts: [{ inlineData: { data: file.base64, mimeType: file.mimeType } }, { text: 'Εξήγαγε τα στοιχεία έγκρισης.' }],
    systemInstruction: system, json: true, scope: 'OCR_VISION', refType: 'approval-read', refId: ref.applicationId, userId: ref.userId,
  })
  const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
  const expenses: ApprovalExpense[] = (Array.isArray(p.expenses) ? (p.expenses as Record<string, unknown>[]) : []).map(e => ({
    categoryCode: str(e.categoryCode), category: str(e.category), subcategoryCode: str(e.subcategoryCode), subcategory: str(e.subcategory),
    title: str(e.title) ?? str(e.subcategory) ?? str(e.description) ?? 'Δαπάνη',
    description: str(e.description), quantity: num(e.quantity), unit: str(e.unit), unitPrice: num(e.unitPrice),
    net: num(e.net) ?? num(e.eligible) ?? 0, vat: num(e.vat), gross: num(e.gross), eligible: num(e.eligible), publicAmount: num(e.publicAmount), aidPct: num(e.aidPct),
  })).filter(e => e.net > 0)
  const indicators: ApprovalIndicator[] = (Array.isArray(p.indicators) ? (p.indicators as Record<string, unknown>[]) : [])
    .map(i => ({ code: str(i.code) ?? '', description: str(i.description) ?? '', value: String(i.value ?? '').trim() }))
    .filter(i => i.code || i.description)
  const dur = num(p.durationMonths)
  return {
    applicationCode: str(p.applicationCode), beneficiaryCode: str(p.beneficiaryCode),
    beneficiaryAfm: str(p.beneficiaryAfm)?.replace(/\D/g, '').slice(0, 9) || null, beneficiaryName: str(p.beneficiaryName),
    submittedAt: isoDate(p.submittedAt), decisionRef: str(p.decisionRef), ada: str(p.ada), decisionDate: isoDate(p.decisionDate),
    resultStatus: str(p.resultStatus), projectTitle: str(p.projectTitle), durationMonths: dur != null ? Math.round(dur) : null,
    regionCategory: str(p.regionCategory), score: num(p.score),
    totalBudget: num(p.totalBudget) ?? (expenses.length ? Math.round(expenses.reduce((a, e) => a + (e.eligible ?? e.net), 0) * 100) / 100 : null),
    publicAmount: num(p.publicAmount), privateAmount: num(p.privateAmount), aidPct: num(p.aidPct),
    expenses, indicators,
  }
}
