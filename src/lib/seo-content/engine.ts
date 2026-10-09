import { prisma } from '@/lib/prisma'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { getSetting, setSetting } from '@/lib/settings'
import { slugify, nextSlugCandidate } from '@/lib/slug'
import { getProgramKnowledge } from '@/lib/programs/references'

/**
 * (Plain module.) Αυτόματη αρθρογραφία για SEO/GEO/AEO του wwa-espa.com.
 *
 *  1. Ιδέες (ContentIdea): νέα του espa.gr (μόνο όσα αφορούν επιχειρήσεις), ενεργά προγράμματα, λέξεις-κλειδιά.
 *  2. Συγγραφή (DeepSeek) ΠΑΝΩ στο πρωτότυπο κείμενο της πηγής + δεύτερο πέρασμα «επιμελητή» που ελέγχει τα στοιχεία
 *     απέναντι στην πηγή και αφαιρεί κάθε «μηχανική» διατύπωση — φυσικός, εμπορικός λόγος έμπειρου συμβούλου.
 *  3. Έλεγχος ποιότητας (μήκος, FAQ, εσωτερικοί σύνδεσμοι, απαγορευμένες φράσεις) — αλλιώς δεν δημοσιεύεται.
 *  4. Εικόνα από το Media Gallery (δωρεάν stock ανά θέμα, χωρίς επανάληψη) και δημοσίευση με τον ρυθμό των ρυθμίσεων.
 *
 * Δομή άρθρου για AEO/GEO: σύντομη απάντηση στην αρχή, «Με μια ματιά» (πίνακας στοιχείων), ενότητες με ##,
 * «Συχνές ερωτήσεις» (### ερώτηση → FAQPage schema στη σελίδα), επίσημη πηγή, εσωτερικοί σύνδεσμοι.
 */

const MODEL = 'deepseek-v4-pro'
const ESPA_BASE = 'https://www.espa.gr'
const UA = 'Mozilla/5.0 (WWA content research; +https://wwa-espa.com)'
export const AUTHOR_NAME = 'Ομάδα World Wide Associates'
const AUTHOR_BIO = 'Σύμβουλοι ΕΣΠΑ και ευρωπαϊκών προγραμμάτων με εμπειρία σε περισσότερα από 2.500 επενδυτικά σχέδια — από τον έλεγχο επιλεξιμότητας έως την αποπληρωμή.'
const CATEGORY = { slug: 'odigoi-espa', name: 'Οδηγοί & Νέα ΕΣΠΑ' }

// ── Ρυθμίσεις autopilot ─────────────────────────────────────────────────────

export type AutopilotSettings = { enabled: boolean; autoPublish: boolean; perWeek: number }
export const AUTOPILOT_KEY = 'seo.autopilot'
export const DEFAULT_AUTOPILOT: AutopilotSettings = { enabled: false, autoPublish: true, perWeek: 2 }
export async function getAutopilot(): Promise<AutopilotSettings> {
  return { ...DEFAULT_AUTOPILOT, ...((await getSetting<AutopilotSettings>(AUTOPILOT_KEY)) ?? {}) }
}
export async function saveAutopilot(s: AutopilotSettings) {
  await setSetting(AUTOPILOT_KEY, { enabled: !!s.enabled, autoPublish: !!s.autoPublish, perWeek: Math.max(1, Math.min(7, Math.round(s.perWeek))) })
}

// ── Βοηθητικά ──────────────────────────────────────────────────────────────

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
const textOf = (html: string) => decode(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} από ${url}`)
  return res.text()
}

/** JSON από LLM (ανεκτικό σε ```json και θόρυβο). */
function json<T>(raw: string): T | null {
  try { return parseJsonLoose(raw) as T } catch { return null }
}

// ── 1. Ιδέες ───────────────────────────────────────────────────────────────

type EspaNews = { url: string; title: string }

/** Λίστα ανακοινώσεων της αρχικής του espa.gr. */
async function espaNewsList(): Promise<EspaNews[]> {
  const html = await fetchText(`${ESPA_BASE}/el/pages/default.aspx`)
  const out = new Map<string, string>()
  for (const m of html.matchAll(/href="(\/el\/pages\/NewsFS\.aspx\?item=\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = textOf(m[2]).replace(/\s+/g, ' ').trim()
    if (title.length > 15) out.set(`${ESPA_BASE}${m[1]}`, title)
  }
  return [...out].map(([url, title]) => ({ url, title }))
}

/** Κείμενο & ημερομηνία μιας ανακοίνωσης του espa.gr. */
async function espaNewsDetail(url: string): Promise<{ text: string; date: Date | null }> {
  const t = textOf(await fetchText(url))
  const i = t.indexOf('Τα νέα του ΕΣΠΑ')
  const body = (i >= 0 ? t.slice(i) : t).slice(0, 9000)
  const dm = body.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/)
  return { text: body, date: dm ? new Date(Date.UTC(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]))) : null }
}

