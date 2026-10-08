import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { loadGuide } from '@/lib/programs/expense-eligibility'
import { getProgramKnowledge } from '@/lib/programs/references'

/**
 * (Plain module.) Γνώση προγράμματος για τον Thanos: ερωτήσεις στον οδηγό (+ γνωσιακή μνήμη) και
 * έλεγχος επιλεξιμότητας ΠΡΟΤΕΙΝΟΜΕΝΗΣ δαπάνης (πριν υπάρξει στο σύστημα). Gemini με το PDF του οδηγού.
 */

async function programContext(programId: string) {
  const p = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: {
      title: true, summary: true, storageKey: true, size: true, submissionEnd: true, fundingRate: true, totalBudget: true, eligibilityNote: true,
      expenseCats: { select: { name: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true, notes: true } },
    },
  })
  const [guide, knowledge] = await Promise.all([loadGuide(p.storageKey, p.size), getProgramKnowledge(programId, 10_000)])
  const meta = {
    title: p.title, summary: p.summary, submissionEnd: p.submissionEnd, fundingRate: p.fundingRate == null ? null : Number(p.fundingRate),
    totalBudget: p.totalBudget == null ? null : Number(p.totalBudget), eligibilityNote: p.eligibilityNote,
    expenseCategories: p.expenseCats.map(c => ({ name: c.name, maxAmount: c.maxAmount == null ? null : Number(c.maxAmount), minPercentage: c.minPercentage == null ? null : Number(c.minPercentage), maxPercentage: c.maxPercentage == null ? null : Number(c.maxPercentage), notes: c.notes })),
  }
  return { guide, knowledge, meta }
}

/** Ερώτηση για ένα πρόγραμμα — απάντηση από τον οδηγό/μνήμη με παραπομπές. */
export async function answerProgramQuestion(programId: string, question: string, opts: { audience: 'STAFF' | 'CUSTOMER'; userId?: string | null }): Promise<{ answer: string; usedGuide: boolean }> {
  const { guide, knowledge, meta } = await programContext(programId)
  const res = await geminiGenerate({
    parts: [
      ...(guide ? [{ inlineData: { data: guide.toString('base64'), mimeType: 'application/pdf' } }] : []),
      { text: `ΠΡΟΓΡΑΜΜΑ: ${JSON.stringify(meta)}${knowledge ? `\n\n${knowledge}` : ''}\n\nΕΡΩΤΗΣΗ: ${question}` },
    ],
    systemInstruction: [
      'Απαντάς ερωτήσεις για ένα ελληνικό/ευρωπαϊκό χρηματοδοτικό πρόγραμμα ΜΟΝΟ από τον οδηγό (συνημμένο PDF) και τις συμπληρωματικές πηγές.',
      opts.audience === 'STAFF'
        ? 'Ο συνομιλητής είναι σύμβουλος ΕΣΠΑ — απάντησε τεχνικά και ακριβώς, με παραπομπές (ενότητα/σελίδα) σε παρένθεση.'
        : 'Ο συνομιλητής είναι επιχειρηματίας — απάντησε απλά και ανθρώπινα, σαν να του μιλάς, σε 3-6 προτάσεις, με την ουσία πρώτα και χωρίς γραφειοκρατική γλώσσα· γράψε τα ακρωνύμια ολόκληρα· βάλε σύντομη παραπομπή (σελίδα) όπου βοηθά.',
      'Αν η απάντηση δεν προκύπτει από τις πηγές, πες το ρητά και πρότεινε επικοινωνία με τον σύμβουλο. Μην επινοείς αριθμούς. Ελληνικά.',
    ].join('\n'),
    temperature: 0.2, maxOutputTokens: 6000, scope: 'OTHER', refType: 'thanos-guide-qa', refId: programId, userId: opts.userId ?? null,
  })
  return { answer: res.text.trim(), usedGuide: !!guide }
}

export type ProposedExpenseCheck = {
  verdict: 'ELIGIBLE' | 'INELIGIBLE' | 'UNCERTAIN'
  category: string | null
  explanation: string
  conditions: string[]
  guideRefs: string[]
}

/** «Θέλω να αγοράσω Χ με Υ€ — είναι επιλέξιμο;» — πριν υπάρξει δαπάνη στο σύστημα. */
export async function checkProposedExpense(programId: string, input: { description: string; amount?: number | null; companyNote?: string | null }, opts: { userId?: string | null }): Promise<ProposedExpenseCheck> {
  const { guide, knowledge, meta } = await programContext(programId)
  const res = await geminiGenerate({
    parts: [
      ...(guide ? [{ inlineData: { data: guide.toString('base64'), mimeType: 'application/pdf' } }] : []),
      { text: `ΠΡΟΓΡΑΜΜΑ: ${JSON.stringify(meta)}${knowledge ? `\n\n${knowledge}` : ''}\n\nΠΡΟΤΕΙΝΟΜΕΝΗ ΔΑΠΑΝΗ: ${input.description}${input.amount ? ` — περίπου ${input.amount}€` : ''}${input.companyNote ? `\nΕΠΙΧΕΙΡΗΣΗ: ${input.companyNote}` : ''}` },
    ],
    systemInstruction: [
      'Κρίνεις αν μια ΠΡΟΤΕΙΝΟΜΕΝΗ δαπάνη επιχείρησης θα ήταν επιλέξιμη στο πρόγραμμα, ΜΟΝΟ βάσει του οδηγού (PDF) και των συμπληρωματικών πηγών.',
      'Βρες την κατάλληλη κατηγορία δαπάνης (ακριβές όνομα από τη λίστα), όρια/περιορισμούς (π.χ. μεταχειρισμένα, ΦΠΑ, μίσθωση, συνδεδεμένα μέρη, χρόνος αγοράς μετά την υποβολή), και τι πρέπει να προσέξει.',
      'Αν δεν προκύπτει καθαρά, verdict=UNCERTAIN. Ελληνικά, απλά και ανθρώπινα για επιχειρηματία (όχι ξύλινη γλώσσα), ακρωνύμια ολόκληρα.',
      'ΑΥΣΤΗΡΑ JSON: {"verdict":"ELIGIBLE|INELIGIBLE|UNCERTAIN","category":"… ή null","explanation":"2-4 προτάσεις","conditions":["…"],"guideRefs":["σελ. …"]}',
    ].join('\n'),
    json: true, temperature: 0.1, maxOutputTokens: 6000, scope: 'OTHER', refType: 'thanos-expense-check', refId: programId, userId: opts.userId ?? null,
  })
  let p: Record<string, unknown> = {}
  try { p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown> } catch { /* UNCERTAIN */ }
  const v = typeof p.verdict === 'string' ? p.verdict.toUpperCase() : ''
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(Boolean) : [])
  return {
    verdict: v === 'ELIGIBLE' || v === 'INELIGIBLE' ? v : 'UNCERTAIN',
    category: typeof p.category === 'string' && p.category !== 'null' ? p.category : null,
    explanation: typeof p.explanation === 'string' ? p.explanation : 'Δεν προέκυψε σαφής απάντηση — ρωτήστε τον σύμβουλό σας.',
    conditions: arr(p.conditions), guideRefs: arr(p.guideRefs),
  }
}
