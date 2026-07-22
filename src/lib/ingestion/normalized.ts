import type { MismatchFlag } from '@/lib/ocr/invoice-math'
import type { RawImportRow } from '@/lib/import/targets'

/** Μία flat source-εγγραφή: sourceKey → raw string τιμή (coercion γίνεται μόνο στο validate). */
export type SourceRecord = Record<string, string>

export type SourceKind = 'excel' | 'ocr' | 'api'

export type NormalizedBatch = {
  source: SourceKind
  sourceKeys: { key: string; sample?: string }[]
  records: SourceRecord[]
  meta?: {
    ocr?: { model: string; usedFallback: boolean; costUsd: number; mismatches: MismatchFlag[] }
    api?: { url: string; fetchedAt: number; count: number }
    excel?: { fileName: string; sheet: string }
  }
}

/** Μία γραμμή μετά το mapping, ίδιο shape με τον import (DRY). */
export type RawIngestionRow = RawImportRow
