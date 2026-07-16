import { prisma } from '@/lib/prisma'
import { s1 } from '@/lib/softone'
import { isIntegrationConfigured, getIntegration } from '@/lib/settings'

/**
 * Συγχρονισμός βοηθητικών πινάκων SoftOne (VAT/COUNTRY/IRSDATA/TRDCATEGORY/
 * PAYMENT/SHIPMENT/SOCURRENCY/SERIES) στα τοπικά mirror models (βλ.
 * prisma/schema.prisma). ΔΕΝ κάνει mapping — upsert με ΑΚΡΙΒΩΣ τα ίδια
 * uppercase field names που επιστρέφει το SoftOne.
 *
 * Δύο τρόποι ανάκτησης, ίδιο idiom με CLAUDE.md «Official Services Reference»:
 * 1. `GetTable` (TABLE, FIELDS) — απευθείας query πίνακα, προτιμώμενο.
 * 2. Fallback `getBrowserInfo` (object/list) → reqID → `getBrowserData`
 *    (paginated), αν το GetTable αποτύχει/δεν υποστηρίζεται για το tenant.
 *
 * ΣΗΜΕΙΩΣΗ: δεν υπάρχουν ακόμα S1 credentials σε αυτό το περιβάλλον (βλ.
 * settings/cards/softone-card.tsx) — το sync είναι gated πίσω από
 * isIntegrationConfigured('softone', ...) και το κουμπί δείχνει το γνωστό
 * friendly μήνυμα μέχρι να ρυθμιστεί.
 */

export type S1RefTable = 'VAT' | 'COUNTRY' | 'IRSDATA' | 'TRDCATEGORY' | 'PAYMENT' | 'SHIPMENT' | 'SOCURRENCY' | 'SERIES'

export type SyncResult = { table: S1RefTable; ok: boolean; count: number; message?: string }

const SETTINGS_HINT = 'Ρύθμισε το SoftOne στις Ρυθμίσεις.'

export class S1SyncNotConfiguredError extends Error {
  constructor() {
    super(`Το SoftOne δεν έχει ρυθμιστεί πλήρως. ${SETTINGS_HINT}`)
    this.name = 'S1SyncNotConfiguredError'
  }
}

/** Config ανά mirror table: SoftOne TABLE name, ζητούμενα FIELDS, browser object/list fallback, primary key field, Prisma delegate. */
type RefConfig = {
  table: S1RefTable
  fields: string[]
  browserObject: string // object name για getBrowserInfo fallback (ίδιο με table στα περισσότερα EditList)
  pk: string
  delegate: 'vat' | 'country' | 'irsdata' | 'trdCategory' | 's1Payment' | 'shipment' | 'soCurrency' | 'series'
}

const REF_CONFIGS: RefConfig[] = [
  { table: 'VAT', fields: ['VAT', 'NAME', 'PERCNT', 'VATS1', 'ISACTIVE', 'MYDATACODE'], browserObject: 'VAT', pk: 'VAT', delegate: 'vat' },
  { table: 'COUNTRY', fields: ['COUNTRY', 'SHORTCUT', 'NAME', 'SOCURRENCY', 'COUNTRYTYPE', 'INTCODE', 'INTERCODE', 'EANCODE', 'ISACTIVE'], browserObject: 'COUNTRY', pk: 'COUNTRY', delegate: 'country' },
  { table: 'IRSDATA', fields: ['IRSDATA', 'CODE', 'NAME', 'ISACTIVE', 'ADDRESS', 'CITY', 'ZIP', 'PHONE1', 'EMAIL'], browserObject: 'IRSDATA', pk: 'IRSDATA', delegate: 'irsdata' },
  { table: 'TRDCATEGORY', fields: ['TRDCATEGORY', 'CODE', 'NAME', 'VATSTS', 'ISACTIVE'], browserObject: 'TRDCATEGORY', pk: 'TRDCATEGORY', delegate: 'trdCategory' },
  { table: 'PAYMENT', fields: ['PAYMENT', 'CODE', 'NAME', 'ISACTIVE', 'MYDATACODE', 'INSTALMENTS'], browserObject: 'PAYMENT', pk: 'PAYMENT', delegate: 's1Payment' },
  { table: 'SHIPMENT', fields: ['SHIPMENT', 'CODE', 'NAME', 'INTCODE', 'ISACTIVE'], browserObject: 'SHIPMENT', pk: 'SHIPMENT', delegate: 'shipment' },
  { table: 'SOCURRENCY', fields: ['SOCURRENCY', 'SHORTCUT', 'NAME', 'ISACTIVE', 'INTERCODE', 'LRATE'], browserObject: 'SOCURRENCY', pk: 'SOCURRENCY', delegate: 'soCurrency' },
  { table: 'SERIES', fields: ['SERIES', 'SODTYPE', 'CODE', 'NAME', 'ISACTIVE'], browserObject: 'SERIES', pk: 'SERIES', delegate: 'series' },
]

