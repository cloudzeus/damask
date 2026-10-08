'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Sparkles, LoaderCircle, FileText, Download, CircleCheck, CircleX, CircleAlert, CircleHelp, TrendingUp, History,
  FileCheck2, FileWarning, FilePlus2, FilePen, Trash2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/relative-time'
import {
  startEligibilityAssessment, getAssessment, listAssessments, listAssessablePrograms, deleteAssessment,
  type AssessmentDetail, type AssessmentRow,
} from '@/lib/assessment/actions'
import type { AssessmentResult, CheckStatus } from '@/lib/assessment/agent'

/**
 * «Αξιολόγηση ένταξης» στην καρτέλα πελάτη: επιλογή προγράμματος → agent (κανόνες + ανάγνωση οδηγού)
 * → πιθανότητα, κριτήρια, δικαιολογητικά που θα χρειαστούν, ενέργειες, PDF. Κρατά ιστορικό.
 */

const VERDICT: Record<AssessmentResult['verdict'], { label: string; cls: string }> = {
  ELIGIBLE: { label: 'Επιλέξιμη', cls: 'ok' },
  CONDITIONAL: { label: 'Επιλέξιμη υπό προϋποθέσεις', cls: 'warn' },
  NOT_ELIGIBLE: { label: 'Μη επιλέξιμη', cls: 'danger' },
}
const STATUS: Record<CheckStatus, { label: string; cls: string; Icon: typeof CircleCheck }> = {
  PASS: { label: 'Πληροί', cls: 'ok', Icon: CircleCheck },
  ESTIMATED: { label: 'Πληροί (εκτίμηση)', cls: 'info', Icon: TrendingUp },
  PARTIAL: { label: 'Υπό όρους', cls: 'warn', Icon: CircleAlert },
  FAIL: { label: 'Δεν πληροί', cls: 'danger', Icon: CircleX },
  UNKNOWN: { label: 'Άγνωστο', cls: 'muted', Icon: CircleHelp },
}
const REQ_DOC: Record<AssessmentResult['requiredDocuments'][number]['status'], { label: string; cls: string; Icon: typeof FileCheck2 }> = {
  OK: { label: 'Υπάρχει', cls: 'ok', Icon: FileCheck2 },
  EXPIRED: { label: 'Ανανέωση', cls: 'warn', Icon: FileWarning },
  MISSING: { label: 'Να εκδοθεί', cls: 'danger', Icon: FilePlus2 },
  TO_PREPARE: { label: 'Σύνταξη', cls: 'info', Icon: FilePen },
}
const IMPACT: Record<string, { label: string; cls: string }> = { HIGH: { label: 'Υψηλή', cls: 'danger' }, MEDIUM: { label: 'Μεσαία', cls: 'warn' }, LOW: { label: 'Χαμηλή', cls: 'muted' } }
const STEPS = ['Προφίλ επιχείρησης', 'Έλεγχος κανόνων', 'Ανάγνωση οδηγού', 'Βαθμολόγηση & τεκμηρίωση']
const NUM = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 })
type Section = 'docs' | 'criteria' | 'scoring' | 'actions'

