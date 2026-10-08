import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { bunnyDownload } from '@/lib/bunny-storage'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { computeSinglePair, type SinglePairEligibility } from '@/lib/prospects/evaluate-pair'
import { buildCompanyProfile, type CompanyProfile } from './company-profile'
import { getProgramKnowledge } from '@/lib/programs/references'

/**
 * (Plain module.) Agent αξιολόγησης ένταξης επιχείρησης σε ευρωπαϊκό πρόγραμμα.
 *
 *   1. Προφίλ εταιρίας (company-profile.ts) — ό,τι ξέρει η εφαρμογή (ΚΑΔ, ΕΜΕ, τζίροι, ίδρυση, έγγραφα).
 *   2. Κανόνες: ΚΑΔ/περιφέρεια/νομική μορφή/ΕΜΕ/έτη (prospects engine) + κάλυψη απαιτούμενων δικαιολογητικών.
 *   3. AI (Gemini) διαβάζει τον ΙΔΙΟ τον οδηγό του προγράμματος (PDF) + τα παραπάνω και βγάζει
 *      έλεγχο ανά κριτήριο με παραπομπή, εκτίμηση βαθμολογίας, πιθανότητα, αιτιολόγηση και ενέργειες.
 *   4. Όρια ασφαλείας: αποτυχία κριτηρίου αποκλεισμού ⇒ ανώτατο όριο πιθανότητας (η AI δεν «ωραιοποιεί»).
 *
 * Νεότερα στοιχεία που ζητά ο οδηγός (π.χ. τζίρος 2025 όταν υπάρχει έως 2024) θεωρούνται ΚΟΝΤΑ στα
 * τελευταία γνωστά (ή στην τάση τους) — σημειώνονται ως εκτίμηση, όχι ως άγνωστα.
 */

export type CheckStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'UNKNOWN' | 'ESTIMATED'
export type AssessmentResult = {
  verdict: 'ELIGIBLE' | 'CONDITIONAL' | 'NOT_ELIGIBLE'
  probability: number
  summary: string
  criteria: { criterion: string; requirement: string; guideRef: string | null; companyValue: string; status: CheckStatus; reasoning: string; exclusion: boolean }[]
  scoring: { total: number | null; max: number | null; passMark: number | null; items: { criterion: string; weight: number | null; estimated: number | null; max: number | null; reasoning: string }[] }
  strengths: string[]
  risks: string[]
  actions: { action: string; impact: 'HIGH' | 'MEDIUM' | 'LOW'; category: 'DOCUMENT' | 'DATA' | 'BUSINESS' | 'BUDGET' | 'OTHER' }[]
  estimates: { field: string; requiredPeriod: string; basedOn: string; note: string }[]
  documents: { name: string; mandatory: boolean; status: 'OK' | 'EXPIRED' | 'MISSING'; note: string | null }[]
  /** Όλα τα πιστοποιητικά/δικαιολογητικά που ζητά ο οδηγός, έναντι της αποθήκης του πελάτη. */
  requiredDocuments: { name: string; stage: string | null; issuer: string | null; status: 'OK' | 'EXPIRED' | 'MISSING' | 'TO_PREPARE'; note: string }[]
  rules: SinglePairEligibility
  caps: string[]
}

const GUIDE_MAX_BYTES = 18 * 1024 * 1024 // όριο inline PDF στο Gemini

async function loadProgram(programId: string) {
  return prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: {
      id: true, title: true, summary: true, referenceCode: true, submissionStart: true, submissionEnd: true,
      totalBudget: true, fundingRate: true, durationMonths: true, minEmployeesFte: true, minOperationalYears: true,
      eligibilityNote: true, extractedData: true, storageKey: true, size: true, mimeType: true,
      kads: { select: { code: true } }, regions: { select: { name: true } }, legalForms: { select: { name: true } },
      requiredForms: { orderBy: { order: 'asc' }, select: { name: true, mandatory: true, notes: true, documentType: { select: { name: true } } } },
      expenseCats: { select: { name: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true, mandatory: true } },
    },
  })
}
type ProgramCtx = Awaited<ReturnType<typeof loadProgram>>