/**
 * Συλλογή ιδεών: (α) νέες ανακοινώσεις espa.gr — το DeepSeek κρατά μόνο όσες ενδιαφέρουν επιχειρήσεις/ΜμΕ και δίνει
 * βαθμό & λέξη-κλειδί, (β) ενεργά προγράμματα χωρίς οδηγό. Επιστρέφει πόσες νέες ιδέες μπήκαν.
 */
export async function harvestIdeas(): Promise<{ added: number; checked: number }> {
  let added = 0
  let checked = 0
  // (α) espa.gr
  try {
    const list = await espaNewsList()
    const known = new Set((await prisma.contentIdea.findMany({ where: { sourceUrl: { in: list.map(l => l.url) } }, select: { sourceUrl: true } })).map(x => x.sourceUrl))
    const fresh = list.filter(l => !known.has(l.url)).slice(0, 15)
    checked = fresh.length
    if (fresh.length) {
      const raw = await deepseekChat([
        { role: 'system', content: [
          'Είσαι στρατηγικός content marketer συμβουλευτικής ΕΣΠΑ που απευθύνεται σε ΕΠΙΧΕΙΡΗΣΕΙΣ (ΜμΕ, επαγγελματίες, νέους επιχειρηματίες).',
          'Για κάθε ανακοίνωση δώσε score 0-100: πόσο αξίζει άρθρο για επιχειρήσεις που ψάχνουν χρηματοδότηση (νέα πρόσκληση/δράση για επιχειρήσεις=90+, αποτελέσματα αξιολόγησης δράσης επιχειρήσεων=70, παράταση/τροποποίηση δράσης επιχειρήσεων=65, δάνεια/ταμεία για ΜμΕ=75, γενική πρόοδος ΕΣΠΑ=30, έργα υποδομών/δήμων/υγείας/πολιτισμού=5).',
          'ΜΟΝΟ ΕΠΙΧΕΙΡΗΣΕΙΣ: score 0 σε ό,τι απευθύνεται σε ΙΔΙΩΤΕΣ/νοικοκυριά (π.χ. Ανακαινίζω/Εξοικονομώ κατοικίας, επιδόματα, ενισχύσεις φυσικών προσώπων, φοιτητές) ή σε ΔΗΜΟΣΙΟ (δήμοι, περιφέρειες, νοσοκομεία, σχολεία, δημόσια κτίρια, παιδικοί σταθμοί/ΚΔΑΠ ως δομές).',
          'targetKeyword: η φράση που θα έψαχνε ένας επιχειρηματίας στο Google (ελληνικά, 2-5 λέξεις).',
          'ΑΥΣΤΗΡΑ JSON: {"items":[{"i":0,"score":0,"targetKeyword":"…","angle":"μία πρόταση: τι άρθρο γράφουμε για τον επιχειρηματία"}]}',
        ].join('\n') },
        { role: 'user', content: JSON.stringify(fresh.map((f, i) => ({ i, title: f.title }))) },
      ], { model: MODEL, reasoningEffort: 'low', maxTokens: 6000, temperature: 0.2, timeoutMs: 120_000, refType: 'seo-ideas' })
      const parsed = json<{ items?: { i: number; score: number; targetKeyword?: string; angle?: string }[] } | { i: number; score: number }[]>(raw)
      const items = (Array.isArray(parsed) ? parsed : parsed?.items ?? []) as { i: number; score: number; targetKeyword?: string; angle?: string }[]
      if (!items.length) console.error('[seo] espa.gr: το μοντέλο δεν επέστρεψε αξιολογήσεις', raw.slice(0, 300))
      for (const it of items) {
        const f = fresh[it.i]
        if (!f) continue
        const score = Math.max(0, Math.min(100, Math.round(it.score)))
        await prisma.contentIdea.create({
          data: { source: 'ESPA_NEWS', sourceUrl: f.url, title: f.title, summary: it.angle ?? null, targetKeyword: it.targetKeyword ?? null, score, status: score >= 55 ? 'NEW' : 'SKIPPED' },
        }).then(() => { if (score >= 55) added++ }).catch(err => console.error('[seo] αποθήκευση ιδέας απέτυχε', err))
      }
    }
  } catch (err) {
    console.error('[seo] espa.gr harvest απέτυχε', err)
  }
  // (β) ενεργά προγράμματα χωρίς ιδέα/οδηγό
  const today = new Date(new Date().toISOString().slice(0, 10))
  const programs = await prisma.program.findMany({
    where: { status: 'ACTIVE', publicSlug: { not: null }, OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }] },
    select: { id: true, title: true, fundingRate: true, cmsContent: true },
  })
  const withIdea = new Set((await prisma.contentIdea.findMany({ where: { source: 'PROGRAM' }, select: { programId: true } })).map(x => x.programId))
  for (const p of programs.filter(p => !withIdea.has(p.id))) {
    // Λέξη-κλειδί: από τη σελίδα του προγράμματος (CMS) — αλλιώς το σύντομο όνομα (κωδικός σε παρένθεση, π.χ. STEP) + έτος.
    const cms = (p.cmsContent ?? {}) as { keywords?: string[]; heroTitle?: string }
    const code = p.title.match(/\(([A-Za-zΑ-Ωα-ω0-9 .&-]{2,15})\)/)?.[1]
    const keyword = cms.keywords?.[0] || (code ? `ΕΣΠΑ ${code} 2026` : `${p.title.toLocaleLowerCase('el').split(/\s+/).slice(0, 4).join(' ')} 2026`)
    await prisma.contentIdea.create({
      data: { source: 'PROGRAM', programId: p.id, title: `Οδηγός: ${cms.heroTitle || p.title}`, targetKeyword: keyword, score: 85, summary: 'Πρακτικός οδηγός για τον επιχειρηματία: ποιος δικαιούται, τι επιδοτείται, πόσα, έως πότε, τι να προσέξει.' },
    }).then(() => { added++ }).catch(() => {})
  }
  return { added, checked }
}

