'use server'

import { requirePermission } from '@/lib/rbac-server'
import { getSetting, setSetting } from '@/lib/settings'
import { extractDocument } from '@/lib/ocr/extract'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { projectOcr } from '@/lib/ingestion/ocr-project'
import { normalizeApiJson, assertSafeIngestUrl } from '@/lib/ingestion/api-normalize'
import { buildOcrCostViewForSession, type OcrCostView } from '@/lib/ingestion/ocr-cost'
import { validateRows } from '@/lib/ingestion/validate'
import { commitFor } from '@/lib/ingestion/commit'
import { mapToRows, type IngestionMapping } from '@/lib/ingestion/map'
import type { NormalizedBatch } from '@/lib/ingestion/normalized'
import type { ImportTotals } from '@/lib/import/product-upsert'
import type { FieldError } from '@/lib/import/targets'

/**
 * Server orchestration για το Universal Ingestion Core: συνδέει τα adapters
 * (OCR/API) με το κοινό pipeline map/validate/commit (Tasks 1-9) πίσω από
 * permission gating ανά target (ingestionTargetByKey().permission — ΠΟΤΕ από
 * τον client). Κάθε exported action ξεκινάει με requireTarget().
 */

const MAX_BYTES = 2_000_000
const MAX_RECORDS = 2000
const TIMEOUT_MS = 15_000

async function requireTarget(targetKey: string) {
  const target = ingestionTargetByKey(targetKey)
  if (!target) throw new Error('Άγνωστο αντικείμενο καταχώρισης.')
  const session = await requirePermission(target.permission)
  return { target, session }
}

export type AcquireOcrResult = { batch: NormalizedBatch; cost: OcrCostView }

export async function acquireFromOcr(
  targetKey: string,
  input: { images: { base64: string; mimeType: string }[]; text?: string },
): Promise<AcquireOcrResult> {
  const { target, session } = await requireTarget(targetKey)
  const result = await extractDocument({
    images: input.images, text: input.text,
    docType: target.ocr?.docTypeHint, userId: session.user.id,
  })
  const { sourceKeys, records } = projectOcr(result.data, target)
  const cost = await buildOcrCostViewForSession(session.user.role, result.model, result.tokensUsed)
  // Το ακατέργαστο κόστος (baseUsd) ΔΕΝ πρέπει να φτάνει στον client μέσω του batch όταν
  // ο ρόλος δεν βλέπει breakdown (buildOcrCostViewForSession ήδη το κρύβει στο view — εδώ
  // απλώς εξασφαλίζουμε ότι ούτε το meta.ocr.costUsd του NormalizedBatch το διαρρέει).
  const costUsd = cost.showBreakdown ? cost.baseUsd ?? 0 : 0
  const batch: NormalizedBatch = {
    source: 'ocr', sourceKeys, records,
    meta: { ocr: { model: result.model, usedFallback: result.usedFallback, costUsd, mismatches: result.mismatches } },
  }
  return { batch, cost }
}

export async function acquireFromApi(
  targetKey: string,
  url: string,
  headerName?: string,
  headerValue?: string,
): Promise<NormalizedBatch> {
  await requireTarget(targetKey)
  const safe = assertSafeIngestUrl(url)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (headerName && headerValue) headers[headerName] = headerValue

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let json: unknown
  try {
    const res = await fetch(safe.toString(), { headers, signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`Το endpoint απάντησε HTTP ${res.status}.`)
    const text = await res.text()
    if (text.length > MAX_BYTES) throw new Error('Η απάντηση είναι πολύ μεγάλη.')
    json = JSON.parse(text)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('Το endpoint δεν απάντησε (timeout).')
    if (err instanceof SyntaxError) throw new Error('Η απάντηση δεν ήταν έγκυρο JSON.')
    throw err
  } finally {
    clearTimeout(timer)
  }
  const { sourceKeys, records } = normalizeApiJson(json)
  if (records.length > MAX_RECORDS) throw new Error(`Πολλές εγγραφές (max ${MAX_RECORDS}).`)
  return { source: 'api', sourceKeys, records, meta: { api: { url: safe.toString(), fetchedAt: 0, count: records.length } } }
}

export type ValidateBatchResult = { toCreate: number; toUpdate: number; errors: FieldError[]; validRows: number }

export async function validateBatch(
  targetKey: string,
  batch: NormalizedBatch,
  mappings: IngestionMapping[],
): Promise<ValidateBatchResult> {
  const { target } = await requireTarget(targetKey)
  const rows = mapToRows(batch, mappings, target)
  const { parsed, errors } = validateRows(rows, target)
  const validRows = parsed.filter(p => p.ok).length
  return { toCreate: validRows, toUpdate: 0, errors, validRows }
}

export async function commitBatch(
  targetKey: string,
  batch: NormalizedBatch,
  mappings: IngestionMapping[],
): Promise<ImportTotals> {
  const { target } = await requireTarget(targetKey)
  const commit = commitFor(targetKey)
  if (!commit) throw new Error('Δεν υπάρχει διαθέσιμη αποθήκευση για αυτό το αντικείμενο.')
  const rows = mapToRows(batch, mappings, target)
  return commit(rows)
}

export type ApiPreset = { name: string; url: string; headerName?: string }

export async function listApiPresets(targetKey: string): Promise<ApiPreset[]> {
  await requireTarget(targetKey)
  return (await getSetting<ApiPreset[]>(`ingestion.apiPresets:${targetKey}`)) ?? []
}

/** headerValue (token/secret) ΠΟΤΕ δεν αποθηκεύεται — μόνο το headerName. */
export async function saveApiPreset(targetKey: string, preset: ApiPreset): Promise<ApiPreset[]> {
  await requireTarget(targetKey)
  assertSafeIngestUrl(preset.url)
  const list = (await getSetting<ApiPreset[]>(`ingestion.apiPresets:${targetKey}`)) ?? []
  const next = [...list.filter(p => p.name !== preset.name), { name: preset.name, url: preset.url, headerName: preset.headerName }]
  await setSetting(`ingestion.apiPresets:${targetKey}`, next)
  return next
}
