/**
 * Pure ΑΑΔΕ (vat.wwa.gr/afm2info) → Trdr mapper + nil-coercion + ΑΦΜ
 * validation. NO fetch/prisma/clock imports here — unit-testable in
 * isolation (tests/trdr-aade-map.test.ts). The network client
 * (src/lib/trdr/aade.ts) re-exports these.
 *
 * Ported + adapted from ref pb-ref app/api/admin/aade-lookup/route.ts to our
 * Trdr shape (prisma/schema.prisma): SoftOne-mirrored fields keep their
 * SoftOne casing (NAME/ADDRESS/ZIP/CITY) — app-only ΑΑΔΕ extras stay
 * camelCase (foundingDate/aadeStatus/aadeFirmKind/appLegalForm).
 */

import { ensurePrimaryActivity } from '@/lib/registries/kad-pure'

/** Strip everything but digits — tolerates a country prefix ("EL999863881" → "999863881"). */
export function normalizeAfm(input: string): string {
  return String(input ?? '').replace(/\D+/g, '')
}

export function isValidAfm(afm: string): boolean {
  return /^\d{9}$/.test(afm)
}

/**
 * ΑΑΔΕ/ΓΕΜΗ nil coercer — some upstream XML→JSON conversions represent a
 * missing value as an object carrying a nil marker instead of JSON `null`:
 *   - `{ $: { 'xsi:nil': 'true' } }`  (SOAP→JSON, ref idiom)
 *   - `{ '@_xsi:nil': 'true' }`       (xml2js attribute-prefix idiom)
 *   - `{ _: 'actual value' }`         (SOAP→JSON text node)
 * Plain values are trimmed; empty/whitespace-only strings become `null`.
 */
export function s(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o['@_xsi:nil'] === 'true') return null
    const dollar = o.$ as Record<string, unknown> | undefined
    if (dollar && (dollar['xsi:nil'] === 'true' || dollar.nil === 'true')) return null
    if (typeof o._ === 'string') return o._.trim() || null
  }
  return null
}

export type AadeFirmActRaw = {
  firm_act_code?: unknown
  firm_act_descr?: unknown
  firm_act_kind?: unknown
}

export type AadeRawResponse = {
  basic_rec?: Record<string, unknown>
  firm_act_tab?: { item?: AadeFirmActRaw | AadeFirmActRaw[] }
}

export type AadeTrdrActivity = {
  code: string | null
  description: string | null
  kind: 'PRIMARY' | 'SECONDARY'
  order: number
}

export type AadeTrdrPatch = {
  NAME: string
  ADDRESS: string | null
  ZIP: string | null
  CITY: string | null
  foundingDate: Date | null
  aadeStatus: string | null
  aadeFirmKind: string | null
  appLegalForm: string | null
}

function toDate(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Maps the raw vat.wwa.gr/afm2info JSON payload into `{ mapped, activities }`
 * — `null` when `basic_rec`/`afm` is missing (AFM not found in the registry).
 */
export function mapAadeResponse(raw: AadeRawResponse): { mapped: AadeTrdrPatch; activities: AadeTrdrActivity[] } | null {
  const b = raw?.basic_rec
  if (!b || !s(b.afm)) return null

  const item = raw?.firm_act_tab?.item
  const items: AadeFirmActRaw[] = item == null ? [] : (Array.isArray(item) ? item : [item])

  const activities = ensurePrimaryActivity(
    items.map((a, i) => ({
      code: s(a.firm_act_code),
      description: s(a.firm_act_descr),
      // ΑΑΔΕ firm_act_kind: "1" κύρια, οτιδήποτε άλλο δευτερεύουσα.
      kind: (s(a.firm_act_kind) === '1' ? 'PRIMARY' : 'SECONDARY') as 'PRIMARY' | 'SECONDARY',
      order: i,
    })),
  )

  const addressParts = [s(b.postal_address), s(b.postal_address_no)].filter(Boolean)

  const mapped: AadeTrdrPatch = {
    NAME: s(b.onomasia) ?? '',
    ADDRESS: addressParts.join(' ') || null,
    ZIP: s(b.postal_zip_code),
    CITY: s(b.postal_area_description),
    foundingDate: toDate(s(b.regist_date)),
    aadeStatus: s(b.deactivation_flag_descr),
    aadeFirmKind: s(b.firm_flag_descr),
    appLegalForm: s(b.legal_status_descr),
  }

  return { mapped, activities }
}