/** Ιδέες από λέξεις-κλειδιά (π.χ. τις 30 της ανάλυσης ανταγωνισμού). */
export async function addKeywordIdeas(items: { title: string; keyword: string; score?: number }[]): Promise<number> {
  let n = 0
  for (const it of items) {
    const exists = await prisma.contentIdea.findFirst({ where: { title: it.title }, select: { id: true } })
    if (exists) continue
    await prisma.contentIdea.create({ data: { source: 'KEYWORD', title: it.title, targetKeyword: it.keyword, score: it.score ?? 70 } })
    n++
  }
  return n
}

// ── 2. Συγγραφή ────────────────────────────────────────────────────────────

/** Φράσεις που «προδίδουν» αυτόματο κείμενο — απαγορεύονται (έλεγχος και στο τέλος). */
const BANNED = [
  'στον σημερινό', 'στη σημερινή εποχή', 'εν κατακλείδι', 'συμπερασματικά', 'συνοψίζοντας', 'αξίζει να σημειωθεί', 'είναι σημαντικό να σημειωθεί',
  'ας εξετάσουμε', 'ας δούμε αναλυτικά', 'σε αυτό το άρθρο θα', 'σε αυτό το άρθρο', 'ταξίδι', 'βουτιά', 'απογειώστε', 'αναμφίβολα', 'αδιαμφισβήτητα',
  'ως μοντέλο', 'ως τεχνητή νοημοσύνη', 'ελπίζω ότι', 'καθοριστικής σημασίας', 'σε έναν συνεχώς μεταβαλλόμενο', 'πληθώρα',
]