type S1TableResponse = { rows?: unknown; data?: unknown; list?: unknown; columns?: unknown }

/** Δέχεται πολλαπλά πιθανά σχήματα απάντησης (rows ως array of objects, ή {columns,rows:[[...]]}). */
function parseRows(response: unknown, fields: string[]): Record<string, unknown>[] {
  if (!response || typeof response !== 'object') return []
  const res = response as S1TableResponse
  const raw = res.rows ?? res.data ?? res.list
  if (!Array.isArray(raw)) return []
  if (raw.length === 0) return []
  // array of objects — ήδη keyed by field name
  if (typeof raw[0] === 'object' && !Array.isArray(raw[0])) return raw as Record<string, unknown>[]
  // array of arrays — χρειάζεται column header (response.columns) ή fallback στη σειρά fields
  const columns: string[] = Array.isArray(res.columns) && res.columns.length === (raw[0] as unknown[]).length
    ? (res.columns as string[])
    : fields
  return (raw as unknown[][]).map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}

function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(n) ? n : null
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

/** Χτίζει το upsert `data` payload ανά table από την ήδη-parsed γραμμή SoftOne. */
function buildUpsertData(table: S1RefTable, row: Record<string, unknown>): Record<string, unknown> {
  switch (table) {
    case 'VAT':
      return { VAT: toInt(row.VAT), NAME: toStr(row.NAME) ?? '', PERCNT: toFloat(row.PERCNT) ?? 0, VATS1: toInt(row.VATS1), ISACTIVE: toInt(row.ISACTIVE) ?? 1, MYDATACODE: toInt(row.MYDATACODE) }
    case 'COUNTRY':
      return { COUNTRY: toInt(row.COUNTRY), SHORTCUT: toStr(row.SHORTCUT) ?? '', NAME: toStr(row.NAME) ?? '', SOCURRENCY: toInt(row.SOCURRENCY), COUNTRYTYPE: toInt(row.COUNTRYTYPE), INTCODE: toStr(row.INTCODE), INTERCODE: toStr(row.INTERCODE), EANCODE: toStr(row.EANCODE), ISACTIVE: toInt(row.ISACTIVE) ?? 1 }
    case 'IRSDATA':
      return { IRSDATA: toInt(row.IRSDATA), CODE: toStr(row.CODE), NAME: toStr(row.NAME) ?? '', ISACTIVE: toInt(row.ISACTIVE) ?? 1, ADDRESS: toStr(row.ADDRESS), CITY: toStr(row.CITY), ZIP: toStr(row.ZIP), PHONE1: toStr(row.PHONE1), EMAIL: toStr(row.EMAIL) }
    case 'TRDCATEGORY':
      return { TRDCATEGORY: toInt(row.TRDCATEGORY), CODE: toStr(row.CODE) ?? '', NAME: toStr(row.NAME) ?? '', VATSTS: toInt(row.VATSTS), ISACTIVE: toInt(row.ISACTIVE) ?? 1 }
    case 'PAYMENT':
      return { PAYMENT: toInt(row.PAYMENT), CODE: toStr(row.CODE) ?? '', NAME: toStr(row.NAME) ?? '', ISACTIVE: toInt(row.ISACTIVE) ?? 1, MYDATACODE: toInt(row.MYDATACODE), INSTALMENTS: toInt(row.INSTALMENTS) }
    case 'SHIPMENT':
      return { SHIPMENT: toInt(row.SHIPMENT), CODE: toStr(row.CODE) ?? '', NAME: toStr(row.NAME) ?? '', INTCODE: toStr(row.INTCODE), ISACTIVE: toInt(row.ISACTIVE) ?? 1 }
    case 'SOCURRENCY':
      return { SOCURRENCY: toInt(row.SOCURRENCY), SHORTCUT: toStr(row.SHORTCUT) ?? '', NAME: toStr(row.NAME) ?? '', ISACTIVE: toInt(row.ISACTIVE) ?? 1, INTERCODE: toStr(row.INTERCODE), LRATE: toFloat(row.LRATE) }
    case 'SERIES':
      return { SERIES: toInt(row.SERIES), SODTYPE: toInt(row.SODTYPE) ?? 0, CODE: toStr(row.CODE), NAME: toStr(row.NAME) ?? '', ISACTIVE: toInt(row.ISACTIVE) ?? 1 }
  }
}

