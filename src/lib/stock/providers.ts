import { getIntegration } from '@/lib/settings'

/**
 * (Plain module.) Δωρεάν stock φωτογραφίες με ΕΠΙΣΗΜΑ API και άδεια εμπορικής χρήσης χωρίς υποχρεωτική αναφορά:
 *  • Pexels  (https://www.pexels.com/license/)  — έως ~1880px (large2x)
 *  • Pixabay (https://pixabay.com/service/license-summary/) — έως 1280px (largeImageURL)
 *  • Openverse (https://openverse.org) — ΧΩΡΙΣ κλειδί· μόνο κοινό κτήμα (CC0 / Public Domain Mark), ελεύθερο για εμπορική χρήση
 * Κλειδιά: Ρυθμίσεις → Διασυνδέσεις (δωρεάν εγγραφή).
 */

export type StockProvider = 'pexels' | 'pixabay' | 'openverse'
export type StockPhoto = {
  provider: StockProvider
  id: string
  url: string // σελίδα της φωτογραφίας
  download: string // URL εικόνας για λήψη
  thumb: string
  width: number
  height: number
  alt: string
  author: string
}

async function key(p: StockProvider): Promise<string | null> {
  if (p === 'openverse') return null
  const c = await getIntegration<{ apiKey?: string }>(p)
  return c.apiKey?.trim() || null
}

/** Διαθέσιμοι πάροχοι: όσοι έχουν κλειδί + Openverse (πάντα, χωρίς κλειδί). */
export async function stockProvidersConfigured(): Promise<StockProvider[]> {
  const out: StockProvider[] = []
  if (await key('pexels')) out.push('pexels')
  if (await key('pixabay')) out.push('pixabay')
  out.push('openverse')
  return out
}

/** Αναζήτηση σε οποιονδήποτε πάροχο. */
export function searchStock(p: StockProvider, query: string, perPage = 30): Promise<StockPhoto[]> {
  return p === 'pexels' ? searchPexels(query, perPage) : p === 'pixabay' ? searchPixabay(query, perPage) : searchOpenverse(query, perPage)
}

/**
 * Openverse: μόνο CC0/PDM (κοινό κτήμα), μεγάλες οριζόντιες φωτογραφίες, χωρίς κλειδί. Η συλλογή κοινού κτήματος
 * είναι μικρότερη — αν το πολύλεξο ερώτημα δεν φέρει τίποτα, ξαναψάχνει με λιγότερες λέξεις (π.χ. «accountant»).
 */
export async function searchOpenverse(query: string, perPage = 20, page = 1): Promise<StockPhoto[]> {
  const words = query.trim().split(/\s+/).filter(Boolean)
  const tries = [...new Set([words.join(' '), words.slice(0, 2).join(' '), words.slice(-2).join(' '), ...[...words].sort((a, b) => b.length - a.length).slice(0, 2)])].filter(Boolean)
  for (const t of tries) {
    const found = await openverseOnce(t, perPage, page)
    if (found.length) return found
  }
  return []
}

async function openverseOnce(query: string, perPage: number, page: number): Promise<StockPhoto[]> {
  // Μόνο πηγές stock φωτογραφίας (όχι έργα τέχνης/χάρτες/διαγράμματα του Wikimedia, που επιπλέον μπλοκάρουν τη λήψη).
  const q = new URLSearchParams({ q: query, license: 'cc0,pdm', source: 'stocksnap,rawpixel', category: 'photograph', aspect_ratio: 'wide', mature: 'false', page_size: String(Math.min(50, perPage)), page: String(page) })
  const res = await fetch(`https://api.openverse.org/v1/images/?${q}`, { headers: { 'User-Agent': 'WWA (wwa-espa.com)' }, signal: AbortSignal.timeout(20_000) })
  if (res.status === 429) throw new Error('Openverse: όριο αιτημάτων — δοκίμασε σε λίγο.')
  if (!res.ok) throw new Error(`Openverse HTTP ${res.status}`)
  const j = await res.json() as { results?: { id: string; title?: string; creator?: string; url: string; thumbnail?: string; foreign_landing_url?: string; width?: number; height?: number }[] }
  return (j.results ?? []).filter(r => (r.width ?? 0) >= 900).map(r => ({
    provider: 'openverse', id: r.id, url: r.foreign_landing_url ?? r.url, download: r.url, thumb: r.thumbnail ?? r.url,
    width: r.width ?? 0, height: r.height ?? 0, alt: r.title ?? '', author: r.creator ?? '',
  }))
}

export async function searchPexels(query: string, perPage = 30, page = 1, apiKey?: string): Promise<StockPhoto[]> {
  const k = apiKey ?? (await key('pexels'))
  if (!k) throw new Error('Δεν έχει ρυθμιστεί το Pexels.')
  const q = new URLSearchParams({ query, per_page: String(Math.min(80, perPage)), page: String(page), orientation: 'landscape', size: 'large' })
  const res = await fetch(`https://api.pexels.com/v1/search?${q}`, { headers: { Authorization: k }, signal: AbortSignal.timeout(20_000) })
  if (res.status === 401 || res.status === 403) throw new Error('Μη έγκυρο κλειδί Pexels.')
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`)
  const j = await res.json() as { photos?: { id: number; url: string; width: number; height: number; alt?: string; photographer?: string; src: { large2x: string; medium: string } }[] }
  return (j.photos ?? []).map(p => ({
    provider: 'pexels', id: String(p.id), url: p.url, download: p.src.large2x, thumb: p.src.medium,
    width: p.width, height: p.height, alt: p.alt ?? '', author: p.photographer ?? '',
  }))
}

export async function searchPixabay(query: string, perPage = 30, page = 1, apiKey?: string): Promise<StockPhoto[]> {
  const k = apiKey ?? (await key('pixabay'))
  if (!k) throw new Error('Δεν έχει ρυθμιστεί το Pixabay.')
  const q = new URLSearchParams({ key: k, q: query, image_type: 'photo', orientation: 'horizontal', safesearch: 'true', per_page: String(Math.max(3, Math.min(200, perPage))), page: String(page), min_width: '1200' })
  const res = await fetch(`https://pixabay.com/api/?${q}`, { signal: AbortSignal.timeout(20_000) })
  if (res.status === 400 || res.status === 401) throw new Error('Μη έγκυρο κλειδί Pixabay.')
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`)
  const j = await res.json() as { hits?: { id: number; pageURL: string; largeImageURL: string; webformatURL: string; imageWidth: number; imageHeight: number; tags?: string; user?: string }[] }
  return (j.hits ?? []).map(h => ({
    provider: 'pixabay', id: String(h.id), url: h.pageURL, download: h.largeImageURL, thumb: h.webformatURL,
    width: h.imageWidth, height: h.imageHeight, alt: h.tags ?? '', author: h.user ?? '',
  }))
}

export async function testStockProvider(p: StockProvider, apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: 'Συμπλήρωσε το API key.' }
  try {
    const r = p === 'pexels' ? await searchPexels('business meeting', 3, 1, apiKey.trim()) : await searchPixabay('business meeting', 3, 1, apiKey.trim())
    return { ok: true, message: `Επιτυχής σύνδεση με το ${p === 'pexels' ? 'Pexels' : 'Pixabay'} (${r.length} δοκιμαστικά αποτελέσματα).` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
