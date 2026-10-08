import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { geminiEmbed } from '@/lib/gemini'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { CACHEABLE_TOOLS } from './cache'
import type { ThanosContext } from './context'

/**
 * (Plain module.) Ο Thanos μαθαίνει από τις συζητήσεις του:
 *  1. Κάθε ερώτηση→απάντηση καταγράφεται (ThanosTurn), με 👍/👎 από τον χρήστη.
 *  2. «Μαθήματα» (ThanosLesson): γενική γνώση για προγράμματα/εφαρμογή, ΧΩΡΙΣ προσωπικά δεδομένα —
 *     από 👍 (αμέσως), από τη νυχτερινή απόσταξη (DeepSeek) και από διορθώσεις 👎 με σχόλιο.
 *  3. Σε κάθε νέα ερώτηση ανακτώνται σημασιολογικά (pgvector) τα πιο σχετικά ΕΝΕΡΓΑ μαθήματα και μπαίνουν
 *     στο prompt — έτσι γίνεται συνεχώς πιο εξειδικευμένος χωρίς fine-tuning.
 * Ενεργό γίνεται αυτόματα μόνο ό,τι στηρίζεται στον οδηγό/εγχειρίδιο ή επιβεβαίωσε άνθρωπος· τα υπόλοιπα
 * περιμένουν έγκριση στη σελίδα «Γνώση Thanos».
 */

const toVector = (v: number[]) => `[${v.map(x => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`
const MIN_SIMILARITY = 0.62
const DUPLICATE_SIMILARITY = 0.93
/** Εργαλεία που «γειώνουν» την απάντηση στον οδηγό/εγχειρίδιο — ασφαλή για αυτόματη ενεργοποίηση. */
const GROUNDED = new Set(['program_question', 'check_expense', 'app_help'])

const isGeneric = (tools: string[]) => tools.every(t => CACHEABLE_TOOLS.has(t))

export async function recordTurn(ctx: ThanosContext, t: {
  conversationId?: string | null; question: string; reply: string; toolsUsed: string[]; programId?: string | null; model?: string | null; cached?: boolean
}): Promise<string | null> {
  try {
    const row = await prisma.thanosTurn.create({
      data: {
        userId: ctx.userId, mode: ctx.mode, conversationId: t.conversationId?.slice(0, 64) ?? null,
        question: t.question.slice(0, 4000), reply: t.reply.slice(0, 8000), toolsUsed: t.toolsUsed,
        programId: t.programId ?? null, model: t.model ?? null, cached: t.cached ?? false,
      },
      select: { id: true },
    })
    return row.id
  } catch {
    return null
  }
}

/** Σχετικά ενεργά μαθήματα για την ερώτηση → μπλοκ για το system prompt ('' αν δεν υπάρχουν). */
export async function lessonsFor(question: string, programId?: string | null): Promise<string> {
  try {
    const [qv] = await geminiEmbed([question], { task: 'RETRIEVAL_QUERY', refType: 'thanos-lessons' })
    if (!qv) return ''
    const rows = await prisma.$queryRaw<{ id: string; question: string; answer: string; sim: number }[]>`
      SELECT "id", "question", "answer", 1 - ("embedding" <=> ${toVector(qv)}::vector) AS sim
      FROM "ThanosLesson"
      WHERE "status" = 'ACTIVE' AND "embedding" IS NOT NULL
        AND (${programId ?? null}::text IS NULL OR "programId" IS NULL OR "programId" = ${programId ?? null})
      ORDER BY "embedding" <=> ${toVector(qv)}::vector
      LIMIT 4`
    const hits = rows.filter(r => r.sim >= MIN_SIMILARITY)
    if (!hits.length) return ''
    void prisma.thanosLesson.updateMany({ where: { id: { in: hits.map(h => h.id) } }, data: { uses: { increment: 1 } } }).catch(() => {})
    return [
      'ΓΝΩΣΗ ΑΠΟ ΠΡΟΗΓΟΥΜΕΝΕΣ ΣΥΖΗΤΗΣΕΙΣ (επιβεβαιωμένη από την ομάδα — χρησιμοποίησέ τη, αλλά για ποσά/προθεσμίες προτίμα πάντα τον οδηγό μέσω εργαλείων):',
      ...hits.map((h, i) => `[${i + 1}] Ε: ${h.question}\nΑ: ${h.answer}`),
    ].join('\n')
  } catch {
    return '' // ποτέ δεν μπλοκάρει τη συνομιλία
  }
}

