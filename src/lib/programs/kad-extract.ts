// SERVER: πλήρης εξαγωγή ΚΑΔ ενός προγράμματος χρηματοδότησης από το κείμενο
// του PDF. Το DeepSeek prompt (extract-prompt.ts §ΚΑΔ) ΣΚΟΠΙΜΑ επιστρέφει μόνο
// ~20 αντιπροσωπευτικούς ΚΑΔ ως δείγμα και αφήνει την πλήρη λίστα σε ΑΥΤΟ το
// regex + registry βήμα — αλλιώς το output θα ξεπερνούσε το max_tokens σε
// προσκλήσεις με εκατοντάδες ΚΑΔ και θα κοβόταν.
//
// Κάθε υποψήφιος κωδικός φιλτράρεται μέσω του μητρώου KadCode (W1): κρατάμε ΜΟΝΟ
// όσους αντιστοιχούν σε πραγματικό ΚΑΔ, οπότε ημερομηνίες (31.12.2024), ποσά
// (1.000.000) και άσχετοι αριθμοί απορρίπτονται αυτόματα. Το αποτέλεσμα φέρει
// τον canonical dotted κωδικό + περιγραφή από το μητρώο.

import { prisma } from '@/lib/prisma'

// Dotted ΚΑΔ token: 2ψήφιος τομέας + 1–4 ομάδες ".<1-3 ψηφία>"
// (π.χ. 20.5, 20.51, 20.51.1, 20.59.59.03). Bare runs χωρίς τελείες ΔΕΝ
// πιάνονται επίτηδες (θόρυβος: ΑΦΜ / ΑΔΑ / τηλέφωνα / αριθμοί ΦΕΚ).
const KAD_TOKEN = /\d{2}(?:\.\d{1,3}){1,4}/g

export type ExtractedKad = { code: string; description: string | null }

/**
 * Σαρώνει όλο το κείμενο του PDF, μαζεύει υποψήφιους ΚΑΔ, τους αντιστοιχεί στο
 * μητρώο KadCode και επιστρέφει τη ΜΟΝΑΔΙΚΗ λίστα των πραγματικών ΚΑΔ που
 * βρέθηκαν (canonical code + περιγραφή), ταξινομημένη κατά κωδικό.
 */
export async function extractProgramKads(text: string): Promise<ExtractedKad[]> {
  if (!text) return []

  const digitForms = new Set<string>()
  for (const m of text.matchAll(KAD_TOKEN)) {
    // Απόρριψε fragments μεγαλύτερου αριθμού: τηλέφωνο "210.1234567" → "10.123",
    // ημερομηνία "31.12.2024" → "31.12.202", ΑΦΜ/ΦΕΚ. Ένα γνήσιο ΚΑΔ σε πίνακα
    // περιβάλλεται από κενό/γράμμα, ΠΟΤΕ από ψηφίο ή τελεία.
    const start = m.index ?? 0
    const before = start > 0 ? text[start - 1] : ''
    const after = text[start + m[0].length] ?? ''
    if (/[\d.]/.test(before) || /\d/.test(after)) continue
    const digits = m[0].replace(/\D/g, '')
    // Έγκυρα μήκη ΚΑΔ: 3 (τάξη π.χ. 20.5 → "205") έως 10 ψηφία (εθνικοί).
    if (digits.length >= 3 && digits.length <= 12) digitForms.add(digits)
  }
  if (digitForms.size === 0) return []

  // Ένα batch query — κάθε επιστρεφόμενη γραμμή είναι πραγματικός ΚΑΔ που
  // εμφανίστηκε στο κείμενο (το codeWithoutDots ταιριάζει με έναν υποψήφιο).
  const rows = await prisma.kadCode.findMany({
    where: { codeWithoutDots: { in: [...digitForms] } },
    select: { code: true, title: true, description: true },
  })

  const out = new Map<string, ExtractedKad>()
  for (const r of rows) {
    if (!out.has(r.code)) out.set(r.code, { code: r.code, description: r.title ?? r.description ?? null })
  }
  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/** Όλο το κείμενο ενός PDF (pdfjs, χωρίς worker, ΟΛΕΣ οι σελίδες) — για οδηγούς εκατοντάδων σελίδων. */
export async function pdfFullText(buf: Buffer | Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent()
    parts.push(c.items.map(x => ('str' in x ? x.str : '')).join(' '))
  }
  return parts.join('\n')
}

