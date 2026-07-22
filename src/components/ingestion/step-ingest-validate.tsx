'use client'

import { useCallback, useEffect, useState } from 'react'
import { LuLoaderCircle, LuRefreshCcw, LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { validateBatch } from '@/lib/ingestion/actions'
import type { StepProps } from './types'

export function StepIngestValidate({ target, state, patch }: StepProps) {
  const [loading, setLoading] = useState(false)

  const runValidation = useCallback(async () => {
    if (!state.batch) return
    setLoading(true)
    try {
      const r = await validateBatch(target.key, state.batch, state.mappings)
      patch({ validation: { errors: r.errors, validRows: r.validRows } })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.batch, state.mappings, target.key])

  useEffect(() => {
    if (state.batch && !state.validation && !loading) {
      runValidation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.batch])

  if (!state.batch) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Πρώτα επίλεξε πηγή.</div>
  }

  const v = state.validation
  const mismatches = state.batch.meta?.ocr?.mismatches ?? []

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">Έλεγχος δεδομένων</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Δοκιμαστικός έλεγχος πριν την καταχώριση — καμία αλλαγή δεν γίνεται ακόμα στη βάση.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={runValidation} disabled={loading}>
          {loading ? <LuLoaderCircle className="size-3.5 animate-spin" /> : <LuRefreshCcw className="size-3.5" />}
          Επανέλεγχος
        </Button>
      </div>

      {loading && !v && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border py-10 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" style={{ color: 'var(--info)' }} />
          Έλεγχος δεδομένων…
        </div>
      )}

      {v && (
        <>
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span style={{ color: 'var(--success)' }}>{v.validRows.toLocaleString('el-GR')} έγκυρες</span>
            <span className="text-muted-foreground">·</span>
            <span style={{ color: v.errors.length > 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
              {v.errors.length.toLocaleString('el-GR')} σφάλματα
            </span>
          </div>

          {mismatches.length > 0 && (
            <div className="space-y-1.5">
              {mismatches.map((m, i) => (
                <div
                  key={`${m.code}-${i}`}
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px]"
                  style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                >
                  <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{m.message}</span>
                </div>
              ))}
            </div>
          )}

          {v.errors.length === 0 ? (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"
              style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
            >
              <LuCircleCheck className="size-4 shrink-0" />
              Έτοιμο για καταχώριση
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Γραμμή</TableHead>
                      <TableHead>Πεδίο</TableHead>
                      <TableHead>Μήνυμα</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {v.errors.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-[11.5px] text-muted-foreground">{e.row}</TableCell>
                        <TableCell className="text-[11.5px] font-semibold">{e.column}</TableCell>
                        <TableCell className="text-[11.5px] whitespace-normal text-muted-foreground">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
