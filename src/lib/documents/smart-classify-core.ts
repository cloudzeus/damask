import { prisma } from '@/lib/prisma'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { resolveExpiry } from './expiry-rule'
import { matchCompany, type CompanyMatch } from './company-match'
import { normalizePeriod, periodFromFileName, type SeriesKind } from './series'

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
  /** Περίοδος αναφοράς για τύπους-σειρές (π.χ. Φ2 «2025-03»), κανονικοποιημένη στον τύπο. */
  period: string | null
  /** Εμπορικό έγγραφο αγοράς (όχι δικαιολογητικό): προσφορά ή παραστατικό προμηθευτή → πάει στις δαπάνες έργου. */
  commercial: CommercialKind | null
}

export type CommercialKind = 'QUOTE' | 'INVOICE'

/** Προσφορά/παραστατικό από το όνομα αρχείου ή τον φάκελο (π.χ. «Προσφορές/…», «Τιμολόγιο_123.pdf»). */
export function commercialHint(pathOrName: string): CommercialKind | null {
  const f = fold(pathOrName)
  if (/προσφορ|prosfor|quotation|\bquote|\boffer|προτιμολογ|proforma/.test(f)) return 'QUOTE'
  if (/τιμολογ|timolog|invoice|παραστατικ|parastatik|αποδειξ/.test(f) || /(^|[^α-ωa-z])(τπυ|τδα|tpy|tda)([^α-ωa-z]|$)/.test(f)) return 'INVOICE'
  return null
}

type TypeRow = { id: string; name: string; expires: boolean; validityDays: number | null; notes: string | null; seriesKind?: string | null }

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

const MEMORY_MIN_SIM = 0.5
/** Μέγιστα παραδείγματα ανά τύπο στη μνήμη (τα πιο πρόσφατα) — ώστε κανένας τύπος να μη «χάνεται» από τους πολυπληθείς. */
const PER_TYPE_CAP = 60
/** Ελάχιστες ΔΙΑΦΟΡΕΤΙΚΕΣ πηγές (όχι σχεδόν ίδια δείγματα) για υπογραφή τύπου. */
const SIG_MIN_SOURCES = 3

export type MemoryExample = { id: string; documentTypeId: string; fileName: string; snippet: string; wasCorrect: boolean; trdrId: string | null; tok: Set<string> }
export type MemoryIndex = { key: string; examples: MemoryExample[]; signatures: Map<string, string[]> }
let memCache: MemoryIndex | null = null

export function exampleTokens(fileName: string, snippet: string): Set<string> {
  return tokens(`${fileName.replace(/\.[^.]+$/, '')} ${snippet.slice(0, 800)}`)
}

/**
 * Μνήμη αναγνώρισης σε cache διεργασίας: ξαναχτίζεται μόνο όταν αλλάξει το πλήθος/τελευταίο παράδειγμα.
 * «Υπογραφή» τύπου = λέξεις που υπάρχουν στο ≥60% των ΔΙΑΦΟΡΕΤΙΚΩΝ πηγών του τύπου (≥3) και σε ≤15% των
 * υπολοίπων — από ΟΛΑ τα δείγματα (εκπαίδευση + uploads σε πολλούς πελάτες).
 */
