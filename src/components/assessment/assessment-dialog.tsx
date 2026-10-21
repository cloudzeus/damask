'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Sparkles, LoaderCircle, FileText, Download, CircleCheck, CircleX, CircleAlert, CircleHelp, TrendingUp, History,
  FileCheck2, FileWarning, FilePlus2, FilePen, Trash2, Mail, Send, Layers,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/relative-time'
import {
  startEligibilityAssessment, getAssessment, listAssessments, listAssessablePrograms, deleteAssessment, getProfileReadiness, listAssessmentRecipients, sendAssessmentEmail, startCombinedAssessment, getCombinedAssessment,
  type AssessmentDetail, type AssessmentRow, type ProfileReadiness, type AssessableProgram, type CombinedState,
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
  const [readiness, setReadiness] = React.useState<ProfileReadiness | null>(null)
  const [sendOpen, setSendOpen] = React.useState(false)
  const [mode, setMode] = React.useState<'single' | 'multi'>('single')
  const [rawPrograms, setRawPrograms] = React.useState<AssessableProgram[]>([])

  // Άνοιγμα: προγράμματα + ιστορικό· αν υπάρχει πρόσφατη αξιολόγηση για το επιλεγμένο πρόγραμμα, εμφάνισέ την.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    getProfileReadiness(trdrId).then(r => { if (!cancelled) setReadiness(r) }).catch(() => {})
    Promise.all([listAssessablePrograms(trdrId), listAssessments(trdrId)]).then(async ([ps, hs]) => {
      if (cancelled) return
      // Πρώτα όσα ταιριάζουν ήδη στον πελάτη (★ περιφέρεια/ΚΑΔ), μετά τα ανοιχτά, στο τέλος όσα έληξαν.
      setRawPrograms(ps)
      setPrograms(ps.map(p => ({
        value: p.id,
        label: `${p.match === 'strong' ? '★ ' : ''}${p.title}`,
        hint: [
          p.match === 'strong' ? `Ταιριάζει: ${p.matched.map(m => ({ region: 'περιφέρεια', kad: 'ΚΑΔ', legalForm: 'μορφή' } as Record<string, string>)[m] ?? m).join(' · ')}` : p.match === 'basic' ? 'Ταιριάζει (χωρίς ειδικό περιορισμό)' : null,
          p.expired ? 'Έληξε η υποβολή' : p.status === 'DRAFT' ? 'Πρόχειρο' : null,
          p.hasGuide ? null : 'χωρίς οδηγό PDF',
        ].filter(Boolean).join(' · ') || 'Ενεργό',
      })))
      setHistory(hs)
      const latest = hs.find(h => h.programId === (initialProgramId ?? hs[0]?.programId))
      if (latest) {
        setProgramId(latest.programId)
        const d = await getAssessment(latest.id)
        if (!cancelled) setCurrent(d)
      } else if (!initialProgramId) {
        // Χωρίς ιστορικό: προεπιλογή το πρόγραμμα που ταιριάζει καλύτερα (ανοιχτό).
        const best = ps.find(p => p.match && !p.expired)
        if (best) setProgramId(best.id)
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
        getProfileReadiness(trdrId).then(setReadiness).catch(() => {})
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
          {/* Ένα πρόγραμμα ή συνολική ανάλυση πολλών */}
          <div role="radiogroup" aria-label="Είδος αξιολόγησης" className="inline-flex self-start rounded-full border border-border bg-card p-0.5 text-[length:var(--fs-12-5)]">
            {([['single', 'Ένα πρόγραμμα', Sparkles], ['multi', 'Πολλά προγράμματα (συνολική)', Layers]] as const).map(([k, l, I]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                className={cn('inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 font-semibold', mode === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <I className="size-3.5" /> {l}
              </button>
            ))}
          </div>

          {mode === 'multi' ? <MultiAssessment trdrId={trdrId} programs={rawPrograms} onOpenSingle={id => { setMode('single'); void open_(id) }} /> : <>
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

          {/* Ετοιμότητα στοιχείων — τι ξέρουμε για την επιχείρηση πριν την αξιολόγηση */}
          {readiness && !r && !runningId && (
            <div className="rounded-2xl border border-border bg-card p-3.5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[length:var(--fs-12-5)] font-semibold">Στοιχεία της επιχείρησης για την αξιολόγηση</span>
                <span className={cn('badge-pill', readiness.score >= 80 ? 'ok' : readiness.score >= 50 ? 'warn' : 'danger')}>{readiness.score}% πλήρη</span>
                <span className="text-[length:var(--fs-11-5)] text-muted-foreground">ΑΑΔΕ/ΓΕΜΗ/περιφέρεια ενημερώνονται αυτόματα πριν την αξιολόγηση.</span>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {readiness.items.map(i => (
                  <li key={i.key} className="flex items-start gap-2 text-[length:var(--fs-12)]">
                    {i.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-(--success)" aria-label="υπάρχει" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-(--warning)" aria-label="λείπει" />}
                    <span className="min-w-0"><b>{i.label}:</b> {i.value}{i.fix && <span className="block text-[length:var(--fs-11-5)] text-muted-foreground">{i.fix}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                  <Button type="button" size="sm" variant={sendOpen ? 'secondary' : 'outline'} onClick={() => setSendOpen(o => !o)} aria-expanded={sendOpen}>
                    <Mail className="size-3.5" /> Αποστολή με email
                  </Button>
                </div>
              </div>
              {sendOpen && <SendPanel ids={current.id} trdrId={trdrId} onSent={() => setSendOpen(false)} />}

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
          </>}

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

/** Αποστολή της αναφοράς: προτεινόμενοι παραλήπτες (πελάτης/επαφές) με ένα κλικ ή οποιοδήποτε email + μήνυμα. */
function SendPanel({ ids, trdrId, onSent }: { ids: string | string[]; trdrId: string; onSent: () => void }) {
  const [suggestions, setSuggestions] = React.useState<{ label: string; email: string }[]>([])
  const [to, setTo] = React.useState('')
  const [cc, setCc] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [sending, setSending] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    listAssessmentRecipients(trdrId).then(r => { if (!alive) return; setSuggestions(r); if (r[0]) setTo(t => t || r[0].email) }).catch(() => {})
    return () => { alive = false }
  }, [trdrId])
  const toList = to.split(/[,;\s]+/).filter(Boolean)
  function toggle(email: string) {
    setTo(toList.includes(email) ? toList.filter(e => e !== email).join(', ') : [...toList, email].join(', '))
  }
  async function send() {
    setSending(true)
    try {
      const r = await sendAssessmentEmail(ids, { to, cc, message })
      if (!r.ok) { toast.error(r.message); return }
      toast.success('Η αξιολόγηση στάλθηκε.', { description: 'Θα τη βρείτε στην «Επικοινωνία» του πελάτη.' })
      onSent()
    } catch { toast.error('Η αποστολή απέτυχε.') } finally { setSending(false) }
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[length:var(--fs-13)] font-semibold"><Mail className="size-4 text-primary" /> Αποστολή της αναφοράς (PDF συνημμένο)</div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(sg => (
            <button key={sg.email} type="button" onClick={() => toggle(sg.email)} aria-pressed={toList.includes(sg.email)}
              className={cn('inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-3 text-[length:var(--fs-12)]', toList.includes(sg.email) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {toList.includes(sg.email) && <CircleCheck className="size-3" />} {sg.label} · {sg.email}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[length:var(--fs-12)] font-semibold">Προς
          <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="email@επιχείρηση.gr — πολλά με κόμμα" />
        </label>
        <label className="flex flex-col gap-1 text-[length:var(--fs-12)] font-semibold">Κοινοποίηση (προαιρετικό)
          <Input type="email" value={cc} onChange={e => setCc(e.target.value)} placeholder="π.χ. λογιστής" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[length:var(--fs-12)] font-semibold">Μήνυμα (προαιρετικό)
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
          placeholder="Αν το αφήσετε κενό, στέλνεται σύντομο συνοδευτικό κείμενο με το όνομα της επιχείρησης και του προγράμματος."
          className="rounded-xl border border-border bg-card px-3 py-2 text-[length:var(--fs-13)] font-normal outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
      </label>
      <div className="flex justify-end">
        <Button type="button" onClick={() => void send()} disabled={sending || !toList.length}>
          {sending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Αποστολή
        </Button>
      </div>
    </div>
  )
}

const DOC_FILTERS = [['all', 'Όλα'], ['common', 'Κοινά'], ['todo', 'Θέλουν ενέργεια'], ['ok', 'Υπάρχουν']] as const
type DocFilter = (typeof DOC_FILTERS)[number][0]

/**
 * ΣΥΝΟΛΙΚΗ ανάλυση: επιλογή πολλών προγραμμάτων (προεπιλεγμένα όσα ταιριάζουν ★) → μία αξιολόγηση ανά πρόγραμμα
 * (πρόσφατες ξαναχρησιμοποιούνται) → πίνακας πιθανοτήτων + ΜΙΑ λίστα δικαιολογητικών (κοινά / υπάρχουν / θέλουν ενέργεια)
 * + συνολικό PDF + αποστολή.
 */
function MultiAssessment({ trdrId, programs, onOpenSingle }: { trdrId: string; programs: AssessableProgram[]; onOpenSingle: (id: string) => void }) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(programs.filter(p => p.match === 'strong' && !p.expired).slice(0, 4).map(p => p.id)))
  const [ids, setIds] = React.useState<string[] | null>(null)
  const [state, setState] = React.useState<CombinedState | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [filter, setFilter] = React.useState<DocFilter>('all')
  const [sendOpen, setSendOpen] = React.useState(false)
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    if (!ids) return
    let alive = true
    const tick = async () => {
      const st = await getCombinedAssessment(ids).catch(() => null)
      if (!alive || !st) return
      setState(st)
      if (st.status === 'RUNNING') setTimeout(tick, 3000)
      else toast.success('Η συνολική ανάλυση ολοκληρώθηκε.')
    }
    void tick()
    return () => { alive = false }
  }, [ids])

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else if (n.size < 8) n.add(id); else toast.info('Έως 8 προγράμματα.'); return n })
  }
  async function start(fresh = false) {
    setStarting(true)
    try {
      const r = await startCombinedAssessment(trdrId, [...selected], { fresh })
      if (!r.ok) { toast.error(r.message); return }
      setState(null); setIds(r.ids)
      if (r.reused) toast.info(`${r.reused} από ${r.ids.length} αξιολογήσεις ήταν πρόσφατες και ξαναχρησιμοποιούνται.`)
    } finally { setStarting(false) }
  }

  const visible = showAll ? programs : programs.filter(p => !p.expired)
  const done = state?.status === 'DONE' ? state : null
  const docs = done ? done.summary.docs.filter(d => filter === 'all' || (filter === 'common' ? d.programs.length > 1 : filter === 'ok' ? d.status === 'OK' : d.status !== 'OK')) : []
  const q = ids ? `ids=${ids.join(',')}` : ''

  return (
    <div className="flex flex-col gap-4">
      {/* Επιλογή προγραμμάτων */}
      <div className="rounded-2xl border border-border bg-card p-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--fs-12-5)] font-semibold">Επιλέξτε προγράμματα ({selected.size}/8)</span>
          <span className="text-[length:var(--fs-11-5)] text-muted-foreground">★ = ταιριάζει ήδη σε περιφέρεια/ΚΑΔ</span>
          <button type="button" onClick={() => setShowAll(v => !v)} className="ml-auto cursor-pointer text-[length:var(--fs-11-5)] text-muted-foreground underline-offset-2 hover:underline">
            {showAll ? 'Απόκρυψη όσων έληξαν' : 'Εμφάνιση και όσων έληξαν'}
          </button>
        </div>
        <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
          {visible.map(p => (
            <li key={p.id}>
              <label className={cn('flex min-h-10 cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[length:var(--fs-12-5)] hover:bg-muted/60', selected.has(p.id) && 'bg-primary/8')}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span className="min-w-0">
                  <span className="font-semibold">{p.match === 'strong' ? '★ ' : ''}{p.title}</span>
                  <span className="block text-[length:var(--fs-11)] text-muted-foreground">{[p.expired ? 'Έληξε' : p.status === 'DRAFT' ? 'Πρόχειρο' : null, p.hasGuide ? null : 'χωρίς οδηγό PDF', p.submissionEnd ? `λήξη ${new Date(p.submissionEnd).toLocaleDateString('el-GR')}` : null].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap justify-end gap-2">
          {done && <Button type="button" variant="outline" size="sm" onClick={() => void start(true)} disabled={starting}>Νέα ανάλυση από την αρχή</Button>}
          <Button type="button" onClick={() => void start()} disabled={starting || selected.size < 2 || state?.status === 'RUNNING'}>
            {starting || state?.status === 'RUNNING' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Layers className="size-3.5" />} Συνολική ανάλυση ({selected.size})
          </Button>
        </div>
      </div>

      {state?.status === 'RUNNING' && (
        <div className="rounded-2xl border border-border bg-card p-4" aria-live="polite">
          <div className="mb-2 text-[length:var(--fs-12-5)] font-semibold">Αξιολόγηση ανά πρόγραμμα — {state.done}/{state.total} ολοκληρώθηκαν (≈1′ το καθένα, παράλληλα)</div>
          <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} /></div>
        </div>
      )}

      {done && (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--fs-13)] font-bold">Πιθανότητα ανά πρόγραμμα</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href={`/api/assessments/combined/pdf?${q}`} target="_blank" rel="noopener" />}><FileText className="size-3.5" /> Προβολή PDF</Button>
                <Button type="button" size="sm" nativeButton={false} render={<a href={`/api/assessments/combined/pdf?${q}&download=1`} />}><Download className="size-3.5" /> Λήψη PDF</Button>
                <Button type="button" size="sm" variant={sendOpen ? 'secondary' : 'outline'} onClick={() => setSendOpen(o => !o)}><Mail className="size-3.5" /> Αποστολή με email</Button>
              </div>
            </div>
            {done.failed.length > 0 && <p className="text-[length:var(--fs-12)] text-(--danger)">Δεν ολοκληρώθηκε για: {done.failed.join(', ')}</p>}
            <ul className="divide-y divide-border rounded-xl border border-border">
              {done.summary.programs.map(p => (
                <li key={p.assessmentId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-[length:var(--fs-12-5)] font-semibold">{p.title}</span>
                  <span className="w-28"><span className="block text-[length:var(--fs-12)] font-bold tabular-nums">{p.probability}%</span><span className="block h-1.5 rounded-full bg-muted"><span className={cn('block h-1.5 rounded-full', p.probability >= 60 ? 'bg-(--success)' : p.probability >= 35 ? 'bg-(--warning)' : 'bg-(--danger)')} style={{ width: `${p.probability}%` }} /></span></span>
                  <span className={cn('badge-pill', VERDICT[p.verdict].cls)}>{VERDICT[p.verdict].label}</span>
                  <button type="button" onClick={() => onOpenSingle(p.assessmentId)} className="cursor-pointer text-[length:var(--fs-12)] font-semibold text-primary hover:underline">Λεπτομέρειες ›</button>
                </li>
              ))}
            </ul>
          </div>
          {sendOpen && ids && <SendPanel ids={ids} trdrId={trdrId} onSent={() => setSendOpen(false)} />}

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--fs-13)] font-bold">Δικαιολογητικά για όλα τα προγράμματα</span>
              <span className="text-[length:var(--fs-11-5)] text-muted-foreground">{done.summary.counts.total} συνολικά · {done.summary.counts.common} κοινά · {done.summary.counts.ok} υπάρχουν · {done.summary.counts.toDo} θέλουν ενέργεια</span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {DOC_FILTERS.map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                  className={cn('min-h-8 cursor-pointer rounded-full border px-3 text-[length:var(--fs-12)] font-semibold', filter === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>{l}</button>
              ))}
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {docs.map((d, i) => {
                const st = REQ_DOC[d.status]
                return (
                  <li key={`${d.name}-${i}`} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                    <st.Icon className={cn('mt-0.5 size-4 shrink-0', d.status === 'OK' ? 'text-(--success)' : d.status === 'MISSING' ? 'text-(--danger)' : d.status === 'EXPIRED' ? 'text-(--warning)' : 'text-primary')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[length:var(--fs-12-5)] font-semibold">{d.name}{d.issuer ? <span className="font-normal text-muted-foreground"> · {d.issuer}</span> : null}</span>
                      <span className="block text-[length:var(--fs-11-5)] text-muted-foreground">{d.programs.length > 1 ? <b className="text-foreground">Κοινό σε {d.programs.length} προγράμματα: </b> : null}{d.programs.join(' · ')}</span>
                      {d.notes[0] && <span className="block text-[length:var(--fs-11-5)] text-muted-foreground">{d.notes[0]}</span>}
                    </span>
                    <span className={cn('badge-pill shrink-0', st.cls)}>{st.label}</span>
                  </li>
                )
              })}
              {docs.length === 0 && <li className="px-3 py-4 text-center text-[length:var(--fs-12)] text-muted-foreground">Κανένα δικαιολογητικό σε αυτό το φίλτρο.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
