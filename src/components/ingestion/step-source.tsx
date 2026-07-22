'use client'

import { useRef, useState } from 'react'
import { LuFileSpreadsheet, LuScanText, LuGlobe, LuCheck, LuTriangleAlert, LuLoaderCircle } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readWorkbookFromFile } from '@/lib/import/xlsx-parse'
import { readSheet, rowsToBatch } from '@/lib/ingestion/sources/excel'
import type { SourceKind } from '@/lib/ingestion/normalized'
import { SourceOcrPanel } from './source-ocr-panel'
import { SourceApiPanel } from './source-api-panel'
import type { StepProps } from './types'

const SOURCE_CARDS: { kind: SourceKind; icon: typeof LuFileSpreadsheet; label: string }[] = [
  { kind: 'excel', icon: LuFileSpreadsheet, label: 'Excel' },
  { kind: 'ocr', icon: LuScanText, label: 'OCR (φωτο/PDF)' },
  { kind: 'api', icon: LuGlobe, label: 'API endpoint' },
]

export function StepSource({ target, state, patch }: StepProps) {
  const available = SOURCE_CARDS.filter(c => target.sources.includes(c.kind))

  return (
    <div className="flex flex-col gap-5 py-4">
      <div>
        <h2 className="text-[16px] font-semibold">Πηγή δεδομένων</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Διάλεξε από πού θα φορτωθούν οι εγγραφές για «{target.label}».
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {available.map(c => {
          const Icon = c.icon
          const selected = state.source === c.kind
          return (
            <button
              key={c.kind}
              type="button"
              onClick={() => patch({ source: c.kind, batch: null, ocrCost: null })}
              className="flex min-w-[128px] flex-1 flex-col items-center gap-2 rounded-2xl px-4 py-4 transition-all"
              style={{
                background: selected ? 'var(--navy)' : 'var(--glass)',
                border: `1.5px solid ${selected ? 'transparent' : 'var(--glass-border)'}`,
                backdropFilter: selected ? undefined : 'blur(14px)',
              }}
              aria-pressed={selected}
            >
              <Icon className="size-6" style={{ color: selected ? 'var(--navy-ink)' : 'var(--muted-foreground)' }} aria-hidden />
              <span className="text-[13px] font-semibold" style={{ color: selected ? 'var(--navy-ink)' : 'var(--foreground)' }}>
                {c.label}
              </span>
            </button>
          )
        })}
      </div>

      {state.batch && state.source && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: 'var(--success)' }}>
          <LuCheck className="size-3.5" aria-hidden /> {state.batch.records.length} εγγραφές έτοιμες
        </p>
      )}

      {state.source === 'excel' && <SourceExcelPanel patch={patch} />}
      {state.source === 'ocr' && <SourceOcrPanel target={target} patch={patch} ocrCost={state.ocrCost} />}
      {state.source === 'api' && <SourceApiPanel target={target} patch={patch} />}
    </div>
  )
}

function SourceExcelPanel({ patch }: Pick<StepProps, 'patch'>) {
  const [file, setFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheet, setSheet] = useState<string>('')
  const [headerRow, setHeaderRow] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recordCount, setRecordCount] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(f: File) {
    setError(null)
    setRecordCount(null)
    setLoading(true)
    try {
      const wb = await readWorkbookFromFile(f)
      const names = wb.SheetNames
      if (names.length === 0) {
        setError('Δεν βρέθηκαν φύλλα μέσα στο αρχείο.')
        return
      }
      setFile(f)
      setSheetNames(names)
      setSheet(names[0])
      setHeaderRow(1)
    } catch {
      setError('Δεν ήταν δυνατή η ανάγνωση του αρχείου. Βεβαιώσου ότι είναι έγκυρο Excel/CSV.')
    } finally {
      setLoading(false)
    }
  }

  async function load() {
    if (!file || !sheet || loading) return
    setLoading(true)
    setError(null)
    try {
      const { headers, rows } = await readSheet(file, sheet, headerRow)
      const batch = rowsToBatch(headers, rows, { fileName: file.name, sheet })
      setRecordCount(batch.records.length)
      patch({ batch })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Η φόρτωση του φύλλου απέτυχε.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {error && (
        <div className="notice" role="alert">
          <LuTriangleAlert className="size-4 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden />
          <span style={{ color: 'var(--destructive)' }}>{error}</span>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold" htmlFor="excel-file">Αρχείο</label>
        <input
          ref={inputRef}
          id="excel-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="block w-full text-[12.5px] text-muted-foreground file:mr-3 file:h-8 file:cursor-pointer file:rounded-lg file:border-0 file:bg-muted file:px-3 file:text-[12.5px] file:font-semibold file:text-foreground"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {file && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{file.name}</p>}
      </div>

      {sheetNames.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold" htmlFor="excel-sheet">Φύλλο</label>
            <Select value={sheet} onValueChange={v => v && setSheet(v)}>
              <SelectTrigger id="excel-sheet" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheetNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold" htmlFor="excel-header-row">Γραμμή επικεφαλίδων</label>
            <Input
              id="excel-header-row"
              type="number"
              min={1}
              value={headerRow}
              onChange={e => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>
      )}

      {sheetNames.length > 0 && (
        <Button type="button" className="btn-pill btn-navy self-end" disabled={loading} onClick={load}>
          {loading ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
          {loading ? 'Φόρτωση…' : 'Φόρτωση'}
        </Button>
      )}

      {recordCount != null && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: 'var(--success)' }}>
          <LuCheck className="size-3.5" aria-hidden /> {recordCount} γραμμές
        </p>
      )}
    </div>
  )
}
