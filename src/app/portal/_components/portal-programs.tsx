'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuUpload, LuCircleCheck, LuClock, LuLoaderCircle, LuFileText, LuCheck, LuMapPin, LuArrowRight,
  LuCalendarDays, LuMessageCircle, LuMail, LuSparkles, LuChevronDown, LuTriangleAlert,
} from 'react-icons/lu'
import { submitObligationUpload, type PortalApp } from '@/lib/pm/portal-contact'
import type { PortalDocCheck } from '@/lib/pm/portal-documents'

/** Ανέβασμα σε δύο βήματα: η AI διαβάζει το αρχείο → αν δεν είναι σίγουρα το σωστό, ο πελάτης αποφασίζει. */
export type UploadReview = { file: File; phase: 'checking' | 'review'; check: PortalDocCheck | null }

export const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(new Error('read'))
  r.readAsDataURL(file)
})

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

  const [reviews, setReviews] = React.useState<Record<string, UploadReview>>({})
  const setReview = (id: string, r: UploadReview | null) => setReviews(prev => { const n = { ...prev }; if (r) n[id] = r; else delete n[id]; return n })

  /** Ανέβασμα: ο server διαβάζει το αρχείο με AI και το δέχεται ΜΟΝΟ αν είναι το ζητούμενο έγγραφο της επιχείρησης. */
  async function handlePick(obligationId: string, file: File) {
    if (preview) { toast.info('Προεπισκόπηση — το ανέβασμα γίνεται μόνο από τον πελάτη.'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('Το αρχείο ξεπερνά τα 8MB.'); return }
    setReview(obligationId, { file, phase: 'checking', check: null })
    setBusyId(obligationId)
    try {
      const base64 = await fileToBase64(file)
      const res = await submitObligationUpload(obligationId, { filename: file.name, base64, mimeType: file.type || 'application/octet-stream' })
      if (res.ok) { setReview(obligationId, null); toast.success('Ελέγχθηκε και ανέβηκε — ευχαριστούμε!'); router.refresh(); return }
      const reason = res.reason && res.reason.includes(' ') ? res.reason : 'Το ανέβασμα απέτυχε. Δοκιμάστε ξανά ή στείλτε το στον σύμβουλό σας.'
      setReview(obligationId, { file, phase: 'review', check: { verdict: 'mismatch', message: reason, expectedName: null, detectedTypeId: null, detectedName: null, expiresAt: null, issuedAt: null } })
    } catch {
      setReview(obligationId, null)
      toast.error('Το ανέβασμα απέτυχε. Δοκιμάστε ξανά ή στείλτε το στον σύμβουλό σας.')
    } finally {
      setBusyId(null)
    }
  }

  if (applications.length === 0) {
    return <div className="p-empty"><p className="p-muted">Δεν υπάρχουν έργα διαθέσιμα για την επαφή σας ακόμη.</p></div>
  }

  const pendingTotal = applications.reduce((n, a) => n + a.obligations.filter(o => !isDone(o.status)).length, 0)

  return (
    <>
      {pendingTotal > 0 && (
        <div className="p-alert" role="status">
          <LuClock aria-hidden />
          <span><b>Χρειαζόμαστε {pendingTotal} {pendingTotal === 1 ? 'έγγραφο' : 'έγγραφα'} από εσάς</b> <span className="p-muted">— ανεβάστε τα παρακάτω, ώστε να προχωρήσει το έργο χωρίς καθυστέρηση.</span></span>
        </div>
      )}
      {applications.map(app => (
        <ProgramGuide key={app.applicationId} app={app} busyId={busyId} reviews={reviews} onPick={handlePick} onCancel={id => setReview(id, null)} preview={preview} />
      ))}
    </>
  )
}

const isDone = (s: string) => s === 'APPROVED' || s === 'SUBMITTED' || s === 'WAIVED'

