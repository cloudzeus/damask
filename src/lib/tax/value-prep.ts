import { coerceFinancialValue, type FinancialValueTypeStr } from '@/lib/tax/greek-format'

/**
 * PURE mapping: correction-grid entries (ό,τι επιβεβαιώνει/διορθώνει ο χρήστης
 * μετά το scanForm OCR) → write-data για TrdrFinancialValue, ανά valueType.
 * DATE γράφεται σε valueText (ακατέργαστο, χωρίς Date parsing εδώ — το
 * ημερολογιακό parsing/coercion μένει στο greek-format), TABLE σε valueJson,
 * όλα τα υπόλοιπα (CURRENCY/NUMBER/PERCENT/INTEGER/BOOLEAN) σε numeric value
 * μέσω coerceFinancialValue.
 */

export type GridEntry = {
  fieldKey: string
  kind: 'SINGLE' | 'SERIES' | 'TABLE'
  valueType: FinancialValueTypeStr
  raw?: string | null
  json?: unknown
  confidence?: number | null
}

export type ValueWrite = {
  trdrId: string
  templateId: string
  fieldKey: string
  year: number
  kind: 'SINGLE' | 'SERIES' | 'TABLE'
  valueType: FinancialValueTypeStr
  value: number | null
  valueText: string | null
  valueJson: unknown
  source: 'OCR'
  sourceRecordId: string
  confidence: number | null
}

export function prepareValueWrites(input: {
  trdrId: string
  templateId: string
  year: number
  recordId: string
  entries: GridEntry[]
}): ValueWrite[] {
  return input.entries.map(e => {
    const isTable = e.kind === 'TABLE'
    const isDate = e.valueType === 'DATE'
    return {
      trdrId: input.trdrId,
      templateId: input.templateId,
      fieldKey: e.fieldKey,
      year: input.year,
      kind: e.kind,
      valueType: e.valueType,
      value: isTable || isDate ? null : coerceFinancialValue(e.raw, e.valueType),
      valueText: isDate ? (e.raw ?? null) : null,
      valueJson: isTable ? (e.json ?? null) : null,
      source: 'OCR',
      sourceRecordId: input.recordId,
      confidence: e.confidence ?? null,
    }
  })
}
