import { getIntegration } from '@/lib/settings'

/**
 * Envato (Elements / Market) — personal token από build.envato.com (Ρυθμίσεις → Διασυνδέσεις → Envato Elements).
 * Προς το παρόν μόνο αποθήκευση + δοκιμή σύνδεσης· για μελλοντική χρήση (π.χ. φωτογραφίες/πρότυπα στο Media Gallery).
 */

export const ENVATO_API_BASE = 'https://api.envato.com'
export type EnvatoConfig = { apiKey?: string }

export async function envatoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const c = await getIntegration<EnvatoConfig>('envato')
  if (!c.apiKey?.trim()) throw new Error('Δεν έχει ρυθμιστεί το Envato (Ρυθμίσεις → Διασυνδέσεις).')
  return fetch(`${ENVATO_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.apiKey.trim()}`, 'User-Agent': 'WWA (wwa.gr)', ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  })
}

export async function testEnvato(config: EnvatoConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey?.trim()) return { ok: false, message: 'Συμπλήρωσε το API key (personal token).' }
  try {
    const res = await fetch(`${ENVATO_API_BASE}/whoami`, {
      headers: { Authorization: `Bearer ${config.apiKey.trim()}`, 'User-Agent': 'WWA (wwa.gr)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Μη έγκυρο ή ληγμένο token.' }
    if (!res.ok) return { ok: false, message: `Το Envato επέστρεψε HTTP ${res.status}.` }
    const j = await res.json().catch(() => null) as { userId?: number; scopes?: string[] } | null
    const scopes = j?.scopes?.length ? ` — δικαιώματα: ${j.scopes.join(', ')}` : ''
    return { ok: true, message: `Επιτυχής σύνδεση με το Envato${j?.userId ? ` (χρήστης #${j.userId})` : ''}${scopes}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης (${err instanceof Error ? err.message : String(err)}).` }
  }
}

// ── Αναζήτηση & εισαγωγή στο Media Gallery ────────────────────────────────────

export type EnvatoKind = 'photo' | 'video'
export type EnvatoItem = {
  id: number
  name: string
  author: string
  url: string
  priceCents: number | null
  thumb: string | null
  preview: string | null
  videoUrl: string | null
  purchased: boolean
}

const SITE: Record<EnvatoKind, string> = { photo: 'photodune.net', video: 'videohive.net' }

type RawPreview = {
  thumbnail_preview?: { small_url?: string; large_url?: string; large_url_portrait?: string }
  landscape_preview?: { landscape_url?: string }
  icon_with_landscape_preview?: { icon_url?: string; landscape_url?: string }
  icon_with_video_preview?: { icon_url?: string; landscape_url?: string; video_url?: string }
}
type RawMatch = { id: number; name: string; author_username: string; url: string; price_cents?: number; previews?: RawPreview }

/** Αναζήτηση φωτογραφιών (PhotoDune) ή βίντεο (VideoHive) στο Envato Market· σημαδεύει όσα έχουμε ήδη αγοράσει. */
export async function searchEnvato(term: string, kind: EnvatoKind, page = 1, pageSize = 24): Promise<{ total: number; pages: number; items: EnvatoItem[] }> {
  const q = new URLSearchParams({ term, site: SITE[kind], page: String(page), page_size: String(pageSize) })
  const [res, purchased] = await Promise.all([envatoFetch(`/v1/discovery/search/search/item?${q}`), purchasedItemIds().catch(() => new Set<number>())])
  if (!res.ok) throw new Error(res.status === 401 ? 'Μη έγκυρο token Envato.' : `Το Envato επέστρεψε HTTP ${res.status}.`)
  const j = await res.json() as { total_hits?: number; matches?: RawMatch[] }
  const items = (j.matches ?? []).map(m => {
    const p = m.previews ?? {}
    const video = p.icon_with_video_preview
    return {
      id: m.id, name: m.name, author: m.author_username, url: m.url, priceCents: m.price_cents ?? null,
      thumb: p.thumbnail_preview?.large_url ?? video?.landscape_url ?? p.icon_with_landscape_preview?.landscape_url ?? null,
      preview: p.thumbnail_preview?.large_url_portrait ?? p.landscape_preview?.landscape_url ?? video?.landscape_url ?? p.thumbnail_preview?.large_url ?? null,
      videoUrl: video?.video_url ?? null,
      purchased: purchased.has(m.id),
    }
  })
  const total = j.total_hits ?? items.length
  return { total, pages: Math.min(60, Math.ceil(total / pageSize)), items }
}

let purchasesCache: { ids: Set<number>; at: number } | null = null
/** Αγορασμένα items του λογαριασμού (cache 10′). */
export async function purchasedItemIds(): Promise<Set<number>> {
  if (purchasesCache && Date.now() - purchasesCache.at < 10 * 60_000) return purchasesCache.ids
  const ids = new Set<number>()
  for (let page = 1; page <= 20; page++) {
    const res = await envatoFetch(`/v3/market/buyer/list-purchases?page=${page}`)
    if (!res.ok) break
    const j = await res.json() as { results?: { item?: { id?: number } }[] }
    if (!j.results?.length) break
    j.results.forEach(r => { if (r.item?.id) ids.add(r.item.id) })
  }
  purchasesCache = { ids, at: Date.now() }
  return ids
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i
const VIDEO_EXT = /\.(mp4|mov|webm)$/i
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }
const DOWNLOAD_MAX = 600 * 1024 * 1024

/**
 * Κατεβάζει ΑΓΟΡΑΣΜΕΝΟ item (άδεια χρήσης) και επιστρέφει το κύριο αρχείο: από ZIP το μεγαλύτερο αρχείο εικόνας/βίντεο.
 * Χωρίς αγορά το Envato δεν δίνει σύνδεσμο λήψης — οι προεπισκοπήσεις έχουν υδατογράφημα και δεν εισάγονται.
 */
export async function downloadPurchased(itemId: number, kind: EnvatoKind): Promise<{ data: Uint8Array; filename: string; mime: string }> {
  const res = await envatoFetch(`/v3/market/buyer/download?item_id=${itemId}`)
  if (res.status === 403 || res.status === 404) throw new Error('Το item δεν έχει αγοραστεί από αυτόν τον λογαριασμό Envato.')
  if (!res.ok) throw new Error(`Το Envato επέστρεψε HTTP ${res.status}.`)
  const { download_url: url } = await res.json() as { download_url?: string }
  if (!url) throw new Error('Το Envato δεν έδωσε σύνδεσμο λήψης.')
  const file = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!file.ok) throw new Error(`Η λήψη απέτυχε (HTTP ${file.status}).`)
  const len = Number(file.headers.get('content-length') ?? '0')
  if (len > DOWNLOAD_MAX) throw new Error('Το αρχείο του Envato είναι πολύ μεγάλο για αυτόματη εισαγωγή.')
  const data = new Uint8Array(await file.arrayBuffer())
  const remoteName = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? `envato-${itemId}`)
  const isZip = data[0] === 0x50 && data[1] === 0x4b
  if (!isZip) {
    const ext = remoteName.split('.').pop()?.toLowerCase() ?? ''
    return { data, filename: remoteName, mime: MIME[ext] ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg') }
  }
  const { unzipSync } = await import('fflate')
  const wanted = kind === 'video' ? VIDEO_EXT : IMAGE_EXT
  const entries = unzipSync(data, { filter: f => wanted.test(f.name) && !f.name.includes('__MACOSX') && !/(^|\/)\._/.test(f.name) })
  const best = Object.entries(entries).sort((a, b) => b[1].length - a[1].length)[0]
  if (!best) throw new Error(kind === 'video' ? 'Δεν βρέθηκε αρχείο βίντεο μέσα στο πακέτο.' : 'Δεν βρέθηκε εικόνα μέσα στο πακέτο.')
  const filename = best[0].split('/').pop() ?? best[0]
  return { data: best[1], filename, mime: MIME[filename.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream' }
}