const STYLE = [
  'Γράφεις για το blog της World Wide Associates (WWA), συμβουλευτικής ΕΣΠΑ στην Αθήνα με 2.500+ επενδυτικά σχέδια. Το κοινό: ιδιοκτήτες ΜμΕ, επαγγελματίες, νέοι επιχειρηματίες — όχι ειδικοί.',
  'Γράφεις ΜΟΝΟ για χρηματοδότηση ΕΠΙΧΕΙΡΗΣΕΩΝ — ποτέ για προγράμματα ιδιωτών/νοικοκυριών ή φορέων του δημοσίου (ούτε ως παραπομπή).',
  'ΦΩΝΗ: έμπειρος σύμβουλος που μιλά σε επιχειρηματία — ζεστός, πρακτικός, με αυτοπεποίθηση, εμπορικός χωρίς υπερβολές. Πρώτο πληθυντικό για την ομάδα («στη WWA βλέπουμε συχνά…», «από την εμπειρία μας…»), πληθυντικός ευγενείας στον αναγνώστη.',
  'ΦΥΣΙΚΟ ΚΕΙΜΕΝΟ: εναλλαγή μικρών και μεγαλύτερων προτάσεων, συγκεκριμένοι αριθμοί/ποσά/ημερομηνίες, ένα ρεαλιστικό παράδειγμα επιχείρησης (π.χ. «ένα οικογενειακό αρτοποιείο στη Λάρισα»), καθημερινές λέξεις. Όχι κλισέ, όχι γενικόλογες εισαγωγές, όχι «σε αυτό το άρθρο θα δούμε», όχι συμπεράσματα-περιλήψεις.',
  `ΑΠΑΓΟΡΕΥΟΝΤΑΙ οι φράσεις: ${BANNED.map(b => `«${b}»`).join(', ')}.`,
  'ΑΚΡΙΒΕΙΑ: μόνο ό,τι στηρίζεται στην ΠΗΓΗ. Ποτέ επινοημένα ποσά, ποσοστά ή προθεσμίες. Αν κάτι δεν είναι γνωστό, γράψε ότι θα ανακοινωθεί/ελέγχεται κατά περίπτωση.',
  'ΔΟΜΗ (SEO/AEO/GEO): (1) εισαγωγική παράγραφος 40-60 λέξεων που ΑΠΑΝΤΑ ευθέως στο βασικό ερώτημα (ποιος, τι, πόσα, έως πότε)· (2) «## Με μια ματιά» με markdown πίνακα 2 στηλών (Στοιχείο | Λεπτομέρεια)· (3) 3-5 ενότητες «## …» με ερωτηματικούς/περιγραφικούς τίτλους που περιέχουν φυσικά τη λέξη-κλειδί ή συνώνυμα· (4) «## Τι να προσέξετε» με πρακτικές συμβουλές από εμπειρία· (5) «## Συχνές ερωτήσεις» με 4-6 «### Ερώτηση;» και απάντηση 2-3 προτάσεων· (6) τελική παράγραφος με φυσικό κάλεσμα σε δράση για δωρεάν έλεγχο επιλεξιμότητας ([δωρεάν έλεγχο επιλεξιμότητας](/eligibility)).',
  'ΣΥΝΔΕΣΜΟΙ: 2-4 εσωτερικοί σύνδεσμοι markdown με φυσικό anchor text προς τις σελίδες που δίνονται· 1 σύνδεσμος στην επίσημη πηγή (espa.gr) ως «επίσημη ανακοίνωση». Όχι γυμνά URLs.',
  'Μήκος 900-1300 λέξεις. Ελληνικά, σωστός τονισμός, ακρωνύμια ολόκληρα την πρώτη φορά (π.χ. «Μικρομεσαίες Επιχειρήσεις (ΜμΕ)»).',
].join('\n')

type Draft = { title: string; slug?: string; excerpt: string; body: string; seoTitle: string; seoDescription: string; imageTheme?: string; imageQuery?: string }

