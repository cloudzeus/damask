import { prisma } from '@/lib/prisma'
import { getSetting, setSetting } from '@/lib/settings'
import { storeMediaBuffer } from '@/lib/media-store'
import { searchStock, stockProvidersConfigured, type StockPhoto } from './providers'

/**
 * (Plain module.) Μαζική εισαγωγή δωρεάν stock φωτογραφιών στο Media Gallery για τα ευρωπαϊκά προγράμματα:
 * επαγγελματίες, επαγγέλματα, ομάδες, χώροι εργασίας. Θέματα ανά κλάδο → φάκελοι, WebP ≤1920px, χωρίς διπλότυπα
 * (meta.stockKey), πρόοδος σε Setting (για το UI). Τρέχει στο παρασκήνιο (pg-boss «stock-import»).
 */

export const ROOT_FOLDER = 'Επαγγέλματα & Επιχειρήσεις'

/** Κλάδος (φάκελος) → θέματα: [ελληνική ετικέτα, αγγλική αναζήτηση]. */
export const STOCK_THEMES: Record<string, [string, string][]> = {
  'Γραφείο & Συνεργασία': [
    ['Επιχειρηματική συνάντηση', 'business meeting team office'],
    ['Σύμβουλος παρουσιάζει', 'consultant presentation clients'],
    ['Λογιστής', 'accountant working office documents'],
    ['Νεοφυής επιχείρηση', 'startup team coworking'],
    ['Γυναίκα επιχειρηματίας', 'woman entrepreneur small business'],
    ['Χειραψία συνεργασίας', 'business partners handshake agreement'],
    ['Δικηγόρος', 'lawyer consultation office'],
    ['Τηλεφωνικό κέντρο', 'call center customer support team'],
  ],
  'Βιομηχανία & Τεχνικά': [
    ['Μηχανικός σε εργοστάσιο', 'engineer factory production line'],
    ['Εργάτης βιομηχανίας', 'industrial worker manufacturing'],
    ['Ηλεκτρολόγος', 'electrician working installation'],
    ['Μηχανικός αυτοκινήτων', 'car mechanic garage workshop'],
    ['Ξυλουργός', 'carpenter woodworking workshop'],
    ['Οικοδομή', 'construction workers building site'],
    ['Αποθήκη & logistics', 'warehouse logistics workers forklift'],
    ['Μεταλλουργία', 'metalworking welder workshop'],
  ],
  'Τουρισμός & Εστίαση': [
    ['Ρεσεψιόν ξενοδοχείου', 'hotel reception staff guests'],
    ['Σεφ στην κουζίνα', 'chef cooking restaurant kitchen'],
    ['Σερβιτόρος', 'waiter serving restaurant'],
    ['Μπαρίστα', 'barista coffee shop'],
    ['Ξενάγηση', 'tour guide tourists'],
    ['Ελληνικό νησί φιλοξενία', 'greek island hotel tourism'],
  ],
  'Αγροτικά & Τρόφιμα': [
    ['Αγρότης', 'farmer field agriculture'],
    ['Ελαιοπαραγωγή', 'olive harvest olive oil production'],
    ['Οινοποιός', 'winemaker vineyard winery'],
    ['Μελισσοκόμος', 'beekeeper honey'],
    ['Αρτοποιός', 'baker bakery bread'],
    ['Παραγωγή τροφίμων', 'food production factory workers'],
    ['Ψαράς', 'fisherman boat sea'],
  ],
  'Υγεία & Φροντίδα': [
    ['Γιατρός', 'doctor patient clinic'],
    ['Φαρμακοποιός', 'pharmacist pharmacy'],
    ['Οδοντίατρος', 'dentist clinic'],
    ['Νοσηλεύτρια', 'nurse hospital care'],
    ['Κτηνίατρος', 'veterinarian clinic'],
    ['Εργαστήριο', 'laboratory scientist research'],
  ],
  'Λιανική & Υπηρεσίες': [
    ['Ιδιοκτήτης καταστήματος', 'shop owner retail store'],
    ['Κομμωτήριο', 'hairdresser salon'],
    ['Ηλεκτρονικό κατάστημα', 'e-commerce packing orders small business'],
    ['Κούριερ', 'delivery courier package'],
    ['Εκπαίδευση', 'teacher training classroom adults'],
    ['Χειροτέχνης', 'craftsman artisan handmade'],
  ],
  'Τεχνολογία & Καινοτομία': [
    ['Προγραμματιστής', 'software developer coding'],
    ['Ανάλυση δεδομένων', 'data analytics dashboard business'],
    ['Κυβερνοασφάλεια', 'cybersecurity it professional'],
    ['Ρομποτική', 'robotics automation manufacturing'],
    ['3D εκτύπωση', '3d printing prototype'],
    ['Ψηφιακός μετασχηματισμός', 'digital transformation team laptop'],
  ],
  'Πράσινη ενέργεια & Βιωσιμότητα': [
    ['Φωτοβολταϊκά', 'solar panels installer'],
    ['Ανεμογεννήτριες', 'wind turbine engineer'],
    ['Ενεργειακή αναβάθμιση', 'energy efficiency building renovation'],
    ['Ανακύκλωση', 'recycling sustainability business'],
  ],
}

