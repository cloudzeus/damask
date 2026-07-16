/**
 * Geocoding μέσω geocode.maps.co (Nominatim-style API) — αναζήτηση διεύθυνσης
 * → συντεταγμένες (search) και συντεταγμένες → διεύθυνση (reverse). Καθαρές,
 * standalone συναρτήσεις (καμία εξάρτηση σε prisma/DB) — το api key περνάει
 * ρητά από τον caller (src/app/(app)/partners/actions.ts, το οποίο το διαβάζει
 * από getIntegration('maps') — env fallback GEOCODE_API), ίδιο idiom με τα
 * standalone test* του src/lib/connection-tests.ts. Κάθε επιτυχής κλήση
 * καταγράφεται με logApiUsage({ service: 'geocoding', ... }).
 *
 * GET https://geocode.maps.co/search?q={addr}&api_key=
 * GET https://geocode.maps.co/reverse?lat=&lon=&api_key=
 */

import { logApiUsage } from '@/lib/api-usage'

const GEOCODE_BASE = 'https://geocode.maps.co'
const REQUEST_TIMEOUT_MS = 10_000

/** Λάθος γεωκωδικοποίησης με φιλικό ελληνικό μήνυμα. */
export class GeocodeError extends Error {}

export type GeocodeResult = {
  lat: number
  lng: number
  displayName: string
  address: string | null
  city: string | null
  zip: string | null
  country: string | null
}

type NominatimAddress = {
  road?: string
  house_number?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  postcode?: string
  country?: string
  country_code?: string
}

type NominatimRaw = {
  lat?: unknown
  lon?: unknown
  display_name?: unknown
  address?: NominatimAddress
}

function toResult(raw: NominatimRaw): GeocodeResult | null {
  const lat = Number(raw.lat)
  const lng = Number(raw.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const a = raw.address ?? {}
  const streetLine = [a.road, a.house_number].filter(Boolean).join(' ')

  return {
    lat,
    lng,
    displayName: typeof raw.display_name === 'string' ? raw.display_name : '',
    address: streetLine || null,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
    zip: a.postcode ?? null,
    country: a.country ?? (a.country_code ? a.country_code.toUpperCase() : null),
  }
}

async function geocodeFetch(url: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new GeocodeError('Η υπηρεσία geocode.maps.co δεν απάντησε έγκαιρα (10s). Δοκίμασε ξανά.')
    }
    throw new GeocodeError('Αδυναμία σύνδεσης με την υπηρεσία geocode.maps.co. Δοκίμασε ξανά σε λίγο.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new GeocodeError('Μη έγκυρο κλειδί geocode.maps.co — έλεγξε τη ρύθμιση στο Ρυθμίσεις → Χάρτες & Geocoding.')
  }
  if (res.status === 429) {
    throw new GeocodeError('Η υπηρεσία geocode.maps.co έχει εξαντλήσει το όριο αιτημάτων. Δοκίμασε ξανά σε λίγο.')
  }
  if (!res.ok) {
    throw new GeocodeError(`Η υπηρεσία geocode.maps.co επέστρεψε σφάλμα HTTP ${res.status}.`)
  }
  try {
    return await res.json()
  } catch {
    throw new GeocodeError('Μη έγκυρη απάντηση από την υπηρεσία geocode.maps.co.')
  }
}

function requireApiKey(apiKey: string): void {
  if (!apiKey?.trim()) {
    throw new GeocodeError('Δεν έχει ρυθμιστεί το κλειδί geocode.maps.co (Ρυθμίσεις → Χάρτες & Geocoding).')
  }
}

/** Αναζήτηση διεύθυνσης → λίστα υποψήφιων αποτελεσμάτων (πρώτο = πιο σχετικό). */
export async function geocodeSearch(address: string, apiKey: string): Promise<GeocodeResult[]> {
  requireApiKey(apiKey)
  const clean = address.trim()
  if (!clean) throw new GeocodeError('Συμπλήρωσε διεύθυνση για αναζήτηση.')

  const url = `${GEOCODE_BASE}/search?q=${encodeURIComponent(clean)}&api_key=${encodeURIComponent(apiKey)}`
  const data = await geocodeFetch(url)

  void logApiUsage({ service: 'geocoding', operation: 'search', units: 1 })

  if (!Array.isArray(data)) return []
  const results: GeocodeResult[] = []
  for (const item of data as NominatimRaw[]) {
    const r = toResult(item)
    if (r) results.push(r)
  }
  return results
}

/** Προτάσεις autocomplete (fallback όταν το Google Places (New) δεν είναι διαθέσιμο — βλ.
 * partners/google-places-input.tsx) — ίδιο endpoint με το geocodeSearch αλλά με explicit
 * `limit` ώστε το dropdown να μη γεμίζει με δεκάδες αποτελέσματα. */
export async function geocodeSuggest(query: string, apiKey: string, limit = 6): Promise<GeocodeResult[]> {
  requireApiKey(apiKey)
  const clean = query.trim()
  if (!clean) return []

  const url = `${GEOCODE_BASE}/search?q=${encodeURIComponent(clean)}&limit=${encodeURIComponent(String(limit))}&api_key=${encodeURIComponent(apiKey)}`
  const data = await geocodeFetch(url)

  void logApiUsage({ service: 'geocoding', operation: 'suggest', units: 1 })

  if (!Array.isArray(data)) return []
  const results: GeocodeResult[] = []
  for (const item of data as NominatimRaw[]) {
    const r = toResult(item)
    if (r) results.push(r)
    if (results.length >= limit) break
  }
  return results
}

/** Συντεταγμένες → διεύθυνση. `null` όταν η υπηρεσία δεν βρήκε τίποτα σε αυτό το σημείο. */
export async function geocodeReverse(lat: number, lng: number, apiKey: string): Promise<GeocodeResult | null> {
  requireApiKey(apiKey)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new GeocodeError('Μη έγκυρες συντεταγμένες.')
  }

  const url = `${GEOCODE_BASE}/reverse?lat=${lat}&lon=${lng}&api_key=${encodeURIComponent(apiKey)}`
  const data = await geocodeFetch(url)

  void logApiUsage({ service: 'geocoding', operation: 'reverse', units: 1 })

  if (!data || typeof data !== 'object') return null
  return toResult(data as NominatimRaw)
}
