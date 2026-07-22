'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { LuRocket, LuLoaderCircle, LuCircleCheck, LuPlus, LuPencil, LuTriangleAlert } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { commitBatch } from '@/lib/ingestion/actions'
import type { StepProps } from './types'

export function StepIngestCommit({ target, state, patch, onDone }: StepProps & { onDone?: () => void }) {
  const [running, setRunning] = useState(false)

  async function handleCommit() {
    if (!state.batch || running || state.totals) return
    setRunning(true)
    try {
      const totals = await commitBatch(target.key, state.batch, state.mappings)
      patch({ totals })
      onDone?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η καταχώριση απέτυχε.')
    } finally {
      setRunning(false)
    }
  }

  const totals = state.totals

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-[16px] font-semibold">Καταχώριση</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {state.validation
            ? `${state.validation.validRows.toLocaleString('el-GR')} έγκυρες γραμμές έτοιμες προς καταχώριση στο «${target.label}».`
            : `Καταχώριση στο «${target.label}».`}
        </p>
      </div>

      {!totals && (
        <Button type="button" size="lg" className="w-full" disabled={running || !state.batch} onClick={handleCommit}>
          {running ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuRocket className="size-4" />}
          {running ? 'Καταχώριση…' : 'Καταχώριση'}
        </Button>
      )}

      {running && (
        <div className="space-y-1.5">
          <Progress value={null} />
          <p className="text-center text-[11px] text-muted-foreground">Καταχώριση…</p>
        </div>
      )}

      {totals && (
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 rounded-2xl p-4"
            style={{ background: 'var(--success-soft)', border: '1.5px solid color-mix(in srgb, var(--success) 35%, transparent)' }}
          >
            <LuCircleCheck className="mt-0.5 size-6 shrink-0" style={{ color: 'var(--success)' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold">Η καταχώριση ολοκληρώθηκε</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {totals.created.toLocaleString('el-GR')} δημιουργήθηκαν · {totals.updated.toLocaleString('el-GR')} ενημερώθηκαν · {totals.failed.toLocaleString('el-GR')} απέτυχαν
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[24px] font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                <LuPlus className="size-4" />{totals.created.toLocaleString('el-GR')}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Δημιουργήθηκαν</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[24px] font-bold tabular-nums" style={{ color: 'var(--info)' }}>
                <LuPencil className="size-4" />{totals.updated.toLocaleString('el-GR')}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Ενημερώθηκαν</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p
                className="flex items-center justify-center gap-1.5 text-[24px] font-bold tabular-nums"
                style={{ color: totals.failed > 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}
              >
                <LuTriangleAlert className="size-4" />{totals.failed.toLocaleString('el-GR')}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Απέτυχαν</p>
            </div>
          </div>

          {totals.errors.length > 0 && (
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
              <div className="px-4 py-2.5 text-[12px] font-semibold" style={{ background: 'color-mix(in srgb, var(--destructive) 8%, transparent)', color: 'var(--destructive)' }}>
                {totals.errors.length} {totals.errors.length === 1 ? 'σφάλμα' : 'σφάλματα'}
              </div>
              <div className="max-h-52 divide-y divide-border overflow-y-auto">
                {totals.errors.slice(0, 20).map((e, i) => (
                  <div key={i} className="flex gap-3 px-4 py-2 text-[11.5px]">
                    <span className="shrink-0 font-mono font-semibold text-muted-foreground">Γραμμή {e.row}</span>
                    <span className="shrink-0 font-semibold">{e.column}</span>
                    <span className="text-muted-foreground">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
