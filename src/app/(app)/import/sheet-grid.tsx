'use client'

import { useMemo } from 'react'
import { LuCheck } from 'react-icons/lu'
import type { RawRow, ColumnInfo } from '@/lib/import/xlsx-parse'

const WINDOW_THRESHOLD = 200
const WINDOW_SIZE = 100

/**
 * Μόνιμο Excel-like grid preview (MASTER.md §5α — τελείες αντί για zebra) —
 * κοινό component για το Βήμα 2 (excludes στηλών) και το Βήμα 4 (σήμανση
 * γραμμών με σφάλμα). Πάντα render πρώτες WINDOW_SIZE γραμμές αν το φύλλο
 * έχει πάνω από WINDOW_THRESHOLD γραμμές (spec: "simple: render πρώτες 100
 * με σημείωση" — καμία virtualization βιβλιοθήκη).
 */
export function SheetGrid({
  rows,
  columns,
  headerRow,
  excludedColumns,
  onToggleColumn,
  onSetHeaderRow,
  errorRowNums,
  hiddenColumnIndexes,
}: {
  rows: RawRow[]
  columns: ColumnInfo[]
  headerRow: number
  excludedColumns: number[]
  onToggleColumn?: (colIndex: number) => void
  onSetHeaderRow?: (rowNum: number) => void
  errorRowNums?: Map<number, string[]>
  hiddenColumnIndexes?: Set<number>
}) {
  const visibleRows = useMemo(() => {
    if (rows.length <= WINDOW_THRESHOLD) return rows
    const windowEnd = Math.max(WINDOW_SIZE, headerRow + 5)
    return rows.filter(r => r.rowNum <= windowEnd)
  }, [rows, headerRow])

  const visibleColumns = useMemo(
    () => columns.filter(c => !hiddenColumnIndexes?.has(c.index)),
    [columns, hiddenColumnIndexes],
  )

  const truncated = rows.length > visibleRows.length

  return (
    <div className="space-y-2">
      <div className="table-wrap rounded-2xl border border-border" style={{ maxHeight: 460, overflowY: 'auto' }}>
        <table className="data-table" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-muted" style={{ width: 54 }}>#</th>
              {visibleColumns.map(col => {
                const excluded = excludedColumns.includes(col.index)
                return (
                  <th key={col.index} className="sticky top-0 z-10 bg-muted" style={{ width: 148 }}>
                    <button
                      type="button"
                      onClick={() => onToggleColumn?.(col.index)}
                      disabled={!onToggleColumn}
                      className="flex w-full items-center gap-1.5 text-left"
                      title={excluded ? 'Κλικ για συμπερίληψη στήλης' : 'Κλικ για εξαίρεση στήλης'}
                    >
                      <span
                        className="flex size-3.5 shrink-0 items-center justify-center rounded"
                        style={{
                          background: excluded ? 'transparent' : 'var(--navy)',
                          border: `1.5px solid ${excluded ? 'var(--border)' : 'var(--navy)'}`,
                        }}
                      >
                        {!excluded && <LuCheck className="size-2.5" style={{ color: 'var(--navy-ink)' }} />}
                      </span>
                      <span className="font-mono text-[10px] font-black" style={{ color: excluded ? 'var(--muted-foreground)' : 'var(--info)' }}>
                        {col.colLetter}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const isHeader = row.rowNum === headerRow
              const isBeforeHeader = row.rowNum < headerRow
              const rowErrors = errorRowNums?.get(row.rowNum)
              return (
                <tr
                  key={row.rowNum}
                  className="dotted-row-bottom"
                  style={{
                    opacity: isBeforeHeader ? 0.45 : 1,
                    background: rowErrors
                      ? 'color-mix(in srgb, var(--destructive) 10%, transparent)'
                      : isHeader
                        ? 'var(--info-soft)'
                        : undefined,
                  }}
                >
                  <td
                    className="sticky left-0 z-10 bg-card"
                    style={{ width: 54 }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{row.rowNum}</span>
                      {onSetHeaderRow && (
                        <button
                          type="button"
                          onClick={() => onSetHeaderRow(row.rowNum)}
                          title="Ορισμός ως γραμμή επικεφαλίδων"
                          className="rounded px-1 text-[9px] font-black leading-none"
                          style={{
                            background: isHeader ? 'var(--info)' : 'var(--muted)',
                            color: isHeader ? '#fff' : 'var(--muted-foreground)',
                          }}
                        >
                          Κ
                        </button>
                      )}
                    </div>
                  </td>
                  {visibleColumns.map(col => {
                    const excluded = excludedColumns.includes(col.index)
                    const val = row.cells[col.index]
                    return (
                      <td
                        key={col.index}
                        className="truncate"
                        title={rowErrors?.join(' · ') ?? val ?? ''}
                        style={{
                          color: excluded ? 'var(--muted-foreground)' : isHeader ? 'var(--info)' : 'var(--foreground)',
                          fontWeight: isHeader ? 700 : 400,
                          fontStyle: val ? 'normal' : 'italic',
                          textDecoration: excluded ? 'line-through' : 'none',
                          opacity: excluded ? 0.55 : 1,
                        }}
                      >
                        {val ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="px-1 text-[11px] text-muted-foreground">
          Εμφανίζονται οι πρώτες {visibleRows.length.toLocaleString('el-GR')} από {rows.length.toLocaleString('el-GR')} γραμμές. Όλες οι γραμμές συμμετέχουν στον Έλεγχο/Εκτέλεση — η προεπισκόπηση απλώς δεν τις σχεδιάζει όλες.
        </p>
      )}
    </div>
  )
}