/** Απαιτούμενα δικαιολογητικά του προγράμματος ↔ αποθήκη πελάτη (ίδιος τύπος, σε ισχύ). */
function documentCoverage(program: ProgramCtx, profile: CompanyProfile): AssessmentResult['documents'] {
  return program.requiredForms.map(f => {
    const typeName = f.documentType?.name ?? null
    const docs = typeName ? profile.documents.filter(d => d.type === typeName && (!d.programSpecific || d.programSpecific === program.title)) : []
    const valid = docs.find(d => d.valid)
    return {
      name: f.name,
      mandatory: f.mandatory,
      status: valid ? 'OK' : docs.length ? 'EXPIRED' : 'MISSING',
      note: valid ? `${valid.name}${valid.expiresAt ? ` · ισχύει έως ${valid.expiresAt.split('-').reverse().join('/')}` : ''}` : typeName ? null : 'Δεν έχει αντιστοιχιστεί τύπος δικαιολογητικού',
    }
  })
}

const RULE_LABEL: Record<string, string> = { kad: 'ΚΑΔ', region: 'Περιφέρεια', legalForm: 'Νομική μορφή', size: 'Ελάχιστες ΕΜΕ', age: 'Έτη λειτουργίας' }

function buildPrompt(program: ProgramCtx, profile: CompanyProfile, rules: SinglePairEligibility, docs: AssessmentResult['documents'], hasGuide: boolean, today: string, knowledge: string) {
  const extracted = (program.extractedData ?? {}) as Record<string, unknown>
  const programData = {
    title: program.title, referenceCode: program.referenceCode, summary: program.summary,
    submission: { start: program.submissionStart, end: program.submissionEnd },
    budget: program.totalBudget == null ? null : Number(program.totalBudget), fundingRate: program.fundingRate == null ? null : Number(program.fundingRate),
    minEmployeesFte: program.minEmployeesFte == null ? null : Number(program.minEmployeesFte),
    minOperationalYears: program.minOperationalYears == null ? null : Number(program.minOperationalYears),
    eligibilityNote: program.eligibilityNote,
    kadRule: extracted.kadRule ?? null, eligibleKads: program.kads.map(k => k.code),
    regions: program.regions.map(r => r.name), legalForms: program.legalForms.map(f => f.name),
    evaluationCriteria: extracted.criteria ?? [], bonuses: extracted.bonuses ?? [], deadlines: extracted.deadlines ?? [],
    expenseCategories: program.expenseCats.map(c => ({ ...c, minAmount: c.minAmount == null ? null : Number(c.minAmount), maxAmount: c.maxAmount == null ? null : Number(c.maxAmount), minPercentage: c.minPercentage == null ? null : Number(c.minPercentage), maxPercentage: c.maxPercentage == null ? null : Number(c.maxPercentage) })),
  }
  const system = [
    'Είσαι έμπειρος σύμβουλος ΕΣΠΑ/ευρωπαϊκών προγραμμάτων στην Ελλάδα. Αξιολογείς αν μια επιχείρηση μπορεί να ενταχθεί σε πρόγραμμα και με ποια πιθανότητα.',
    hasGuide
      ? 'Ο ΟΔΗΓΟΣ του προγράμματος (PDF) είναι συνημμένος: είναι η ΚΥΡΙΑ πηγή. Εντόπισε ΟΛΑ τα κριτήρια επιλεξιμότητας/αποκλεισμού και τα κριτήρια αξιολόγησης/βαθμολόγησης, με παραπομπή (ενότητα/άρθρο/σελίδα) στο guideRef.'
      : 'Δεν υπάρχει το PDF του οδηγού — βασίσου στα δομημένα στοιχεία του προγράμματος και σημείωσέ το στο summary.',
    'Τα στοιχεία της επιχείρησης είναι ό,τι έχει η εφαρμογή (ΓΕΜΗ/ΑΑΔΕ, ΚΑΔ, έντυπα Ε3/ΕΜΕ/Δήλωση ΜΜΕ ανά έτος, δικαιολογητικά). Οι «κανόνες» είναι ντετερμινιστικός έλεγχος — μην τους αντιφάσκεις χωρίς ρητό λόγο από τον οδηγό.',
    'ΝΕΟΤΕΡΑ ΣΤΟΙΧΕΙΑ: αν ο οδηγός ζητά τιμή για χρήση/περίοδο που δεν υπάρχει ακόμη στα στοιχεία (π.χ. τζίρος ή ΕΜΕ πιο πρόσφατου έτους), ΘΕΩΡΗΣΕ ότι είναι κοντά στις τελευταίες γνωστές τιμές (ή συνεχίζει την τάση τους). Χρησιμοποίησε status "ESTIMATED" (όχι UNKNOWN), γράψε την εκτίμηση στο companyValue και καταχώρισέ την στο estimates. UNKNOWN μόνο όταν δεν υπάρχει ΚΑΜΙΑ σχετική τιμή.',
    'status: PASS (πληροί) · FAIL (δεν πληροί) · PARTIAL (μερικώς/υπό όρους) · ESTIMATED (πληροί με εκτίμηση) · UNKNOWN. exclusion=true ΜΟΝΟ για ουσιαστικά κριτήρια επιλεξιμότητας της ίδιας της επιχείρησης (ΚΑΔ, έδρα, μορφή, μέγεθος, έτη, κατάσταση, de minimis, προβληματική κ.λπ.).',
    'ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ που λείπουν ή έχουν λήξει ΔΕΝ είναι αποκλεισμός: είναι ενέργειες (actions, category DOCUMENT) που γίνονται πριν την υποβολή — exclusion=false, status PARTIAL, και μειώνουν την πιθανότητα μόνο ελαφρά.',
    [
      'scoring: αν ο οδηγός έχει βαθμολογούμενα κριτήρια, για ΚΑΘΕ κριτήριο συμπλήρωσε ΥΠΟΧΡΕΩΤΙΚΑ αριθμούς: max = μέγιστη βαθμολογία στην κλίμακα του οδηγού (π.χ. 10 ή 100), weight = στάθμιση % (αν δίνεται), estimated = εκτιμώμενη βαθμολογία.',
      '• Κριτήρια που υπολογίζονται από τα στοιχεία (π.χ. EBITDA/κύκλος εργασιών, κάλυψη τόκων, εξαγωγές, ΕΜΕ, έτη) → υπολόγισέ τα από το προφίλ και γράψε τον υπολογισμό στο reasoning.',
      '• Κριτήρια που εξαρτώνται από το (μελλοντικό) επενδυτικό σχέδιο → υπέθεσε ένα ρεαλιστικό, καλά προετοιμασμένο σχέδιο για αυτή την επιχείρηση και πες τι πρέπει να περιέχει για να πιάσει τη βαθμολογία.',
      'Δώσε total/max και passMark (βάση) αν υπάρχει. Αν ο οδηγός ΔΕΝ έχει βαθμολόγηση (π.χ. FIFO), items=[] και total=null.',
    ].join('\n'),
    'probability (0-100): ρεαλιστική πιθανότητα έγκρισης ΑΝ γίνουν εγκαίρως οι ενέργειες που προτείνεις — συνυπολόγισε επιλεξιμότητα, εκτιμώμενη βαθμολογία έναντι βάσης/ανταγωνισμού (συγκριτική ή FIFO αξιολόγηση), προθεσμίες και προϋπολογισμό του προγράμματος. verdict: ELIGIBLE · CONDITIONAL (επιλέξιμη αν γίνουν οι ενέργειες) · NOT_ELIGIBLE.',
    'actions: συγκεκριμένες, πρακτικές ενέργειες για ένταξη ή καλύτερη βαθμολογία (π.χ. «Πρόσληψη 1 ΕΜΕ πριν την υποβολή για +5 μόρια», «Ανέβασε φορολογική ενημερότητα σε ισχύ»), με impact και category.',
    'requiredDocuments: ΟΛΑ τα πιστοποιητικά και δικαιολογητικά που ζητά ο οδηγός (για υποβολή και, χωριστά σημειωμένα στο stage, για ένταξη/υλοποίηση). Για το καθένα: issuer (πού εκδίδεται, π.χ. ΓΕΜΗ, ΑΑΔΕ/myAADE, e-ΕΦΚΑ, Πρωτοδικείο, λογιστής), status σε σχέση με τα δικαιολογητικά της επιχείρησης — OK (υπάρχει σε ισχύ), EXPIRED (υπάρχει αλλά έληξε/θα λήξει πριν την υποβολή), MISSING (λείπει και εκδίδεται), TO_PREPARE (συντάσσεται για το πρόγραμμα, π.χ. υπεύθυνη δήλωση, επενδυτικό σχέδιο, προσφορές) — και note (τι ακριβώς να γίνει).',
    'Γράψε στα ελληνικά, επαγγελματικά και τεκμηριωμένα, χωρίς υπερβολές. summary: 3-5 προτάσεις για τον πελάτη.',
    'Απάντησε ΑΥΣΤΗΡΑ JSON: {"verdict":"…","probability":0,"summary":"…","criteria":[{"criterion":"…","requirement":"…","guideRef":"… ή null","companyValue":"…","status":"PASS","reasoning":"…","exclusion":true}],"scoring":{"total":null,"max":null,"passMark":null,"items":[{"criterion":"…","weight":null,"estimated":null,"max":null,"reasoning":"…"}]},"strengths":["…"],"risks":["…"],"actions":[{"action":"…","impact":"HIGH","category":"DOCUMENT"}],"estimates":[{"field":"…","requiredPeriod":"…","basedOn":"…","note":"…"}],"requiredDocuments":[{"name":"…","stage":"Υποβολή","issuer":"…","status":"MISSING","note":"…"}]}',
  ].join('\n\n')

  const user = [
    `Σημερινή ημερομηνία: ${today}`,
    `ΠΡΟΓΡΑΜΜΑ (δομημένα στοιχεία από την αποδελτίωση):\n${JSON.stringify(programData)}`,
    `ΕΠΙΧΕΙΡΗΣΗ (προφίλ):\n${JSON.stringify(profile)}`,
    `ΚΑΝΟΝΕΣ (ντετερμινιστικός έλεγχος): πληροί=${rules.matched.map(k => RULE_LABEL[k] ?? k).join(', ') || '—'} · δεν πληροί=${rules.failed.map(k => RULE_LABEL[k] ?? k).join(', ') || '—'} · άγνωστα=${rules.unknown.map(k => RULE_LABEL[k] ?? k).join(', ') || '—'} · ΚΑΔ που ταιριάζουν=${rules.matchedKads.join(', ') || '—'}`,
    `ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ ΠΡΟΓΡΑΜΜΑΤΟΣ ↔ ΑΠΟΘΗΚΗ ΠΕΛΑΤΗ:\n${JSON.stringify(docs)}`,
    knowledge || null,
  ].filter(Boolean).join('\n\n')
  return { system, user }
}

