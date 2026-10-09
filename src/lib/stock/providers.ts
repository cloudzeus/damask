import { getIntegration } from '@/lib/settings'

/**
 * (Plain module.) Δωρεάν stock φωτογραφίες με ΕΠΙΣΗΜΑ API και άδεια εμπορικής χρήσης χωρίς υποχρεωτική αναφορά:
 *  • Pexels  (https://www.pexels.com/license/)  — έως ~1880px (large2x)
 *  • Pixabay (https://pixabay.com/service/license-summary/) — έως 1280px (largeImageURL)
 * Κλειδιά: Ρυθμίσεις → Διασυνδέσεις (δωρεάν εγγραφή).
 */

export type StockProvider = 'pexels' | 'pixabay'
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
  const c = await getIntegration<{ apiKey?: string }>(p)
  return c.apiKey?.trim() || null
}

export async function stockProvidersConfigured(): Promise<StockProvider[]> {
  const out: StockProvider[] = []
  if (await key('pexels')) out.push('pexels')
  if (await key('pixabay')) out.push('pixabay')
  return out
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
