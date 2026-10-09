import { prisma } from '@/lib/prisma'
import { getSetting, setSetting } from '@/lib/settings'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { createNotification } from '@/lib/notifications/service'

/**
 * (Plain module.) Αυτόματη συλλογή ΠΡΟΣΚΛΗΣΕΩΝ για επιχειρήσεις από τις επίσημες πηγές:
 *  - espa.gr «Προγράμματα - Προσκλήσεις»: τομεακά ΕΣΠΑ ΚΑΙ τα 13 Περιφερειακά Προγράμματα (όλες οι Περιφέρειες
 *    δημοσιεύουν εκεί) — σελίδες λεπτομερειών ProclamationsFS.aspx?item=N, σάρωση προς τα πίσω·
 *  - agrotikianaptixi.gr (ΥΠΑΑΤ): προσκλήσεις ΣΣ ΚΑΠ, μεταξύ τους οι LEADER των ΟΤΔ (RSS)·
 *  - ependyseis.mindev.gov.gr: προκηρύξεις καθεστώτων του Αναπτυξιακού Νόμου (νεότερος κύκλος ανά καθεστώς).
 * Για κάθε νέα: μόνο ανοιχτές/αναμενόμενες → AI κρατά ΜΟΝΟ όσες απευθύνονται σε επιχειρήσεις (όχι δήμους/δημόσιο/
 * ιδιώτες) → PDF → η ίδια αποδελτίωση με το χειροκίνητο + περιεχόμενο σελίδας (CMS) — ως ΠΡΟΧΕΙΡΟ (DRAFT):
 * το γραφείο ελέγχει και ενεργοποιεί. Μνήμη ελεγμένων κλειδιών σε Setting, ώστε κάθε πρόσκληση να εξετάζεται μία φορά.
 */

const BASE = 'https://www.espa.gr'
const UA = 'Mozilla/5.0 (compatible; WWA-Bot/1.0; +https://wwa-espa.com)'
const SEEN_KEY = 'calls.harvest.seen'
const LEGACY_SEEN_KEY = 'espa.calls.seen'
const SCAN_BACK = 500 // πόσα ids πίσω από το νεότερο εξετάζονται (ανά εκτέλεση, μόνο τα μη ελεγμένα)
const MAX_NEW = 4 // νέα προγράμματα ανά εκτέλεση (κόστος αποδελτίωσης)
const KAP_FEED = 'https://www.agrotikianaptixi.gr/feed/?post_type=prosklisi'
const ANAPTYXIAKOS = 'https://ependyseis.mindev.gov.gr/el/idiotikes/prokirikseis'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}
const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&euro;/g, '€')
/** HTML → «|»-χωρισμένο κείμενο (εύκολο parsing ετικετών). */
const flat = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '|')).replace(/\s*\|[\s|]*/g, '|')
const greekDate = (s: string) => { const m = s.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/); return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null }

export type EspaCall = {
  item: number; url: string; title: string; status: string | null; description: string
  start: Date | null; end: Date | null; region: string | null; budget: string | null; pdfUrl: string | null
}

/** Τα νεότερα item ids από τη λίστα προσκλήσεων. */
async function latestIds(): Promise<number[]> {
  const html = await fetchText(`${BASE}/el/Pages/Proclamations.aspx`)
  return [...new Set([...html.matchAll(/ProclamationsFS\.aspx\?item=(\d+)/g)].map(m => Number(m[1])))].sort((a, b) => b - a)
}

