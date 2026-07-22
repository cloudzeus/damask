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

/** SSRF guard: μόνο https + δημόσιος host. Πετάει με ελληνικό μήνυμα σε παραβίαση. */
export function assertSafeIngestUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('Μη έγκυρο URL.') }
  if (u.protocol !== 'https:') throw new Error('Επιτρέπονται μόνο https διευθύνσεις.')
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') throw new Error('Δεν επιτρέπεται localhost.')
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const priv =
      a === 10 || a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    if (priv) throw new Error('Δεν επιτρέπονται ιδιωτικές/loopback διευθύνσεις IP.')
  }
  return u
}