/** Πηγή & πλαίσιο ανά τύπο ιδέας. */
async function sourceFor(idea: { source: string; sourceUrl: string | null; programId: string | null; title: string; summary: string | null; targetKeyword: string | null }) {
  if (idea.source === 'ESPA_NEWS' && idea.sourceUrl) {
    const d = await espaNewsDetail(idea.sourceUrl)
    return { sourceText: d.text, sourceUrl: idea.sourceUrl, sourceDate: d.date }
  }
  if (idea.source === 'PROGRAM' && idea.programId) {
    const p = await prisma.program.findUnique({
      where: { id: idea.programId },
      select: { title: true, summary: true, totalBudget: true, fundingRate: true, submissionStart: true, submissionEnd: true, eligibilityNote: true, extractedData: true, cmsContent: true, publicSlug: true,
        regions: { select: { name: true } }, expenseCats: { select: { name: true, minAmount: true, maxAmount: true, maxPercentage: true, notes: true } } },
    })
    if (!p) throw new Error('Το πρόγραμμα δεν βρέθηκε.')
    const knowledge = await getProgramKnowledge(idea.programId, 8000).catch(() => '')
    const facts = {
      τίτλος: p.title, περίληψη: p.summary, προϋπολογισμός: p.totalBudget == null ? null : Number(p.totalBudget), ποσοστόΕπιδότησης: p.fundingRate == null ? null : Number(p.fundingRate),
      έναρξηΥποβολών: p.submissionStart?.toISOString().slice(0, 10) ?? null, λήξηΥποβολών: p.submissionEnd?.toISOString().slice(0, 10) ?? null,
      περιοχές: p.regions.map(r => r.name), επιλεξιμότητα: p.eligibilityNote,
      κατηγορίεςΔαπανών: p.expenseCats.map(c => ({ ...c, minAmount: c.minAmount == null ? null : Number(c.minAmount), maxAmount: c.maxAmount == null ? null : Number(c.maxAmount), maxPercentage: c.maxPercentage == null ? null : Number(c.maxPercentage) })),
      αποδελτίωση: p.extractedData, σελίδαΠρογράμματος: p.cmsContent,
    }
    return { sourceText: `${JSON.stringify(facts).slice(0, 14000)}${knowledge ? `\n\n${knowledge}` : ''}`, sourceUrl: p.publicSlug ? `/programmata/${p.publicSlug}` : null, sourceDate: null }
  }
  return { sourceText: `Θέμα: ${idea.title}\n${idea.summary ?? ''}`, sourceUrl: null, sourceDate: null }
}

/** Ενεργά προγράμματα για εσωτερικούς συνδέσμους. */
async function internalLinks(): Promise<string> {
  const today = new Date(new Date().toISOString().slice(0, 10))
  const ps = await prisma.program.findMany({
    where: { status: 'ACTIVE', publicSlug: { not: null }, OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }] },
    select: { title: true, publicSlug: true }, take: 25,
  })
  return [
    '- /programmata — όλα τα ενεργά προγράμματα', '- /eligibility — δωρεάν έλεγχος επιλεξιμότητας με ΑΦΜ', '- /ypiresies — οι υπηρεσίες μας', '- /epikoinonia — επικοινωνία',
    ...ps.map(p => `- /programmata/${p.publicSlug} — ${p.title}`),
  ].join('\n')
}

/** Διαθέσιμα θέματα εικόνων στο Gallery (από τη μαζική εισαγωγή stock). */
async function imageThemes(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ theme: string }[]>`SELECT DISTINCT "meta"->>'theme' AS theme FROM "MediaAsset" WHERE "type" = 'IMAGE' AND "meta"->>'theme' IS NOT NULL`
  return rows.map(r => r.theme).filter(Boolean)
}

