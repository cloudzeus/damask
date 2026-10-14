'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuLoaderCircle, LuFileSpreadsheet, LuLandmark, LuUserPlus, LuFolderOpen, LuCircleCheck, LuCircleAlert, LuCircleX,
  LuEye, LuTrash2, LuPencil, LuChevronRight, LuUsers,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ViewerFile } from '@/components/ui/file-viewer-modal'
import { cn } from '@/lib/utils'
import {
  getPayroll, uploadPayrollDoc, updatePayrollEmployee, updatePayrollPayment, deletePayrollDoc,
  type PayrollView, type PayrollDocKind,
} from '@/lib/pm/payroll'

/**
 * Μισθολογικό κόστος μιας εγκεκριμένης δαπάνης προσωπικού: ανέβασμα (μισθοδοτικές, πληρωμές, αναγγελίες, λοιπά) →
 * νέοι εργαζόμενοι του έργου με κόστος & όριο προγράμματος → πλέγμα μηνών με πληρωμές.
 */

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
const EUR0 = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const MON = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ']
const monthLabel = (p: string) => { const [y, m] = p.split('-'); return `${MON[Number(m) - 1] ?? m} ${y.slice(2)}` }
const MAX_UPLOAD = 8 * 1024 * 1024

const SLOTS: { kind: PayrollDocKind; label: string; hint: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }[] = [
  { kind: 'PAYSLIPS', label: 'Μισθοδοτικές καταστάσεις', hint: 'Ένα ή πολλά PDF — όλοι οι μήνες', icon: LuFileSpreadsheet },
  { kind: 'PAYMENT', label: 'Πληρωμές μισθοδοσίας', hint: 'Αποδεικτικά/εξτρέ ανά μήνα', icon: LuLandmark },
  { kind: 'HIRING', label: 'Αναγγελίες πρόσληψης', hint: 'Ορίζουν τους νέους εργαζόμενους', icon: LuUserPlus },
  { kind: 'OTHER', label: 'Λοιπά', hint: 'ΑΠΔ, e-ΕΦΚΑ, Ε4', icon: LuFolderOpen },
]

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.includes(',') ? s.split(',')[1] : s) }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function PayrollPanel({ expenseId, onChanged, onView }: { expenseId: string; onChanged: () => void; onView: (f: ViewerFile) => void }) {
  const [view, setView] = React.useState<PayrollView | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [showOthers, setShowOthers] = React.useState(false)
  const inputs = React.useRef<Partial<Record<PayrollDocKind, HTMLInputElement | null>>>({})

  React.useEffect(() => { getPayroll(expenseId).then(setView).catch(() => toast.error('Η φόρτωση της μισθοδοσίας απέτυχε.')) }, [expenseId])

  async function upload(kind: PayrollDocKind, files: File[]) {
    for (const [i, f] of files.entries()) {
      if (f.size > MAX_UPLOAD) { toast.error(`Το «${f.name}» είναι πάνω από 8 MB — χωρίστε το ή συμπιέστε το.`); continue }
      setBusy(`${files.length > 1 ? `${i + 1}/${files.length} · ` : ''}Ανάγνωση: ${f.name}${kind === 'PAYSLIPS' ? ' (οι μισθοδοτικές θέλουν ~1′)' : ''}`)
      try {
        const r = await uploadPayrollDoc(expenseId, kind, { name: f.name, base64: await readBase64(f), mimeType: f.type || 'application/octet-stream' })
        if (!r.ok) toast.error(r.message)
        else { setView(r.view); if (files.length === 1) toast.success(r.note) }
      } catch { toast.error(`Το ανέβασμα του «${f.name}» απέτυχε.`) }
    }
    if (files.length > 1) toast.success(`Καταχωρίστηκαν ${files.length} έγγραφα.`)
    setBusy(null)
    onChanged()
  }
  async function act(p: Promise<PayrollView>) {
    try { setView(await p); onChanged() } catch { toast.error('Η ενέργεια απέτυχε.') }
  }

  if (!view) return <div className="m-3 h-24 animate-pulse rounded-lg bg-muted/50" aria-label="Φόρτωση μισθοδοσίας" />

  const hires = view.employees.filter(e => e.projectHire)
  const others = view.employees.filter(e => !e.projectHire)
  const periods = view.periods
  const cost = (empId: string, p: string) => view.grid.find(g => g.employeeId === empId && g.period === p)?.cost ?? 0
  const payments = view.docs.filter(d => d.kind === 'PAYMENT')

  return (
    <div className="flex flex-col gap-3 border-t border-border p-3">
      {/* Σύνοψη + κανόνας προγράμματος */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--fs-12)]">
        <span>Κόστος νέων εργαζομένων <b className="tabular-nums">{EUR.format(view.summary.cost)}</b></span>
        <span>Επιλέξιμο <b className="tabular-nums text-primary">{EUR.format(view.summary.eligible)}</b></span>
        <span>Εξοφλημένο <b className="tabular-nums">{EUR.format(view.summary.paidCost)}</b></span>
        {view.perEmeCap != null && <span className="badge-pill info" style={{ textTransform: 'none' }}>Πρόγραμμα: έως {EUR.format(view.perEmeCap)} ανά ΕΜΕ</span>}
      </div>

      {/* Ανέβασμα — 4 ξεκάθαρες επιλογές */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SLOTS.map(s => {
          const count = view.docs.filter(d => d.kind === s.kind).length
          const Icon = s.icon
          return (
            <button
              key={s.kind} type="button" disabled={!!busy} onClick={() => inputs.current[s.kind]?.click()}
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) void upload(s.kind, [...e.dataTransfer.files]) }}
              className="flex min-h-16 cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60"
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[length:var(--fs-12-5)] font-semibold">{s.label}{count ? <span className="ml-1 font-normal text-muted-foreground">({count})</span> : null}</span>
                <span className="block text-[length:var(--fs-11)] text-muted-foreground">{s.hint}</span>
              </span>
              <input ref={el => { inputs.current[s.kind] = el }} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={e => { if (e.target.files?.length) void upload(s.kind, [...e.target.files]); e.target.value = '' }} />
            </button>
          )
        })}
      </div>
      {busy && <p className="flex items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground" aria-live="polite"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> {busy}</p>}

      {/* Νέοι εργαζόμενοι του έργου */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[length:var(--fs-12-5)] font-semibold"><LuUsers className="size-4 text-primary" aria-hidden /> Νέοι εργαζόμενοι του έργου ({hires.length})</div>
        {hires.length === 0 ? (
          <p className="px-3 py-4 text-[length:var(--fs-12)] text-muted-foreground">
            {view.employees.length
              ? 'Σημειώστε παρακάτω ποιοι από τους εργαζόμενους των μισθοδοτικών είναι οι νέες προσλήψεις του έργου — ή ανεβάστε τις αναγγελίες πρόσληψης.'
              : 'Ανεβάστε τις μισθοδοτικές καταστάσεις και τις αναγγελίες πρόσληψης.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[length:var(--fs-12)]">
              <thead className="text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
                <tr><th className="px-3 py-1.5">Εργαζόμενος</th><th className="px-2 py-1.5">Πρόσληψη</th><th className="px-2 py-1.5 text-right">Μήνες</th><th className="px-2 py-1.5 text-right">Κόστος</th><th className="px-2 py-1.5 text-right">Όριο</th><th className="px-2 py-1.5 text-right">Επιλέξιμο</th><th className="w-10" /></tr>
              </thead>
              <tbody>
                {hires.map(e => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-1.5"><div className="font-semibold">{e.name}</div>{e.afm && <div className="text-[length:var(--fs-11)] text-muted-foreground">ΑΦΜ {e.afm}{e.fte < 1 ? ` · μερική ${Math.round(e.fte * 100)}%` : ''}</div>}</td>
                    <td className="px-2 py-1.5 tabular-nums">{e.hiredAt ? new Date(e.hiredAt).toLocaleDateString('el-GR') : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {e.months}
                      {e.missing.length > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-[color:var(--warning)]" title={`Χωρίς μισθοδοσία: ${e.missing.map(monthLabel).join(', ')} — ανεβάστε τη μισθοδοτική αυτών των μηνών ή ξαναδιαβάστε.`}><LuCircleAlert className="size-3" aria-label="Λείπουν μήνες" /> λείπει {e.missing.map(monthLabel).join(', ')}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{EUR.format(e.cost)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{e.cap != null ? EUR.format(e.cap) : '—'}</td>
                    <td className={cn('px-2 py-1.5 text-right font-semibold tabular-nums', e.cap != null && e.cost > e.cap && 'text-[color:var(--warning)]')} title={e.cap != null && e.cost > e.cap ? 'Το κόστος ξεπερνά το όριο του προγράμματος — μετρά μέχρι το όριο.' : undefined}>{EUR.format(e.eligible)}</td>
                    <td className="px-1"><button type="button" onClick={() => void act(updatePayrollEmployee(e.id, { projectHire: false }))} aria-label={`Αφαίρεση ${e.name} από τους νέους εργαζόμενους`} title="Δεν είναι νέα πρόσληψη του έργου" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-[color:var(--danger)]"><LuCircleX className="size-4" aria-hidden /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {others.length > 0 && (
          <div className="border-t border-border">
            <button type="button" onClick={() => setShowOthers(s => !s)} aria-expanded={showOthers} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[length:var(--fs-12)] text-muted-foreground hover:text-foreground">
              <LuChevronRight className={cn('size-3.5 transition-transform', showOthers && 'rotate-90')} aria-hidden /> Άλλοι εργαζόμενοι στις μισθοδοτικές ({others.length}) — δεν μετρούν στο έργο
            </button>
            {showOthers && (
              <ul className="flex flex-col gap-1 px-3 pb-3">
                {others.map(e => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-[length:var(--fs-12)]">
                    <span className="min-w-0 flex-1">{e.name} <span className="text-muted-foreground tabular-nums">· {e.months} μήνες · {EUR.format(e.cost)}</span></span>
                    <Button size="sm" variant="outline" onClick={() => void act(updatePayrollEmployee(e.id, { projectHire: true }))}><LuUserPlus className="size-3.5" aria-hidden /> Νέος εργαζόμενος έργου</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Πλέγμα μηνών */}
      {periods.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-max text-[length:var(--fs-11-5)] tabular-nums">
            <thead>
              <tr className="text-[length:var(--fs-10-5)] font-bold text-muted-foreground">
                <th className="sticky left-0 bg-card px-3 py-1.5 text-left">Μήνας</th>
                {periods.map(p => <th key={p.period} className="px-2 py-1.5 text-right">{monthLabel(p.period)}</th>)}
              </tr>
            </thead>
            <tbody>
              {hires.map(e => (
                <tr key={e.id} className="border-t border-border">
                  <td className="sticky left-0 max-w-44 truncate bg-card px-3 py-1 font-semibold">{e.name}</td>
                  {periods.map(p => { const c = cost(e.id, p.period); return <td key={p.period} className={cn('px-2 py-1 text-right', !c && 'text-muted-foreground')}>{c ? EUR0.format(c) : '—'}</td> })}
                </tr>
              ))}
              <tr className="border-t border-border text-muted-foreground">
                <td className="sticky left-0 bg-card px-3 py-1">Καθαρά πληρωτέα (όλοι)</td>
                {periods.map(p => <td key={p.period} className="px-2 py-1 text-right">{EUR0.format(p.netDue)}</td>)}
              </tr>
              <tr className="border-t border-border">
                <td className="sticky left-0 bg-card px-3 py-1 font-semibold">Πληρωμές</td>
                {periods.map(p => (
                  <td key={p.period} className="px-2 py-1 text-right" title={`Πληρώθηκαν ${EUR.format(p.paid)} από ${EUR.format(p.netDue)}`}>
                    <span className={cn('inline-flex items-center gap-1', p.status === 'PAID' ? 'text-[color:var(--success)]' : p.status === 'PARTIAL' ? 'text-[color:var(--warning)]' : 'text-[color:var(--danger)]')}>
                      {p.status === 'PAID' ? <LuCircleCheck className="size-3" aria-label="Εξοφλήθηκε" /> : <LuCircleAlert className="size-3" aria-label={p.status === 'PARTIAL' ? 'Μερικώς' : 'Χωρίς πληρωμή'} />}
                      {p.paid ? EUR0.format(p.paid) : '—'}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Έγγραφα */}
      {view.docs.length > 0 && (
        <details className="group rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[length:var(--fs-12)] font-semibold [&::-webkit-details-marker]:hidden">
            <LuChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden /> Έγγραφα μισθοδοσίας ({view.docs.length}){payments.length ? ` · ${payments.length} πληρωμές` : ''}
          </summary>
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {view.docs.map(d => <DocRow key={d.id} d={d} onView={() => onView({ name: d.name, url: `/payroll-doc/${d.id}` })} onAct={act} />)}
          </ul>
        </details>
      )}
    </div>
  )
}

function DocRow({ d, onView, onAct }: { d: PayrollView['docs'][number]; onView: () => void; onAct: (p: Promise<PayrollView>) => Promise<void> }) {
  const [edit, setEdit] = React.useState(false)
  const [f, setF] = React.useState({ amount: d.amount?.toString() ?? '', paidAt: d.paidAt ?? '', period: d.period ?? '' })
  const slot = SLOTS.find(s => s.kind === d.kind)
  const num = (s: string) => { const x = Number(s.replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return s.trim() && Number.isFinite(x) ? x : null }
  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-[length:var(--fs-12)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="badge-pill muted shrink-0" style={{ textTransform: 'none' }}>{slot?.label ?? d.kind}</span>
        <button type="button" onClick={onView} className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-primary" title={d.name}>{d.name}</button>
        {d.kind === 'PAYMENT' && <span className="tabular-nums">{d.amount != null ? EUR.format(d.amount) : <span className="text-[color:var(--warning)]">ποσό;</span>} · {d.period ? monthLabel(d.period) : <span className="text-[color:var(--warning)]">μήνας;</span>}{d.note ? ` · ${d.note}` : ''}</span>}
        {d.kind === 'PAYSLIPS' && <span className="text-muted-foreground">{d.lines} γραμμές</span>}
        {d.readError && <span className="text-[color:var(--warning)]" title={d.readError}>δεν διαβάστηκε</span>}
        <span className="flex items-center">
          <button type="button" onClick={onView} aria-label="Προβολή" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><LuEye className="size-3.5" aria-hidden /></button>
          {d.kind === 'PAYMENT' && <button type="button" onClick={() => setEdit(e => !e)} aria-label="Διόρθωση πληρωμής" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><LuPencil className="size-3.5" aria-hidden /></button>}
          <button type="button" onClick={() => { if (window.confirm(`Διαγραφή του «${d.name}»${d.kind === 'PAYSLIPS' ? ' και των γραμμών μισθοδοσίας του' : ''};`)) void onAct(deletePayrollDoc(d.id)) }} aria-label="Διαγραφή" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-[color:var(--danger)]"><LuTrash2 className="size-3.5" aria-hidden /></button>
        </span>
      </div>
      {edit && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1"><span className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Ποσό €</span><Input value={f.amount} inputMode="decimal" onChange={e => setF(x => ({ ...x, amount: e.target.value }))} className="h-9 w-32" /></label>
          <label className="flex flex-col gap-1"><span className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Ημερομηνία</span><Input type="date" value={f.paidAt} onChange={e => setF(x => ({ ...x, paidAt: e.target.value }))} className="h-9 w-40" /></label>
          <label className="flex flex-col gap-1"><span className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Μήνας μισθοδοσίας</span><Input type="month" value={f.period} onChange={e => setF(x => ({ ...x, period: e.target.value }))} className="h-9 w-40" /></label>
          <Button size="sm" onClick={() => { void onAct(updatePayrollPayment(d.id, { amount: num(f.amount), paidAt: f.paidAt || null, period: f.period || null })); setEdit(false) }}>Αποθήκευση</Button>
        </div>
      )}
    </li>
  )
}