export async function getMemoryIndex(): Promise<MemoryIndex> {
  const agg = await prisma.documentClassificationExample.aggregate({ _count: { _all: true }, _max: { createdAt: true } })
  const key = `${agg._count._all}|${agg._max.createdAt?.getTime() ?? 0}`
  if (memCache?.key === key) return memCache
  const rows = await prisma.documentClassificationExample.findMany({
    orderBy: { createdAt: 'desc' }, take: 20_000,
    select: { id: true, documentTypeId: true, fileName: true, snippet: true, wasCorrect: true, trdrId: true },
  })
  const perType = new Map<string, number>()
  const examples: MemoryExample[] = []
  for (const r of rows) {
    const n = perType.get(r.documentTypeId) ?? 0
    if (n >= PER_TYPE_CAP) continue
    perType.set(r.documentTypeId, n + 1)
    examples.push({ ...r, tok: exampleTokens(r.fileName, r.snippet) })
  }
  // Πηγές: δείγματα που μοιάζουν πολύ (π.χ. ΕΜΕ της ίδιας εταιρίας για 2 χρονιές) μετράνε ως ΜΙΑ πηγή — αλλιώς
  // ονόματα εργαζομένων/επωνυμία μιας εταιρίας θα γίνονταν «χαρακτηριστικές λέξεις» του τύπου.
  const byType = new Map<string, Set<string>[]>() // τύπος → πηγές (ένωση λέξεων των μελών)
  for (const e of examples) {
    const clusters = byType.get(e.documentTypeId) ?? []
    byType.set(e.documentTypeId, clusters)
    const near = clusters.find(c => jaccard(c, e.tok) >= 0.5)
    if (near) for (const t of e.tok) near.add(t)
    else clusters.push(new Set(e.tok))
  }
  const dfAll = new Map<string, number>() // λέξη → σε πόσα δείγματα (όλων των τύπων)
  for (const e of examples) for (const t of e.tok) dfAll.set(t, (dfAll.get(t) ?? 0) + 1)
  const signatures = new Map<string, string[]>()
  for (const [typeId, clusters] of byType) {
    if (clusters.length < SIG_MIN_SOURCES) continue
    const n = perType.get(typeId) ?? 0
    const others = examples.length - n
    const df = new Map<string, number>()
    for (const c of clusters) for (const t of c) df.set(t, (df.get(t) ?? 0) + 1)
    const inType = (t: string) => examples.filter(e => e.documentTypeId === typeId && e.tok.has(t)).length
    const sig = [...df]
      .filter(([t, c]) => c / clusters.length >= 0.6 && (others === 0 || ((dfAll.get(t) ?? 0) - inType(t)) / others <= 0.15))
      .sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t)
    if (sig.length >= 4) signatures.set(typeId, sig)
  }
  memCache = { key, examples, signatures }
  return memCache
}

export type MemoryHit = { typeId: string; confidence: number; reason: string; via: 'similar' | 'signature' }

/** Αναγνώριση ΜΟΝΟ από τη μνήμη (χωρίς AI). `excludeId` = leave-one-out για τη μέτρηση ακρίβειας. */
export function memoryMatch(probe: Set<string>, index: MemoryIndex, opts: { activeIds?: Set<string>; excludeId?: string; typeName?: (id: string) => string } = {}): MemoryHit | null {
  const pool = index.examples.filter(e => e.id !== opts.excludeId && (!opts.activeIds || opts.activeIds.has(e.documentTypeId)))
  const top = pool.map(e => ({ e, sim: jaccard(probe, e.tok) })).sort((a, b) => b.sim - a.sim).slice(0, 5)
  const best = top[0]
  const name = (id: string) => opts.typeName?.(id) ?? id
  if (best && best.sim >= MEMORY_MIN_SIM) {
    // Συμφωνία των κοντινότερων γειτόνων στον ίδιο τύπο ⇒ υψηλή βεβαιότητα.
    const close = top.filter(x => x.sim >= MEMORY_MIN_SIM * 0.8)
    const agree = close.filter(x => x.e.documentTypeId === best.e.documentTypeId).length / close.length
    if (agree >= 0.7) {
      return { typeId: best.e.documentTypeId, confidence: Math.min(0.98, 0.6 + best.sim * 0.4) * agree, via: 'similar', reason: `Μοιάζει με ${close.length} έγγραφο/α που έχουν ήδη καταχωριστεί ως «${name(best.e.documentTypeId)}».` }
    }
  }
  // Υπογραφή τύπου: το έγγραφο περιέχει τις χαρακτηριστικές φράσεις ΜΟΝΟ ενός τύπου.
  const cov = [...index.signatures]
    .filter(([id]) => !opts.activeIds || opts.activeIds.has(id))
    .map(([id, sig]) => ({ id, c: sig.filter(t => probe.has(t)).length / sig.length }))
    .sort((a, b) => b.c - a.c)
  if (cov[0] && cov[0].c >= 0.7 && (!cov[1] || cov[0].c - cov[1].c >= 0.25)) {
    return { typeId: cov[0].id, confidence: Math.min(0.95, 0.55 + cov[0].c * 0.4), via: 'signature', reason: `Έχει τις χαρακτηριστικές φράσεις του «${name(cov[0].id)}» (από τα δείγματα που έχουν καταχωριστεί).` }
  }
  return null
}