/** Εικόνα για το άρθρο — επιστρέφει URL και από πού βρέθηκε. Προτιμά πάντα όσες δεν χρησιμοποιούνται ήδη σε άρθρο. */
export async function pickImage(theme: string | undefined, query: string | undefined): Promise<{ url: string; via: 'theme' | 'gallery' | 'stock' } | null> {
  const used = new Set((await prisma.post.findMany({ where: { featuredImage: { not: null } }, select: { featuredImage: true } })).map(p => p.featuredImage))

  // 1) Θέμα από τη μαζική εισαγωγή stock (meta.theme).
  if (theme) {
    const rows = await prisma.$queryRaw<{ cdnUrl: string }[]>`SELECT "cdnUrl" FROM "MediaAsset" WHERE "type" = 'IMAGE' AND "meta"->>'theme' = ${theme} ORDER BY random() LIMIT 40`
    const hit = rows.find(r => !used.has(r.cdnUrl))
    if (hit) return { url: hit.cdnUrl, via: 'theme' }
  }

  // 2) Ταίριασμα λέξεων της περιγραφής με όνομα/alt/θέμα των εικόνων του Gallery.
  const words = (query ?? '').toLowerCase().split(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/i).filter(w => w.length > 2 && !['the', 'and', 'with', 'for', 'photo', 'image', 'people'].includes(w))
  if (words.length) {
    const assets = await prisma.mediaAsset.findMany({ where: { type: 'IMAGE' }, select: { cdnUrl: true, name: true, alt: true, meta: true }, take: 3000, orderBy: { createdAt: 'desc' } })
    let best: { url: string; score: number } | null = null
    for (const a of assets) {
      if (used.has(a.cdnUrl)) continue
      const hay = `${a.name} ${a.alt ?? ''} ${(a.meta as { theme?: string } | null)?.theme ?? ''} ${a.cdnUrl.split('/').pop() ?? ''}`.toLowerCase().replace(/[-_]/g, ' ')
      const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0)
      if (score >= Math.min(2, words.length) && (!best || score > best.score)) best = { url: a.cdnUrl, score }
    }
    if (best) return { url: best.url, via: 'gallery' }
  }

  // 3) Ζωντανή αναζήτηση στο Pexels/Pixabay (αν υπάρχει κλειδί) → εισαγωγή στο Gallery.
  if (query) {
    try {
      const { stockProvidersConfigured, searchPexels, searchPixabay } = await import('@/lib/stock/providers')
      const providers = await stockProvidersConfigured()
      for (const p of providers) {
        const found = p === 'pexels' ? await searchPexels(query, 10) : await searchPixabay(query, 10)
        const known = new Set((await prisma.$queryRaw<{ k: string }[]>`SELECT "meta"->>'stockKey' AS k FROM "MediaAsset" WHERE "meta"->>'stockKey' IS NOT NULL`).map(r => r.k))
        const c = found.find(f => !known.has(`${f.provider}:${f.id}`))
        if (!c) continue
        const res = await fetch(c.download, { signal: AbortSignal.timeout(60_000) })
        if (!res.ok) continue
        const sharp = (await import('sharp')).default
        const webp = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
        const root = await prisma.mediaFolder.findFirst({ where: { name: 'Επαγγέλματα & Επιχειρήσεις', parentId: null }, select: { id: true } })
          ?? await prisma.mediaFolder.create({ data: { name: 'Επαγγέλματα & Επιχειρήσεις', parentId: null }, select: { id: true } })
        const folder = await prisma.mediaFolder.findFirst({ where: { name: 'Άρθρα', parentId: root.id }, select: { id: true } })
          ?? await prisma.mediaFolder.create({ data: { name: 'Άρθρα', parentId: root.id }, select: { id: true } })
        const { storeMediaBuffer } = await import('@/lib/media-store')
        const stored = await storeMediaBuffer({
          body: webp, filename: `article-${c.provider}-${c.id}.webp`, mimeType: 'image/webp', path: `media-gallery/${folder.id}`, folderId: folder.id,
          name: `${query} — ${c.author || c.provider}`.slice(0, 200), alt: c.alt || query,
          meta: { source: c.provider, stockKey: `${c.provider}:${c.id}`, stockUrl: c.url, author: c.author, theme: query, license: c.provider === 'pexels' ? 'Pexels License' : 'Pixabay Content License' },
        })
        return { url: stored.url, via: 'stock' }
      }
    } catch (err) {
      console.error('[seo] αναζήτηση εικόνας απέτυχε', err)
    }
  }
  return null
}