function ProgramGuide({ app, busyId, reviews, onPick, onCancel, preview }: {
  app: PortalApp; busyId: string | null; reviews: Record<string, UploadReview>; preview: boolean
  onPick: (id: string, f: File) => void; onCancel: (id: string) => void
}) {
  const { journey, money } = app
  const todo = app.obligations.filter(o => !isDone(o.status))
  const done = app.obligations.filter(o => isDone(o.status))
  const current = journey.steps[journey.currentIndex]
  const program = `«${app.programTitle}»`

  return (
    <article className="p-card" aria-labelledby={`p-${app.applicationId}`}>
      <div className="p-card-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="p-kicker">ΠΡΟΓΡΑΜΜΑ</div>
          <h2 id={`p-${app.applicationId}`}>{app.programTitle}</h2>
        </div>
        <span className="p-badge">Βήμα {journey.currentIndex + 1} από {journey.steps.length} · {current.label}</span>
      </div>

      <div className="p-card-body">
        {/* Πορεία έργου */}
        <div>
          <ol className="p-steps" aria-label="Πορεία έργου">
            {journey.steps.map((s, i) => (
              <li key={s.key} className={s.state} aria-current={s.state === 'current' ? 'step' : undefined}>
                <span className="dot">{s.state === 'done' ? <LuCheck aria-label="ολοκληρώθηκε" /> : i + 1}</span>
                <span className="lbl">{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="p-now">
            <div className="t"><LuMapPin aria-hidden /> Πού βρισκόμαστε</div>
            <p>{journey.now}</p>
            {journey.next && <div className="next"><LuArrowRight aria-hidden /><span><b>Μετά:</b> {journey.next}</span></div>}
          </div>
        </div>

        {/* Τι χρειαζόμαστε από εσάς */}
        <div>
          <h3 className="p-h3">Τι χρειαζόμαστε από εσάς</h3>
          {todo.length === 0 ? (
            <p className="p-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><LuCircleCheck style={{ color: 'var(--p-success)', width: 18, height: 18 }} aria-hidden /> Τίποτα αυτή τη στιγμή — σας ευχαριστούμε!</p>
          ) : (
            <ul className="p-list">
              {todo.map(o => {
                const rejected = o.status === 'REJECTED'
                const rv = reviews[o.id]
                const busy = busyId === o.id || rv?.phase === 'checking'
                return (
                  <li key={o.id} style={{ flexWrap: 'wrap' }}>
                    <LuFileText className="ico" aria-hidden />
                    <div className="name">
                      {o.name}
                      <div className={`sub${rejected ? ' bad' : ''}`}>{rejected ? 'Χρειάζεται ξανά — δείτε το email του συμβούλου σας' : o.dueDate ? `Έως ${day(o.dueDate)}` : 'Εκκρεμεί'}</div>
                    </div>
                    <label className={`p-btn${preview ? ' p-btn-outline' : ''}`} aria-disabled={preview || busy}>
                      {busy ? <LuLoaderCircle className="spin" aria-hidden /> : <LuUpload aria-hidden />}
                      {rv?.phase === 'checking' ? 'Έλεγχος…' : rejected ? 'Ανεβάστε ξανά' : 'Ανεβάστε'}
                      <input type="file" className="sr-only" disabled={busy || preview} aria-label={`Ανέβασμα: ${o.name}`}
                        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(o.id, f); e.target.value = '' }} />
                    </label>
                    {rv && <ReviewBox review={rv} onCancel={() => onCancel(o.id)} />}
                  </li>
                )
              })}
            </ul>
          )}
          {app.openRequests > 0 && (
            <p className="p-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Υπάρχ{app.openRequests === 1 ? 'ει 1 αίτημα' : `ουν ${app.openRequests} αιτήματα`} εγγράφων με ξεχωριστό σύνδεσμο στο email σας.</p>
          )}
          {done.length > 0 && (
            <details className="p-done">
              <summary><LuChevronDown aria-hidden /> Έχετε στείλει {done.length} {done.length === 1 ? 'έγγραφο' : 'έγγραφα'}</summary>
              <ul>
                {done.map(o => (
                  <li key={o.id}><LuCircleCheck aria-hidden /><span style={{ flex: 1 }}>{o.name}</span><span className="p-badge ok">{o.statusLabel}</span></li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Η επένδυση σε αριθμούς */}
        {(money.budget != null || money.expensesCount > 0 || app.payments.length > 0) && (
          <div>
            <h3 className="p-h3">Η επένδυσή σας σε αριθμούς</h3>
            <div className="p-figs">
              <Figure label="Προϋπολογισμός" value={eur(money.budget)} />
              <Figure label={`Επιδότηση${money.rate != null ? ` (${money.rate}%)` : ''}`} value={eur(money.subsidy)} />
              <Figure label={`Δαπάνες (${money.expensesCount})`} value={eur(money.expensesAmount)} bar={money.budget ? money.expensesAmount / money.budget : null} hint={money.certifiedAmount ? `${eur(money.certifiedAmount)} πιστοποιημένες` : undefined} />
              <Figure label="Έχετε εισπράξει" value={eur(money.paidAmount)} bar={money.subsidy ? money.paidAmount / money.subsidy : null} />
            </div>
            {app.payments.length > 0 && (
              <ul className="p-pays">
                {app.payments.map(p => (
                  <li key={p.ordinal}>
                    <b>{p.title || `${p.ordinal}η δόση`}</b>
                    <span className="p-muted">{eur(p.amount)}</span>
                    <span className={`p-badge ${p.status === 'PAID' ? 'ok' : p.status === 'REJECTED' ? 'bad' : ''}`}>{p.statusLabel}{p.paidAt ? ` · ${day(p.paidAt)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Ημερομηνίες */}
        {(app.dates.deadline || app.dates.submittedAt || app.dates.nextDue || app.dates.durationMonths) && (
          <dl className="p-dates">
            {app.dates.deadline && <DateRow label="Προθεσμία υποβολής προγράμματος" value={day(app.dates.deadline)} />}
            {app.dates.submittedAt && <DateRow label="Η αίτηση υποβλήθηκε" value={day(app.dates.submittedAt)} />}
            {app.dates.nextDue && <DateRow label="Επόμενη προθεσμία εγγράφου" value={day(app.dates.nextDue)} />}
            {app.dates.durationMonths && <DateRow label="Διάρκεια υλοποίησης" value={`${app.dates.durationMonths} μήνες`} />}
          </dl>
        )}

        {/* Βοηθός */}
        <div className="p-assist">
          <div className="t"><LuSparkles aria-hidden /> Ρωτήστε τον βοηθό</div>
          <p>Απαντά για αυτό το έργο — με κείμενο ή φωνή, οποιαδήποτε ώρα.</p>
          <div className="chips">
            <button type="button" className="p-chip" disabled={preview} onClick={() => ask(`Θέλω να κάνω μια αγορά για το πρόγραμμα ${program}. Πώς ελέγχω αν είναι επιλέξιμη δαπάνη;`)}>Είναι επιλέξιμη μια αγορά;</button>
            <button type="button" className="p-chip" disabled={preview} onClick={() => ask(`Τι εκκρεμεί για να προχωρήσει το έργο μου στο πρόγραμμα ${program};`)}>Τι εκκρεμεί;</button>
            <button type="button" className="p-chip" disabled={preview} onClick={() => ask(`Εξήγησέ μου απλά τι ακολουθεί στο πρόγραμμα ${program} και τι πρέπει να κάνω εγώ.`)}>Τι ακολουθεί;</button>
            <button type="button" className="p-chip" disabled={preview} onClick={() => ask(`Θέλω να στείλω σύνδεσμο στον λογιστή μου για να ανεβάσει έγγραφα για το πρόγραμμα ${program}.`)}>Σύνδεσμος για τον λογιστή μου</button>
          </div>
        </div>

        {app.manager && (
          <p className="p-advisor" style={{ margin: 0 }}>
            <LuMessageCircle aria-hidden /> Σύμβουλός σας: <b style={{ color: 'var(--p-ink)' }}>{app.manager.name}</b>
            {app.manager.email && <a href={`mailto:${app.manager.email}`}><LuMail aria-hidden />{app.manager.email}</a>}
          </p>
        )}
      </div>
    </article>
  )
}

function Figure({ label, value, bar, hint }: { label: string; value: string; bar?: number | null; hint?: string }) {
  const pct = bar != null ? Math.max(0, Math.min(1, bar)) : null
  return (
    <div className="p-fig">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {pct != null && (
        <div className="bar" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><span style={{ width: `${pct * 100}%` }} /></div>
      )}
      {hint && <div className="h">{hint}</div>}
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: string | null }) {
  return <div><LuCalendarDays aria-hidden /><dt>{label}:</dt><dd>{value}</dd></div>
}

/** Αποτέλεσμα του ελέγχου AI κάτω από το έντυπο: «διαβάζει…» ή προειδοποίηση + επιλογές. */
export function ReviewBox({ review, onCancel }: { review: UploadReview; onCancel: () => void }) {
  if (review.phase === 'checking') {
    return <div className="p-review checking" role="status"><LuLoaderCircle className="spin" aria-hidden /> Ο έλεγχος AI διαβάζει το «{review.file.name}»…</div>
  }
  return (
    <div className="p-review bad" role="alert">
      <div className="msg"><LuTriangleAlert aria-hidden /><span><b>Δεν ανέβηκε.</b> {review.check?.message}</span></div>
      <div className="acts"><button type="button" className="p-btn p-btn-outline" onClick={onCancel}>Εντάξει — θα επιλέξω άλλο αρχείο</button></div>
    </div>
  )
}