// Παραλλαγές επικεφαλίδας (αναζήτηση ΧΩΡΙΣ τόνους): «ΠΑΡΑΡΤΗΜΑ ΧΙ: ΕΠΙΛΕΞΙΜΟΙ ΤΟΜΕΙΣ ΔΡΑΣΤΗΡΙΟΤΗΤΑΣ (ΚΑΔ)»,
// «Παράρτημα III EΠΙΛΕΞΙΜΕΣ ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ (ΚΑΔ)» (λατινικό E!), «ΠΑΡΑΡΤΗΜΑ Γ – ΕΠΙΛΕΞΙΜΟΙ ΚΑΔ», «Παράρτημα Ι:
// Επιλέξιμοι κωδικοί αριθμοί δραστηριότητας (ΚΑΔ)». Αριθμός: ρωμαϊκά (λατ./ελλ.), γράμμα (Α/Β/Γ…) ή ψηφία.
const ANNEX_HEAD = /ΠΑΡΑΡΤΗΜΑ\s+[ΙIVXΧΑΒΓΔΕΖ0-9]{1,6}(?:\s+[ΙIVXΧ]{1,3})?\s*[:.–—-]?\s*[«"]?\s*[EΕ]ΠΙΛΕΞΙΜ[^\n]{0,90}?(?:ΚΑΔ|Κ\.Α\.Δ\.)/gi
const stripAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
/** Η λίστα τελειώνει εκεί που σταματούν οι κωδικοί: κενό > GAP χαρακτήρων χωρίς ΚΑΔ μετά τον πρώτο. */
const GAP = 6000

/**
 * ΠΑΡΑΡΤΗΜΑ «Επιλέξιμοι … (ΚΑΔ)» από ΟΛΟ το κείμενο του οδηγού: οι οδηγοί έχουν συχνά λίστες χιλιάδων ΚΑΔ σε 100+
 * σελίδες, που χάνονται όταν το κείμενο της αποδελτίωσης κόβεται. Για κάθε εμφάνιση της επικεφαλίδας (και του πίνακα
 * περιεχομένων) παίρνεται το συνεχές τμήμα κωδικών που ακολουθεί· κρατιέται το μεγαλύτερο. «ΜΗ ΕΠΙΛΕΞΙΜΟΙ» αγνοείται.
 * null αν δεν βρεθεί παράρτημα.
 */
export async function kadAnnexFromText(fullRaw: string): Promise<ExtractedKad[] | null> {
  const full = stripAccents(fullRaw)
  let best: ExtractedKad[] | null = null
  for (const m of full.matchAll(ANNEX_HEAD)) {
    const at = m.index ?? 0
    if (/ΜΗ\s*$/i.test(full.slice(Math.max(0, at - 6), at)) || /ΜΗ\s+[EΕ]ΠΙΛΕΞΙΜ/i.test(m[0])) continue
    // Συνεχές τμήμα κωδικών μετά την επικεφαλίδα (ανεξάρτητα από το πώς γράφονται οι επόμενες επικεφαλίδες).
    const rest = full.slice(at + m[0].length)
    let first = -1, last = -1
    for (const t of rest.matchAll(KAD_TOKEN)) {
      const i = t.index ?? 0
      if (first < 0) { if (i > 20_000) break; first = i }
      else if (i - last > GAP) break
      last = i + t[0].length
    }
    if (first < 0) continue
    const kads = await extractProgramKads(rest.slice(first, last))
    if (kads.length >= 20 && (!best || kads.length > best.length)) best = kads
  }
  // Δικλίδα: «παράρτημα» με σχεδόν όλο το μητρώο = ΟΛΗ η ονοματολογία με στήλη επιλεξιμότητας (π.χ. «Πράσινη
  // Παραγωγική Επένδυση»), όχι λίστα μόνο των επιλέξιμων — δεν χρησιμοποιείται (θα έκανε επιλέξιμους όλους τους ΚΑΔ).
  if (best) {
    const registry = await prisma.kadCode.count()
    if (registry > 0 && best.length > registry * 0.4) {
      console.warn(`[kad-annex] ${best.length}/${registry} ΚΑΔ — πλήρης ονοματολογία, όχι λίστα επιλέξιμων· αγνοείται`)
      return null
    }
  }
  return best
}

/**
 * Παράρτημα ΚΑΔ από ΟΛΑ τα PDF του προγράμματος: κύριος οδηγός (storageKey), συμπληρωματικοί οδηγοί (αρχεία στη
 * γνωσιακή μνήμη) και το PDF της πρόσκλησης από την πηγή (σύνδεσμος, π.χ. espa.gr) — κρατιέται το μεγαλύτερο έγκυρο.
 * null αν κανένα δεν έχει παράρτημα επιλέξιμων ΚΑΔ.
 */
export async function kadAnnexForProgram(programId: string): Promise<ExtractedKad[] | null> {
  const [p, refs] = await Promise.all([
    prisma.program.findUnique({ where: { id: programId }, select: { storageKey: true } }),
    prisma.programReference.findMany({ where: { programId, OR: [{ kind: 'FILE', storageKey: { not: null } }, { kind: 'URL', url: { endsWith: '.pdf', mode: 'insensitive' } }] }, select: { kind: true, storageKey: true, url: true, mimeType: true, fileName: true }, take: 10 }),
  ])
  const sources: (() => Promise<Uint8Array>)[] = []
  const { bunnyDownload } = await import('@/lib/bunny-storage')
  if (p?.storageKey) sources.push(async () => new Uint8Array(await bunnyDownload(p.storageKey!)))
  for (const r of refs) {
    if (r.kind === 'FILE' && r.storageKey && (r.mimeType === 'application/pdf' || /\.pdf$/i.test(r.fileName ?? r.storageKey))) sources.push(async () => new Uint8Array(await bunnyDownload(r.storageKey!)))
    if (r.kind === 'URL' && r.url) sources.push(async () => {
      const res = await fetch(r.url!, { headers: { 'User-Agent': 'Mozilla/5.0 (WWA)' }, signal: AbortSignal.timeout(90_000) })
      if (!res.ok) throw new Error(`PDF ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    })
  }
  let best: ExtractedKad[] | null = null
  for (const load of sources) {
    try {
      const a = await kadAnnexFromText(await pdfFullText(await load()))
      if (a && (!best || a.length > best.length)) best = a
    } catch (err) {
      console.warn('[kad-annex] ανάγνωση PDF απέτυχε', programId, err instanceof Error ? err.message : err)
    }
  }
  return best
}

/**
 * ΕΝΙΑΙΟ βήμα κάθε αποδελτίωσης (χειροκίνητη, «Προσθήκη οδηγού», αυτόματη συλλογή από espa.gr): αν κάποιο PDF του
 * προγράμματος έχει πληρέστερη λίστα επιλέξιμων ΚΑΔ από αυτή που βρήκε η αποδελτίωση, αυτή υπερισχύει
 * (κανόνας «μόνο οι αναφερόμενοι»). Ποτέ δεν μειώνει τη λίστα.
 */
export async function applyKadAnnex<T extends { kads: { code: string; description?: string | null }[]; kadRule: string | null }>(programId: string, data: T): Promise<T> {
  const annex = await kadAnnexForProgram(programId)
  return annex && annex.length > data.kads.length ? { ...data, kads: annex, kadRule: 'ONLY_LISTED' } : data
}
