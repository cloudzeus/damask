import { coerceFinancialValue, type FinancialValueTypeStr } from '@/lib/tax/greek-format'

/**
 * PURE mapping: correction-grid entries (ό,τι επιβεβαιώνει/διορθώνει ο χρήστης
 * μετά το scanForm OCR) → write-data για TrdrFinancialValue, ανά valueType.
 * DATE γράφεται σε valueText (ακατέργαστο, χωρίς Date parsing εδώ — το
 * ημερολογιακό parsing/coercion μένει στο greek-format), TABLE σε valueJson,
 * SERIES εκρήγνυται σε ΠΟΛΛΑΠΛΑ writes — ένα ανά σημείο {year,value} (στο
 * ΕΤΟΣ ΤΟΥ ΣΗΜΕΙΟΥ, όχι στο έτος της σάρωσης) — ώστε πολυετή δεδομένα (π.χ.
 * τζίρος 2022-2024 σε ένα σαρωμένο έντυπο) να μην συμπιέζονται σε μία
 * γραμμή/έτος, όλα τα υπόλοιπα (CURRENCY/NUMBER/PERCENT/INTEGER/BOOLEAN) σε
 * numeric value μέσω coerceFinancialValue.
 */

export type SeriesEntryPoint = { year: number | null; value: string | null }

export type GridEntry = {
  fieldKey: string
  kind: 'SINGLE' | 'SERIES' | 'TABLE'
  valueType: FinancialValueTypeStr
  raw?: string | null
  json?: unknown
  series?: SeriesEntryPoint[]
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
  return input.entries.flatMap((e): ValueWrite[] => {
    if (e.kind === 'SERIES') {
      // Ένα write ανά σημείο σειράς, στο ΕΤΟΣ ΤΟΥ ΣΗΜΕΙΟΥ (όχι στο έτος
      // σάρωσης) — σημεία χωρίς έτος παραλείπονται (δεν μπορούν να
      // upsert-αριστούν στο μοναδικό (trdrId, fieldKey, year)).
      return (e.series ?? [])
        .filter((p): p is SeriesEntryPoint & { year: number } => p.year != null)
        .map(p => ({
          trdrId: input.trdrId,
          templateId: input.templateId,
          fieldKey: e.fieldKey,
          year: p.year,
          kind: e.kind,
          valueType: e.valueType,
          value: coerceFinancialValue(p.value, e.valueType),
          valueText: null,
          valueJson: null,
          source: 'OCR' as const,
          sourceRecordId: input.recordId,
          confidence: e.confidence ?? null,
        }))
    }
    const isTable = e.kind === 'TABLE'
    const isDate = e.valueType === 'DATE'
    return [{
      trdrId: input.trdrId,
      templateId: input.templateId,
      fieldKey: e.fieldKey,
      year: input.year,
      kind: e.kind,
      valueType: e.valueType,
      value: isTable || isDate ? null : coerceFinancialValue(e.raw, e.valueType),
      valueText: isDate ? (e.raw ?? null) : null,
      valueJson: isTable ? (e.json ?? null) : null,
      source: 'OCR' as const,
      sourceRecordId: input.recordId,
      confidence: e.confidence ?? null,
    }]
  })
}
