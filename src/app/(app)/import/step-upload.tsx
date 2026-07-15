'use client'

import { useRef, useState, type DragEvent } from 'react'
import { LuUpload, LuFileSpreadsheet, LuX, LuTriangleAlert } from 'react-icons/lu'
import type { ImportConfig } from './types'
import { readWorkbookFromFile, listSheets } from '@/lib/import/xlsx-parse'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB (spec)
const ACCEPTED_EXT = ['.xlsx', '.xls', '.csv']

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StepUpload({ config, onChange }: { config: ImportConfig; onChange: (patch: Partial<ImportConfig>) => void }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    if (!ACCEPTED_EXT.includes(ext)) {
      setError('Επίτρεπτοι τύποι αρχείου: .xlsx, .xls, .csv')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Το αρχείο ξεπερνά το όριο των ${formatBytes(MAX_FILE_BYTES)}.`)
      return
    }

    setLoading(true)
    setError('')
    try {
      const wb = await readWorkbookFromFile(file)
      const sheets = listSheets(wb).filter(s => s.rowCount > 0)
      if (sheets.length === 0) {
        setError('Δεν βρέθηκαν φύλλα με δεδομένα μέσα στο αρχείο.')
        return
      }
      onChange({
        file,
        fileName: file.name,
        fileSize: file.size,
        sheets,
        selectedSheet: '',
        sheetRows: {},
        sheetColCounts: {},
        headerRow: 1,
        columns: [],
        excludedColumns: [],
        mappings: [],
        validation: null,
        execution: null,
      })
    } catch {
      setError('Δεν ήταν δυνατή η ανάγνωση του αρχείου. Βεβαιώσου ότι είναι έγκυρο Excel/CSV.')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const hasFile = !!config.fileName

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold">Ανέβασμα αρχείου Excel</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Υποστηρίζονται αρχεία .xlsx, .xls και .csv μέχρι {formatBytes(MAX_FILE_BYTES)}. Η ανάγνωση γίνεται στον browser σου — το αρχείο δεν στέλνεται πουθενά πριν τον Έλεγχο.
        </p>
      </div>

      {!hasFile ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl px-6 py-12 text-center transition-colors"
          style={{
            border: `2px dashed ${dragging ? 'var(--info)' : 'var(--border)'}`,
            background: dragging ? 'var(--info-soft)' : 'var(--muted)',
          }}
        >
          {loading ? (
            <>
              <LuFileSpreadsheet className="size-9 animate-pulse" style={{ color: 'var(--info)' }} />
              <p className="text-[13px] font-medium text-muted-foreground">Ανάγνωση αρχείου…</p>
            </>
          ) : (
            <>
              <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: dragging ? 'var(--info)' : 'var(--border)' }}>
                <LuUpload className="size-6" style={{ color: dragging ? '#fff' : 'var(--muted-foreground)' }} />
              </span>
              <div>
                <p className="text-[14px] font-semibold">{dragging ? 'Άφησέ το εδώ' : 'Σύρε το αρχείο Excel εδώ'}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  ή <span className="font-semibold" style={{ color: 'var(--info)' }}>κάνε κλικ για επιλογή</span>
                </p>
              </div>
              <div className="flex gap-1.5">
                {ACCEPTED_EXT.map(ext => (
                  <span key={ext} className="rounded bg-border px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">{ext}</span>
                ))}
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXT.join(',')}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      ) : (
        <div className="flex items-start gap-4 rounded-2xl p-4" style={{ background: 'var(--success-soft)', border: '1.5px solid color-mix(in srgb, var(--success) 35%, transparent)' }}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card">
            <LuFileSpreadsheet className="size-5" style={{ color: 'var(--success)' }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold">{config.fileName}</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {formatBytes(config.fileSize)} · {config.sheets.length} {config.sheets.length === 1 ? 'φύλλο' : 'φύλλα'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {config.sheets.map(s => (
                <span key={s.name} className="badge-pill" style={{ color: 'var(--success)', background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }}>
                  {s.name} — {s.rowCount.toLocaleString('el-GR')} γρ.
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange({ file: null, fileName: '', fileSize: 0, sheets: [], selectedSheet: '', sheetRows: {}, sheetColCounts: {}, columns: [], excludedColumns: [], mappings: [], validation: null, execution: null })
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="rowmenu-btn shrink-0"
            aria-label="Αφαίρεση αρχείου"
          >
            <LuX className="size-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', color: 'var(--destructive)' }}>
          <LuTriangleAlert className="size-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
