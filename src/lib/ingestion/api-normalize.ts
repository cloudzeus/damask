import type { SourceRecord } from './normalized'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Scalar → string. Nested object/array/null/undefined → παραλείπεται (flat only v1). */
function toRecord(o: Record<string, unknown>): SourceRecord {
  const rec: SourceRecord = {}
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    rec[k] = String(v)
  }
  return rec
}

export function normalizeApiJson(json: unknown): { sourceKeys: { key: string; sample?: string }[]; records: SourceRecord[] } {
  let list: unknown[]
  if (Array.isArray(json)) list = json
  else if (isPlainObject(json) && Array.isArray(json.data)) list = json.data
  else if (isPlainObject(json) && Array.isArray(json.items)) list = json.items
  else if (isPlainObject(json)) list = [json]
  else throw new Error('Η απάντηση δεν ήταν έγκυρο JSON αντικείμενο/λίστα.')

  const records = list.filter(isPlainObject).map(toRecord)
  if (records.length === 0) throw new Error('Δεν βρέθηκαν εγγραφές στην απάντηση.')

  const keySet = new Set<string>()
  for (const r of records) for (const k of Object.keys(r)) keySet.add(k)
  const first = records[0]
  const sourceKeys = [...keySet].map(k => ({ key: k, sample: first[k] || undefined }))
  return { sourceKeys, records }
}

function isPrivateIPv4(dotted: string): boolean {
  const m = dotted.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 10 || a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  )
}

/**
 * SSRF guard: μόνο https + δημόσιος host. Πετάει με ελληνικό μήνυμα σε παραβίαση.
 *
 * ΣΗΜΕΙΩΣΗ: Αυτό είναι ένα STATIC literal guard — δεν κάνει DNS resolution, άρα ένα
 * δημόσιο hostname που κάνει resolve σε ιδιωτική IP (DNS rebinding) ΔΕΝ καλύπτεται εδώ·
 * αυτός ο υπολειπόμενος κίνδυνος μετριάζεται από το permission gate στο calling action
 * και μπορεί να σκληρύνει περαιτέρω σε fetch-time σε επόμενο pass.
 */
export function assertSafeIngestUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('Μη έγκυρο URL.') }
  if (u.protocol !== 'https:') throw new Error('Επιτρέπονται μόνο https διευθύνσεις.')

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('Δεν επιτρέπεται localhost.')

  // IPv6 loopback / unique-local / link-local literals.
  if (
    host === '::1' ||
    host.startsWith('fc') || host.startsWith('fd') ||
    host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')
  ) {
    throw new Error('Δεν επιτρέπονται ιδιωτικές/loopback διευθύνσεις IPv6.')
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or its hex-quad normalized form ::ffff:7f00:1) — unsafe wholesale,
  // regardless of which dotted-decimal/hex-quad form the runtime normalizes it to.
  if (host.startsWith('::ffff:')) throw new Error('Δεν επιτρέπονται IPv4-mapped IPv6 διευθύνσεις.')

  // Any other bracketed/bare IPv6 literal (contains ':' and wasn't handled above) — treat as unsafe.
  if (host.includes(':')) throw new Error('Δεν επιτρέπονται IPv6 διευθύνσεις.')

  if (isPrivateIPv4(host)) throw new Error('Δεν επιτρέπονται ιδιωτικές/loopback διευθύνσεις IP.')

  // Numeric-obfuscated hosts (bare integer or hex IPv4, e.g. 2130706433 / 0x7f000001).
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) {
    throw new Error('Δεν επιτρέπονται αριθμητικά κωδικοποιημένες διευθύνσεις IP.')
  }

  return u
}