export async function fetchEspaCall(item: number): Promise<EspaCall | null> {
  const url = `${BASE}/el/Pages/ProclamationsFS.aspx?item=${item}`
  const html = await fetchText(url).catch(() => '')
  if (!html) return null
  const t = flat(html)
  const head = t.indexOf('Προγράμματα - Προσκλήσεις|Ενέργειες|')
  if (head < 0) return null
  const after = t.slice(head + 'Προγράμματα - Προσκλήσεις|Ενέργειες|'.length)
  const parts = after.split('|')
  const title = (parts[0] ?? '').trim()
  if (!title || title.length < 6) return null
  const status = /^(Αναμένεται|Ανοιχτή|Ενεργή|Έκλεισε|Ολοκληρώθηκε|Ανενεργή)/i.test(parts[1] ?? '') ? parts[1].trim() : null
  const endBody = after.indexOf('|Περίοδος υποβολής|')
  const description = after.slice(0, endBody > 0 ? endBody : 3000).split('|').slice(1).filter(x => x.length > 2 && !/^Προσθήκη στη λίστα/.test(x) && x !== status).join(' ').replace(/​/g, '').trim().slice(0, 4000)
  const field = (label: string) => { const i = after.indexOf(`|${label}|`); return i >= 0 ? after.slice(i + label.length + 2).split('|')[0].trim() : null }
  const period = field('Περίοδος υποβολής') ?? ''
  const [a, b] = period.split(/\s+έως\s+/)
  const pdf = html.match(/href="([^"]+\/Lists\/Proclamations\/Attachments\/[^"]+\.pdf)"/i)?.[1] ?? null
  return {
    item, url, title, status, description,
    start: a ? greekDate(a) : null, end: b ? greekDate(b) : null,
    region: field('Περιοχή εφαρμογής'), budget: field('Προϋπολογισμός'),
    pdfUrl: pdf ? (pdf.startsWith('http') ? pdf : `${BASE}${pdf}`).replace(/ /g, '%20') : null,
  }
}

/** Κείμενο PDF πρόσκλησης (pdfjs, χωρίς worker) — έως 80 σελίδες. */
export async function pdfText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`PDF ${res.status}`)
  const data = new Uint8Array(await res.arrayBuffer())
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  let text = ''
  for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
    const page = await doc.getPage(i)
    const c = await page.getTextContent()
    text += c.items.map(x => ('str' in x ? x.str : '')).join(' ') + '\n'
  }
  return text
}

/** Ενιαία μορφή πρόσκλησης από οποιαδήποτε πηγή. */
export type HarvestCall = {
  key: string; source: string; url: string; title: string; status: string | null; description: string
  start: Date | null; end: Date | null; region: string | null; budget: string | null; pdfUrl: string | null
  /** Δεν έχουμε επίσημη περίοδο υποβολής → το AI κρίνει αν είναι ανοιχτή από το κείμενο. */
  needsOpenCheck?: boolean
}

const fromEspa = (c: EspaCall): HarvestCall => ({ ...c, key: `espa:${c.item}`, source: 'espa.gr' })

/** espa.gr: τα ids από το νεότερο προς τα πίσω (μόνο όσα δεν έχουν ελεγχθεί). */
async function* espaSource(seen: Set<string>, scanBack: number): AsyncGenerator<HarvestCall | { skipKey: string }> {
  const ids = await latestIds().catch(() => [] as number[])
  if (!ids.length) return
  const today = new Date(new Date().toISOString().slice(0, 10))
  for (let i = ids[0]; i > ids[0] - scanBack && i > 0; i--) {
    if (seen.has(`espa:${i}`)) continue
    const c = await fetchEspaCall(i).catch(() => null)
    // Ανύπαρκτο/κλειστό/ληγμένο → ελεγμένο (δεν ξαναεξετάζεται).
    if (!c || /Έκλεισε|Ολοκληρώθηκε|Ανενεργή/i.test(c.status ?? '') || (c.end && c.end < today)) { yield { skipKey: `espa:${i}` }; continue }
    yield fromEspa(c)
  }
}

const pickPdf = (links: { href: string; text: string }[]) => {
  const pdfs = links.filter(l => /\.pdf(\?|$)/i.test(l.href))
  return (pdfs.find(l => /(πρόσκληση|προσκληση|prosklisi|proskl)/i.test(l.text + l.href) && !/(περίληψη|perilipsi|παράρτημα|parartima|τροποποίηση|tropopoi)/i.test(l.text + l.href))
    ?? pdfs.find(l => !/(παράρτημα|parartima)/i.test(l.text + l.href)) ?? pdfs[0])?.href ?? null
}
const linksOf = (html: string) => [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ href: decode(m[1]), text: decode(m[2].replace(/<[^>]+>/g, ' ')).trim() }))
const cdata = (s: string) => s.replace(/^<!\[CDATA\[|\]\]>$/g, '')