export type StockImportStatus = {
  state: 'idle' | 'running' | 'done' | 'error'
  target: number
  imported: number
  skipped: number
  failed: number
  current: string | null
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  byFolder: Record<string, number>
}
const STATUS_KEY = 'stock.import.status'
const IDLE: StockImportStatus = { state: 'idle', target: 0, imported: 0, skipped: 0, failed: 0, current: null, startedAt: null, finishedAt: null, error: null, byFolder: {} }

export async function getStockImportStatus(): Promise<StockImportStatus> {
  return { ...IDLE, ...((await getSetting<StockImportStatus>(STATUS_KEY)) ?? {}) }
}
async function saveStatus(s: StockImportStatus) { await setSetting(STATUS_KEY, s) }

async function ensureFolder(name: string, parentId: string | null): Promise<string> {
  const f = await prisma.mediaFolder.findFirst({ where: { name, parentId }, select: { id: true } })
  if (f) return f.id
  return (await prisma.mediaFolder.create({ data: { name, parentId }, select: { id: true } })).id
}

async function existingStockKeys(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ k: string }[]>`SELECT "meta"->>'stockKey' AS k FROM "MediaAsset" WHERE "meta"->>'stockKey' IS NOT NULL`
  return new Set(rows.map(r => r.k))
}

/** Εικόνα → WebP ≤1920px (sharp). */
async function toWebp(buf: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(buf).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
}

/**
 * Τρέχει την εισαγωγή: για κάθε θέμα μαζεύει υποψήφιες (Pexels ~70%, Pixabay ~30% — ή όποιος είναι ρυθμισμένος),
 * αγνοεί όσες υπάρχουν ήδη και ανεβάζει έως να φτάσει το target. Ασφαλές να ξανατρέξει (συνεχίζει, δεν διπλασιάζει).
 */
export async function runStockImport(target = 500): Promise<StockImportStatus> {
  const providers = await stockProvidersConfigured()
  const status: StockImportStatus = { ...IDLE, state: 'running', target, startedAt: new Date().toISOString() }
  if (!providers.length) {
    Object.assign(status, { state: 'error', error: 'Δεν έχει ρυθμιστεί ούτε Pexels ούτε Pixabay (Ρυθμίσεις → Διασυνδέσεις).', finishedAt: new Date().toISOString() })
    await saveStatus(status)
    return status
  }
  await saveStatus(status)
  try {
    const seen = await existingStockKeys()
    const rootId = await ensureFolder(ROOT_FOLDER, null)
    const themes = Object.entries(STOCK_THEMES).flatMap(([folder, list]) => list.map(([label, query]) => ({ folder, label, query })))
    const perTheme = Math.ceil(target / themes.length)

    for (const t of themes) {
      if (status.imported >= target) break
      status.current = `${t.folder} › ${t.label}`
      await saveStatus(status)
      const folderId = await ensureFolder(t.folder, rootId)

      // Υποψήφιες από τους διαθέσιμους παρόχους (περισσότερες από όσες χρειαζόμαστε, για τα διπλότυπα).
      const want = perTheme * 3
      const lists: StockPhoto[][] = await Promise.all(providers.map(p => searchStock(p, t.query, Math.ceil(want * (providers.length > 1 ? 0.6 : 1))).catch(() => [] as StockPhoto[])))
      // Εναλλάξ από τους παρόχους, για ποικιλία.
      const candidates: StockPhoto[] = []
      for (let i = 0; candidates.length < want && lists.some(l => l[i]); i++) lists.forEach(l => { if (l[i]) candidates.push(l[i]) })

      let got = 0
      for (const c of candidates) {
        if (got >= perTheme || status.imported >= target) break
        const stockKey = `${c.provider}:${c.id}`
        if (seen.has(stockKey)) { status.skipped++; continue }
        try {
          const res = await fetch(c.download, { headers: { 'User-Agent': 'WWA (wwa-espa.com)' }, signal: AbortSignal.timeout(60_000) })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const webp = await toWebp(Buffer.from(await res.arrayBuffer()))
          await storeMediaBuffer({
            body: webp, filename: `${t.query.split(' ').slice(0, 3).join('-')}-${c.provider}-${c.id}.webp`, mimeType: 'image/webp',
            path: `media-gallery/${folderId}`, folderId,
            name: `${t.label} — ${c.author || c.provider}`.slice(0, 200),
            alt: c.alt ? c.alt.slice(0, 300) : t.label,
            meta: { source: c.provider, stockKey, stockUrl: c.url, author: c.author, theme: t.label, license: c.provider === 'pexels' ? 'Pexels License' : c.provider === 'pixabay' ? 'Pixabay Content License' : 'CC0 / Public Domain (Openverse)' },
          })
          seen.add(stockKey)
          got++
          status.imported++
          status.byFolder[t.folder] = (status.byFolder[t.folder] ?? 0) + 1
          if (status.imported % 5 === 0) await saveStatus(status)
        } catch {
          status.failed++
        }
      }
    }
    Object.assign(status, { state: 'done', current: null, finishedAt: new Date().toISOString() })
  } catch (err) {
    Object.assign(status, { state: 'error', error: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() })
  }
  await saveStatus(status)
  return status
}
