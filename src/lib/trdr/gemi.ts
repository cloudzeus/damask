/**
 * ΓΕΜΗ Open Data API client (opendata-api.businessportal.gr) — port of ref
 * pb-ref `lib/gemi.ts` adapted to DAMASK: the `api_key` comes from
 * Settings → Διασυνδέσεις (`integration.gemi` via src/lib/settings.ts),
 * NEVER from env/hardcode (per W2 spec §0.5). Pure mapping lives in
 * gemi-map.ts (re-exported below) so it stays unit-testable without a live
 * key/network — see tests/trdr-gemi-map.test.ts.
 *
 * Docs: https://opendata.businessportal.gr/techdocs/
 * Spec: https://opendata-api.businessportal.gr/api-docs
 */

import { getIntegration } from '@/lib/settings'
import { mapGemiCompany, type GemiCompanyRaw, type GemiTrdrActivity, type GemiTrdrPatch } from '@/lib/trdr/gemi-map'

export { mapGemiCompany }
export type { GemiCompanyRaw, GemiTrdrActivity, GemiTrdrPatch }

const BASE_URL = 'https://opendata-api.businessportal.gr/api/opendata/v1'

export class GemiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`GEMI ${status}: ${message}`)
  }
}

async function storedApiKey(): Promise<string | null> {
  const cfg = await getIntegration<{ apiKey?: string }>('gemi')
  const key = cfg.apiKey?.trim()
  return key || null
}

/** true αν έχει αποθηκευτεί κλειδί ΓΕΜΗ στις Ρυθμίσεις → Διασυνδέσεις. */
export async function isGemiConfigured(): Promise<boolean> {
  return (await storedApiKey()) != null
}

/** apiKeyOverride: ΜΟΝΟ για το κουμπί «Δοκιμή σύνδεσης» των Ρυθμίσεων (δοκιμάζει ένα μη-αποθηκευμένο ακόμα κλειδί). */
async function resolveApiKey(apiKeyOverride?: string): Promise<string> {
  const key = apiKeyOverride?.trim() || (await storedApiKey())
  if (!key) throw new GemiError(0, 'Το κλειδί ΓΕΜΗ δεν έχει ρυθμιστεί (Ρυθμίσεις → Διασυνδέσεις).')
  return key
}

async function gemiFetch<T>(path: string, init?: RequestInit & { apiKeyOverride?: string }): Promise<T> {
  const { apiKeyOverride, ...rest } = init ?? {}
  const apiKey = await resolveApiKey(apiKeyOverride)
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: { api_key: apiKey, Accept: 'application/json', ...(rest.headers ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new GemiError(res.status, text || res.statusText)
  }
  return res.json() as Promise<T>
}

// ---------- Types (subset, see swagger spec for full schema) ----------

export type GemiCompanySummary = {
  arGemi: string // API returns as string (≥ 12 digits)
  afm: string
  coNameEl: string
  coTitlesEl?: string[]
  status?: { id: number; descr: string; isActive: boolean }
}

export type GemiDocumentDecision = {
  dateAssemblyDecided?: string
  assembly?: string
  summary?: string
  kak?: string
  decisionSubject?: string
  decisionSubjectID?: string
  dateAnnounced?: string
  assemblyDecisionUrl?: string
  dateRegistrated?: string
  applicationStatusId?: string
  applicationStatusDescription?: string
  referenceKak?: string
}

export type GemiDocumentPublication = { url?: string; kad?: string }

export type GemiDocumentSet = {
  decision?: GemiDocumentDecision[]
  publication?: GemiDocumentPublication[]
}

export type MetadataItem = { id: string | number; descr: string; descrEn?: string; lastUpdated?: string }
export type GemiLegalType = MetadataItem & { id: number }
export type GemiCompanyStatus = MetadataItem & { id: number; isActive: boolean }
export type GemiOfficeMeta = MetadataItem & {
  id: number
  address?: string
  city?: string
  zipCode?: string
  phone?: string
  fax?: string
  url?: string
}
export type GemiPrefecture = MetadataItem & { id: string }
export type GemiMunicipality = MetadataItem & { id: string; prefectureId?: string }

// ---------- Metadata (lookup tables) ----------
// apiKeyOverride σε κάθε metadata fn: χρησιμοποιείται ΜΟΝΟ από το testGemiSettings
// server action (Ρυθμίσεις → «Δοκιμή σύνδεσης») για να δοκιμάσει ένα κλειδί που
// μόλις πληκτρολογήθηκε, πριν αποθηκευτεί. Το refreshGemiMetadata action (T3) δεν
// περνάει τίποτα → διαβάζεται πάντα το αποθηκευμένο κλειδί.

export const gemiMetadata = {
  legalTypes: (apiKeyOverride?: string) => gemiFetch<GemiLegalType[]>('/metadata/legalTypes', { apiKeyOverride }),
  gemiOffices: (apiKeyOverride?: string) => gemiFetch<GemiOfficeMeta[]>('/metadata/gemiOffices', { apiKeyOverride }),
  companyStatuses: (apiKeyOverride?: string) =>
    gemiFetch<GemiCompanyStatus[]>('/metadata/companyStatuses', { apiKeyOverride }),
  prefectures: (apiKeyOverride?: string) => gemiFetch<GemiPrefecture[]>('/metadata/prefectures', { apiKeyOverride }),
  municipalities: (apiKeyOverride?: string) =>
    gemiFetch<GemiMunicipality[]>('/metadata/municipalities', { apiKeyOverride }),
}

export async function searchGemiCompanies(params: {
  afm?: string
  arGemi?: string | number
  name?: string
  resultsSize?: number
}): Promise<{ results: GemiCompanySummary[]; totalResults: number }> {
  const qs = new URLSearchParams()
  if (params.afm) qs.set('afm', params.afm)
  if (params.arGemi !== undefined) qs.set('arGemi', String(params.arGemi))
  if (params.name) qs.set('name', params.name)
  qs.set('resultsSize', String(params.resultsSize ?? 25))
  const raw = await gemiFetch<{
    searchResults?: GemiCompanySummary[]
    results?: GemiCompanySummary[]
    searchMetadata?: { totalCount?: number }
    totalResults?: number
  }>(`/companies?${qs.toString()}`)
  return {
    results: raw.searchResults ?? raw.results ?? [],
    totalResults: raw.searchMetadata?.totalCount ?? raw.totalResults ?? 0,
  }
}

export async function getGemiCompany(arGemi: string | number): Promise<GemiCompanyRaw> {
  return gemiFetch(`/companies/${arGemi}`)
}

export async function getGemiCompanyDocuments(arGemi: string | number): Promise<GemiDocumentSet> {
  return gemiFetch(`/companies/${arGemi}/documents`)
}

/** Downloads a file from a GEMI URL (assemblyDecisionUrl or publication.url) as a Buffer. */
export async function downloadGemiFile(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey = await resolveApiKey()
  const res = await fetch(url, { headers: { api_key: apiKey }, cache: 'no-store' })
  if (!res.ok) throw new GemiError(res.status, `Download failed: ${url}`)
  const ab = await res.arrayBuffer()
  return {
    buffer: Buffer.from(ab),
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  }
}
