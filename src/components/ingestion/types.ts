import type { NormalizedBatch, SourceKind } from '@/lib/ingestion/normalized'
import type { IngestionMapping } from '@/lib/ingestion/map'
import type { OcrCostView } from '@/lib/ingestion/ocr-cost'
import type { FieldError } from '@/lib/import/targets'
import type { ImportTotals } from '@/lib/import/product-upsert'

export type IngestStep = 1 | 2 | 3 | 4

export type IngestState = {
  source: SourceKind | null
  batch: NormalizedBatch | null
  ocrCost: OcrCostView | null
  mappings: IngestionMapping[]
  /** fieldKey → σταθερή τιμή για όλες τις γραμμές (βλ. fixedChoices στο IngestionFieldDef). '' = ανενεργό. */
  fixedValues: Record<string, string>
  validation: { errors: FieldError[]; validRows: number } | null
  totals: ImportTotals | null
}

export const EMPTY_INGEST_STATE: IngestState = {
  source: null, batch: null, ocrCost: null, mappings: [], fixedValues: {}, validation: null, totals: null,
}

// Shared prop shape for the four step components
export type StepProps = {
  target: import('@/lib/ingestion/target').IngestionTarget
  state: IngestState
  patch: (u: Partial<IngestState>) => void
}
