import { prisma } from '@/lib/prisma'
import { getSetting, setSetting } from '@/lib/settings'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { createNotification } from '@/lib/notifications/service'

/**
 * (Plain module.) Αυτόματη συλλογή ΠΡΟΣΚΛΗΣΕΩΝ από το espa.gr («Προγράμματα - Προσκλήσεις»):
 *  1. νέα item ids από τη λίστα + σάρωση προς τα πίσω (σελίδες λεπτομερειών ProclamationsFS.aspx?item=N)·
 *  2. μόνο ανοιχτές/αναμενόμενες, με λήξη από σήμερα και μετά·
 *  3. AI: κρατά ΜΟΝΟ όσες απευθύνονται σε ιδιωτικές επιχειρήσεις (όχι δήμους/δημόσιους φορείς/ιδιώτες)·
 *  4. PDF πρόσκλησης → κείμενο → η ίδια αποδελτίωση με το χειροκίνητο (όροι, ΚΑΔ, περιοχές, δικαιολογητικά) +
 *     περιεχόμενο σελίδας (CMS) — ως ΠΡΟΧΕΙΡΟ (DRAFT): το γραφείο ελέγχει και ενεργοποιεί.
 * Μνήμη ελεγμένων ids σε Setting, ώστε κάθε πρόσκληση να εξετάζεται μία φορά.
 */

const BASE = 'https://www.espa.gr'
const UA = 'Mozilla/5.0 (compatible; WWA-Bot/1.0; +https://wwa-espa.com)'
const SEEN_KEY = 'espa.calls.seen'
const SCAN_BACK = 80 // πόσα ids πίσω από το νεότερο εξετάζονται (ανά εκτέλεση, μόνο τα μη ελεγμένα)
const MAX_NEW = 4 // νέα προγράμματα ανά εκτέλεση (κόστος αποδελτίωσης)

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

/** AI: αφορά ιδιωτικές επιχειρήσεις; (όχι δήμους/δημόσιο/ΑΕΙ/ιδιώτες-νοικοκυριά) */
export async function isForBusinesses(c: EspaCall): Promise<{ ok: boolean; reason: string }> {
  const raw = await deepseekChat([
    { role: 'system', content: 'Κρίνε αν μια πρόσκληση ΕΣΠΑ απευθύνεται σε ΙΔΙΩΤΙΚΕΣ ΕΠΙΧΕΙΡΗΣΕΙΣ (ΜμΕ, επιχειρήσεις, νέες επιχειρήσεις, ελεύθερους επαγγελματίες με επιχειρηματική δραστηριότητα) ως δικαιούχους. ΟΧΙ αν δικαιούχοι είναι δήμοι, περιφέρειες, δημόσιοι φορείς, σχολεία/ΑΕΙ, νοσοκομεία, ΜΚΟ ή φυσικά πρόσωπα/νοικοκυριά/άνεργοι. ΑΥΣΤΗΡΑ JSON: {"business":true|false,"reason":"σύντομα"}' },
    { role: 'user', content: `Τίτλος: ${c.title}\nΠεριοχή: ${c.region ?? '—'}\nΠεριγραφή: ${c.description.slice(0, 2500)}` },
  ], { model: 'deepseek-v4-pro', reasoningEffort: 'low', maxTokens: 1500, temperature: 0, refType: 'espa-call-classify' })
  const j = parseJsonLoose(raw) as { business?: boolean; reason?: string } | null
  return { ok: j?.business === true, reason: j?.reason ?? '' }
}

export type HarvestResult = { checked: number; business: number; created: { id: string; title: string }[]; skipped: number }