/** Νέο μάθημα (με embedding)· αν υπάρχει ήδη σχεδόν ίδιο, δεν διπλασιάζεται (επιστρέφει null). */
export async function addLesson(l: { question: string; answer: string; programId?: string | null; status: 'ACTIVE' | 'SUGGESTED'; source: string; sourceTurnId?: string | null }): Promise<string | null> {
  const question = l.question.trim().slice(0, 1000)
  const answer = l.answer.trim().slice(0, 4000)
  if (question.length < 8 || answer.length < 15) return null
  const [v] = await geminiEmbed([`${question}\n${answer}`], { task: 'RETRIEVAL_DOCUMENT', refType: 'thanos-lessons' })
  if (v) {
    const dup = await prisma.$queryRaw<{ id: string; sim: number }[]>`
      SELECT "id", 1 - ("embedding" <=> ${toVector(v)}::vector) AS sim FROM "ThanosLesson"
      WHERE "status" <> 'REJECTED' AND "embedding" IS NOT NULL ORDER BY "embedding" <=> ${toVector(v)}::vector LIMIT 1`
    if (dup[0] && dup[0].sim >= DUPLICATE_SIMILARITY) {
      // Επιβεβαίωση υπάρχοντος: ένα SUGGESTED γίνεται ACTIVE όταν το ξαναβρεί ενεργή πηγή.
      if (l.status === 'ACTIVE') await prisma.thanosLesson.update({ where: { id: dup[0].id }, data: { status: 'ACTIVE' } }).catch(() => {})
      return null
    }
  }
  const row = await prisma.thanosLesson.create({
    data: { question, answer, programId: l.programId ?? null, status: l.status, source: l.source, sourceTurnId: l.sourceTurnId ?? null },
    select: { id: true },
  })
  if (v) await prisma.$executeRaw`UPDATE "ThanosLesson" SET "embedding" = ${toVector(v)}::vector WHERE "id" = ${row.id}`
  return row.id
}

/** Ξανα-embedding μαθήματος μετά από επεξεργασία. */
export async function reembedLesson(id: string): Promise<void> {
  const l = await prisma.thanosLesson.findUniqueOrThrow({ where: { id }, select: { question: true, answer: true } })
  const [v] = await geminiEmbed([`${l.question}\n${l.answer}`], { task: 'RETRIEVAL_DOCUMENT', refType: 'thanos-lessons' })
  if (v) await prisma.$executeRaw`UPDATE "ThanosLesson" SET "embedding" = ${toVector(v)}::vector WHERE "id" = ${id}`
}

/**
 * 👍 / 👎 σε απάντηση. 👍 σε γενική απάντηση → μάθημα (ενεργό αν το έδωσε σύμβουλος, αλλιώς προς έγκριση).
 * 👎 με σχόλιο → μένει για τη νυχτερινή απόσταξη ως διόρθωση.
 */
export async function rateTurn(ctx: ThanosContext, turnId: string, rating: 1 | -1, note?: string): Promise<boolean> {
  const turn = await prisma.thanosTurn.findFirst({ where: { id: turnId, userId: ctx.userId } })
  if (!turn) return false
  await prisma.thanosTurn.update({ where: { id: turnId }, data: { rating, note: note?.trim().slice(0, 1000) || null, distilledAt: null } })
  if (rating === 1 && isGeneric(turn.toolsUsed) && !turn.cached) {
    await addLesson({
      question: turn.question, answer: turn.reply, programId: turn.programId,
      status: ctx.mode === 'STAFF' ? 'ACTIVE' : 'SUGGESTED', source: 'FEEDBACK', sourceTurnId: turn.id,
    }).catch(() => null)
  }
  return true
}

type Distilled = { question: string; answer: string; programTitle?: string | null; correction?: boolean; turnIndex?: number }

/**
 * Νυχτερινή απόσταξη: οι νέες συζητήσεις → γενικά μαθήματα (DeepSeek). Αφαιρεί προσωπικά δεδομένα, αγνοεί
 * τετριμμένα/άσχετα, μετατρέπει τα 👎 με σχόλιο σε διορθώσεις. Επιστρέφει πόσα μαθήματα προστέθηκαν.
 */
