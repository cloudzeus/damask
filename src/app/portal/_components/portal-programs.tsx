'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuUpload, LuCircleCheck, LuClock, LuLoaderCircle, LuFileText, LuCheck, LuMapPin, LuArrowRight,
  LuCalendarDays, LuMessageCircle, LuMail, LuSparkles, LuChevronDown,
} from 'react-icons/lu'
import { submitObligationUpload, type PortalApp } from '@/lib/pm/portal-contact'

/**
 * Portal πελάτη — «οδηγός έργου»: πού βρίσκεται κάθε έργο (6 απλά βήματα), τι χρειαζόμαστε από τον
 * πελάτη (με ανέβασμα), τα ποσά (προϋπολογισμός/επιδότηση/δαπάνες/εισπράξεις), οι πληρωμές, οι
 * ημερομηνίες και γρήγορες ερωτήσεις στον βοηθό Thanos για το συγκεκριμένο πρόγραμμα.
 */

const eur = (n: number | null) => (n == null ? '—' : n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }))
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null)
const ask = (text: string) => window.dispatchEvent(new CustomEvent('thanos:ask', { detail: { text } }))

export function PortalPrograms({ applications, preview = false }: { applications: PortalApp[]; preview?: boolean }) {
  const router = useRouter()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function handleUpload(obligationId: string, file: File) {
    if (preview) { toast.info('Προεπισκόπηση — το ανέβασμα γίνεται μόνο από τον πελάτη.'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('Το αρχείο ξεπερνά τα 8MB.'); return }
    setBusyId(obligationId)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
        r.onerror = () => reject(new Error('read'))
        r.readAsDataURL(file)
      })
      const res = await submitObligationUpload(obligationId, { filename: file.name, base64, mimeType: file.type || 'application/octet-stream' })
      if (res.ok) { toast.success('Το δικαιολογητικό ανέβηκε — ευχαριστούμε!'); router.refresh() }
      else toast.error('Το ανέβασμα απέτυχε. Δοκιμάστε ξανά ή στείλτε το στον σύμβουλό σας.')
    } catch {
      toast.error('Το ανέβασμα απέτυχε. Δοκιμάστε ξανά ή στείλτε το στον σύμβουλό σας.')
    } finally {
      setBusyId(null)
    }
  }

  if (applications.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Δεν υπάρχουν προγράμματα διαθέσιμα για την επαφή σας ακόμη.</p>
  }

  const pendingTotal = applications.reduce((n, a) => n + a.obligations.filter(o => !isDone(o.status)).length, 0)

  return (
    <div className="flex flex-col gap-5">
      {pendingTotal > 0 && (
        <div className="glass flex items-center gap-3 p-4" style={{ borderLeft: '4px solid var(--warning)' }} role="status">
          <LuClock className="size-5 shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
          <p className="text-[length:var(--fs-14)]">
            <b>Χρειαζόμαστε {pendingTotal} {pendingTotal === 1 ? 'έγγραφο' : 'έγγραφα'} από εσάς</b>
            <span className="text-muted-foreground"> — ανεβάστε τα παρακάτω, ώστε να προχωρήσει το έργο χωρίς καθυστέρηση.</span>
          </p>
        </div>
      )}
      {applications.map(app => (
        <ProgramGuide key={app.applicationId} app={app} busyId={busyId} onUpload={handleUpload} preview={preview} />
      ))}
    </div>
  )
}

const isDone = (s: string) => s === 'APPROVED' || s === 'SUBMITTED' || s === 'WAIVED'