export type QualityReport = { ok: boolean; words: number; faq: number; internalLinks: number; banned: string[] }
export function qualityCheck(body: string): QualityReport {
  const words = body.replace(/[#>*_`|\-]/g, ' ').split(/\s+/).filter(Boolean).length
  const faqSec = body.split(/^##\s+/m).find(x => /^Συχνές ερωτήσεις/i.test(x)) ?? ''
  const faq = (faqSec.match(/^###\s+/gm) ?? []).length
  const internal = (body.match(/\]\(\/[a-z]/g) ?? []).length
  const lower = body.toLocaleLowerCase('el')
  const banned = BANNED.filter(b => lower.includes(b))
  return { ok: words >= 600 && faq >= 3 && internal >= 2 && banned.length === 0, words, faq, internalLinks: internal, banned }
}

async function ensureAuthorAndCategory(): Promise<{ authorId: string; categoryId: string }> {
  const author = await prisma.author.findFirst({ where: { name: AUTHOR_NAME }, select: { id: true } })
    ?? await prisma.author.create({ data: { name: AUTHOR_NAME, bio: AUTHOR_BIO }, select: { id: true } })
  const cat = await prisma.postCategory.findUnique({ where: { slug: CATEGORY.slug }, select: { id: true } })
    ?? await prisma.postCategory.create({ data: { slug: CATEGORY.slug, translations: { create: { locale: 'el', name: CATEGORY.name } } }, select: { id: true } })
  return { authorId: author.id, categoryId: cat.id }
}

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i < 50; i++) {
    const s = nextSlugCandidate(base, i)
    if (!(await prisma.post.findUnique({ where: { slug: s }, select: { id: true } }))) return s
  }
  return `${base}-${Date.now()}`
}

/**
 * Γράφει άρθρο από μια ιδέα: συγγραφή → επιμέλεια/έλεγχος στοιχείων → έλεγχος ποιότητας → εικόνα → Post.
 * publish=true → PUBLISHED, αλλιώς REVIEW (για έγκριση στο CMS). Επιστρέφει το postId.
 */
export async function writeArticle(ideaId: string, opts: { publish: boolean }): Promise<{ postId: string; quality: QualityReport }> {
  const idea = await prisma.contentIdea.findUniqueOrThrow({ where: { id: ideaId } })
  await prisma.contentIdea.update({ where: { id: ideaId }, data: { status: 'WRITING', error: null } })
  try {
    const [{ sourceText, sourceUrl, sourceDate }, links, themes] = await Promise.all([sourceFor(idea), internalLinks(), imageThemes()])
    const today = new Date().toISOString().slice(0, 10)
    const brief = [
      `ΣΗΜΕΡΑ: ${today}. ΘΕΜΑ: ${idea.title}`,
      idea.summary ? `ΓΩΝΙΑ: ${idea.summary}` : '',
      idea.targetKeyword ? `ΒΑΣΙΚΗ ΛΕΞΗ-ΚΛΕΙΔΙ (φυσικά στον τίτλο, στην πρώτη παράγραφο και σε 1-2 υπότιτλους): ${idea.targetKeyword}` : '',
      sourceUrl ? `ΕΠΙΣΗΜΗ ΠΗΓΗ (σύνδεσμος): ${sourceUrl.startsWith('/') ? sourceUrl : sourceUrl}` : '',
      sourceDate ? `ΗΜΕΡΟΜΗΝΙΑ ΠΗΓΗΣ: ${sourceDate.toISOString().slice(0, 10)}` : '',
      `ΣΕΛΙΔΕΣ ΓΙΑ ΕΣΩΤΕΡΙΚΟΥΣ ΣΥΝΔΕΣΜΟΥΣ:\n${links}`,
      themes.length ? `ΘΕΜΑΤΑ ΕΙΚΟΝΑΣ (διάλεξε ΕΝΑ ακριβώς όπως γράφεται): ${themes.join(' | ')}` : '',
      `ΠΗΓΗ (η μόνη βάση για γεγονότα/αριθμούς):\n${sourceText}`,
    ].filter(Boolean).join('\n\n')
    const shape = 'ΑΥΣΤΗΡΑ JSON: {"title":"ελκυστικός τίτλος ≤ 70 χαρ. με τη λέξη-κλειδί (μοτίβο π.χ. «Πρόγραμμα 2026: έως X% επιδότηση — ποιοι δικαιούνται»)","excerpt":"1-2 προτάσεις","body":"markdown","seoTitle":"≤ 60 χαρ.","seoDescription":"140-160 χαρ., με όφελος + κάλεσμα","imageTheme":"ένα από τα θέματα εικόνας ή κενό","imageQuery":"3-6 αγγλικές λέξεις για την ιδανική φωτογραφία (επάγγελμα, άνθρωποι, χώρος — π.χ. bakery owner small business greece)"}'

    const draftRaw = await deepseekChat([
      { role: 'system', content: `${STYLE}\n\n${shape}` },
      { role: 'user', content: brief },
    ], { model: MODEL, reasoningEffort: 'low', maxTokens: 16000, temperature: 0.7, timeoutMs: 240_000, refType: 'seo-article-draft', refId: ideaId })
    const draft = json<Draft>(draftRaw)
    if (!draft?.body || !draft.title) throw new Error('Το μοντέλο δεν επέστρεψε άρθρο.')

    // Επιμελητής: έλεγχος στοιχείων απέναντι στην πηγή + «ανθρώπινο» ύφος + τήρηση δομής.
    const editRaw = await deepseekChat([
      { role: 'system', content: [
        'Είσαι αρχισυντάκτης με 20 χρόνια εμπειρία σε οικονομικό ελληνικό Τύπο. Επιμελείσαι άρθρο συμβουλευτικής ΕΣΠΑ.',
        '1) Σύγκρινε ΚΑΘΕ αριθμό, ποσό, ποσοστό, ημερομηνία και όνομα με την ΠΗΓΗ — ό,τι δεν στηρίζεται, διόρθωσέ το ή αφαίρεσέ το.',
        '2) Ξαναγράψε όπου χρειάζεται ώστε να διαβάζεται σαν να το έγραψε έμπειρος άνθρωπος: ποικιλία ρυθμού, συγκεκριμένα παραδείγματα, χωρίς επαναλήψεις, χωρίς στερεότυπες μεταβάσεις, χωρίς λίστες παντού.',
        '3) Κράτα τη δομή (εισαγωγική απάντηση, «## Με μια ματιά», ενότητες, «## Τι να προσέξετε», «## Συχνές ερωτήσεις» με ###, κάλεσμα) και τους συνδέσμους.',
        STYLE,
        shape,
      ].join('\n') },
      { role: 'user', content: `ΠΗΓΗ:\n${sourceText.slice(0, 12000)}\n\nΑΡΘΡΟ ΠΡΟΣ ΕΠΙΜΕΛΕΙΑ:\n${JSON.stringify(draft)}` },
    ], { model: MODEL, reasoningEffort: 'low', maxTokens: 16000, temperature: 0.4, timeoutMs: 240_000, refType: 'seo-article-edit', refId: ideaId })
    const final = json<Draft>(editRaw) ?? draft

    let body = final.body.trim()
    let quality = qualityCheck(body)
    if (quality.banned.length) {
      // Τελευταία ασφάλεια: αφαίρεσε τις προδοτικές φράσεις αν ξέφυγαν.
      for (const b of quality.banned) body = body.replace(new RegExp(b, 'gi'), '')
      quality = qualityCheck(body)
    }
    const publish = opts.publish && quality.ok

    const { authorId, categoryId } = await ensureAuthorAndCategory()
    const slug = await uniqueSlug(slugify(final.slug || final.title).slice(0, 90))
    const picked = await pickImage(final.imageTheme || draft.imageTheme, final.imageQuery || draft.imageQuery || idea.targetKeyword || undefined)
    const image = picked?.url ?? null
    const post = await prisma.post.create({
      data: {
        slug, status: publish ? 'PUBLISHED' : 'REVIEW', authorId, categoryId, featuredImage: image,
        publishedAt: publish ? new Date() : null, aiGenerated: true,
        translations: { create: { locale: 'el', title: final.title.trim().slice(0, 200), excerpt: final.excerpt?.trim().slice(0, 400) || null, body, seoTitle: final.seoTitle?.trim().slice(0, 70) || null, seoDescription: final.seoDescription?.trim().slice(0, 170) || null } },
      },
      select: { id: true },
    })
    await prisma.contentIdea.update({ where: { id: ideaId }, data: { status: 'USED', postId: post.id, error: quality.ok ? null : `Έλεγχος ποιότητας: ${quality.words} λέξεις, ${quality.faq} ερωτήσεις, ${quality.internalLinks} εσωτ. σύνδεσμοι — σε αναμονή έγκρισης.` } })
    return { postId: post.id, quality }
  } catch (err) {
    await prisma.contentIdea.update({ where: { id: ideaId }, data: { status: 'ERROR', error: (err instanceof Error ? err.message : String(err)).slice(0, 400) } })
    throw err
  }
}

// ── 3. Autopilot ───────────────────────────────────────────────────────────

/** Ημερήσιο tick: συλλογή ιδεών + (αν χρειάζεται για τον εβδομαδιαίο ρυθμό) ένα νέο άρθρο από την καλύτερη ιδέα. */
export async function runAutopilot(force = false): Promise<{ harvested: number; wrote: string | null; reason?: string }> {
  const s = await getAutopilot()
  if (!s.enabled && !force) return { harvested: 0, wrote: null, reason: 'απενεργοποιημένο' }
  const { added } = await harvestIdeas()
  if (!force) {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    const recent = await prisma.post.findMany({ where: { aiGenerated: true, createdAt: { gte: weekAgo } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    if (recent.length >= s.perWeek) return { harvested: added, wrote: null, reason: 'έχει συμπληρωθεί ο εβδομαδιαίος ρυθμός' }
    const minGapMs = (7 / s.perWeek) * 86_400_000 * 0.8
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < minGapMs) return { harvested: added, wrote: null, reason: 'πολύ νωρίς από το προηγούμενο άρθρο' }
  }
  const idea = await prisma.contentIdea.findFirst({ where: { status: 'NEW' }, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }] })
  if (!idea) return { harvested: added, wrote: null, reason: 'δεν υπάρχουν ιδέες' }
  const r = await writeArticle(idea.id, { publish: s.autoPublish })
  return { harvested: added, wrote: r.postId }
}