export async function distillTurns(limit = 150, minAgeMs = 10 * 60_000): Promise<{ turns: number; lessons: number }> {
  const turns = await prisma.thanosTurn.findMany({
    where: { distilledAt: null, cached: false, createdAt: { lt: new Date(Date.now() - minAgeMs) } },
    orderBy: { createdAt: 'asc' }, take: limit,
  })
  if (!turns.length) return { turns: 0, lessons: 0 }
  const programs = await prisma.program.findMany({ where: { id: { in: [...new Set(turns.map(t => t.programId).filter(Boolean) as string[])] } }, select: { id: true, title: true } })
  const titleOf = new Map(programs.map(p => [p.id, p.title]))
  const allPrograms = await prisma.program.findMany({ select: { id: true, title: true } })
  const idOfTitle = (t?: string | null) => (t ? allPrograms.find(p => p.title.toLowerCase() === t.toLowerCase())?.id ?? null : null)

  let lessons = 0
  for (let i = 0; i < turns.length; i += 20) {
    const batch = turns.slice(i, i + 20)
    const payload = batch.map((t, k) => ({
      i: k, mode: t.mode, program: t.programId ? titleOf.get(t.programId) ?? null : null, tools: t.toolsUsed,
      rating: t.rating, userCorrection: t.note, question: t.question, answer: t.reply.slice(0, 2500),
    }))
    try {
      const raw = await deepseekChat([
        {
          role: 'system',
          content: [
            'Είσαι επιμελητής γνώσης για τον Thanos, ψηφιακό σύμβουλο ευρωπαϊκών/εθνικών προγραμμάτων χρηματοδότησης (ΕΣΠΑ) της WWA.',
            'Από τις συζητήσεις που σου δίνω, βγάλε ΜΟΝΟ γενική, επαναχρησιμοποιήσιμη γνώση που θα βοηθήσει σε μελλοντικές ερωτήσεις: κανόνες επιλεξιμότητας, δαπάνες, δικαιολογητικά (τι είναι, από πού βγαίνουν), διαδικασίες, χρήση της εφαρμογής, συχνές παρανοήσεις.',
            'ΑΥΣΤΗΡΑ: ΧΩΡΙΣ προσωπικά δεδομένα (ονόματα προσώπων/εταιρειών, ΑΦΜ, email, τηλέφωνα, ποσά συγκεκριμένου πελάτη). Γενίκευσε («μια επιχείρηση», «ο πελάτης»).',
            'Αγνόησε: χαιρετισμούς, άσχετες ερωτήσεις, απαντήσεις «δεν ξέρω», ενέργειες (αποστολές/αναθέσεις), ό,τι αφορά μόνο έναν πελάτη.',
            'Αν μια συζήτηση έχει rating -1 ΚΑΙ userCorrection, γράψε τη ΣΩΣΤΗ γνώση βάσει της διόρθωσης (correction=true). Rating -1 χωρίς σχόλιο → αγνόησέ τη.',
            'Γράψε την απάντηση σύντομα, φιλικά και ακριβώς (2-4 προτάσεις), ακρωνύμια ολόκληρα την πρώτη φορά. Το question να είναι γενική διατύπωση της ερώτησης.',
            'ΑΥΣΤΗΡΑ JSON: {"lessons":[{"turnIndex":0,"question":"…","answer":"…","programTitle":"ακριβής τίτλος ή null αν είναι γενικό","correction":false}]} — κενή λίστα αν δεν υπάρχει κάτι αξιόλογο.',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(payload) },
      ], { model: 'deepseek-v4-pro', maxTokens: 12000, temperature: 0.2, timeoutMs: 180_000, refType: 'thanos-distill' })
      const parsed = parseJsonLoose(raw) as { lessons?: Distilled[] } | null
      for (const l of parsed?.lessons ?? []) {
        const src = typeof l.turnIndex === 'number' ? batch[l.turnIndex] : undefined
        const grounded = !!src && src.toolsUsed.some(t => GROUNDED.has(t)) && src.rating !== -1
        const humanCorrection = !!l.correction && src?.mode === 'STAFF' && !!src.note
        const id = await addLesson({
          question: l.question, answer: l.answer,
          programId: idOfTitle(l.programTitle) ?? src?.programId ?? null,
          status: grounded || humanCorrection ? 'ACTIVE' : 'SUGGESTED',
          source: l.correction ? 'CORRECTION' : 'DISTILLED', sourceTurnId: src?.id ?? null,
        }).catch(() => null)
        if (id) lessons++
      }
    } catch (err) {
      console.error('[thanos-distill] batch απέτυχε', err)
      continue // τα turns της παρτίδας θα ξαναδοκιμαστούν την επόμενη νύχτα
    }
    await prisma.thanosTurn.updateMany({ where: { id: { in: batch.map(t => t.id) } }, data: { distilledAt: new Date() } })
  }
  return { turns: turns.length, lessons }
}

export type LessonRow = Prisma.ThanosLessonGetPayload<{ select: { id: true; question: true; answer: true; programId: true; status: true; source: true; uses: true; createdAt: true } }>
