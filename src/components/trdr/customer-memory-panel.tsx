'use client'

import * as React from 'react'
import { LuBrain, LuLoaderCircle, LuChevronDown, LuCircleCheck, LuTriangleAlert, LuCircleX, LuCircleDashed, LuClock } from 'react-icons/lu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { customerCoreStatusAction, programReadinessAction, readinessProgramsAction } from '@/lib/memory/actions'
import type { CustomerDocStatus, DocState, Readiness } from '@/lib/memory/core'

/**
 * Καρτέλα πελάτη › Δικαιολογητικά: «Τι έχει ήδη» — ο πυρήνας δικαιολογητικών (όσα ζητούν τα περισσότερα προγράμματα)
 * με την κατάστασή τους, και ετοιμότητα για οποιοδήποτε πρόγραμμα (και πριν ανοίξει έργο) από τη μνήμη του γραφείου.
 */

const STATE: Record<DocState | 'UNLINKED', { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  VALID: { label: 'Σε ισχύ', cls: 'ok', Icon: LuCircleCheck },
  EXPIRING: { label: 'Λήγει σύντομα', cls: 'warn', Icon: LuClock },
  EXPIRED: { label: 'Έληξε', cls: 'danger', Icon: LuCircleX },
  MISSING: { label: 'Λείπει', cls: 'muted', Icon: LuCircleDashed },
  PARTIAL: { label: 'Ελλιπής σειρά', cls: 'warn', Icon: LuTriangleAlert },
  UNLINKED: { label: 'Για έλεγχο', cls: 'info', Icon: LuTriangleAlert },
}

export function CustomerMemoryPanel({ trdrId }: { trdrId: string }) {
  const [open, setOpen] = React.useState(false)
  const [core, setCore] = React.useState<CustomerDocStatus[] | null>(null)
  const [programs, setPrograms] = React.useState<{ id: string; title: string; mine: boolean }[]>([])
  const [programId, setProgramId] = React.useState('')
  const [ready, setReady] = React.useState<Readiness | null>(null)
  const [loadingReady, setLoadingReady] = React.useState(false)
  const [all, setAll] = React.useState(false)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !core) {
      customerCoreStatusAction(trdrId).then(setCore).catch(() => setCore([]))
      readinessProgramsAction(trdrId).then(setPrograms).catch(() => setPrograms([]))
    }
  }
  async function pick(id: string) {
    setProgramId(id)
    setReady(null)
    if (!id) return
    setLoadingReady(true)
    try { setReady(await programReadinessAction(trdrId, id)) } finally { setLoadingReady(false) }
  }

  const counts = (core ?? []).reduce((a, c) => { a[c.state] = (a[c.state] ?? 0) + 1; return a }, {} as Record<string, number>)
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-3">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 text-left">
        <LuBrain className="size-4 text-primary" aria-hidden />
        <span className="text-[length:var(--fs-13)] font-semibold">Τι έχει ήδη — από τη μνήμη του γραφείου</span>
        {core && (['VALID', 'EXPIRING', 'PARTIAL', 'EXPIRED', 'MISSING'] as DocState[]).filter(s => counts[s]).map(s => (
          <span key={s} className={cn('badge-pill', STATE[s].cls)} style={{ textTransform: 'none' }}>{counts[s]} {STATE[s].label.toLowerCase()}</span>
        ))}
        <LuChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-[length:var(--fs-11-5)] text-muted-foreground">Τα δικαιολογητικά που ζητούν τα προγράμματα, με το πόσα τα ζητούν — όσα είναι σε ισχύ ξαναχρησιμοποιούνται αυτόματα σε κάθε νέο έργο.</p>
            {!core ? (
              <p className="flex items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Φόρτωση…</p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {(all ? core : core.slice(0, 12)).map(c => {
                  const s = STATE[c.state]
                  return (
                    <li key={c.typeId} className="flex items-start gap-2 rounded-xl border border-border px-2.5 py-1.5" title={c.programs.map(p => p.title).join('\n')}>
                      <s.Icon className={cn('mt-0.5 size-4 shrink-0', c.state === 'VALID' ? 'text-[color:var(--success)]' : c.state === 'MISSING' ? 'text-muted-foreground' : c.state === 'EXPIRED' ? 'text-destructive' : 'text-[color:var(--warning)]')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[length:var(--fs-12-5)] font-semibold">{c.name}</span>
                        <span className="block text-[length:var(--fs-11)] text-muted-foreground">{c.detail} · {c.programs.length} {c.programs.length === 1 ? 'πρόγραμμα' : 'προγράμματα'}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {core && core.length > 12 && (
              <button type="button" onClick={() => setAll(v => !v)} className="mt-1.5 text-[length:var(--fs-11-5)] font-semibold text-primary hover:underline">
                {all ? 'Μόνο τα βασικότερα' : `Όλα (${core.length})`}
              </button>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--fs-12-5)] font-semibold">Ετοιμότητα για πρόγραμμα</span>
              <Select value={programId || undefined} onValueChange={v => void pick(v ?? '')}>
                <SelectTrigger aria-label="Πρόγραμμα" className="h-9 w-full max-w-md rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
                  <SelectValue placeholder="Επιλέξτε πρόγραμμα…">{(v: string) => programs.find(p => p.id === v)?.title ?? ''}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.mine ? '★ ' : ''}{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {ready && <span className={cn('badge-pill', ready.score >= 80 ? 'ok' : ready.score >= 40 ? 'warn' : 'danger')}>{ready.ready}/{ready.total} υποχρεωτικά · {ready.score}%</span>}
            </div>
            {loadingReady && <p className="flex items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Έλεγχος…</p>}
            {ready && (
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {ready.items.map(i => {
                  const s = STATE[i.state]
                  return (
                    <li key={i.formId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-[length:var(--fs-12)]">
                      <span className={cn('badge-pill shrink-0', s.cls)} style={{ textTransform: 'none' }}>{s.label}</span>
                      <span className="min-w-0 flex-1 font-semibold">{i.name}{!i.mandatory && <span className="font-normal text-muted-foreground"> (προαιρετικό)</span>}</span>
                      <span className="text-[length:var(--fs-11)] text-muted-foreground">{i.detail}{i.source ? ` · ${i.source}` : ''}</span>
                      {i.candidates.length > 0 && <span className="w-full pl-1 text-[length:var(--fs-11)] text-muted-foreground">Πιθανά: {i.candidates.map(c => c.title).join(' · ')}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