async function fetchRows(cfg: RefConfig): Promise<Record<string, unknown>[]> {
  // 1. GetTable — απευθείας query
  try {
    const res = await s1('GetTable', { TABLE: cfg.table, FIELDS: cfg.fields.join(',') })
    if (res?.success) {
      const rows = parseRows(res, cfg.fields)
      if (rows.length > 0) return rows
    }
  } catch {
    // πέφτει στο fallback
  }
  // 2. getBrowserInfo → getBrowserData (paginated) fallback
  const info = await s1('getBrowserInfo', { object: cfg.browserObject, list: 'browser' })
  if (!info?.success || !info.reqID) throw new Error(`S1 sync (${cfg.table}): ούτε GetTable ούτε getBrowserInfo επέστρεψαν έγκυρα δεδομένα`)
  const allRows: Record<string, unknown>[] = []
  let start = 0
  const limit = 500
  for (let page = 0; page < 200; page++) { // safety cap — 100k γραμμές max
    const data = await s1('getBrowserData', { reqID: info.reqID, start, limit })
    const rows = parseRows(data, cfg.fields)
    allRows.push(...rows)
    if (rows.length < limit) break
    start += limit
  }
  return allRows
}

/** Sync ενός mirror table. Γράφει SyncLog (entity="s1-ref:<table>"). */
export async function syncS1Reference(table: S1RefTable): Promise<SyncResult> {
  const softone = await getIntegration('softone')
  if (!isIntegrationConfigured('softone', softone)) throw new S1SyncNotConfiguredError()

  const cfg = REF_CONFIGS.find(c => c.table === table)
  if (!cfg) throw new Error(`Άγνωστο S1 reference table: ${table}`)

  try {
    const rows = await fetchRows(cfg)
    let count = 0
    for (const row of rows) {
      const data = buildUpsertData(table, row)
      const pkValue = data[cfg.pk]
      if (pkValue === null || pkValue === undefined) continue // skip γραμμές χωρίς έγκυρο PK
      const delegate = prisma[cfg.delegate] as unknown as {
        upsert: (args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<unknown>
      }
      await delegate.upsert({
        where: { [cfg.pk]: pkValue },
        create: data,
        update: data,
      })
      count++
    }
    await prisma.syncLog.create({
      data: { entity: `s1-ref:${table}`, action: 'pull', ok: true, message: `${count} εγγραφές`, response: { count } },
    })
    // Πρώτο επιτυχημένο sync ενός table καθαρίζει το «προσωρινό seed» flag του (βλ. seedReferenceDefaults).
    await clearSeedFlag(table)
    return { table, ok: true, count }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.syncLog.create({
      data: { entity: `s1-ref:${table}`, action: 'pull', ok: false, message },
    })
    return { table, ok: false, count: 0, message }
  }
}

export async function syncAllReferences(): Promise<SyncResult[]> {
  const results: SyncResult[] = []
  for (const cfg of REF_CONFIGS) {
    results.push(await syncS1Reference(cfg.table))
  }
  return results
}

// ── Προσωρινό seed πριν το πρώτο S1 sync (βλ. AGENTS.md §4) ─────────────
/** Setting key που κρατάει ποια tables έχουν ΜΟΝΟ seed δεδομένα (όχι ακόμα από S1). */
const SEED_FLAG_KEY = 's1.referenceSeeded'

async function markSeedFlag(table: S1RefTable): Promise<void> {
  const { getSetting, setSetting } = await import('@/lib/settings')
  const existing = (await getSetting<S1RefTable[]>(SEED_FLAG_KEY)) ?? []
  if (!existing.includes(table)) await setSetting(SEED_FLAG_KEY, [...existing, table])
}

async function clearSeedFlag(table: S1RefTable): Promise<void> {
  const { getSetting, setSetting } = await import('@/lib/settings')
  const existing = (await getSetting<S1RefTable[]>(SEED_FLAG_KEY)) ?? []
  if (existing.includes(table)) await setSetting(SEED_FLAG_KEY, existing.filter(t => t !== table))
}

/** true αν το table δείχνει ακόμα «προσωρινά — εκκρεμεί S1 sync» δεδομένα (UI badge). */
export async function isReferenceStillSeeded(table: S1RefTable): Promise<boolean> {
  const { getSetting } = await import('@/lib/settings')
  const existing = (await getSetting<S1RefTable[]>(SEED_FLAG_KEY)) ?? []
  return existing.includes(table)
}

/**
 * Seed ΜΟΝΟ αν ο πίνακας είναι άδειος (ασφαλές να τρέχει επανειλημμένα από
 * prisma/seed.ts). Χρησιμοποιεί IDs 1-4 (VAT) / 1-3 (COUNTRY) — ΔΕΝ είναι
 * επιβεβαιωμένα SoftOne ids, γι' αυτό σημειώνονται ως "seeded" (βλ.
 * isReferenceStillSeeded) μέχρι το πρώτο πραγματικό S1 sync να τα
 * αντικαταστήσει (upsert by id).
 */
export async function seedReferenceDefaults(): Promise<void> {
  const vatCount = await prisma.vat.count()
  if (vatCount === 0) {
    await prisma.vat.createMany({
      data: [
        { VAT: 1, NAME: 'Κανονικός συντελεστής 24%', PERCNT: 24, ISACTIVE: 1 },
        { VAT: 2, NAME: 'Μειωμένος συντελεστής 13%', PERCNT: 13, ISACTIVE: 1 },
        { VAT: 3, NAME: 'Υπερμειωμένος συντελεστής 6%', PERCNT: 6, ISACTIVE: 1 },
        { VAT: 4, NAME: 'Απαλλαγή Φ.Π.Α. 0%', PERCNT: 0, ISACTIVE: 1 },
      ],
    })
    await markSeedFlag('VAT')
  }

  const countryCount = await prisma.country.count()
  if (countryCount === 0) {
    await prisma.country.createMany({
      data: [
        { COUNTRY: 1, SHORTCUT: 'GR', NAME: 'Ελλάδα', COUNTRYTYPE: 1, ISACTIVE: 1 },
        { COUNTRY: 2, SHORTCUT: 'CY', NAME: 'Κύπρος', COUNTRYTYPE: 2, ISACTIVE: 1 },
        { COUNTRY: 3, SHORTCUT: 'US', NAME: 'Η.Π.Α.', COUNTRYTYPE: 3, ISACTIVE: 1 },
      ],
    })
    await markSeedFlag('COUNTRY')
  }
}
