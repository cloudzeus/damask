'use client'

import { useEffect, useMemo, useState } from 'react'
import { LuLoaderCircle, LuCheck, LuSheet, LuChevronDown, LuChevronUp, LuEyeOff } from 'react-icons/lu'
import type { ImportConfig } from './types'
import { readWorkbookFromFile, readSheetRows, deriveColumns } from '@/lib/import/xlsx-parse'
import { SheetGrid } from './sheet-grid'

export function StepSheet({ config, onChange }: { config: ImportConfig; onChange: (patch: Partial<ImportConfig>) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function selectSheet(name: string) {
    if (!config.file) return
    setError('')
    let rows = config.sheetRows[name]
    let colCount = config.sheetColCounts[name]

    if (!rows) {
      setLoading(true)
      try {
        const wb = await readWorkbookFromFile(config.file)
        const ws = wb.Sheets[name]
        if (!ws) { setError(`Το φύλλο "${name}" δεν βρέθηκε.`); return }
        const parsed = readSheetRows(ws)
        rows = parsed.rows
        colCount = parsed.colCount
      } catch {
        setError('Αποτυχία ανάγνωσης του φύλλου.')
        return
      } finally {
        setLoading(false)
      }
    }

    const cols = deriveColumns(rows, 1, colCount ?? 0)
    onChange({
      selectedSheet: name,
      sheetRows: { ...config.sheetRows, [name]: rows! },
      sheetColCounts: { ...config.sheetColCounts, [name]: colCount ?? 0 },
      headerRow: 1,
      columns: cols,
      excludedColumns: cols.filter(c => c.isEmpty).map(c => c.index),
      mappings: [],
      validation: null,
      execution: null,
    })
  }

  useEffect(() => {
    if (config.selectedSheet || config.sheets.length === 0) return
    // queueMicrotask: το πρώτο auto-select φύλλου τρέχει ΜΕΤΑ το commit του effect,
    // όχι συγχρονισμένο μέσα του (αποφεύγει cascading renders — react-hooks/set-state-in-effect).
    queueMicrotask(() => selectSheet(config.sheets[0].name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = config.sheetRows[config.selectedSheet] ?? []
  const colCount = config.sheetColCounts[config.selectedSheet] ?? 0
  const maxHeaderRow = Math.max(1, rows[rows.length - 1]?.rowNum ?? 1)

  function setHeaderRow(rowNum: number) {
    const bounded = Math.min(Math.max(1, rowNum), maxHeaderRow)
    const cols = deriveColumns(rows, bounded, colCount)
    onChange({
      headerRow: bounded,
      columns: cols,
      excludedColumns: cols.filter(c => c.isEmpty).map(c => c.index),
      mappings: [],
      validation: null,
      execution: null,
    })
  }

  function toggleColumn(colIndex: number) {
    const next = config.excludedColumns.includes(colIndex)
      ? config.excludedColumns.filter(i => i !== colIndex)
      : [...config.excludedColumns, colIndex]
    onChange({ excludedColumns: next, mappings: [], validation: null, execution: null })
  }

  function selectAllColumns() { onChange({ excludedColumns: [], mappings: [], validation: null, execution: null }) }
  function selectNoColumns() { onChange({ excludedColumns: config.columns.map(c => c.index), mappings: [], validation: null, execution: null }) }
  function invertColumns() {
    const next = config.columns.map(c => c.index).filter(i => !config.excludedColumns.includes(i))
    onChange({ excludedColumns: next, mappings: [], validation: null, execution: null })
  }

  const includedCount = config.columns.length - config.excludedColumns.length
  const hiddenColumnIndexes = useMemo(
    () => (config.hideEmptyColumns ? new Set(config.columns.filter(c => c.isEmpty).map(c => c.index)) : undefined),
    [config.hideEmptyColumns, config.columns],
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold">Φύλλο &amp; Στήλες</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Διάλεξε το φύλλο με τα δεδομένα, όρισε ποια γραμμή έχει τις επικεφαλίδες και ποιες στήλες θα εισαχθούν.
        </p>
      </div>

      {config.sheets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {config.sheets.map(s => {
            const sel = config.selectedSheet === s.name
            const visited = !!config.sheetRows[s.name]
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => selectSheet(s.name)}
                disabled={loading}
                className={`pill${sel ? ' on' : ''}`}
              >
                <LuSheet className="size-3.5 shrink-0" />
                {s.name}
                <span className="cnt">{s.rowCount.toLocaleString('el-GR')}γρ</span>
                {sel && loading ? <LuLoaderCircle className="size-3.5 animate-spin" /> : visited ? <LuCheck className="size-3.5" /> : null}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="rounded-xl px-3 py-2 text-[12px]" style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', color: 'var(--destructive)' }}>
          {error}
        </p>
      )}

      {loading && rows.length === 0 && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted py-10">
          <LuLoaderCircle className="size-4 animate-spin" style={{ color: 'var(--info)' }} />
          <span className="text-[13px] text-muted-foreground">Ανάγνωση φύλλου…</span>
        </div>
      )}

      {rows.length > 0 && !loading && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3">
            <span className="text-[12px] font-semibold">Γραμμή επικεφαλίδων</span>
            <div className="flex items-center overflow-hidden rounded-lg border border-border">
              <button type="button" onClick={() => setHeaderRow(config.headerRow - 1)} disabled={config.headerRow <= 1} className="rowmenu-btn rounded-none disabled:opacity-30">
                <LuChevronDown className="size-3.5" />
              </button>
              <span className="w-10 text-center text-[13px] font-bold tabular-nums" style={{ color: 'var(--info)' }}>{config.headerRow}</span>
              <button type="button" onClick={() => setHeaderRow(config.headerRow + 1)} disabled={config.headerRow >= maxHeaderRow} className="rowmenu-btn rounded-none disabled:opacity-30">
                <LuChevronUp className="size-3.5" />
              </button>
            </div>
            <span className="text-[11px] text-muted-foreground">Προεπιλογή η 1η γραμμή — άλλαξέ το αν οι επικεφαλίδες είναι π.χ. στη 2η.</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[12px]"><b>{includedCount}</b> από {config.columns.length} στήλες επιλεγμένες</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={selectAllColumns} className="pill">Επιλογή όλων</button>
            <button type="button" onClick={selectNoColumns} className="pill">Καμία</button>
            <button type="button" onClick={invertColumns} className="pill">Αντιστροφή</button>
            <button
              type="button"
              onClick={() => onChange({ hideEmptyColumns: !config.hideEmptyColumns })}
              className={`pill${config.hideEmptyColumns ? ' on' : ''}`}
            >
              <LuEyeOff className="size-3.5" />
              Απόκρυψη κενών στηλών
            </button>
          </div>

          <SheetGrid
            rows={rows}
            columns={config.columns}
            headerRow={config.headerRow}
            excludedColumns={config.excludedColumns}
            onToggleColumn={toggleColumn}
            onSetHeaderRow={setHeaderRow}
            hiddenColumnIndexes={hiddenColumnIndexes}
          />
          <p className="text-[11px] text-muted-foreground">
            Κλικ στο γράμμα ή στο κουτάκι μιας στήλης για συμπερίληψη/εξαίρεση — οι εξαιρεμένες στήλες παραμένουν ορατές, γκριζαρισμένες με διαγράμμιση. Κλικ στο «Κ» δίπλα σε μια γραμμή για να την ορίσεις ως γραμμή επικεφαλίδων.
          </p>
        </>
      )}
    </div>
  )
}
