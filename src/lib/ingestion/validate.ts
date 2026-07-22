import type { FieldError } from '@/lib/import/targets'
import type { IngestionTarget } from './target'
import type { RawIngestionRow } from './normalized'

export type ParsedRow =
  | { rowNum: number; ok: true; data: Record<string, unknown> }
  | { rowNum: number; ok: false; errors: FieldError[] }

export type ValidateResult = { parsed: ParsedRow[]; errors: FieldError[] }

function parseRowAgainstTarget(rowNum: number, raw: Record<string, string>, target: IngestionTarget): ParsedRow {
  const errors: FieldError[] = []
  const data: Record<string, unknown> = {}
  for (const field of target.fields) {
    const cell = raw[field.key] ?? ''
    const result = field.parse(cell)
    if (result.error) errors.push({ row: rowNum, column: field.label, message: result.error })
    else data[field.key] = result.value
  }
  return errors.length > 0 ? { rowNum, ok: false, errors } : { rowNum, ok: true, data }
}

export function validateRows(rows: RawIngestionRow[], target: IngestionTarget): ValidateResult {
  const parsed = rows.map(r => parseRowAgainstTarget(r.rowNum, r.values, target))
  const errors: FieldError[] = parsed.flatMap(p => (p.ok ? [] : p.errors))

  const uniqueField = target.fields.find(f => f.key === target.uniqueBy)
  const uniqueLabel = uniqueField?.label ?? target.uniqueBy
  const firstSeen = new Map<string, number>()
  for (const p of parsed) {
    if (!p.ok) continue
    const key = String(p.data[target.uniqueBy] ?? '')
    if (!key) continue
    const seen = firstSeen.get(key)
    if (seen) errors.push({ row: p.rowNum, column: uniqueLabel, message: `Διπλότυπη τιμή «${key}» μέσα στο batch (ήδη στη γραμμή ${seen}).` })
    else firstSeen.set(key, p.rowNum)
  }
  return { parsed, errors }
}

export function validationSummary(result: ValidateResult): { valid: number; invalid: number; errors: number } {
  const valid = result.parsed.filter(p => p.ok).length
  return { valid, invalid: result.parsed.length - valid, errors: result.errors.length }
}