/** ΥΠΑΑΤ / Αγροτική Ανάπτυξη: προσκλήσεις ΣΣ ΚΑΠ (LEADER των ΟΤΔ κ.ά.) από το RSS — τελευταίοι 4 μήνες. */
async function* kapSource(seen: Set<string>): AsyncGenerator<HarvestCall | { skipKey: string }> {
  const since = Date.now() - 120 * 86_400_000
  for (const page of [1, 2]) {
    const xml = await fetchText(page === 1 ? KAP_FEED : `${KAP_FEED}&paged=${page}`).catch(() => '')
    for (const item of xml.split('<item>').slice(1)) {
      const tag = (t: string) => cdata(item.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1]?.trim() ?? '')
      const url = decode(tag('link')), title = decode(tag('title'))
      if (!url || !title) continue
      const key = `kap:${url}`
      if (seen.has(key)) continue
      const pub = Date.parse(tag('pubDate'))
      if (pub && pub < since) { yield { skipKey: key }; continue }
      // Δημόσιου χαρακτήρα (δήμοι/φορείς) → χωρίς AI.
      if (/δημ[οό]σιου\s+χαρακτήρα/i.test(title)) { yield { skipKey: key }; continue }
      const content = tag('content:encoded') || tag('description')
      // Τα συνημμένα (PDF πρόσκλησης) συχνά υπάρχουν μόνο στη σελίδα, όχι στο RSS.
      const pdfUrl = pickPdf(linksOf(content)) ?? pickPdf(linksOf(await fetchText(url).catch(() => '')))
      yield {
        key, source: 'agrotikianaptixi.gr (ΣΣ ΚΑΠ / LEADER)', url, title: title.slice(0, 300), status: null,
        description: flat(content).replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000),
        start: null, end: null, region: null, budget: null, pdfUrl, needsOpenCheck: true,
      }
    }
  }
}

/** Αναπτυξιακός Νόμος: κάθε καθεστώς (h4) → ο νεότερος κύκλος του → η κύρια προκήρυξη (κωδικοποίηση αν υπάρχει). */
async function* anaptyxiakosSource(seen: Set<string>): AsyncGenerator<HarvestCall | { skipKey: string }> {
  const html = await fetchText(ANAPTYXIAKOS).catch(() => '')
  const year = new Date().getFullYear()
  for (const block of html.split(/<h4[^>]*>/i).slice(1)) {
    const scheme = decode(block.slice(0, block.indexOf('</h4>')).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    const cycleParts = block.split(/<div class="h6 text-primary">/i)
    if (!scheme || cycleParts.length < 2) continue
    const latest = cycleParts[1]
    const cycle = decode(latest.slice(0, latest.indexOf('</div>')).replace(/<[^>]+>/g, '')).trim()
    const key = `an:${scheme}|${cycle}`
    if (seen.has(key)) continue
    const docs = [...latest.matchAll(/<b>([\s\S]*?)<\/b>[\s\S]*?href="([^"]+)"/gi)].map(m => ({ text: decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(), href: decode(m[2]) }))
    // Παλιός κύκλος (κανένα έγγραφο φετινό/περσινό) → εκτός.
    if (!docs.length || !docs.some(d => new RegExp(`${year}|${year - 1}`).test(d.text + d.href))) { yield { skipKey: key }; continue }
    const main = docs.find(d => /^ΚΩΔΙΚΟΠΟΙΗΣΗ/i.test(d.text)) ?? docs.find(d => /Προκήρυξη/i.test(d.text) && !/^(Τροποποίηση|\d+η Τροποποίηση|ΠΡΟΔΗΜΟΣΙΕΥΣΗ)/i.test(d.text)) ?? docs[0]
    yield {
      key, source: 'ependyseis.mindev.gov.gr (Αναπτυξιακός Νόμος)', url: `${ANAPTYXIAKOS}#${encodeURIComponent(`${scheme} ${cycle}`)}`,
      title: `${scheme.replace(/\s*[-–]\s*Ν\.\s*4887\/2022\s*$/i, '')} — Αναπτυξιακός Νόμος (${cycle.toLowerCase()})`.slice(0, 300), status: null,
      description: docs.map(d => d.text).join(' · ').slice(0, 3000),
      start: null, end: null, region: 'Όλη η Ελλάδα', budget: null, pdfUrl: main.href.endsWith('.pdf') ? main.href : null, needsOpenCheck: true,
    }
  }
}

/**
 * AI: αφορά επιχειρήσεις; (+ για πηγές χωρίς επίσημη περίοδο: είναι ανοιχτή ή αναμένεται;)
 * `text` = αρχή του PDF όταν η περιγραφή δεν αρκεί.
 */
export async function isForBusinesses(c: HarvestCall | EspaCall, text?: string): Promise<{ ok: boolean; open: boolean | null; start: Date | null; end: Date | null; reason: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const askOpen = 'needsOpenCheck' in c && c.needsOpenCheck
  const raw = await deepseekChat([
    { role: 'system', content: 'Κρίνε αν μια πρόσκληση χρηματοδότησης απευθύνεται σε ΙΔΙΩΤΙΚΕΣ ΕΠΙΧΕΙΡΗΣΕΙΣ (ΜμΕ, μεγάλες, νέες/υπό σύσταση επιχειρήσεις, ελεύθερους επαγγελματίες, αγρότες/γεωργικές εκμεταλλεύσεις, συνεταιρισμούς) ως δικαιούχους. ΟΧΙ αν δικαιούχοι είναι δήμοι, περιφέρειες, δημόσιοι φορείς, σχολεία/ΑΕΙ, νοσοκομεία, ΜΚΟ ή φυσικά πρόσωπα/νοικοκυριά/άνεργοι.'
      + (askOpen ? ` Σήμερα είναι ${today}. Κρίνε ΕΠΙΣΗΣ αν η υποβολή αιτήσεων είναι ανοιχτή ή αναμένεται να ανοίξει (open:true), έχει λήξει (open:false) ή δεν φαίνεται (open:null), και δώσε τις ημερομηνίες έναρξης/λήξης υποβολής αν αναφέρονται (YYYY-MM-DD ή null).` : '')
      + ' ΑΥΣΤΗΡΑ JSON: {"business":true|false,"open":true|false|null,"start":"YYYY-MM-DD"|null,"end":"YYYY-MM-DD"|null,"reason":"σύντομα"}' },
    { role: 'user', content: `Τίτλος: ${c.title}\nΠεριοχή: ${c.region ?? '—'}\nΠεριγραφή: ${c.description.slice(0, 2500)}${text ? `\n\nΑπόσπασμα κειμένου πρόσκλησης:\n${text.slice(0, 7000)}` : ''}` },
  ], { model: 'deepseek-v4-pro', reasoningEffort: 'low', maxTokens: 1500, temperature: 0, refType: 'espa-call-classify' })
  const j = parseJsonLoose(raw) as { business?: boolean; open?: boolean | null; start?: string | null; end?: string | null; reason?: string } | null
  const d = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null)
  return { ok: j?.business === true, open: typeof j?.open === 'boolean' ? j.open : null, start: d(j?.start), end: d(j?.end), reason: j?.reason ?? '' }
}

