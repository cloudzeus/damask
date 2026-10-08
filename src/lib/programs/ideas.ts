import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { bunnyDownload } from '@/lib/bunny-storage'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { getSetting } from '@/lib/settings'
import { getProgramKnowledge } from './references'

/**
 * (Plain module.) «Ιδέες εφαρμογών»: τι μπορούμε να αναπτύξουμε (βάσει του αντικειμένου μας) ώστε να
 * χρηματοδοτηθεί ως επιλέξιμη δαπάνη δικαιούχων του προγράμματος. Αυστηρά: μόνο ιδέες που αντιστοιχούν σε
 * ΡΗΤΑ επιλέξιμη κατηγορία με παραπομπή στον οδηγό· ό,τι δεν τεκμηριώνεται απορρίπτεται (rejected).
 */

export const CAPABILITIES_KEY = 'company.capabilities'
export const DEFAULT_CAPABILITIES = [
  'Ανάπτυξη web εφαρμογών & SaaS (Next.js, React, TypeScript)',
  'Βάσεις δεδομένων & backend (Prisma ORM, PostgreSQL, APIs, ολοκληρώσεις με ERP/e-shop)',
  'IoT με αισθητήρες Milesight (LoRaWAN: θερμοκρασία/υγρασία, ενέργεια, ποιότητα αέρα, πληρότητα, παρουσία) — συλλογή, dashboards, ειδοποιήσεις',
  'Computer vision (αναγνώριση αντικειμένων, ποιοτικός έλεγχος, καταμέτρηση, ασφάλεια χώρων, OCR εγγράφων)',
  'BI & analytics (dashboards, KPIs, προβλέψεις, data warehouse)',
  'Κυβερνοασφάλεια (hardening, backup/DR, έλεγχος πρόσβασης, παρακολούθηση, συμμόρφωση GDPR/NIS2)',
  'Εφαρμογές τεχνητής νοημοσύνης (LLM agents, chatbots/voicebots, αυτοματοποίηση διαδικασιών, ανάγνωση εγγράφων)',
  'Τηλεφωνία & τηλεφωνικά κέντρα (VoIP, IP PBX, cloud τηλεφωνικό κέντρο, call center με καταγραφή/αναφορές, διασύνδεση με CRM, AI voice agents)',
  'ERP — υλοποίηση, παραμετροποίηση και διασυνδέσεις SoftOne (Soft1) ERP· ψηφιακή τιμολόγηση/myDATA· e-shop & CRM ολοκληρώσεις',
].join('\n')

export async function getCapabilities(): Promise<string> {
  return (await getSetting<string>(CAPABILITIES_KEY))?.trim() || DEFAULT_CAPABILITIES
}

export type ProgramIdea = {
  title: string
  summary: string
  forWhom: string
  expenseCategory: string
  guideRefs: string[]
  eligibilityRationale: string
  budget: { min: number | null; max: number | null; note: string | null }
  scoringBenefits: string[]
  components: string[]
  conditions: string[]
  confidence: number
}
export type ProgramIdeasResult = {
  overview: string
  ideas: ProgramIdea[]
  rejected: { idea: string; reason: string }[]
  usedGuidePdf: boolean
}