function ProgramGuide({ app, busyId, onUpload, preview }: { app: PortalApp; busyId: string | null; onUpload: (id: string, f: File) => void; preview: boolean }) {
  const { journey, money } = app
  const todo = app.obligations.filter(o => !isDone(o.status))
  const done = app.obligations.filter(o => isDone(o.status))
  const current = journey.steps[journey.currentIndex]
  const program = `«${app.programTitle}»`

  return (
    <section className="glass overflow-hidden" aria-labelledby={`p-${app.applicationId}`}>
      {/* Κεφαλίδα */}
      <div className="flex flex-wrap items-start gap-2 border-b border-border p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-11-5)] font-medium uppercase tracking-wide text-muted-foreground">Πρόγραμμα</p>
          <h2 id={`p-${app.applicationId}`} className="text-[length:var(--fs-17)] font-semibold leading-snug">{app.programTitle}</h2>
        </div>
        <span className="badge-pill info">Βήμα {journey.currentIndex + 1} από {journey.steps.length}: {current.label}</span>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {/* Πορεία έργου */}
        <div>
          <ol className="grid grid-cols-6 gap-1" aria-label="Πορεία έργου">
            {journey.steps.map((s, i) => (
              <li key={s.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
                <div className="relative flex w-full items-center justify-center">
                  {i > 0 && <span className="absolute right-1/2 top-1/2 h-0.5 w-full -translate-y-1/2" style={{ background: s.state === 'todo' ? 'var(--border)' : 'var(--primary)' }} aria-hidden />}
                  <span
                    className="relative z-[1] grid size-8 place-items-center rounded-full text-[length:var(--fs-12)] font-semibold"
                    style={s.state === 'done'
                      ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                      : s.state === 'current'
                        ? { background: 'var(--card)', color: 'var(--primary)', boxShadow: '0 0 0 2px var(--primary), 0 0 0 6px color-mix(in srgb, var(--primary) 15%, transparent)' }
                        : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                  >
                    {s.state === 'done' ? <LuCheck className="size-4" aria-label="ολοκληρώθηκε" /> : i + 1}
                  </span>
                </div>
                <span className={`text-[length:var(--fs-11)] leading-tight ${s.state === 'current' ? 'font-semibold text-foreground' : 'hidden text-muted-foreground sm:block'}`}>{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-xl p-4" style={{ background: 'color-mix(in srgb, var(--primary) 7%, transparent)' }}>
            <p className="flex items-center gap-1.5 text-[length:var(--fs-12-5)] font-semibold" style={{ color: 'var(--primary)' }}><LuMapPin className="size-3.5" aria-hidden /> Πού βρισκόμαστε</p>
            <p className="mt-1 text-[length:var(--fs-14)] leading-relaxed">{journey.now}</p>
            {journey.next && (
              <p className="mt-2 flex items-start gap-1.5 text-[length:var(--fs-13)] text-muted-foreground"><LuArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span><b className="text-foreground">Μετά:</b> {journey.next}</span></p>
            )}
          </div>
        </div>

        {/* Τι χρειαζόμαστε από εσάς */}
        <div>
          <h3 className="mb-2 text-[length:var(--fs-14)] font-semibold">Τι χρειαζόμαστε από εσάς</h3>
          {todo.length === 0 ? (
            <p className="flex items-center gap-2 text-[length:var(--fs-13)] text-muted-foreground"><LuCircleCheck className="size-4" style={{ color: 'var(--success)' }} aria-hidden /> Τίποτα αυτή τη στιγμή — σας ευχαριστούμε!</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {todo.map(o => {
                const rejected = o.status === 'REJECTED'
                const busy = busyId === o.id
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
                    <LuFileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-[length:var(--fs-14)] font-medium">{o.name}</div>
                      <div className="text-[length:var(--fs-11-5)]" style={{ color: rejected ? 'var(--coral)' : 'var(--muted-foreground)' }}>
                        {rejected ? 'Χρειάζεται ξανά — δείτε το email του συμβούλου σας' : o.dueDate ? `Έως ${day(o.dueDate)}` : 'Εκκρεμεί'}
                      </div>
                    </div>
                    <label className={`btn-pill h-11 cursor-pointer px-4 text-[length:var(--fs-13)] ${preview ? 'btn-glass opacity-60' : 'btn-navy'}`}>
                      {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuUpload className="size-4" aria-hidden />}
                      {rejected ? 'Ανεβάστε ξανά' : 'Ανεβάστε'}
                      <input type="file" className="sr-only" disabled={busy || preview} aria-label={`Ανέβασμα: ${o.name}`}
                        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(o.id, f); e.target.value = '' }} />
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {app.openRequests > 0 && (
            <p className="mt-2 text-[length:var(--fs-12)] text-muted-foreground">Υπάρχ{app.openRequests === 1 ? 'ει 1 αίτημα' : `ουν ${app.openRequests} αιτήματα`} εγγράφων με ξεχωριστό σύνδεσμο στο email σας.</p>
          )}
          {done.length > 0 && (
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[length:var(--fs-12-5)] text-muted-foreground hover:text-foreground">
                <LuChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden /> Έχετε στείλει {done.length} {done.length === 1 ? 'έγγραφο' : 'έγγραφα'}
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {done.map(o => (
                  <li key={o.id} className="flex items-center gap-2 text-[length:var(--fs-12-5)]">
                    <LuCircleCheck className="size-3.5 shrink-0" style={{ color: 'var(--success)' }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    <span className="badge-pill success">{o.statusLabel}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Η επένδυση σε αριθμούς */}
        {(money.budget != null || money.expensesCount > 0 || app.payments.length > 0) && (
          <div>
            <h3 className="mb-2 text-[length:var(--fs-14)] font-semibold">Η επένδυσή σας σε αριθμούς</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label="Προϋπολογισμός" value={eur(money.budget)} />
              <Figure label={`Επιδότηση${money.rate != null ? ` (${money.rate}%)` : ''}`} value={eur(money.subsidy)} />
              <Figure label={`Δαπάνες (${money.expensesCount})`} value={eur(money.expensesAmount)} bar={money.budget ? money.expensesAmount / money.budget : null} hint={money.certifiedAmount ? `${eur(money.certifiedAmount)} πιστοποιημένες` : undefined} />
              <Figure label="Έχετε εισπράξει" value={eur(money.paidAmount)} bar={money.subsidy ? money.paidAmount / money.subsidy : null} />
            </div>
            {app.payments.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {app.payments.map(p => (
                  <li key={p.ordinal} className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                    <span className="font-medium">{p.title || `${p.ordinal}η δόση`}</span>
                    <span className="text-muted-foreground">{eur(p.amount)}</span>
                    <span className={`badge-pill ${p.status === 'PAID' ? 'success' : p.status === 'REJECTED' ? '' : 'info'}`}>{p.statusLabel}{p.paidAt ? ` · ${day(p.paidAt)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Ημερομηνίες */}
        {(app.dates.deadline || app.dates.submittedAt || app.dates.nextDue || app.dates.durationMonths) && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[length:var(--fs-13)] sm:grid-cols-2">
            {app.dates.deadline && <DateRow label="Προθεσμία υποβολής προγράμματος" value={day(app.dates.deadline)} />}
            {app.dates.submittedAt && <DateRow label="Η αίτηση υποβλήθηκε" value={day(app.dates.submittedAt)} />}
            {app.dates.nextDue && <DateRow label="Επόμενη προθεσμία εγγράφου" value={day(app.dates.nextDue)} />}
            {app.dates.durationMonths && <DateRow label="Διάρκεια υλοποίησης" value={`${app.dates.durationMonths} μήνες`} />}
          </dl>
        )}

        {/* Βοηθός */}
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold"><LuSparkles className="size-4" style={{ color: 'var(--primary)' }} aria-hidden /> Ρωτήστε τον βοηθό για αυτό το έργο</p>
          <div className="flex flex-wrap gap-2">
            <AskChip disabled={preview} onClick={() => ask(`Θέλω να κάνω μια αγορά για το πρόγραμμα ${program}. Πώς ελέγχω αν είναι επιλέξιμη δαπάνη;`)}>Είναι επιλέξιμη μια αγορά;</AskChip>
            <AskChip disabled={preview} onClick={() => ask(`Τι εκκρεμεί για να προχωρήσει το έργο μου στο πρόγραμμα ${program};`)}>Τι εκκρεμεί;</AskChip>
            <AskChip disabled={preview} onClick={() => ask(`Εξήγησέ μου απλά τι ακολουθεί στο πρόγραμμα ${program} και τι πρέπει να κάνω εγώ.`)}>Τι ακολουθεί;</AskChip>
            <AskChip disabled={preview} onClick={() => ask(`Θέλω να στείλω σύνδεσμο στον λογιστή μου για να ανεβάσει έγγραφα για το πρόγραμμα ${program}.`)}>Σύνδεσμος για τον λογιστή μου</AskChip>
          </div>
        </div>

        {app.manager && (
          <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)] text-muted-foreground">
            <LuMessageCircle className="size-4" aria-hidden /> Σύμβουλός σας: <b className="text-foreground">{app.manager.name}</b>
            {app.manager.email && <a href={`mailto:${app.manager.email}`} className="inline-flex min-h-11 items-center gap-1 text-[color:var(--primary)] hover:underline"><LuMail className="size-3.5" aria-hidden />{app.manager.email}</a>}
          </p>
        )}
      </div>
    </section>
  )
}

function Figure({ label, value, bar, hint }: { label: string; value: string; bar?: number | null; hint?: string }) {
  const pct = bar != null ? Math.max(0, Math.min(1, bar)) : null
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[length:var(--fs-11-5)] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[length:var(--fs-16)] font-semibold tabular-nums">{value}</div>
      {pct != null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: 'var(--primary)' }} />
        </div>
      )}
      {hint && <div className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">{hint}</div>}
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <LuCalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function AskChip({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="btn-pill btn-glass min-h-11 px-3.5 text-[length:var(--fs-12-5)] disabled:cursor-not-allowed disabled:opacity-50">
      {children}
    </button>
  )
}
