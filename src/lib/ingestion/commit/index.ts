import { runProductImport, type ImportTotals } from '@/lib/import/product-upsert'
import type { RawImportRow } from '@/lib/import/targets'
import { validateRows } from '@/lib/ingestion/validate'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { runPartnerUpsert } from './partner-upsert'
import type { CommitEnrichOptions } from '@/lib/ingestion/target'

/**
 * server-only module (εισάγει prisma μεταβατικά μέσω product-upsert/partner-upsert) —
 * ΠΟΤΕ μην το κάνεις import από αρχείο με 'use client'.
 */

export type { CommitEnrichOptions }

/** targetKey → commit fn. Δέχεται RawImportRow[] (fieldKey→string) — ό,τι παράγει το map stage.
 *  Το `enrich` αφορά μόνο targets με IngestionTarget.enrich=true (σήμερα: partner) — τα υπόλοιπα το αγνοούν. */
export const COMMIT_REGISTRY: Record<string, (rows: RawImportRow[], enrich?: CommitEnrichOptions) => Promise<ImportTotals>> = {
  product: (rows) => runProductImport(rows),
  partner: (rows, enrich) => {
    const target = ingestionTargetByKey('partner')!
    return runPartnerUpsert(validateRows(rows, target).parsed, enrich ?? {})
  },
}

export function commitFor(targetKey: string) {
  return COMMIT_REGISTRY[targetKey] ?? null
}