/** Πυρήνας αναγνώρισης ΧΩΡΙΣ έλεγχο δικαιωμάτων — ο καλών κάνει τον έλεγχο
 * (session permission ή token αιτήματος δικαιολογητικών). */
export async function classifyDocumentCore(input: {
  trdrId: string
  fileName: string
  text: string
}): Promise<{ ok: true; result: SmartClassifyResult } | { ok: false; message: string }> {
  const snippet = withExpiryClues(input.text)
  const probe = exampleTokens(input.fileName, snippet)

  const [types, memory, apps, trdr] = await Promise.all([
    prisma.documentType.findMany({ where: { active: true }, select: { id: true, name: true, expires: true, validityDays: true, notes: true, seriesKind: true }, orderBy: { name: 'asc' } }),
    getMemoryIndex(),
    prisma.programApplication.findMany({
      where: { trdrId: input.trdrId },
      select: { programId: true, program: { select: { title: true, referenceCode: true } } },
    }),
    prisma.trdr.findUnique({ where: { id: input.trdrId }, select: { AFM: true, NAME: true } }),
  ])
  const company = matchCompany(input.text, { afm: trdr?.AFM ?? null, name: trdr?.NAME ?? '' })
  if (types.length === 0) return { ok: false, message: 'Δεν υπάρχουν τύποι δικαιολογητικών.' }

  // ── 0. Προσφορά/παραστατικό από όνομα αρχείου ή φάκελο → δαπάνες έργου (όχι δικαιολογητικό).
  const hint = commercialHint(input.fileName)
  if (hint) {
    // Το έργο: αν ο πελάτης έχει ένα πρόγραμμα, αυτό· αλλιώς ό,τι αναφέρει ρητά το έγγραφο.
    const ai = apps.length > 1 ? await askAi({ types, examples: [], apps, fileName: input.fileName, snippet, forcedType: hint === 'QUOTE' ? 'Προσφορά προμηθευτή' : 'Παραστατικό αγοράς' }).catch(() => null) : null
    return {
      ok: true,
      result: {
        typeId: null, confidence: 0.9, source: 'ai',
        reason: hint === 'QUOTE' ? 'Προσφορά (από το όνομα αρχείου/φακέλου).' : 'Παραστατικό αγοράς (από το όνομα αρχείου/φακέλου).',
        programId: ai?.programId ?? (apps.length === 1 ? apps[0].programId : null),
        reusable: false, issuedAt: ai?.issuedAt ?? null, expiresAt: null, expiryNote: null, statedExpiresAt: null, expiryBasis: null,
        company, period: null, commercial: hint,
      },
    }
  }
  const activeIds = new Set(types.map(t => t.id))
  const typeById = new Map(types.map(t => [t.id, t]))

  // ── 1. Μνήμη (χωρίς AI) ──────────────────────────────────────────────────
  const scored = memory.examples
    .filter(e => activeIds.has(e.documentTypeId))
    .map(e => ({ e, sim: jaccard(probe, e.tok) }))
    .sort((a, b) => b.sim - a.sim)
  const hit = memoryMatch(probe, memory, { activeIds, typeName: id => typeById.get(id)?.name ?? '' })
  {
    if (hit) {
      const t = typeById.get(hit.typeId)!
      // AI μόνο για τα συμπληρωματικά (λήξη/πρόγραμμα) — αν δεν χρειάζονται, καμία κλήση.
      const needAi = t.expires || apps.length > 0 || !!t.seriesKind
      const ai = needAi
        ? await askAi({ types, examples: scored, apps, fileName: input.fileName, snippet, forcedType: t.name }).catch(() => null)
        : null
      return {
        ok: true,
        result: {
          typeId: t.id,
          confidence: hit.confidence,
          source: 'memory',
          reason: hit.reason,
          programId: ai?.programId ?? null,
          reusable: ai?.reusable ?? true,
          issuedAt: ai?.issuedAt ?? null,
          ...resolveExpiry(t, ai),
          statedExpiresAt: ai?.expiresAt ?? null,
          expiryBasis: ai?.expiryBasis ?? null,
          company,
          period: periodOf(t, ai?.period ?? null, input.fileName),
          commercial: null,
        },
      }
    }
  }

  // ── 2. AI ────────────────────────────────────────────────────────────────
  try {
    const ai = await askAi({ types, examples: scored, apps, fileName: input.fileName, snippet })
    const t = !ai.commercial && ai.typeName ? resolveTypeName(types, ai.typeName) : null
    if (ai.commercial) {
      return {
        ok: true,
        result: {
          typeId: null, confidence: ai.confidence, source: 'ai', reason: ai.reason,
          programId: ai.programId ?? (apps.length === 1 ? apps[0].programId : null),
          reusable: false, issuedAt: ai.issuedAt, expiresAt: null, expiryNote: null, statedExpiresAt: null, expiryBasis: null,
          company, period: null, commercial: ai.commercial,
        },
      }
    }
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
        period: t ? periodOf(t, ai.period, input.fileName) : null,
        commercial: null,
      },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η αναγνώριση απέτυχε.' }
  }
}

