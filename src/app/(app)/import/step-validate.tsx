'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LuLoaderCircle, LuRefreshCcw, LuPlus, LuPencil, LuTriangleAlert, LuChevronDown, LuChevronUp } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { findDuplicateCodes, type FieldError } from '@/lib/import/targets'
import { chunkArray } from '@/lib/import/chunk'
import { validateImportChunk } from './actions'
import { buildMappedRows } from './build-rows'
import { SheetGrid } from './sheet-grid'
import type { ImportConfig } from './types'

const CHUNK_SIZE = 1000

export function StepValidate({ config, onChange }: { config: ImportConfig; onChange: (patch: Partial<ImportConfig>) => void }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [showErrors, setShowErrors] = useState(true)

  const mappedRows = useMemo(() => buildMappedRows(config), [config])

  const runValidation = useCallback(async () => {
    if (mappedRows.length === 0) {
      onChange({ validation: { toCreate: 0, toUpdate: 0, errors: [], checkedAt: Date.now() } })
      return
    }
    setRunning(true)
    try {
      // Πλήρες αρχείο, client-side: διπλότυποι κωδικοί (ο server ελέγχει μόνο μέσα σε κάθε chunk).
      const codeRows = mappedRows.map(r => ({ rowNum: r.rowNum, code: (r.values.code ?? '').trim() })).filter(r => r.code)
      const dupErrors = findDuplicateCodes(codeRows)
      const dupRowNums = new Set(dupErrors.map(e => e.row))

      const chunks = chunkArray(mappedRows.filter(r => !dupRowNums.has(r.rowNum)), CHUNK_SIZE)
      let toCreate = 0
      let toUpdate = 0
      const errors: FieldError[] = [...dupErrors]
      setProgress({ done: 0, total: chunks.length })

      for (let i = 0; i < chunks.length; i++) {
        const res = await validateImportChunk(chunks[i])
        toCreate += res.toCreate
        toUpdate += res.toUpdate
        errors.push(...res.errors)
        setProgress({ done: i + 1, total: chunks.length })
      }

      onChange({ validation: { toCreate, toUpdate, errors, checkedAt: Date.now() } })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ο έλεγχος απέτυχε.')
    } finally {
      setRunning(false)
      setProgress(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappedRows])

  useEffect(() => {
    if (config.validation || running) return
    // queueMicrotask: ο αρχικός αυτόματος έλεγχος τρέχει ΜΕΤΑ το commit του effect
    // (αποφεύγει cascading renders — react-hooks/set-state-in-effect).
    queueMicrotask(() => runValidation())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const v = config.validation
  const errorRowNums = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const e of v?.errors ?? []) {
      const list = m.get(e.row) ?? []
      list.push(`${e.column}: ${e.message}`)
      m.set(e.row, list)
    }
    return m
  }, [v])

  const rows = config.sheetRows[config.selectedSheet] ?? []
  const shownErrors = (v?.errors ?? []).slice(0, 50)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">Έλεγχος</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Δοκιμαστικός έλεγχος πριν την οριστική εισαγωγή — καμία αλλαγή δεν γίνεται ακόμα στη βάση δεδομένων.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={runValidation} disabled={running}>
          {running
            ? <LuLoaderCircle className="size-3.5 animate-spin" />
            : <LuRefreshCcw className="size-3.5" />}
          {running ? (progress ? `Έλεγχος… (${progress.done}/${progress.total})` : 'Έλεγχος…') : 'Επανέλεγχος'}
        </Button>
      </div>

      {v && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[24px] font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                <LuPlus className="size-4" />{v.toCreate.toLocaleString('el-GR')}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Θα δημιουργηθούν</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[24px] font-bold tabular-nums" style={{ color: 'var(--info)' }}>
                <LuPencil className="size-4" />{v.toUpdate.toLocaleString('el-GR')}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Θα ενημερωθούν</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[24px] font-bold tabular-nums" style={{ color: v.errors.length > 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
                <LuTriangleAlert className="size-4" />{v.errors.length.toLocaleString('el-GR')}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Σφάλματα</p>
            </div>
          </div>

          {v.toCreate + v.toUpdate === 0 && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', color: 'var(--destructive)' }}>
              <LuTriangleAlert className="size-3.5 shrink-0" />
              Καμία γραμμή δεν είναι έγκυρη προς εισαγωγή — έλεγξε την αντιστοίχιση στηλών στο προηγούμενο βήμα.
            </div>
          )}

          {v.errors.length > 0 && (
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
              <button
                type="button"
                onClick={() => setShowErrors(s => !s)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-[12px] font-semibold"
                style={{ background: 'color-mix(in srgb, var(--destructive) 8%, transparent)', color: 'var(--destructive)' }}
              >
                <span>
                  {shownErrors.length} {shownErrors.length === 1 ? 'σφάλμα' : 'σφάλματα'}
                  {v.errors.length > shownErrors.length && ` (εμφανίζονται τα πρώτα ${shownErrors.length})`}
                </span>
                {showErrors ? <LuChevronUp className="size-3.5" /> : <LuChevronDown className="size-3.5" />}
              </button>
              {showErrors && (
                <div className="max-h-52 divide-y divide-border overflow-y-auto">
                  {shownErrors.map((e, i) => (
                    <div key={i} className="flex gap-3 px-4 py-2 text-[11.5px]">
                      <span className="shrink-0 font-mono font-semibold text-muted-foreground">Γραμμή {e.row}</span>
                      <span className="shrink-0 font-semibold">{e.column}</span>
                      <span className="text-muted-foreground">{e.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <SheetGrid
              rows={rows}
              columns={config.columns}
              headerRow={config.headerRow}
              excludedColumns={config.excludedColumns}
              errorRowNums={errorRowNums}
            />
          )}
        </>
      )}
    </div>
  )
}
