import { prisma } from '@/lib/prisma'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { resolveExpiry } from './expiry-rule'
import { matchCompany, type CompanyMatch } from './company-match'

/**
 * (Plain module — ΟΧΙ server action.) Έξυπνη αναγνώριση δικαιολογητικού που «μαθαίνει» (Δικαιολογητικά πελάτη).
 *
 *   1. Μνήμη: σύγκριση (όνομα αρχείου + απόσπασμα κειμένου) με τα παραδείγματα που
 *      έχουν επιβεβαιώσει/διορθώσει οι χρήστες (DocumentClassificationExample). Αν
 *      ένα έγγραφο μοιάζει πολύ με ήδη ταξινομημένα → τύπος χωρίς κλήση AI.
 *   2. AI: αλλιώς DeepSeek με τον κατάλογο τύπων + πρόσφατα παραδείγματα ως few-shot
 *      (προτεραιότητα στις διορθώσεις) + τα προγράμματα του πελάτη. Επιστρέφει
 *      τύπο, βεβαιότητα, πρόγραμμα, αν είναι επαναχρησιμοποιήσιμο, ημ. έκδοσης/λήξης.
 *
 * Κάθε αποθήκευση γράφει νέο παράδειγμα (βλ. recordClassificationExample) — άρα
 * όσο χρησιμοποιείται, τόσο περισσότερα έγγραφα αναγνωρίζονται από τη μνήμη.
 */

export type SmartClassifyResult = {
  typeId: string | null
  confidence: number // 0..1
  source: 'memory' | 'ai' | 'none'
  reason: string | null
  programId: string | null
  reusable: boolean
  issuedAt: string | null
  expiresAt: string | null
  /** Από πού προέκυψε η λήξη (π.χ. «λήξη θητείας ΔΣ», «έκδοση + 90 ημέρες») — για να το βλέπει ο χρήστης. */
  expiryNote: string | null
  /** Ό,τι διάβασε η AI ως λήξη μέσα στο έγγραφο (πριν τον κανόνα τύπου) — για επανυπολογισμό όταν αλλάζει ο τύπος. */
  statedExpiresAt: string | null
  expiryBasis: string | null
  /** Αφορά την επιλεγμένη επιχείρηση; (ΑΦΜ/επωνυμία μέσα στο έγγραφο) */
  company: CompanyMatch
}

type TypeRow = { id: string; name: string; expires: boolean; validityDays: number | null; notes: string | null }

const STOP = new Set([
  'και', 'του', 'της', 'των', 'την', 'τον', 'για', 'από', 'στο', 'στη', 'στην', 'στον', 'με', 'σε', 'που', 'ως', 'προς',
  'pdf', 'jpg', 'jpeg', 'png', 'scan', 'img', 'doc', 'docx', 'the', 'and',
])

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Σύνολο «λέξεων-κλειδιών» (χωρίς τόνους/αριθμούς/stopwords). */
function tokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of fold(text).split(/[^a-zα-ω0-9]+/i)) {
    if (w.length < 3 || /^\d+$/.test(w) || STOP.has(w)) continue
    out.add(w)
  }
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

const SNIPPET_MAX = 1500

/** Αρχή του κειμένου (χωρίς περιττά κενά) + γραμμές από ΟΛΟ το έγγραφο που αναφέρουν λήξη/ισχύ/θητεία
 * — π.χ. στην ανακοίνωση ΓΕΜΗ η «θητεία … λήγει» είναι πολύ μετά την αρχή. */
function withExpiryClues(text: string): string {
  const flat = text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
  const head = flat.slice(0, SNIPPET_MAX)
  const rest = flat.slice(SNIPPET_MAX)
  const clue = /λήγ|λήξ|ισχ[υύ]|θητεί|έως|μέχρι|valid/gi
  const parts: string[] = []
  let last = -1
  for (const m of rest.matchAll(clue)) {
    const i = m.index ?? 0
    if (i < last) continue // ήδη μέσα στο προηγούμενο παράθυρο
    parts.push(rest.slice(Math.max(0, i - 140), i + 140).replace(/\s+/g, ' '))
    last = i + 140
    if (parts.length >= 5) break
  }
  return parts.length ? `${head}\n…\n[Αποσπάσματα για λήξη/ισχύ]\n${parts.map(p => `…${p}…`).join('\n')}` : head
}