const GUIDE_MAX = 18 * 1024 * 1024
const str = (v: unknown, max = 800) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const arr = (v: unknown) => (Array.isArray(v) ? v : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function generateProgramIdeas(ideaSetId: string): Promise<void> {
  const set = await prisma.programIdeaSet.findUniqueOrThrow({ where: { id: ideaSetId }, select: { programId: true, capabilities: true, createdById: true } })
  try {
    const p = await prisma.program.findUniqueOrThrow({
      where: { id: set.programId },
      select: {
        title: true, summary: true, totalBudget: true, fundingRate: true, eligibilityNote: true, extractedData: true, storageKey: true, size: true,
        submissionEnd: true, kads: { select: { code: true }, take: 300 }, regions: { select: { name: true } },
        expenseCats: { select: { name: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true, notes: true } },
      },
    })
    const guide = p.storageKey && (p.size ?? 0) <= GUIDE_MAX ? await bunnyDownload(p.storageKey).catch(() => null) : null
    const knowledge = await getProgramKnowledge(set.programId, 10_000)
    const ex = (p.extractedData ?? {}) as Record<string, unknown>
    const context = {
      program: {
        title: p.title, summary: p.summary, totalBudget: p.totalBudget == null ? null : Number(p.totalBudget), fundingRate: p.fundingRate == null ? null : Number(p.fundingRate),
        submissionEnd: p.submissionEnd, eligibilityNote: p.eligibilityNote, regions: p.regions.map(r => r.name), eligibleKadsSample: p.kads.map(k => k.code).slice(0, 120),
        expenseCategories: p.expenseCats.map(c => ({ name: c.name, minAmount: c.minAmount == null ? null : Number(c.minAmount), maxAmount: c.maxAmount == null ? null : Number(c.maxAmount), minPercentage: c.minPercentage == null ? null : Number(c.minPercentage), maxPercentage: c.maxPercentage == null ? null : Number(c.maxPercentage), notes: c.notes })),
        evaluationCriteria: ex.criteria ?? [], bonuses: ex.bonuses ?? [],
      },
      ourCapabilities: set.capabilities,
    }
    const system = [
      'Είσαι σύμβουλος ΕΣΠΑ ΚΑΙ αρχιτέκτονας λογισμικού. Η εταιρία μας αναπτύσσει λύσεις λογισμικού/IoT/AI (ourCapabilities). Προτείνεις ΕΦΑΡΜΟΓΕΣ που μπορούμε να αναπτύξουμε/πουλήσουμε σε ΔΙΚΑΙΟΥΧΟΥΣ αυτού του προγράμματος, ώστε το κόστος τους να είναι ΕΠΙΛΕΞΙΜΗ δαπάνη.',
      guide ? 'Ο ΟΔΗΓΟΣ (PDF) είναι συνημμένος — είναι η αυθεντία. Κάθε ιδέα ΠΡΕΠΕΙ να αντιστοιχεί σε κατηγορία δαπάνης που ΡΗΤΑ επιτρέπει λογισμικό/εξοπλισμό/υπηρεσίες τέτοιου τύπου, με παραπομπή (ενότητα/σελίδα) στο guideRefs.' : 'Δεν υπάρχει ο οδηγός — μόνο τα δομημένα στοιχεία· γίνε ΠΙΟ συντηρητικός (μέγιστη confidence 70).',
      'ΑΥΣΤΗΡΟΙ ΚΑΝΟΝΕΣ: (1) Μόνο ιδέες με ρητή κάλυψη από επιλέξιμη κατηγορία· ό,τι είναι αμφίβολο ή ρητά μη επιλέξιμο → rejected με αιτία. (2) Σεβάσου όρια €/% κατηγοριών και τυχόν απαγορεύσεις (π.χ. λογισμικό μόνο ως άδεια χρήσης, όχι συνδρομή· συνδεδεμένα μέρη· μεταχειρισμένα). (3) Να ταιριάζει στον σκοπό/τομείς του προγράμματος και να ανεβάζει βαθμολογία όπου γίνεται (scoringBenefits). (4) Ρεαλιστικός προϋπολογισμός σε € για ΜΜΕ.',
      'confidence (0-100): πόσο σίγουρο είναι ότι η δαπάνη θα κριθεί επιλέξιμη — 90+ μόνο όταν ο οδηγός το αναφέρει σχεδόν αυτολεξεί. ΜΗΝ υπόσχεσαι εγγυημένη έγκριση.',
      'components: τεχνικά μέρη με βάση το stack μας (π.χ. Next.js πύλη, PostgreSQL, αισθητήρες Milesight EM300, κάμερα + μοντέλο CV, BI dashboard). conditions: τι πρέπει να ισχύει (π.χ. άδεια χρήσης στο όνομα του δικαιούχου, εγκατάσταση στην έδρα).',
      'Δώσε 5-8 ιδέες ταξινομημένες κατά confidence. Ελληνικά, συγκεκριμένα, χωρίς marketing.',
      'Απάντησε ΑΥΣΤΗΡΑ JSON: {"overview":"2-3 προτάσεις για το τι χωράει στο πρόγραμμα","ideas":[{"title":"…","summary":"…","forWhom":"τύπος δικαιούχων/κλάδοι/ΚΑΔ","expenseCategory":"όνομα κατηγορίας από τη λίστα","guideRefs":["…"],"eligibilityRationale":"…","budget":{"min":0,"max":0,"note":"…"},"scoringBenefits":["…"],"components":["…"],"conditions":["…"],"confidence":0}],"rejected":[{"idea":"…","reason":"…"}]}',
    ].join('\n\n')

    const ask = (attempt: number) => geminiGenerate({
      parts: [
        ...(guide ? [{ inlineData: { data: guide.toString('base64'), mimeType: 'application/pdf' } }] : []),
        { text: `${JSON.stringify(context)}${knowledge ? `\n\n${knowledge}` : ''}${attempt ? '\n\nΣΗΜΑΝΤΙΚΟ: δώσε ΟΛΟΚΛΗΡΩΜΕΝΟ έγκυρο JSON με σύντομα κείμενα.' : ''}` },
      ],
      systemInstruction: system, json: true, temperature: 0.3, maxOutputTokens: 60000,
      scope: 'OTHER', refType: 'program-ideas', refId: ideaSetId, userId: set.createdById,
    })
    const parse = (t: string) => { try { const v = parseJsonLoose(t) as Record<string, unknown>; return v && Array.isArray(v.ideas) ? v : null } catch { return null } }
    let res = await ask(0)
    let raw = parse(res.text)
    if (!raw) { res = await ask(1); raw = parse(res.text) }
    if (!raw) throw new Error('Η AI δεν επέστρεψε πλήρεις ιδέες — δοκίμασε ξανά.')

    const result: ProgramIdeasResult = {
      overview: str(raw.overview, 1200),
      ideas: arr(raw.ideas).map(i => {
        const x = i as Record<string, unknown>
        const b = (x.budget ?? {}) as Record<string, unknown>
        return {
          title: str(x.title, 160), summary: str(x.summary, 800), forWhom: str(x.forWhom, 300), expenseCategory: str(x.expenseCategory, 200),
          guideRefs: arr(x.guideRefs).map(v => str(v, 160)).filter(Boolean), eligibilityRationale: str(x.eligibilityRationale, 1200),
          budget: { min: num(b.min), max: num(b.max), note: str(b.note, 200) || null },
          scoringBenefits: arr(x.scoringBenefits).map(v => str(v, 300)).filter(Boolean),
          components: arr(x.components).map(v => str(v, 200)).filter(Boolean),
          conditions: arr(x.conditions).map(v => str(v, 300)).filter(Boolean),
          confidence: Math.max(0, Math.min(guide ? 100 : 70, Math.round(num(x.confidence) ?? 0))),
        }
      }).filter(i => i.title && i.expenseCategory).sort((a, b) => b.confidence - a.confidence),
      rejected: arr(raw.rejected).map(r => { const x = r as Record<string, unknown>; return { idea: str(x.idea, 200), reason: str(x.reason, 400) } }).filter(r => r.idea),
      usedGuidePdf: !!guide,
    }
    await prisma.programIdeaSet.update({ where: { id: ideaSetId }, data: { status: 'DONE', result: result as unknown as object, model: res.model, finishedAt: new Date() } })
  } catch (err) {
    await prisma.programIdeaSet.update({ where: { id: ideaSetId }, data: { status: 'ERROR', error: (err instanceof Error ? err.message : String(err)).slice(0, 400), finishedAt: new Date() } })
  }
}
