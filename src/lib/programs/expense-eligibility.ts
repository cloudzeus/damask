import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { bunnyDownload } from '@/lib/bunny-storage'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { getProgramKnowledge } from './references'

/**
 * (Plain module.) Αναλυτικός έλεγχος επιλεξιμότητας ΜΙΑΣ δαπάνης έναντι του οδηγού του προγράμματος.
 * Δουλεύει και με προσφορά (σχέδιο υποβολής) και με παραστατικό αγοράς (προγράμματα χωρίς προσφορές):
 * από το παραστατικό παίρνει ημερομηνία/προμηθευτή/ποσό — π.χ. αγορά πριν την υποβολή.
 * ΒΟΗΘΗΜΑ — ο διαχειριστής αποφασίζει.
 */

export type EligibilityCheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'UNKNOWN'
export type ExpenseEligibilityDetail = {
  verdict: 'ELIGIBLE' | 'INELIGIBLE' | 'UNCERTAIN'
  basis: 'QUOTE' | 'INVOICE' | 'DESCRIPTION'
  summary: string
  eligibleAmount: number | null
  checks: { rule: string; guideRef: string | null; status: EligibilityCheckStatus; explanation: string }[]
  conditions: string[]
  requiredDocuments: string[]
  suggestedCategory: string | null
  usedGuidePdf: boolean
  checkedAt: string
}

const GUIDE_MAX_BYTES = 18 * 1024 * 1024
// Ο οδηγός ξαναδιαβάζεται για κάθε δαπάνη («για όλες» = σειριακά) — μικρό cache στη μνήμη.
const guideCache = new Map<string, { at: number; buf: Buffer | null }>()
async function loadGuide(storageKey: string | null, size: number | null): Promise<Buffer | null> {
  if (!storageKey || (size ?? 0) > GUIDE_MAX_BYTES) return null
  const hit = guideCache.get(storageKey)
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.buf
  const buf = await bunnyDownload(storageKey).catch(() => null)
  guideCache.set(storageKey, { at: Date.now(), buf: buf && buf.length <= GUIDE_MAX_BYTES ? buf : null })
  return guideCache.get(storageKey)!.buf
}

const n = (v: unknown) => (v == null ? null : Number(v))
const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null)
const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const arr = (v: unknown) => (Array.isArray(v) ? v : [])