const MEMORY_POOL = 500
const MEMORY_MIN_SIM = 0.5

/** Πυρήνας αναγνώρισης ΧΩΡΙΣ έλεγχο δικαιωμάτων — ο καλών κάνει τον έλεγχο
 * (session permission ή token αιτήματος δικαιολογητικών). */
export async function classifyDocumentCore(input: {
  trdrId: string
  fileName: string
  text: string
}): Promise<{ ok: true; result: SmartClassifyResult } | { ok: false; message: string }> {
  const snippet = withExpiryClues(input.text)
  const probe = tokens(`${input.fileName.replace(/\.[^.]+$/, '')} ${snippet.slice(0, 800)}`)

  const [types, examples, apps, trdr] = await Promise.all([
    prisma.documentType.findMany({ where: { active: true }, select: { id: true, name: true, expires: true, validityDays: true, notes: true }, orderBy: { name: 'asc' } }),
    prisma.documentClassificationExample.findMany({
      orderBy: { createdAt: 'desc' },
      take: MEMORY_POOL,
      select: { documentTypeId: true, fileName: true, snippet: true, wasCorrect: true },
    }),
    prisma.programApplication.findMany({
      where: { trdrId: input.trdrId },
      select: { programId: true, program: { select: { title: true, referenceCode: true } } },
    }),
    prisma.trdr.findUnique({ where: { id: input.trdrId }, select: { AFM: true, NAME: true } }),
  ])
  const company = matchCompany(input.text, { afm: trdr?.AFM ?? null, name: trdr?.NAME ?? '' })
  if (types.length === 0) return { ok: false, message: 'Δεν υπάρχουν τύποι δικαιολογητικών.' }
  const activeIds = new Set(types.map(t => t.id))
  const typeById = new Map(types.map(t => [t.id, t]))

  // ── 1. Μνήμη ─────────────────────────────────────────────────────────────
  const scored = examples
    .filter(e => activeIds.has(e.documentTypeId))
    .map(e => ({ e, sim: jaccard(probe, tokens(`${e.fileName.replace(/\.[^.]+$/, '')} ${e.snippet.slice(0, 800)}`)) }))
    .sort((a, b) => b.sim - a.sim)
  const top = scored.slice(0, 5)
  const best = top[0]
  if (best && best.sim >= MEMORY_MIN_SIM) {
    // Συμφωνία των κοντινότερων γειτόνων στον ίδιο τύπο ⇒ υψηλή βεβαιότητα.
    const close = top.filter(x => x.sim >= MEMORY_MIN_SIM * 0.8)
    const agree = close.filter(x => x.e.documentTypeId === best.e.documentTypeId).length / close.length
    if (agree >= 0.7) {
      const t = typeById.get(best.e.documentTypeId)!
      // AI μόνο για τα συμπληρωματικά (λήξη/πρόγραμμα) — αν δεν χρειάζονται, καμία κλήση.
      const needAi = t.expires || apps.length > 0
      const ai = needAi
        ? await askAi({ types, examples: scored, apps, fileName: input.fileName, snippet, forcedType: t.name }).catch(() => null)
        : null
      return {
        ok: true,
        result: {
          typeId: t.id,
          confidence: Math.min(0.98, 0.6 + best.sim * 0.4) * agree,
          source: 'memory',
          reason: `Μοιάζει με ${close.length} έγγραφο/α που έχουν ήδη καταχωριστεί ως «${t.name}».`,
          programId: ai?.programId ?? null,
          reusable: ai?.reusable ?? true,
          issuedAt: ai?.issuedAt ?? null,
          ...resolveExpiry(t, ai),
          statedExpiresAt: ai?.expiresAt ?? null,
          expiryBasis: ai?.expiryBasis ?? null,
          company,
        },
      }
    }
  }

  // ── 2. AI ────────────────────────────────────────────────────────────────
  try {
    const ai = await askAi({ types, examples: scored, apps, fileName: input.fileName, snippet })
    const t = ai.typeName ? types.find(x => fold(x.name) === fold(ai.typeName!)) : null
    return {
      ok: true,
      result: {
        typeId: t?.id ?? null,
        confidence: t ? ai.confidence : 0,
        source: t ? 'ai' : 'none',
        reason: ai.reason,
        programId: ai.programId,
        reusable: ai.reusable,
        issuedAt: ai.issuedAt,
        ...resolveExpiry(t, ai),
        statedExpiresAt: ai.expiresAt,
        expiryBasis: ai.expiryBasis,
        company,
      },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η αναγνώριση απέτυχε.' }
  }
}

type AiOut = {
  typeName: string | null
  confidence: number
  reason: string | null
  programId: string | null
  reusable: boolean
  issuedAt: string | null
  expiresAt: string | null
  expiryBasis: string | null
}

async function askAi(args: {
  types: TypeRow[]
  examples: { e: { documentTypeId: string; fileName: string; snippet: string; wasCorrect: boolean }; sim: number }[]
  apps: { programId: string; program: { title: string; referenceCode: string | null } }[]
  fileName: string
  snippet: string
  forcedType?: string
}): Promise<AiOut> {
  const typeById = new Map(args.types.map(t => [t.id, t]))
  // Few-shot: τα πιο όμοια παραδείγματα + οι πιο πρόσφατες διορθώσεις (μέχρι 12).
  const picked = new Map<string, (typeof args.examples)[number]>()
  for (const x of args.examples.slice(0, 6)) picked.set(`${x.e.fileName}|${x.e.documentTypeId}`, x)
  for (const x of args.examples.filter(x => !x.e.wasCorrect).slice(0, 6)) picked.set(`${x.e.fileName}|${x.e.documentTypeId}`, x)
  const shots = [...picked.values()].slice(0, 12).map(x =>
    `- «${x.e.fileName}» → ${typeById.get(x.e.documentTypeId)?.name}${x.e.wasCorrect ? '' : ' (διόρθωση χρήστη)'}: ${x.e.snippet.slice(0, 220).replace(/\s+/g, ' ')}`,
  )
  const typeList = args.types.map(t => `- ${t.name}${t.expires ? (t.validityDays ? ` [λήγει· ισχύς ${t.validityDays} ημέρες από την έκδοση]` : ' [λήγει]') : ''}${t.notes ? ` — ${t.notes.slice(0, 120)}` : ''}`).join('\n')
  const programList = args.apps.length
    ? args.apps.map(a => `- id=${a.programId}: ${a.program.title}${a.program.referenceCode ? ` (${a.program.referenceCode})` : ''}`).join('\n')
    : '(ο πελάτης δεν έχει προγράμματα)'

  const system = [
    'Είσαι ειδικός στα ελληνικά επιχειρηματικά δικαιολογητικά (ΕΣΠΑ, φορολογικά, ασφαλιστικά, ΓΕΜΗ, άδειες).',
    args.forcedType
      ? `Ο τύπος έχει ήδη αναγνωριστεί ως «${args.forcedType}». Βρες ΜΟΝΟ πρόγραμμα, επαναχρησιμοποίηση και ημερομηνίες.`
      : 'Αναγνώρισε τον τύπο του εγγράφου ΑΠΟΚΛΕΙΣΤΙΚΑ από τον κατάλογο.',
    `Κατάλογος τύπων:\n${typeList}`,
    shots.length ? `Παραδείγματα από προηγούμενες ταξινομήσεις χρηστών (ακολούθησέ τα):\n${shots.join('\n')}` : '',
    `Προγράμματα του πελάτη:\n${programList}`,
    'Πρόγραμμα: επίλεξε id ΜΟΝΟ αν το έγγραφο αναφέρεται ρητά σε συγκεκριμένο πρόγραμμα (τίτλος/κωδικός/δράση)· αλλιώς null.',
    'reusable: true για γενικά εταιρικά έγγραφα που ισχύουν παντού (ενημερότητες, καταστατικό, πιστοποιητικά ΓΕΜΗ, Ε3 κ.λπ.)· false αν συντάχθηκε ειδικά για ένα πρόγραμμα (π.χ. υπεύθυνη δήλωση προγράμματος).',
    'Ημερομηνίες: issuedAt = ημ. έκδοσης (η ημερομηνία στην κεφαλίδα δίπλα στον τόπο/αρ. πρωτοκόλλου)· expiresAt = «ισχύει έως»/«λήγει» ΜΟΝΟ αν αναγράφεται ή συνάγεται από το ίδιο το έγγραφο — ΜΗΝ εφαρμόζεις εσύ κανόνα «Χ ημέρες», τον εφαρμόζει το σύστημα. expiryBasis = σύντομα από πού προκύπτει η λήξη (π.χ. «Λήξη θητείας ΔΣ») ή null.',
    [
      'Έγγραφα ΓΕΜΗ (Επιμελητήριο / Υπηρεσία Γ.Ε.ΜΗ.):',
      '• «Γενικό Πιστοποιητικό» (πιστοποιείται η καταχώριση/ότι δεν έχει λυθεί κ.λπ.): issuedAt = ημ. έκδοσης, expiresAt = null (ο κανόνας τύπου δίνει τη λήξη).',
      '• «Πιστοποιητικό Εκπροσώπησης» ή «Ανακοίνωση καταχώρισης» εκλογής/συγκρότησης ΔΣ ή ορισμού διαχειριστή: τύπος για εκπροσώπηση (π.χ. «Δικαιολογητικά νόμιμης υπόστασης και εκπροσώπησης» αν υπάρχει)· expiresAt = η ημερομηνία λήξης θητείας («Η θητεία … λήγει την …»), expiryBasis «Λήξη θητείας ΔΣ».',
      '• «Ανακοίνωση» τροποποίησης καταστατικού / κωδικοποιημένο καταστατικό: τύπος καταστατικού («Καταστατικό και νομιμοποιητικά έγγραφα» αν υπάρχει), χωρίς λήξη.',
      '• Μια «Ανακοίνωση» ΔΕΝ είναι «Γενικό Πιστοποιητικό».',
    ].join('\n'),
    'Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"type":"όνομα από τον κατάλογο ή null","confidence":0..1,"reason":"μία σύντομη πρόταση στα ελληνικά","programId":"id ή null","reusable":true|false,"issuedAt":"YYYY-MM-DD ή null","expiresAt":"YYYY-MM-DD ή null","expiryBasis":"κείμενο ή null"}',
  ].filter(Boolean).join('\n\n')

  const text = await deepseekChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: `Όνομα αρχείου: ${args.fileName}\n\nΚείμενο:\n${args.snippet || '(χωρίς αναγνώσιμο κείμενο — κρίνε από το όνομα αρχείου)'}` },
    ],
    { model: 'deepseek-chat', maxTokens: 500, scope: 'OTHER', refType: 'dossier-smart-classify' },
  )
  const p = (parseJsonLoose(text) ?? {}) as Record<string, unknown>
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null)
  const rawType = typeof p.type === 'string' ? p.type.replace(/\s*\[[^\]]*\]\s*$/, '').trim() : ''
  const programId = typeof p.programId === 'string' && args.apps.some(a => a.programId === p.programId) ? p.programId : null
  const conf = typeof p.confidence === 'number' ? p.confidence : Number(p.confidence)
  return {
    typeName: rawType && rawType !== 'null' ? rawType : null,
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    reason: typeof p.reason === 'string' ? p.reason.slice(0, 240) : null,
    programId,
    reusable: typeof p.reusable === 'boolean' ? p.reusable : !programId,
    issuedAt: date(p.issuedAt),
    expiresAt: date(p.expiresAt),
    expiryBasis: typeof p.expiryBasis === 'string' && p.expiryBasis !== 'null' ? p.expiryBasis.slice(0, 80) : null,
  }
}