export function AssessmentDialog({
  trdrId, open, onOpenChange, initialProgramId,
}: {
  trdrId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  initialProgramId?: string | null
}) {
  const [programs, setPrograms] = React.useState<{ value: string; label: string; hint?: string }[]>([])
  const [programId, setProgramId] = React.useState<string | null>(initialProgramId ?? null)
  const [history, setHistory] = React.useState<AssessmentRow[]>([])
  const [current, setCurrent] = React.useState<AssessmentDetail | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [section, setSection] = React.useState<Section>('docs')
  const [tick, setTick] = React.useState(0)

  // Άνοιγμα: προγράμματα + ιστορικό· αν υπάρχει πρόσφατη αξιολόγηση για το επιλεγμένο πρόγραμμα, εμφάνισέ την.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([listAssessablePrograms(), listAssessments(trdrId)]).then(async ([ps, hs]) => {
      if (cancelled) return
      setPrograms(ps.map(p => ({ value: p.id, label: p.title, hint: `${p.status === 'ACTIVE' ? 'Ενεργό' : p.status === 'DRAFT' ? 'Πρόχειρο' : 'Κλειστό'}${p.hasGuide ? '' : ' · χωρίς οδηγό PDF'}` })))
      setHistory(hs)
      const latest = hs.find(h => h.programId === (initialProgramId ?? hs[0]?.programId))
      if (latest) {
        setProgramId(latest.programId)
        const d = await getAssessment(latest.id)
        if (!cancelled) setCurrent(d)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [open, trdrId, initialProgramId])

  // Polling όσο τρέχει ο agent (~1′).
  const runningId = current?.status === 'RUNNING' ? current.id : null
  React.useEffect(() => {
    if (!runningId) return
    const iv = setInterval(async () => {
      setTick(t => t + 1)
      const d = await getAssessment(runningId).catch(() => null)
      if (d && d.status !== 'RUNNING') {
        setCurrent(d)
        setHistory(await listAssessments(trdrId).catch(() => []))
        if (d.status === 'DONE') toast.success('Η αξιολόγηση ολοκληρώθηκε.')
        else toast.error(d.error ?? 'Η αξιολόγηση απέτυχε.')
      }
    }, 3000)
    return () => clearInterval(iv)
  }, [runningId, trdrId])

  async function start() {
    if (!programId) { toast.error('Επίλεξε πρόγραμμα.'); return }
    setStarting(true)
    try {
      const r = await startEligibilityAssessment(trdrId, programId)
      if (!r.ok) { toast.error(r.message); return }
      setTick(0)
      setSection('docs')
      setCurrent(await getAssessment(r.id))
    } finally {
      setStarting(false)
    }
  }

  async function open_(id: string) {
    const d = await getAssessment(id)
    if (d) { setCurrent(d); setProgramId(d.programId); setSection('docs') }
  }

  async function remove(id: string) {
    if (!window.confirm('Διαγραφή αυτής της αξιολόγησης;')) return
    await deleteAssessment(id).catch(() => toast.error('Η διαγραφή απέτυχε.'))
    setHistory(h => h.filter(x => x.id !== id))
    if (current?.id === id) setCurrent(null)
  }

  const r = current?.status === 'DONE' ? current.result : null
  const step = Math.min(STEPS.length - 1, Math.floor(tick / 5))
  const pdf = (dl: boolean) => `/api/assessments/${current?.id}/pdf${dl ? '?download=1' : ''}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Αξιολόγηση ένταξης σε πρόγραμμα</DialogTitle>
          <DialogDescription>
            Ο agent ελέγχει ΚΑΔ, περιφέρεια, μορφή, ΕΜΕ, τζίρους, έτη λειτουργίας και δικαιολογητικά, διαβάζει τον οδηγό του προγράμματος και εκτιμά την πιθανότητα ένταξης.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Επιλογή προγράμματος */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Combobox
              className="min-w-0 flex-1"
              options={programs}
              value={programId}
              onChange={v => { setProgramId(v); if (current && current.programId !== v) setCurrent(null) }}
              placeholder="Επίλεξε ευρωπαϊκό πρόγραμμα…"
              ariaLabel="Πρόγραμμα"
            />
            <Button type="button" onClick={start} disabled={!programId || starting || !!runningId}>
              {starting || runningId ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {current && current.programId === programId && current.status === 'DONE' ? 'Νέα αξιολόγηση' : 'Αξιολόγηση'}
            </Button>
          </div>

          {/* Σε εξέλιξη */}
          {runningId && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 text-[length:var(--fs-12-5)] font-semibold">Ο agent δουλεύει — περίπου ένα λεπτό…</div>
              <ol className="grid gap-2 sm:grid-cols-4">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-[length:var(--fs-12)]', i < step ? 'border-(--success) text-(--success)' : i === step ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>
                    {i < step ? <CircleCheck className="size-3.5 shrink-0" /> : i === step ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <span className="size-3.5 shrink-0 rounded-full border border-current" />}
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {current?.status === 'ERROR' && (
            <p className="rounded-xl border border-(--danger) bg-(--danger-soft,transparent) px-3 py-2 text-[length:var(--fs-12-5)] text-(--danger)">Η αξιολόγηση απέτυχε: {current.error}</p>
          )}

          {/* Αποτέλεσμα */}
          {r && current && (
            <>
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <ProbabilityRing value={r.probability} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={cn('badge-pill', VERDICT[r.verdict].cls)}>{VERDICT[r.verdict].label}</span>
                    {!current.usedGuidePdf && <span className="badge-pill muted" title="Το πρόγραμμα δεν έχει ανεβασμένο οδηγό PDF">χωρίς οδηγό</span>}
                    <span className="text-[length:var(--fs-11)] text-muted-foreground">{relativeTime(current.createdAt)}</span>
                  </div>
                  <p className="text-[length:var(--fs-12-5)] leading-relaxed">{r.summary}</p>
                  {r.scoring.total != null && r.scoring.max ? (
                    <div className="mt-2.5">
                      <div className="mb-1 flex justify-between text-[length:var(--fs-11-5)] font-semibold">
                        <span>Εκτιμώμενη βαθμολογία</span>
                        <span className="tabular-nums">{NUM.format(r.scoring.total)} / {NUM.format(r.scoring.max)}{r.scoring.passMark != null ? ` · βάση ${NUM.format(r.scoring.passMark)}` : ''}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, (r.scoring.total / r.scoring.max) * 100)}%` }} /></div>
                    </div>
                  ) : null}
                  {r.caps.length > 0 && <p className="mt-2 text-[length:var(--fs-11-5)] text-(--danger)">{r.caps.join(' ')}</p>}
                </div>
                <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                  <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href={pdf(false)} target="_blank" rel="noopener" />}>
                    <FileText className="size-3.5" /> Προβολή PDF
                  </Button>
                  <Button type="button" size="sm" nativeButton={false} render={<a href={pdf(true)} />}>
                    <Download className="size-3.5" /> Λήψη PDF
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5" role="tablist">
                {([
                  ['docs', `Δικαιολογητικά (${r.requiredDocuments?.length ?? 0})`],
                  ['criteria', `Κριτήρια (${r.criteria.length})`],
                  ['scoring', `Βαθμολογία (${r.scoring.items.length})`],
                  ['actions', `Τι χρειάζεται (${r.actions.length})`],
                ] as [Section, string][]).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={section === k} onClick={() => setSection(k)}
                    className={cn('rounded-full border px-3 py-1 text-[length:var(--fs-12)] font-semibold', section === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
                    {label}
                  </button>
                ))}
              </div>

              {section === 'docs' && <RequiredDocs r={r} />}
              {section === 'criteria' && <Criteria r={r} />}
              {section === 'scoring' && <Scoring r={r} />}
              {section === 'actions' && <Actions r={r} />}
            </>
          )}

          {/* Ιστορικό */}
          {history.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase"><History className="size-3.5" /> Προηγούμενες αξιολογήσεις</div>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {history.map(h => (
                  <li key={h.id} className={cn('flex items-center gap-3 px-3 py-2', current?.id === h.id && 'bg-muted/50')}>
                    <button type="button" onClick={() => open_(h.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[length:var(--fs-12-5)] font-semibold">{h.programTitle}</span>
                      <span className="text-[length:var(--fs-11)] text-muted-foreground">{relativeTime(h.createdAt)}</span>
                    </button>
                    {h.status === 'DONE' && h.verdict
                      ? <span className={cn('badge-pill tabular-nums', VERDICT[h.verdict].cls)}>{h.probability}%</span>
                      : <span className="badge-pill muted">{h.status === 'RUNNING' ? 'σε εξέλιξη' : 'σφάλμα'}</span>}
                    <button type="button" className="rowmenu-btn" aria-label="Διαγραφή αξιολόγησης" onClick={() => remove(h.id)}><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProbabilityRing({ value }: { value: number }) {
  const r = 34, c = 2 * Math.PI * r
  const color = value >= 65 ? 'var(--success)' : value >= 35 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="relative grid size-24 shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <div className="text-center">
        <div className="text-[length:var(--fs-22)] leading-none font-extrabold tabular-nums" style={{ color }}>{value}%</div>
        <div className="mt-0.5 text-[length:var(--fs-9)] font-bold tracking-wide text-muted-foreground uppercase">πιθανότητα</div>
      </div>
    </div>
  )
}

function RequiredDocs({ r }: { r: AssessmentResult }) {
  const docs = r.requiredDocuments ?? []
  if (!docs.length) return <p className="text-[length:var(--fs-12-5)] text-muted-foreground">Ο οδηγός δεν αναφέρει δικαιολογητικά (ή δεν ήταν διαθέσιμος).</p>
  const counts = docs.reduce<Record<string, number>>((a, d) => ({ ...a, [d.status]: (a[d.status] ?? 0) + 1 }), {})
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 text-[length:var(--fs-11-5)]">
        {(Object.keys(REQ_DOC) as (keyof typeof REQ_DOC)[]).filter(k => counts[k]).map(k => (
          <span key={k} className={cn('badge-pill', REQ_DOC[k].cls)}>{REQ_DOC[k].label}: {counts[k]}</span>
        ))}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {docs.map((d, i) => {
          const m = REQ_DOC[d.status]
          return (
            <li key={i} className="flex items-start gap-3 px-3 py-2.5">
              <m.Icon className={cn('mt-0.5 size-4 shrink-0', d.status === 'OK' ? 'text-(--success)' : d.status === 'MISSING' ? 'text-(--danger)' : d.status === 'EXPIRED' ? 'text-(--warning)' : 'text-primary')} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[length:var(--fs-12-5)] font-semibold">{d.name}</span>
                  {d.stage && <span className="text-[length:var(--fs-11)] text-muted-foreground">{d.stage}</span>}
                </div>
                {d.issuer && <div className="text-[length:var(--fs-11-5)] text-muted-foreground">Εκδίδεται από: {d.issuer}</div>}
                {d.note && <div className="mt-0.5 text-[length:var(--fs-12)]">{d.note}</div>}
              </div>
              <span className={cn('badge-pill shrink-0', m.cls)}>{m.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Criteria({ r }: { r: AssessmentResult }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {r.criteria.map((c, i) => {
        const m = STATUS[c.status]
        return (
          <li key={i} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[1fr_1fr_auto] sm:gap-3">
            <div>
              <div className="text-[length:var(--fs-12-5)] font-semibold">{c.criterion}{c.exclusion && <span className="ml-1.5 text-[length:var(--fs-10-5)] font-bold text-muted-foreground uppercase">αποκλεισμού</span>}</div>
              {c.requirement && <div className="text-[length:var(--fs-11-5)] text-muted-foreground">{c.requirement}</div>}
              {c.guideRef && <div className="text-[length:var(--fs-11)] text-primary italic">Οδηγός: {c.guideRef}</div>}
            </div>
            <div className="text-[length:var(--fs-12)]">
              <div className="font-semibold">{c.companyValue}</div>
              <div className="text-muted-foreground">{c.reasoning}</div>
            </div>
            <span className={cn('badge-pill self-start', m.cls)}><m.Icon className="size-3" /> {m.label}</span>
          </li>
        )
      })}
      {r.estimates.length > 0 && (
        <li className="bg-muted/40 px-3 py-2.5 text-[length:var(--fs-11-5)]">
          <b>Εκτιμήσεις:</b> {r.estimates.map(e => `${e.field} ${e.requiredPeriod} ≈ ${e.basedOn}`).join(' · ')} — επιβεβαιώνονται όταν εκδοθούν τα νέα έγγραφα.
        </li>
      )}
    </ul>
  )
}

function Scoring({ r }: { r: AssessmentResult }) {
  if (!r.scoring.items.length) return <p className="text-[length:var(--fs-12-5)] text-muted-foreground">Το πρόγραμμα δεν έχει βαθμολογούμενα κριτήρια (π.χ. σειρά προτεραιότητας / FIFO).</p>
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {r.scoring.items.map((it, i) => {
        const pct = it.estimated != null && it.max ? (it.estimated / it.max) * 100 : 0
        return (
          <li key={i} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[1.1fr_120px_1.4fr] sm:items-center sm:gap-3">
            <div className="text-[length:var(--fs-12-5)] font-semibold">{it.criterion}{it.weight != null && <span className="ml-1 text-[length:var(--fs-11)] font-normal text-muted-foreground">({NUM.format(it.weight)}%)</span>}</div>
            <div>
              <div className="text-[length:var(--fs-12)] font-bold tabular-nums">{it.estimated != null ? NUM.format(it.estimated) : '—'}{it.max != null ? ` / ${NUM.format(it.max)}` : ''}</div>
              <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)' }} /></div>
            </div>
            <div className="text-[length:var(--fs-12)] text-muted-foreground">{it.reasoning}</div>
          </li>
        )
      })}
    </ul>
  )
}

function Actions({ r }: { r: AssessmentResult }) {
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const
  const actions = [...r.actions].sort((a, b) => order[a.impact] - order[b.impact])
  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {actions.map((a, i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-2.5">
            <span className="w-5 shrink-0 text-[length:var(--fs-14)] font-extrabold text-primary tabular-nums">{i + 1}</span>
            <span className="flex-1 text-[length:var(--fs-12-5)]">{a.action}</span>
            <span className={cn('badge-pill shrink-0', IMPACT[a.impact].cls)}>{IMPACT[a.impact].label}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3">
        {r.strengths.length > 0 && <Bullets title="Δυνατά σημεία" items={r.strengths} tone="var(--success)" />}
        {r.risks.length > 0 && <Bullets title="Κίνδυνοι" items={r.risks} tone="var(--danger)" />}
      </div>
    </div>
  )
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1.5 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">{title}</div>
      <ul className="flex flex-col gap-1.5">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2 text-[length:var(--fs-12)]"><span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: tone }} />{x}</li>
        ))}
      </ul>
    </div>
  )
}