const clampInt = (n: unknown, lo: number, hi: number) => {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const arr = (v: unknown) => (Array.isArray(v) ? v : [])
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

function normalize(raw: Record<string, unknown>, rules: SinglePairEligibility, docs: AssessmentResult['documents']): AssessmentResult {
  const sc = (raw.scoring ?? {}) as Record<string, unknown>
  const res: AssessmentResult = {
    verdict: oneOf(raw.verdict, ['ELIGIBLE', 'CONDITIONAL', 'NOT_ELIGIBLE'] as const, 'CONDITIONAL'),
    probability: clampInt(raw.probability, 0, 100) ?? 0,
    summary: str(raw.summary, 2000),
    criteria: arr(raw.criteria).map(c => {
      const x = c as Record<string, unknown>
      return {
        criterion: str(x.criterion, 200), requirement: str(x.requirement), guideRef: str(x.guideRef, 160) || null,
        companyValue: str(x.companyValue, 300), status: oneOf(x.status, ['PASS', 'FAIL', 'PARTIAL', 'UNKNOWN', 'ESTIMATED'] as const, 'UNKNOWN'),
        reasoning: str(x.reasoning, 800), exclusion: x.exclusion === true,
      }
    }).filter(c => c.criterion),
    scoring: {
      total: num(sc.total), max: num(sc.max), passMark: num(sc.passMark),
      items: arr(sc.items).map(i => {
        const x = i as Record<string, unknown>
        return { criterion: str(x.criterion, 200), weight: num(x.weight), estimated: num(x.estimated), max: num(x.max), reasoning: str(x.reasoning, 600) }
      }).filter(i => i.criterion),
    },
    strengths: arr(raw.strengths).map(s => str(s, 400)).filter(Boolean),
    risks: arr(raw.risks).map(s => str(s, 400)).filter(Boolean),
    actions: arr(raw.actions).map(a => {
      const x = a as Record<string, unknown>
      return { action: str(x.action, 400), impact: oneOf(x.impact, ['HIGH', 'MEDIUM', 'LOW'] as const, 'MEDIUM'), category: oneOf(x.category, ['DOCUMENT', 'DATA', 'BUSINESS', 'BUDGET', 'OTHER'] as const, 'OTHER') }
    }).filter(a => a.action),
    estimates: arr(raw.estimates).map(e => {
      const x = e as Record<string, unknown>
      return { field: str(x.field, 160), requiredPeriod: str(x.requiredPeriod, 80), basedOn: str(x.basedOn, 160), note: str(x.note, 400) }
    }).filter(e => e.field),
    documents: docs,
    requiredDocuments: arr(raw.requiredDocuments).map(d => {
      const x = d as Record<string, unknown>
      return { name: str(x.name, 200), stage: str(x.stage, 60) || null, issuer: str(x.issuer, 120) || null, status: oneOf(x.status, ['OK', 'EXPIRED', 'MISSING', 'TO_PREPARE'] as const, 'MISSING'), note: str(x.note, 400) }
    }).filter(d => d.name),
    rules,
    caps: [],
  }

  // Σύνολο βαθμολογίας: αν η AI δεν το έδωσε, άθροισε τα επιμέρους (σταθμισμένα αν υπάρχουν βάρη).
  const items = res.scoring.items.filter(i => i.estimated != null && i.max)
  if (res.scoring.total == null && items.length) {
    const weighted = items.every(i => i.weight != null)
    if (weighted) {
      const wsum = items.reduce((a, i) => a + (i.weight ?? 0), 0) || 1
      res.scoring.total = Math.round(items.reduce((a, i) => a + (i.estimated! / i.max!) * (i.weight ?? 0), 0) / wsum * 1000) / 10
      res.scoring.max = 100
    } else {
      res.scoring.total = Math.round(items.reduce((a, i) => a + i.estimated!, 0) * 10) / 10
      res.scoring.max = items.reduce((a, i) => a + i.max!, 0)
    }
  }

  // Όρια ασφαλείας — οι κανόνες και οι αποτυχίες αποκλεισμού υπερισχύουν της «αισιοδοξίας» της AI.
  const cap = (limit: number, why: string) => {
    if (res.probability > limit) { res.probability = limit; res.caps.push(why) }
  }
  if (rules.failed.length) {
    cap(10, `Δεν πληρούνται κριτήρια αποκλεισμού: ${rules.failed.map(k => RULE_LABEL[k] ?? k).join(', ')}.`)
    res.verdict = 'NOT_ELIGIBLE'
  }
  const aiFails = res.criteria.filter(c => c.exclusion && c.status === 'FAIL')
  if (aiFails.length) {
    cap(20, `Ο οδηγός αποκλείει: ${aiFails.map(c => c.criterion).join(', ')}.`)
    if (res.verdict === 'ELIGIBLE') res.verdict = 'CONDITIONAL'
  }
  const missingMandatory = docs.filter(d => d.mandatory && d.status !== 'OK').length
  if (missingMandatory && res.verdict === 'ELIGIBLE') res.verdict = 'CONDITIONAL'
  if (res.verdict === 'NOT_ELIGIBLE') cap(25, 'Συνολική κρίση: μη επιλέξιμη.')
  return res
}

/** Τρέχει την αξιολόγηση και ενημερώνει την εγγραφή `assessmentId` (RUNNING → DONE/ERROR). */
export async function runEligibilityAssessment(assessmentId: string): Promise<void> {
  const a = await prisma.eligibilityAssessment.findUniqueOrThrow({ where: { id: assessmentId }, select: { trdrId: true, programId: true, createdById: true } })
  try {
    const now = new Date()
    const [program, profile, rules, knowledge] = await Promise.all([
      loadProgram(a.programId),
      buildCompanyProfile(a.trdrId, now),
      computeSinglePair(a.trdrId, a.programId),
      getProgramKnowledge(a.programId),
    ])
    const docs = documentCoverage(program, profile)

    let guide: Buffer | null = null
    if (program.storageKey && (program.size ?? 0) <= GUIDE_MAX_BYTES && (program.mimeType ?? 'application/pdf').includes('pdf')) {
      guide = await bunnyDownload(program.storageKey).catch(() => null)
      if (guide && guide.length > GUIDE_MAX_BYTES) guide = null
    }
    const { system, user } = buildPrompt(program, profile, rules, docs, !!guide, now.toISOString().slice(0, 10), knowledge)
    // Τα «thinking» tokens του Gemini μετρούν στο όριο εξόδου — μεγάλο περιθώριο, και μία
    // επανάληψη αν το JSON έρθει κομμένο/άκυρο (μεγάλοι οδηγοί → πολλά κριτήρια/δικαιολογητικά).
    const ask = (attempt: number) => geminiGenerate({
      parts: [
        ...(guide ? [{ inlineData: { data: guide.toString('base64'), mimeType: 'application/pdf' } }] : []),
        { text: attempt === 0 ? user : `${user}\n\nΣΗΜΑΝΤΙΚΟ: η προηγούμενη απάντηση ήταν ελλιπής. Δώσε ΟΛΟΚΛΗΡΩΜΕΝΟ, έγκυρο JSON — σύντομες αιτιολογήσεις (έως 2 προτάσεις η καθεμία).` },
      ],
      systemInstruction: system,
      json: true,
      temperature: attempt === 0 ? 0.2 : 0.1,
      maxOutputTokens: 60000,
      scope: 'OTHER',
      refType: 'eligibility-assessment',
      refId: assessmentId,
      userId: a.createdById,
    })
    const tryParse = (text: string) => {
      try {
        const v = parseJsonLoose(text)
        return v && typeof v === 'object' && 'probability' in (v as object) ? (v as Record<string, unknown>) : null
      } catch { return null }
    }
    let res = await ask(0)
    let parsed = tryParse(res.text)
    if (!parsed) {
      res = await ask(1)
      parsed = tryParse(res.text)
    }
    if (!parsed) throw new Error('Η AI δεν επέστρεψε πλήρη αξιολόγηση — δοκίμασε ξανά.')
    const result = normalize(parsed, rules, docs)

    await prisma.eligibilityAssessment.update({
      where: { id: assessmentId },
      data: {
        status: 'DONE', finishedAt: new Date(), model: res.model, usedGuidePdf: !!guide,
        probability: result.probability, verdict: result.verdict, summary: result.summary,
        score: result.scoring.total != null && result.scoring.max ? Math.round((result.scoring.total / result.scoring.max) * 1000) / 10 : null,
        result: result as unknown as object, inputSnapshot: { profile, program: { title: program.title, referenceCode: program.referenceCode } } as unknown as object,
      },
    })
  } catch (err) {
    await prisma.eligibilityAssessment.update({
      where: { id: assessmentId },
      data: { status: 'ERROR', finishedAt: new Date(), error: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
    })
  }
}