/**
 * Ανεκτική αντιστοίχιση ονόματος τύπου από το AI στον κατάλογο: ακριβές (χωρίς τόνους/στίξη) → το όνομα του AI
 * ΞΕΚΙΝΑ με όνομα του καταλόγου (πήρε και τη σημείωση) → μεγάλη επικάλυψη λέξεων. Προτιμά το μακρύτερο ταίριασμα.
 */
export function resolveTypeName(types: TypeRow[], raw: string): TypeRow | null {
  const n = (x: string) => fold(x).replace(/[^a-zα-ω0-9]+/g, ' ').trim()
  const r = n(raw)
  if (!r || r === 'null') return null
  const exact = types.find(t => n(t.name) === r)
  if (exact) return exact
  const prefix = types.filter(t => r.startsWith(n(t.name) + ' ') || r === n(t.name)).sort((a, b) => n(b.name).length - n(a.name).length)[0]
  if (prefix) return prefix
  const rw = new Set(r.split(' ').filter(w => w.length > 2))
  let best: { t: TypeRow; s: number } | null = null
  for (const t of types) {
    const tw = new Set(n(t.name).split(' ').filter(w => w.length > 2))
    if (!tw.size) continue
    let hit = 0
    for (const w of tw) if (rw.has(w)) hit++
    const sc = hit / tw.size
    if (sc >= 0.8 && (!best || sc > best.s)) best = { t, s: sc }
  }
  return best?.t ?? null
}

/** Περίοδος για τύπο-σειρά: από την AI, αλλιώς από το όνομα αρχείου (π.χ. «Φ2_03-2025.pdf»). */
function periodOf(t: TypeRow, aiPeriod: string | null, fileName: string): string | null {
  const kind = t.seriesKind
  if (!kind || kind === 'LIST') return null
  return (aiPeriod ? normalizePeriod(aiPeriod, kind as SeriesKind) : null) ?? periodFromFileName(fileName, kind as SeriesKind)
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
  period: string | null
  commercial: CommercialKind | null
}

