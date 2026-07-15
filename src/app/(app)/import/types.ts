import type { SheetMeta, RawRow, ColumnInfo } from '@/lib/import/xlsx-parse'
import type { FieldError } from '@/lib/import/targets'

export type { SheetMeta, RawRow, ColumnInfo, FieldError }

export type ColumnMapping = { colIndex: number; fieldKey: string } // fieldKey '' = παράβλεψη στήλης

export type ValidationSummary = {
  toCreate: number
  toUpdate: number
  errors: FieldError[]
  checkedAt: number // Date.now() — ώστε το UI να ξέρει αν η επικύρωση είναι "μπαγιάτικη" μετά από αλλαγή mapping
}

export type ExecutionSummary = {
  jobId: string
  sync: boolean
  status: 'RUNNING' | 'DONE' | 'FAILED'
  total: number
  processed: number
  created: number
  updated: number
  failed: number
  errors: FieldError[]
}

/** Ολόκληρη η κατάσταση του οδηγού — ζει στο ExcelImportWizard, περνάει προς τα κάτω + patch() προς τα πάνω. */
export type ImportConfig = {
  // Βήμα 1 — Αρχείο
  file: File | null
  fileName: string
  fileSize: number
  sheets: SheetMeta[]

  // Ανά-φύλλο πλήρως parsed δεδομένα (client memory only — ΔΕΝ ταξιδεύει ολόκληρο στο server)
  sheetRows: Record<string, RawRow[]>
  sheetColCounts: Record<string, number>

  // Βήμα 2 — Φύλλο & Στήλες
  selectedSheet: string
  headerRow: number
  columns: ColumnInfo[]
  excludedColumns: number[] // 0-based indices
  hideEmptyColumns: boolean

  // Βήμα 3 — Αντιστοίχιση
  mappings: ColumnMapping[]
  loadedTemplateName: string

  // Βήμα 4 — Έλεγχος
  validation: ValidationSummary | null

  // Βήμα 5 — Εκτέλεση
  execution: ExecutionSummary | null
}

export const DEFAULT_IMPORT_CONFIG: ImportConfig = {
  file: null,
  fileName: '',
  fileSize: 0,
  sheets: [],
  sheetRows: {},
  sheetColCounts: {},
  selectedSheet: '',
  headerRow: 1,
  columns: [],
  excludedColumns: [],
  hideEmptyColumns: false,
  mappings: [],
  loadedTemplateName: '',
  validation: null,
  execution: null,
}
