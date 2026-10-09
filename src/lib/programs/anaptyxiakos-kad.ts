import { prisma } from '@/lib/prisma'

/**
 * (Plain module.) Επίσημοι πίνακες επιλεξιμότητας ΚΑΔ των καθεστώτων του Αναπτυξιακού Νόμου (Υπουργείο Ανάπτυξης,
 * «Υποστηρικτικό υλικό»). Κάθε πίνακας έχει ΟΛΗ την ονοματολογία ΚΑΔ με 1 = επιλέξιμος / 0 = μη επιλέξιμος. Κρατάμε
 * μόνο τους επιλέξιμους, συμπτυγμένους σε ομάδες (όπου ΟΛΟΙ οι υποκωδικοί είναι επιλέξιμοι κρατιέται μόνο το πρόθεμα),
 * ώστε ο έλεγχος με ΑΦΜ / «Έλεγχος ΚΑΔ» / δυνητικά προγράμματα να είναι ακριβής.
 */

const SUPPORT_PAGE = 'https://ependyseis.mindev.gov.gr/el/idiotikes/ypostiriktiko-yliko/anaptiksiakos'
const UA = 'Mozilla/5.0 (compatible; WWA-Bot/1.0; +https://wwa-espa.com)'

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// Ρίζες λέξεων (5 πρώτα γράμματα): «Μεγάλες Επενδύσεις» ≈ «Μεγάλων Επενδύσεων», «Μεταποίηση» ≈ «Μεταποίησης».
const STOPSTEMS = new Set(['καθεσ', 'ενισχ', 'αναπτ', 'νομου', 'κυκλο', 'προκη', 'σχεδι', 'επεν'])
const words = (s: string) => new Set(norm(s).split(/[^a-zα-ω0-9]+/).filter(w => w.length > 3).map(w => w.slice(0, 5)).filter(w => !STOPSTEMS.has(w)))

/** Ο πίνακας ΚΑΔ του καθεστώτος (το πρώτο/νεότερο αρχείο «ΚΑΔ …» με την καλύτερη επικάλυψη ονόματος). */
export async function findSchemeKadTable(schemeName: string): Promise<{ title: string; url: string } | null> {
  const res = await fetch(SUPPORT_PAGE, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null)
  if (!res?.ok) return null
  const html = await res.text()
  const want = words(schemeName)
  let best: { title: string; url: string; score: number } | null = null
  // Η σελίδα είναι γραμμές «py-3 border-bottom»: τίτλος σε <b> + σύνδεσμος αρχείου στην ίδια γραμμή.
  for (const block of html.split(/class="py-3 border-bottom"/i).slice(1)) {
    const title = decode(block.match(/<b>([\s\S]*?)<\/b>/i)?.[1] ?? '')
    const url = block.match(/href="([^"]+\.xlsx?)"/i)?.[1]
    if (!url || !/^ΚΑΔ(\s|$)/.test(title)) continue
    const have = words(title)
    if (!have.size) continue
    let hits = 0
    for (const w of have) if (want.has(w)) hits++
    // Τουλάχιστον 60% των λέξεων του τίτλου του πίνακα (όχι «Διπλή Χρήση» → «Μεγάλες Επενδύσεις» λόγω «επενδυτικών»).
    const score = hits / have.size
    if (score >= 0.6 && (!best || score > best.score)) best = { title, url, score }
  }
  return best ? { title: best.title, url: best.url } : null
}

const dotted = (digits8: string) => {
  const p = digits8.match(/../g) ?? []
  while (p.length > 1 && p[p.length - 1] === '00') p.pop()
  return p.join('.')
}

/** Πίνακας (xls/xlsx) → επιλέξιμοι ΚΑΔ συμπτυγμένοι σε προθέματα. */
export async function parseKadTable(buf: ArrayBuffer): Promise<{ code: string; description: string }[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  let items: { code: string; desc: string; ok: boolean }[] = []
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '' })
    const h = rows.findIndex(r => r.some(c => /KAD_CODE|ΚΑΔ/i.test(String(c))) && r.some(c => /επιλεξιμότητα/i.test(String(c))))
    if (h < 0) continue
    const head = rows[h].map(c => String(c))
    const iCode = head.findIndex(c => /KAD_CODE|ΚΩΔΙΚ|^ΚΑΔ/i.test(c))
    const iDesc = head.findIndex(c => /DESC|ΠΕΡΙΓΡΑΦ/i.test(c))
    const iOk = head.findIndex(c => /^επιλεξιμότητα/i.test(c.trim()))
    if (iCode < 0 || iOk < 0) continue
    items = rows.slice(h + 1)
      .filter(r => /^\d{5,8}$/.test(String(r[iCode]).replace(/\D/g, '')))
      .map(r => ({ code: String(r[iCode]).replace(/\D/g, '').padStart(8, '0'), desc: String(r[iDesc] ?? ''), ok: Number(r[iOk]) === 1 }))
    if (items.length) break
  }
  if (!items.some(i => i.ok)) return []
  // Σύμπτυξη: από τα γενικά προς τα ειδικά προθέματα, όπου ΟΛΑ τα μη καλυμμένα είναι επιλέξιμα.
  const covered = new Set<string>()
  const out: { code: string; description: string }[] = []
  for (const len of [2, 4, 6, 8]) {
    const groups = new Map<string, typeof items>()
    for (const it of items) {
      if (covered.has(it.code)) continue
      const k = it.code.slice(0, len)
      const g = groups.get(k)
      if (g) g.push(it); else groups.set(k, [it])
    }
    for (const [k, g] of groups) {
      if (!g.every(i => i.ok)) continue
      const head = g.find(i => i.code === k.padEnd(8, '0')) ?? g[0]
      out.push({ code: dotted(k.padEnd(8, '0')), description: head.desc ? head.desc.charAt(0) + head.desc.slice(1).toLocaleLowerCase('el') : '' })
      g.forEach(i => covered.add(i.code))
    }
  }
  return out
}

/** Βρίσκει, διαβάζει και αποθηκεύει τους επίσημους επιλέξιμους ΚΑΔ ενός καθεστώτος στο πρόγραμμα. */
export async function applyKadTableToProgram(programId: string, schemeName: string): Promise<{ applied: number; source: string | null }> {
  const table = await findSchemeKadTable(schemeName)
  if (!table) return { applied: 0, source: null }
  const res = await fetch(table.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) }).catch(() => null)
  if (!res?.ok) return { applied: 0, source: null }
  const kads = await parseKadTable(await res.arrayBuffer())
  if (!kads.length) return { applied: 0, source: null }
  const p = await prisma.program.findUnique({ where: { id: programId }, select: { extractedData: true } })
  await prisma.$transaction([
    prisma.programKad.deleteMany({ where: { programId } }),
    prisma.programKad.createMany({ data: kads.map(k => ({ programId, code: k.code, description: k.description || null })) }),
    prisma.program.update({ where: { id: programId }, data: { extractedData: { ...((p?.extractedData as object) ?? {}), kadRule: 'ONLY_LISTED', kadSource: `ependyseis.mindev.gov.gr — ${table.title}` } } }),
  ])
  if (!(await prisma.programReference.findFirst({ where: { programId, url: table.url }, select: { id: true } }))) {
    await prisma.programReference.create({ data: { programId, kind: 'URL', title: `Επιλέξιμοι ΚΑΔ (επίσημος πίνακας): ${table.title}`.slice(0, 250), url: table.url, status: 'READY' } })
  }
  return { applied: kads.length, source: table.url }
}