export async function askAi(args: {
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
  // Αριθμημένος κατάλογος: το AI απαντά με ΑΡΙΘΜΟ (όχι αντιγραφή ονόματος — παλιότερα αντέγραφε και τη σημείωση,
  // π.χ. «ΕΜΕ — … τιμές ανά έτος», και η σωστή απάντηση απορριπτόταν).
  const SERIES_HINT: Record<string, string> = { MONTHLY: ' [σειρά: ένα ανά μήνα]', QUARTERLY: ' [σειρά: ένα ανά τρίμηνο]', YEARLY: ' [σειρά: ένα ανά έτος]', LIST: ' [πολλά αρχεία]' }
  const typeList = args.types.map((t, i) => `${i + 1}. ${t.name}${t.seriesKind ? SERIES_HINT[t.seriesKind] ?? '' : ''}${t.expires ? (t.validityDays ? ` [λήγει· ισχύς ${t.validityDays} ημέρες από την έκδοση]` : ' [λήγει]') : ''}${t.notes ? ` (σημείωση: ${t.notes.slice(0, 120)})` : ''}`).join('\n')
  const programList = args.apps.length
    ? args.apps.map(a => `- id=${a.programId}: ${a.program.title}${a.program.referenceCode ? ` (${a.program.referenceCode})` : ''}`).join('\n')
    : '(ο πελάτης δεν έχει προγράμματα)'

  const system = [
    'Είσαι ειδικός στα ελληνικά επιχειρηματικά δικαιολογητικά (ΕΣΠΑ, φορολογικά, ασφαλιστικά, ΓΕΜΗ, άδειες).',
    args.forcedType
      ? `Ο τύπος έχει ήδη αναγνωριστεί ως «${args.forcedType}». Βρες ΜΟΝΟ πρόγραμμα, επαναχρησιμοποίηση, ημερομηνίες και περίοδο αναφοράς.`
      : 'Αναγνώρισε τον τύπο του εγγράφου ΑΠΟΚΛΕΙΣΤΙΚΑ από τον κατάλογο.',
    `Κατάλογος τύπων (αριθμημένος):\n${typeList}`,
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
    args.forcedType ? '' : 'ΕΜΠΟΡΙΚΑ ΕΓΓΡΑΦΑ ΑΓΟΡΑΣ: αν το έγγραφο ΔΕΝ είναι δικαιολογητικό του καταλόγου αλλά προσφορά προμηθευτή (οικονομική προσφορά, προτιμολόγιο) → commercial "QUOTE"· τιμολόγιο/απόδειξη αγοράς/δελτίο από προμηθευτή → commercial "INVOICE" — και τότε typeNo null. Αλλιώς commercial null.',
    'Περίοδος (period): για έγγραφα που αφορούν συγκεκριμένη περίοδο (π.χ. περιοδική δήλωση ΦΠΑ Φ2, ΑΠΔ, μισθοδοσία, τριμηνιαία/ετήσια κατάσταση) η ΠΕΡΙΟΔΟΣ ΑΝΑΦΟΡΑΣ (όχι η ημ. υποβολής): YYYY-MM για μήνα, YYYY-Qn για τρίμηνο, YYYY για χρήση/έτος· αλλιώς null.',
    'Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"typeNo":αριθμός τύπου από τον κατάλογο ή null,"type":"το όνομα του τύπου ΧΩΡΙΣ τη σημείωση ή null","confidence":0..1,"reason":"μία σύντομη πρόταση στα ελληνικά","programId":"id ή null","reusable":true|false,"issuedAt":"YYYY-MM-DD ή null","expiresAt":"YYYY-MM-DD ή null","expiryBasis":"κείμενο ή null","period":"YYYY-MM | YYYY-Qn | YYYY ή null","commercial":"QUOTE"|"INVOICE"|null}',
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
  const no = Number(p.typeNo)
  const byNo = Number.isInteger(no) && no >= 1 && no <= args.types.length ? args.types[no - 1] : null
  const resolved = byNo ?? resolveTypeName(args.types, rawType)
  const programId = typeof p.programId === 'string' && args.apps.some(a => a.programId === p.programId) ? p.programId : null
  const conf = typeof p.confidence === 'number' ? p.confidence : Number(p.confidence)
  return {
    typeName: resolved?.name ?? null,
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    reason: typeof p.reason === 'string' ? p.reason.slice(0, 240) : null,
    programId,
    reusable: typeof p.reusable === 'boolean' ? p.reusable : !programId,
    issuedAt: date(p.issuedAt),
    expiresAt: date(p.expiresAt),
    expiryBasis: typeof p.expiryBasis === 'string' && p.expiryBasis !== 'null' ? p.expiryBasis.slice(0, 80) : null,
    period: typeof p.period === 'string' && p.period !== 'null' ? p.period.slice(0, 20) : null,
    commercial: !args.forcedType && (p.commercial === 'QUOTE' || p.commercial === 'INVOICE') ? p.commercial : null,
  }
}
