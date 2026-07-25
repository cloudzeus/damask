import { normalizeHeader } from '@/lib/import/targets'
import type { IngestionTarget } from './target'
import type { NormalizedBatch, RawIngestionRow } from './normalized'

export type IngestionMapping = { sourceKey: string; fieldKey: string } // fieldKey '' = παράβλεψη

/** Fuzzy match ενός source key σε field key/label/aliases (accent/case-insensitive). '' αν τίποτα σίγουρο. */
export function autoMatchField(sourceKey: string, target: IngestionTarget): string {
  const norm = normalizeHeader(sourceKey)
  if (!norm) return ''
  for (const f of target.fields) {
    const candidates = [f.key, f.label, ...(f.aliases ?? [])].map(normalizeHeader)
    if (candidates.includes(norm)) return f.key
  }
  for (const f of target.fields) {
    const candidates = [f.key, f.label, ...(f.aliases ?? [])].map(normalizeHeader)
    if (candidates.some(c => c && (c.includes(norm) || norm.includes(c)))) return f.key
  }
  return ''
}

export function autoMatchMappings(sourceKeys: string[], target: IngestionTarget): IngestionMapping[] {
  return sourceKeys.map(sourceKey => ({ sourceKey, fieldKey: autoMatchField(sourceKey, target) }))
}

/**
 * Κάθε record → { rowNum, values: fieldKey→raw } βάσει των mappings. rowNum 1-based.
 * `fixedValues` (fieldKey→raw): σταθερή τιμή για ΟΛΕΣ τις γραμμές — υπερισχύει
 * τυχόν αντιστοιχισμένης στήλης (βλ. fixedChoices στο IngestionFieldDef).
 */
export function mapToRows(
  batch: NormalizedBatch,
  mappings: IngestionMapping[],
  _target: IngestionTarget,
  fixedValues?: Record<string, string>,
): RawIngestionRow[] {
  const active = mappings.filter(m => m.fieldKey)
  const fixed = Object.entries(fixedValues ?? {}).filter(([, v]) => v !== '')
  return batch.records.map((rec, i) => {
    const values: Record<string, string> = {}
    for (const m of active) {
      const v = rec[m.sourceKey]
      if (v != null) values[m.fieldKey] = v
    }
    for (const [fieldKey, v] of fixed) values[fieldKey] = v
    return { rowNum: i + 1, values }
  })
}
