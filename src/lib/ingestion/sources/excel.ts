import { readWorkbookFromFile, readSheetRows, type RawRow } from '@/lib/import/xlsx-parse'
import type { NormalizedBatch, SourceRecord } from '@/lib/ingestion/normalized'

/** PURE: headers + data rows → NormalizedBatch. Στήλες με κενό header ή στο `excluded` (0-based) παραλείπονται. */
export function rowsToBatch(
  headers: (string | null)[],
  rows: { rowNum: number; cells: (string | null)[] }[],
  opts: { fileName: string; sheet: string; excluded?: number[] },
): NormalizedBatch {
  const excluded = new Set(opts.excluded ?? [])
  const kept = headers
    .map((h, idx) => ({ idx, key: (h ?? '').trim() }))
    .filter(c => c.key !== '' && !excluded.has(c.idx))

  const records: SourceRecord[] = rows.map(r => {
    const rec: SourceRecord = {}
    for (const c of kept) {
      const v = r.cells[c.idx]
      if (v != null && String(v).trim() !== '') rec[c.key] = String(v)
    }
    return rec
  })
  const first = rows[0]
  const sourceKeys = kept.map(c => ({ key: c.key, sample: first ? (first.cells[c.idx] ?? undefined) as string | undefined : undefined }))
  return { source: 'excel', sourceKeys, records, meta: { excel: { fileName: opts.fileName, sheet: opts.sheet } } }
}

/**
 * Client helper: File → φύλλο → { headers, rows } έτοιμο για rowsToBatch. Ξαναχρησιμοποιεί
 * readWorkbookFromFile/readSheetRows από xlsx-parse.ts (ίδιο pipeline με step-sheet.tsx —
 * CSV encoding, Ελληνικοί αριθμοί, ημερομηνίες, raw:true χειρισμός — DRY, όχι ξανά inline SheetJS).
 */
export async function readSheet(
  file: File,
  sheetName: string,
  headerRow = 1,
): Promise<{ headers: (string | null)[]; rows: { rowNum: number; cells: (string | null)[] }[] }> {
  const wb = await readWorkbookFromFile(file)
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`)
  const { rows }: { rows: RawRow[] } = readSheetRows(ws)
  const headerRawRow = rows.find(r => r.rowNum === headerRow)
  const headers = headerRawRow?.cells ?? []
  const dataRows = rows.filter(r => r.rowNum > headerRow)
  return { headers, rows: dataRows }
}
