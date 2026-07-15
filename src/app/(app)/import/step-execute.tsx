'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  LuPlay, LuLoaderCircle, LuCircleCheck, LuCircleX, LuTriangleAlert, LuDownload,
  LuFileSpreadsheet, LuLayers, LuChevronDown, LuChevronUp,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { executeImport } from './actions'
import { buildMappedRows } from './build-rows'
import type { ImportConfig, ExecutionSummary } from './types'
import type { FieldError } from '@/lib/import/targets'

function downloadErrorsXlsx(errors: FieldError[], sourceFileName: string) {
  const data = errors.map(e => ({ 'Γραμμή Excel': e.row, Στήλη: e.column, Σφάλμα: e.message }))
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 60 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Σφάλματα')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const base = sourceFileName.replace(/\.[a-z0-9]+$/i, '') || 'eisagogi'
  a.href = url
  a.download = `sfalmata-${base}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function StepExecute({ config, onChange }: { config: ImportConfig; onChange: (patch: Partial<ImportConfig>) => void }) {
  const [starting, setStarting] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const mappedRows = useMemo(() => buildMappedRows(config), [config])
  const v = config.validation

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function startPolling(jobId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/import/status/${jobId}`)
        if (!res.ok) return
        const data: { status: ExecutionSummary['status']; totals: Partial<ExecutionSummary> | null } = await res.json()
        const t = data.totals ?? {}
        onChange({
          execution: {
            jobId,
            sync: false,
            status: data.status,
            total: t.total ?? 0,
            processed: t.processed ?? 0,
            created: t.created ?? 0,
            updated: t.updated ?? 0,
            failed: t.failed ?? 0,
            errors: t.errors ?? [],
          },
        })
        if (data.status === 'DONE' || data.status === 'FAILED') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      } catch {
        // παροδικό σφάλμα δικτύου — ξαναδοκιμάζει στο επόμενο tick
      }
    }, 1500)
  }

  async function start() {
    if (config.execution || starting) return
    setStarting(true)
    try {
      const res = await executeImport(mappedRows)
      if (!res.ok) { toast.error(res.message); return }
      if (res.sync) {
        onChange({
          execution: {
            jobId: res.jobId,
            sync: true,
            status: res.totals.failed > 0 && res.totals.created + res.totals.updated === 0 ? 'FAILED' : 'DONE',
            total: res.totals.total,
            processed: res.totals.processed,
            created: res.totals.created,
            updated: res.totals.updated,
            failed: res.totals.failed,
            errors: res.totals.errors,
          },
        })
      } else {
        onChange({
          execution: { jobId: res.jobId, sync: false, status: 'RUNNING', total: mappedRows.length, processed: 0, created: 0, updated: 0, failed: 0, errors: [] },
        })
        startPolling(res.jobId)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η εκτέλεση απέτυχε.')
    } finally {
      setStarting(false)
    }
  }

  const exec = config.execution
  const running = exec?.status === 'RUNNING'
  const pct = exec && exec.total > 0 ? Math.round((exec.processed / exec.total) * 100) : 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold">Εκτέλεση</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {mappedRows.length <= 500
            ? 'Λιγότερες από 500 γραμμές — η εισαγωγή τρέχει αμέσως.'
            : 'Πάνω από 500 γραμμές — η εισαγωγή τρέχει στο παρασκήνιο, με ζωντανή πρόοδο εδώ.'}
        </p>
      </div>

      {!exec && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border p-3.5">
              <LuFileSpreadsheet className="size-7 shrink-0" style={{ color: 'var(--info)' }} />
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Πηγή</p>
                <p className="truncate text-[12.5px] font-semibold">{config.fileName}</p>
                <p className="text-[11px] text-muted-foreground">{config.selectedSheet} · {mappedRows.length.toLocaleString('el-GR')} γραμμές</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3.5">
              <LuLayers className="size-7 shrink-0" style={{ color: 'var(--info)' }} />
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Στόχος</p>
                <p className="truncate text-[12.5px] font-semibold">Προϊόντα</p>
                <p className="text-[11px] text-muted-foreground">
                  {v ? `${v.toCreate.toLocaleString('el-GR')} νέα · ${v.toUpdate.toLocaleString('el-GR')} ενημερώσεις` : '—'}
                </p>
              </div>
            </div>
          </div>

          <Button type="button" size="lg" className="w-full" disabled={starting || mappedRows.length === 0} onClick={start}>
            {starting ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuPlay className="size-4" />}
            {starting ? 'Ξεκινάει…' : `Έναρξη εισαγωγής — ${mappedRows.length.toLocaleString('el-GR')} γραμμές`}
          </Button>
        </>
      )}

      {exec && (
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 rounded-2xl p-4"
            style={{
              background: exec.status === 'FAILED' ? 'color-mix(in srgb, var(--destructive) 8%, transparent)' : exec.status === 'DONE' ? 'var(--success-soft)' : 'var(--info-soft)',
              border: `1.5px solid ${exec.status === 'FAILED' ? 'color-mix(in srgb, var(--destructive) 35%, transparent)' : exec.status === 'DONE' ? 'color-mix(in srgb, var(--success) 35%, transparent)' : 'color-mix(in srgb, var(--info) 35%, transparent)'}`,
            }}
          >
            {running
              ? <LuLoaderCircle className="mt-0.5 size-6 shrink-0 animate-spin" style={{ color: 'var(--info)' }} />
              : exec.status === 'DONE'
                ? <LuCircleCheck className="mt-0.5 size-6 shrink-0" style={{ color: 'var(--success)' }} />
                : <LuCircleX className="mt-0.5 size-6 shrink-0" style={{ color: 'var(--destructive)' }} />}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold">
                {running ? 'Η εισαγωγή εκτελείται…' : exec.status === 'DONE' ? 'Η εισαγωγή ολοκληρώθηκε' : 'Η εισαγωγή απέτυχε'}
              </p>
              {running && (
                <div className="mt-2 space-y-1">
                  <Progress value={pct} />
                  <p className="text-[11px] text-muted-foreground">{exec.processed.toLocaleString('el-GR')} από {exec.total.toLocaleString('el-GR')} γραμμές ({pct}%)</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--success)' }}>{exec.created.toLocaleString('el-GR')}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Δημιουργήθηκαν</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--info)' }}>{exec.updated.toLocaleString('el-GR')}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Ενημερώθηκαν</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-[24px] font-bold tabular-nums" style={{ color: exec.failed > 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}>{exec.failed.toLocaleString('el-GR')}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Απέτυχαν</p>
            </div>
          </div>

          {exec.errors.length > 0 && (
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
              <button
                type="button"
                onClick={() => setShowErrors(s => !s)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-[12px] font-semibold"
                style={{ background: 'color-mix(in srgb, var(--destructive) 8%, transparent)', color: 'var(--destructive)' }}
              >
                <span className="flex items-center gap-2"><LuTriangleAlert className="size-3.5" />{exec.errors.length} σφάλματα{exec.failed > exec.errors.length ? ` (εμφανίζονται τα πρώτα ${exec.errors.length})` : ''}</span>
                {showErrors ? <LuChevronUp className="size-3.5" /> : <LuChevronDown className="size-3.5" />}
              </button>
              {showErrors && (
                <div className="max-h-52 divide-y divide-border overflow-y-auto">
                  {exec.errors.map((e, i) => (
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

          {exec.errors.length > 0 && !running && (
            <Button type="button" variant="outline" onClick={() => downloadErrorsXlsx(exec.errors, config.fileName)}>
              <LuDownload className="size-3.5" /> Λήψη Excel σφαλμάτων
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
