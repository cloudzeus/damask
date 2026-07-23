/**
 * Region matching — pure helpers, ported from the reference PIM's lib/regions/match.ts.
 * NO prisma/react/clock imports here. The server-side matchRegion (which queries prisma
 * and calls these) lives in regions.ts.
 */

export const MIN_QUERY_LEN = 4 // avoid false positives on tiny strings
export const STEM_LEN = 5 // shared-prefix length for genitive/nominative matching
export const GEO_CAP_KM = 50 // reject geo matches farther than this from any Δήμος centroid

// Administrative prefixes stripped from both Καλλικράτης names and ΓΕΜΗ official names
const ADMIN_PREFIX = /^\s*(ΔΗΜΟΣ|Δ\.|ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ|ΠΕΡΙΦΕΡΕΙΑ|ΝΟΜΟΣ|Π\.Ε\.)\s+/

/** Uppercase, strip diacritics, normalize final sigma, collapse whitespace. */
export function normalizeGreek(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents
    .replace(/ς/g, 'σ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip admin prefixes (ΔΗΜΟΣ/ΝΟΜΟΣ/ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ/…) + parentheticals, then normalize. */
export function coreName(nameEL: string): string {
  const noParen = nameEL.replace(/\(.*?\)/g, '').trim()
  const norm = normalizeGreek(noParen)
  return norm.replace(ADMIN_PREFIX, '').trim()
}

/** Best level-4/5 code for a free-text place name, or null. */
export function nameMatchCandidate(query: string, nodes: { code: string; nameEL: string }[]): string | null {
  const q = normalizeGreek(query)
  if (q.length < MIN_QUERY_LEN) return null

  // 1) exact normalized core match
  for (const n of nodes) if (coreName(n.nameEL) === q) return n.code
  // 2) containment either direction (handles "ΑΘΗΝΑ" ⊂ "ΑΘΗΝΑΙΩΝ", "ΔΟΞΑΤΟ" ⊂ "ΔΟΞΑΤΟΥ")
  for (const n of nodes) {
    const core = coreName(n.nameEL)
    if (core.includes(q) || q.includes(core)) return n.code
  }
  // 3) shared stem (first STEM_LEN chars)
  if (q.length >= STEM_LEN) {
    const stem = q.slice(0, STEM_LEN)
    for (const n of nodes) if (coreName(n.nameEL).startsWith(stem)) return n.code
  }
  return null
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearestNode(
  point: { lat: number; lng: number },
  nodes: { code: string; latitude: number | null; longitude: number | null }[],
  capKm = GEO_CAP_KM,
): string | null {
  let best: string | null = null
  let bestKm = Infinity
  for (const n of nodes) {
    if (n.latitude == null || n.longitude == null) continue
    const km = haversineKm(point, { lat: n.latitude, lng: n.longitude })
    if (km < bestKm) {
      bestKm = km
      best = n.code
    }
  }
  return bestKm <= capKm ? best : null
}
