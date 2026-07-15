import { isRowBlank } from '@/lib/import/xlsx-parse'
import type { RawImportRow } from '@/lib/import/targets'
import type { ImportConfig } from './types'

/**
 * Χτίζει τις γραμμές δεδομένων έτοιμες για validate/execute: μόνο data rows
 * (μετά τη γραμμή επικεφαλίδων), παραλείποντας σιωπηλά τελείως κενές γραμμές
 * (ουρές κενών γραμμών σε πραγματικά αρχεία — όχι πραγματικά δεδομένα).
 * Excluded στήλες δεν εμφανίζονται καν εδώ γιατί ποτέ δεν αποκτούν mapping
 * (βλ. step-mapping.tsx — activeColumns ήδη αφαιρεί τις excluded).
 */
export function buildMappedRows(config: ImportConfig): RawImportRow[] {
  const rows = config.sheetRows[config.selectedSheet] ?? []
  const activeMappings = config.mappings.filter(m => m.fieldKey)
  if (activeMappings.length === 0) return []

  return rows
    .filter(r => r.rowNum > config.headerRow && !isRowBlank(r))
    .map(row => {
      const values: Record<string, string> = {}
      for (const m of activeMappings) {
        values[m.fieldKey] = (row.cells[m.colIndex] ?? '').trim()
      }
      return { rowNum: row.rowNum, values }
    })
}