export async function assessExpenseEligibility(expenseId: string, opts: { userId?: string | null } = {}): Promise<ExpenseEligibilityDetail> {
  const exp = await prisma.programExpense.findUniqueOrThrow({
    where: { id: expenseId },
    select: {
      description: true, amount: true, vatAmount: true, date: true, vendor: true, vendorAfm: true, categoryId: true,
      quoteStorageKey: true, quoteName: true,
      lines: { orderBy: { order: 'asc' }, select: { product: true, description: true, quantity: true, unit: true, unitPrice: true, lineTotal: true } },
      supplier: { select: { NAME: true, AFM: true, kads: { select: { code: true, description: true, kind: true } } } },
      category: { select: { id: true, name: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true, mandatory: true } },
      purchase: { select: { invoiceKey: true, invoiceNumber: true, invoiceDate: true, paidAmount: true, ocrAmount: true, ocrSupplier: true, ocrDate: true, ocrNumber: true } },
      application: {
        select: {
          id: true, opskeSubmittedAt: true, createdAt: true, programId: true,
          trdr: { select: { NAME: true, AFM: true, appLegalForm: true, kads: { select: { code: true, description: true, kind: true }, take: 12 } } },
          program: {
            select: {
              title: true, eligibilityNote: true, submissionStart: true, submissionEnd: true, totalBudget: true, extractedData: true, storageKey: true, size: true,
              expenseCats: { select: { id: true, name: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true, mandatory: true } },
            },
          },
        },
      },
    },
  })
  const prog = exp.application.program

  // Ήδη δαπανημένα στην κατηγορία (χωρίς αυτή τη δαπάνη) + σύνολο σχεδίου — για τα όρια %/€.
  const siblings = await prisma.programExpense.findMany({
    where: { applicationId: exp.application.id, id: { not: expenseId } },
    select: { amount: true, categoryId: true },
  })
  const planTotal = siblings.reduce((a, s) => a + Number(s.amount), 0) + Number(exp.amount)
  const inCategory = siblings.filter(s => s.categoryId && s.categoryId === exp.categoryId).reduce((a, s) => a + Number(s.amount), 0)

  const basis: ExpenseEligibilityDetail['basis'] = exp.purchase?.invoiceKey || exp.purchase?.ocrDate ? 'INVOICE' : exp.quoteStorageKey ? 'QUOTE' : 'DESCRIPTION'
  const extracted = (prog.extractedData ?? {}) as Record<string, unknown>
  const context = {
    program: {
      title: prog.title, eligibilityNote: prog.eligibilityNote,
      submission: { start: d(prog.submissionStart), end: d(prog.submissionEnd) },
      expenseCategories: prog.expenseCats.map(c => ({ name: c.name, minAmount: n(c.minAmount), maxAmount: n(c.maxAmount), minPercentage: n(c.minPercentage), maxPercentage: n(c.maxPercentage), mandatory: c.mandatory })),
      bonuses: extracted.bonuses ?? [], deadlines: extracted.deadlines ?? [],
    },
    beneficiary: { name: exp.application.trdr.NAME, afm: exp.application.trdr.AFM, legalForm: exp.application.trdr.appLegalForm, kads: exp.application.trdr.kads, applicationSubmittedAt: d(exp.application.opskeSubmittedAt) },
    expense: {
      description: exp.description, netAmount: Number(exp.amount), vat: n(exp.vatAmount), date: d(exp.date),
      category: exp.category ? { name: exp.category.name, minAmount: n(exp.category.minAmount), maxAmount: n(exp.category.maxAmount), minPercentage: n(exp.category.minPercentage), maxPercentage: n(exp.category.maxPercentage) } : null,
      alreadyPlannedInCategory: Math.round(inCategory * 100) / 100,
      planTotal: Math.round(planTotal * 100) / 100,
      lines: exp.lines.map(l => ({ product: l.product, description: l.description, quantity: n(l.quantity), unit: l.unit, unitPrice: n(l.unitPrice), lineTotal: Number(l.lineTotal) })),
      supplier: exp.supplier ? { name: exp.supplier.NAME, afm: exp.supplier.AFM, kads: exp.supplier.kads.slice(0, 6) } : exp.vendor ? { name: exp.vendor, afm: exp.vendorAfm } : null,
      basis,
      quote: exp.quoteStorageKey ? { name: exp.quoteName } : null,
      invoice: exp.purchase ? {
        number: exp.purchase.invoiceNumber ?? exp.purchase.ocrNumber, date: d(exp.purchase.invoiceDate ?? exp.purchase.ocrDate),
        amountRead: n(exp.purchase.ocrAmount), supplierRead: exp.purchase.ocrSupplier, paid: n(exp.purchase.paidAmount),
      } : null,
    },
  }

  const [guide, knowledge] = await Promise.all([loadGuide(prog.storageKey, prog.size), getProgramKnowledge(exp.application.programId)])
  const system = [
    'Είσαι έμπειρος ελεγκτής δαπανών ΕΣΠΑ. Ελέγχεις αν ΜΙΑ δαπάνη είναι επιλέξιμη για χρηματοδότηση και ΤΕΚΜΗΡΙΩΝΕΙΣ αναλυτικά.',
    guide ? 'Ο ΟΔΗΓΟΣ του προγράμματος (PDF) είναι συνημμένος — βρες τους κανόνες για τις επιλέξιμες/μη επιλέξιμες δαπάνες, τα όρια ανά κατηγορία, την έναρξη επιλεξιμότητας, ΦΠΑ, μεταχειρισμένα, συνδεδεμένα μέρη, απαιτούμενες προσφορές/παραστατικά. Δώσε παραπομπή (ενότητα/σελίδα) σε guideRef.' : 'Ο οδηγός δεν είναι διαθέσιμος — βασίσου στα δομημένα στοιχεία και σημείωσέ το.',
    'Έλεγξε τουλάχιστον: (1) αν το είδος/υπηρεσία ανήκει σε επιλέξιμη κατηγορία και ποια, (2) όρια € και % της κατηγορίας με τα ήδη προγραμματισμένα, (3) χρονική επιλεξιμότητα (π.χ. παραστατικό πριν την υποβολή/έναρξη = μη επιλέξιμο), (4) καταλληλότητα προμηθευτή (ΚΑΔ, συνδεδεμένο μέρος με τον δικαιούχο), (5) ΦΠΑ (συνήθως μη επιλέξιμος), (6) εύλογο κόστος, (7) τι έγγραφα/προσφορές απαιτούνται για το ποσό.',
    [
      'Βάση ελέγχου (expense.basis):',
      '• QUOTE = προσφορά στο ΣΧΕΔΙΟ ΥΠΟΒΟΛΗΣ. ΔΕΝ απαιτείται ακόμη τιμολόγιο/πληρωμή — μην το κρίνεις ως FAIL (βάλ’ το στα requiredDocuments για τη φάση υλοποίησης). Η ημερομηνία της προσφοράς ΔΕΝ υπόκειται στον κανόνα έναρξης επιλεξιμότητας (προσφορές συχνά προηγούνται της υποβολής) — ο χρονικός κανόνας ελέγχεται μόνο ως υπενθύμιση ότι η ΑΓΟΡΑ πρέπει να γίνει μετά την έναρξη επιλεξιμότητας.',
      '• INVOICE = εκδοθέν παραστατικό αγοράς: εδώ η ημερομηνία του παραστατικού ΚΡΙΝΕΙ τη χρονική επιλεξιμότητα (πριν την έναρξη επιλεξιμότητας/υποβολή ⇒ FAIL), και ελέγχεται η συμφωνία ποσού/προμηθευτή με τη δαπάνη.',
      '• DESCRIPTION = μόνο περιγραφή — κρίνεις είδος/κατηγορία/όρια· τα υπόλοιπα UNKNOWN.',
      'Τα δεδομένα δικαιούχου (ΚΑΔ, μορφή) είναι στο beneficiary· αν λείπουν ΚΑΔ προμηθευτή, UNKNOWN (όχι FAIL).',
    ].join('\n'),
    'status ανά κανόνα: PASS · FAIL · WARN (υπό όρους / θέλει προσοχή) · UNKNOWN. eligibleAmount = καθαρό ποσό που εκτιμάς επιλέξιμο (μπορεί μικρότερο από το ζητούμενο, π.χ. λόγω ορίου).',
    'Ελληνικά, συγκεκριμένα, χωρίς γενικολογίες. summary: 3-5 προτάσεις που εξηγούν ΓΙΑΤΙ η δαπάνη είναι (ή δεν είναι) σύμφωνη με το πρόγραμμα.',
    'Απάντησε ΑΥΣΤΗΡΑ JSON: {"verdict":"ELIGIBLE|INELIGIBLE|UNCERTAIN","summary":"…","eligibleAmount":0,"checks":[{"rule":"…","guideRef":"… ή null","status":"PASS","explanation":"…"}],"conditions":["…"],"requiredDocuments":["…"],"suggestedCategory":"ακριβές όνομα κατηγορίας από τη λίστα ή null"}',
  ].join('\n\n')

  const res = await geminiGenerate({
    parts: [
      ...(guide ? [{ inlineData: { data: guide.toString('base64'), mimeType: 'application/pdf' } }] : []),
      { text: `ΣΤΟΙΧΕΙΑ ΔΑΠΑΝΗΣ & ΠΡΟΓΡΑΜΜΑΤΟΣ:\n${JSON.stringify(context)}${knowledge ? `\n\n${knowledge}` : ''}` },
    ],
    systemInstruction: system,
    json: true,
    temperature: 0.1,
    maxOutputTokens: 30000,
    scope: 'OTHER',
    refType: 'expense-eligibility',
    refId: expenseId,
    userId: opts.userId ?? null,
  })
  let p: Record<string, unknown> = {}
  try { p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown> } catch { /* fallthrough → UNCERTAIN */ }

  const v = typeof p.verdict === 'string' ? p.verdict.toUpperCase() : ''
  const statusOf = (s: unknown): EligibilityCheckStatus => (s === 'PASS' || s === 'FAIL' || s === 'WARN' ? s : 'UNKNOWN')
  return {
    verdict: v === 'ELIGIBLE' || v === 'INELIGIBLE' ? v : 'UNCERTAIN',
    basis,
    summary: str(p.summary, 2000) || 'Δεν προέκυψε σαφής τεκμηρίωση — έλεγξε χειροκίνητα.',
    eligibleAmount: typeof p.eligibleAmount === 'number' && Number.isFinite(p.eligibleAmount) ? Math.max(0, Math.round(p.eligibleAmount * 100) / 100) : null,
    checks: arr(p.checks).map(c => {
      const x = c as Record<string, unknown>
      return { rule: str(x.rule, 200), guideRef: str(x.guideRef, 160) || null, status: statusOf(x.status), explanation: str(x.explanation, 800) }
    }).filter(c => c.rule),
    conditions: arr(p.conditions).map(x => str(x, 400)).filter(Boolean),
    requiredDocuments: arr(p.requiredDocuments).map(x => str(x, 300)).filter(Boolean),
    suggestedCategory: str(p.suggestedCategory, 200) || null,
    usedGuidePdf: !!guide,
    checkedAt: new Date().toISOString(),
  }
}