export type HarvestResult = { checked: number; business: number; created: { id: string; title: string; source: string }[]; skipped: number }

/** Όλες οι πηγές. Το espa.gr τελευταίο (το πιο «φορτωμένο»), ώστε LEADER/Αναπτυξιακός να μη χάνονται λόγω ορίου. */
export async function harvestEspaCalls(opts: { scanBack?: number; maxNew?: number; dryRun?: (c: HarvestCall, verdict: string) => void } = {}): Promise<HarvestResult> {
  const stored = (await getSetting<string[]>(SEEN_KEY)) ?? []
  const legacy = stored.length ? [] : ((await getSetting<number[]>(LEGACY_SEEN_KEY)) ?? []).map(n => `espa:${n}`)
  const seen = new Set([...stored, ...legacy])
  const maxNew = opts.maxNew ?? MAX_NEW
  const today = new Date(new Date().toISOString().slice(0, 10))
  const result: HarvestResult = { checked: 0, business: 0, created: [], skipped: 0 }
  const { extractProgramFromText } = await import('./extract')
  const { persistExtractedProgram } = await import('./persist')
  const { generateProgramCms } = await import('./cms')

  const sources = [anaptyxiakosSource(seen), kapSource(seen), espaSource(seen, opts.scanBack ?? SCAN_BACK)]
  try {
    for (const source of sources) {
      for await (const next of source) {
        if (result.created.length >= maxNew) break
        if ('skipKey' in next) { seen.add(next.skipKey); result.skipped++; continue }
        const c = next
        result.checked++
        // Ήδη στο σύστημα (ίδια πηγή);
        if (await prisma.programReference.findFirst({ where: { url: { in: [c.url, ...(c.pdfUrl ? [c.pdfUrl] : [])] } }, select: { id: true } })) { seen.add(c.key); continue }
        // Χωρίς επίσημη περίοδο → διαβάζουμε την αρχή του PDF για να κρίνει το AI και το «ανοιχτή;».
        const fullText = c.needsOpenCheck && c.pdfUrl ? await pdfText(c.pdfUrl).catch(() => '') : ''
        const cls = await isForBusinesses(c, fullText ? fullText.slice(0, 9000) : undefined).catch(() => null)
        if (!cls) continue // σφάλμα AI → ξανά στην επόμενη εκτέλεση
        seen.add(c.key)
        if (!cls.ok) { result.skipped++; continue }
        if (c.needsOpenCheck) {
          if (cls.open === false || (cls.end && cls.end < today)) { result.skipped++; continue }
          c.start ??= cls.start; c.end ??= cls.end
        }
        result.business++
        if (opts.dryRun) { opts.dryRun(c, cls.reason); result.created.push({ id: '-', title: c.title, source: c.source }); continue }

        const program = await prisma.program.create({
          data: {
            title: c.title.slice(0, 300), summary: c.description.slice(0, 1200) || null,
            submissionStart: c.start, submissionEnd: c.end, status: 'DRAFT',
            notes: `Αυτόματη συλλογή από ${c.source}${c.status ? ` — κατάσταση: ${c.status}` : ''}. Ελέγξτε τα στοιχεία και ενεργοποιήστε για δημοσίευση.`,
          },
          select: { id: true },
        })
        await prisma.programReference.create({ data: { programId: program.id, kind: 'URL', title: `Επίσημη πρόσκληση (${c.source.split(' ')[0]})`, url: c.url, status: 'READY' } })
        if (c.pdfUrl) await prisma.programReference.create({ data: { programId: program.id, kind: 'URL', title: 'PDF πρόσκλησης', url: c.pdfUrl, status: 'READY' } })

        // Αποδελτίωση του PDF (όροι/ΚΑΔ/περιοχές/δικαιολογητικά) + περιεχόμενο σελίδας. Best-effort.
        try {
          const text = fullText || (c.pdfUrl ? await pdfText(c.pdfUrl) : '') || `${c.title}\n${c.description}\nΠεριοχή: ${c.region ?? ''}\nΠροϋπολογισμός: ${c.budget ?? ''}`
          const r = await extractProgramFromText(text, { refId: program.id })
          await persistExtractedProgram(program.id, r.data)
          await prisma.program.update({ where: { id: program.id }, data: { model: r.model, extractedData: JSON.parse(JSON.stringify(r.data)), extractStatus: 'DONE', sourceFileName: c.pdfUrl ? decodeURIComponent(c.pdfUrl.split('/').pop() ?? '') : null } })
          // Η επίσημη περίοδος της πηγής υπερισχύει.
          if (c.start || c.end) await prisma.program.update({ where: { id: program.id }, data: { ...(c.start ? { submissionStart: c.start } : {}), ...(c.end ? { submissionEnd: c.end } : {}) } })
          await generateProgramCms(program.id).catch(err => console.error('[calls-harvest] cms', err))
        } catch (err) {
          console.error('[calls-harvest] αποδελτίωση', c.key, err)
          await prisma.program.update({ where: { id: program.id }, data: { extractStatus: 'FAILED', errorMessage: 'Η αυτόματη αποδελτίωση απέτυχε — ανεβάστε το PDF χειροκίνητα.' } }).catch(() => null)
        }
        result.created.push({ id: program.id, title: c.title, source: c.source })
        await createNotification({
          title: `Νέα πρόσκληση για επιχειρήσεις: ${c.title.slice(0, 90)}`,
          body: `Συλλέχθηκε αυτόματα από ${c.source}${c.end ? ` (υποβολές έως ${c.end.toLocaleDateString('el-GR')})` : ''}. Είναι πρόχειρο — ελέγξτε τα στοιχεία και ενεργοποιήστε το για να δημοσιευτεί στο site.`,
          entityType: 'Program', entityId: program.id, meta: { kind: 'espa-call', key: c.key, url: c.url },
        })
      }
      if (result.created.length >= maxNew) break
    }
  } finally {
    if (!opts.dryRun) await setSetting(SEEN_KEY, [...seen].slice(-5000))
  }
  return result
}
