import { runProductImport, type ImportTotals } from '@/lib/import/product-upsert'
import type { RawImportRow } from '@/lib/import/targets'
import { validateRows } from '@/lib/ingestion/validate'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { runPartnerUpsert } from './partner-upsert'

/**
 * server-only module (εισάγει prisma μεταβατικά μέσω product-upsert/partner-upsert) —
 * ΠΟΤΕ μην το κάνεις import από αρχείο με 'use client'.
 */

/** targetKey → commit fn. Δέχεται RawImportRow[] (fieldKey→string) — ό,τι παράγει το map stage. */
export const COMMIT_REGISTRY: Record<string, (rows: RawImportRow[]) => Promise<ImportTotals>> = {
  product: (rows) => runProductImport(rows),
  partner: (rows) => {
    const target = ingestionTargetByKey('partner')!
    return runPartnerUpsert(validateRows(rows, target).parsed)
  },
}

export function commitFor(targetKey: string) {
  return COMMIT_REGISTRY[targetKey] ?? null
}