export async function harvestEspaCalls(opts: { scanBack?: number; maxNew?: number } = {}): Promise<HarvestResult> {
  const seen = new Set((await getSetting<number[]>(SEEN_KEY)) ?? [])
  const ids = await latestIds()
  if (!ids.length) return { checked: 0, business: 0, created: [], skipped: 0 }
  const top = ids[0]
  const candidates: number[] = []
  for (let i = top; i > top - (opts.scanBack ?? SCAN_BACK) && i > 0; i--) if (!seen.has(i)) candidates.push(i)
  const today = new Date(new Date().toISOString().slice(0, 10))
  const result: HarvestResult = { checked: 0, business: 0, created: [], skipped: 0 }
  const { extractProgramFromText } = await import('./extract')
  const { persistExtractedProgram } = await import('./persist')
  const { generateProgramCms } = await import('./cms')

  for (const item of candidates) {
    if (result.created.length >= (opts.maxNew ?? MAX_NEW)) break
    result.checked++
    const c = await fetchEspaCall(item).catch(() => null)
    // Ανύπαρκτο/κλειστό/ληγμένο → σημειώνεται ως ελεγμένο (δεν ξαναεξετάζεται).
    if (!c || /Έκλεισε|Ολοκληρώθηκε|Ανενεργή/i.test(c.status ?? '') || (c.end && c.end < today)) { seen.add(item); result.skipped++; continue }
    // Ήδη στο σύστημα (ίδια πηγή);
    if (await prisma.programReference.findFirst({ where: { url: c.url }, select: { id: true } })) { seen.add(item); continue }
    const cls = await isForBusinesses(c).catch(() => null)
    if (!cls) continue // σφάλμα AI → θα ξαναδοκιμαστεί στην επόμενη εκτέλεση
    seen.add(item)
    if (!cls.ok) { result.skipped++; continue }
    result.business++

    const program = await prisma.program.create({
      data: {
        title: c.title.slice(0, 300), summary: c.description.slice(0, 1200) || null,
        submissionStart: c.start, submissionEnd: c.end, status: 'DRAFT',
        notes: `Αυτόματη συλλογή από espa.gr (item ${c.item})${c.status ? ` — κατάσταση: ${c.status}` : ''}. Ελέγξτε τα στοιχεία και ενεργοποιήστε για δημοσίευση.`,
      },
      select: { id: true },
    })
    await prisma.programReference.create({ data: { programId: program.id, kind: 'URL', title: 'Επίσημη πρόσκληση (espa.gr)', url: c.url, status: 'READY' } })
    if (c.pdfUrl) await prisma.programReference.create({ data: { programId: program.id, kind: 'URL', title: 'PDF πρόσκλησης', url: c.pdfUrl, status: 'READY' } })

    // Αποδελτίωση του PDF (όροι/ΚΑΔ/περιοχές/δικαιολογητικά) + περιεχόμενο σελίδας. Best-effort.
    try {
      const text = c.pdfUrl ? await pdfText(c.pdfUrl) : `${c.title}\n${c.description}\nΠεριοχή: ${c.region ?? ''}\nΠροϋπολογισμός: ${c.budget ?? ''}`
      const r = await extractProgramFromText(text, { refId: program.id })
      await persistExtractedProgram(program.id, r.data)
      await prisma.program.update({ where: { id: program.id }, data: { model: r.model, extractedData: JSON.parse(JSON.stringify(r.data)), extractStatus: 'DONE', sourceFileName: c.pdfUrl ? decodeURIComponent(c.pdfUrl.split('/').pop() ?? '') : null } })
      // Η περίοδος του espa.gr υπερισχύει (είναι η επίσημη τρέχουσα).
      if (c.start || c.end) await prisma.program.update({ where: { id: program.id }, data: { ...(c.start ? { submissionStart: c.start } : {}), ...(c.end ? { submissionEnd: c.end } : {}) } })
      await generateProgramCms(program.id).catch(err => console.error('[espa-harvest] cms', err))
    } catch (err) {
      console.error('[espa-harvest] αποδελτίωση', item, err)
      await prisma.program.update({ where: { id: program.id }, data: { extractStatus: 'FAILED', errorMessage: 'Η αυτόματη αποδελτίωση απέτυχε — ανεβάστε το PDF χειροκίνητα.' } }).catch(() => null)
    }
    result.created.push({ id: program.id, title: c.title })
    await createNotification({
      title: `Νέα πρόσκληση για επιχειρήσεις: ${c.title.slice(0, 90)}`,
      body: `Συλλέχθηκε αυτόματα από το espa.gr${c.end ? ` (υποβολές έως ${c.end.toLocaleDateString('el-GR')})` : ''}. Είναι πρόχειρο — ελέγξτε τα στοιχεία και ενεργοποιήστε το για να δημοσιευτεί στο site.`,
      entityType: 'Program', entityId: program.id, meta: { kind: 'espa-call', item: c.item, url: c.url },
    })
  }
  await setSetting(SEEN_KEY, [...seen].sort((a, b) => b - a).slice(0, 3000))
  return result
}
