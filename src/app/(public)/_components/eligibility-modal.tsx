'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ShieldCheck, Mail, CheckCircle2, RefreshCw, X, AlertCircle } from 'lucide-react'
import { startLeadRequest, verifyLeadOtp, resendLeadOtp, type EligibleProgram } from '@/lib/public-lead/actions'
import { NEWSLETTER_CONSENT_TEXT } from '@/lib/public-lead/consent'

/**
 * WWA public «Έλεγχος επιλεξιμότητας» σε modal με branded preloader. Ανοίγει με
 * openEligibility() (custom event) από οποιοδήποτε CTA, ή με hash #eligibility.
 * Ροή: στοιχεία (ΑΦΜ/email/τηλ) → ΑΑΔΕ lookup + OTP → επιβεβαίωση → αξιολόγηση
 * ενεργών προγραμμάτων. Server actions ίδια με τη σελίδα /eligibility.
 */
const EVENT = 'wwa:eligibility'
export function openEligibility() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
}

type Step = 'form' | 'otp' | 'done'
type Phase = 'idle' | 'lookup' | 'verify'

const LOOKUP_MSGS = ['Σύνδεση με την ΑΑΔΕ…', 'Ανάκτηση επωνυμίας & δραστηριότητας…', 'Αποστολή κωδικού επιβεβαίωσης…']
const VERIFY_MSGS = ['Επιβεβαίωση κωδικού…', 'Εντοπισμός ΚΑΔ & περιφέρειας…', 'Έλεγχος ενεργών προγραμμάτων…', 'Υπολογισμός επιλεξιμότητας…']

export function EligibilityModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [phase, setPhase] = useState<Phase>('idle')
  const [pending, startTransition] = useTransition()

  const [afm, setAfm] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [newsletter, setNewsletter] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'afm' | 'email' | 'phone', string>>>({})

  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [resent, setResent] = useState(false)
  const [eligible, setEligible] = useState<EligibleProgram[]>([])

  const dialogRef = useRef<HTMLDivElement>(null)

  function reset() {
    setStep('form'); setPhase('idle'); setAfm(''); setEmail(''); setPhone(''); setNewsletter(true)
    setFieldErrors({}); setError(null); setRequestId(null); setCompanyName(null); setCode(''); setRemaining(null); setResent(false); setEligible([])
  }

  // Open via event ή hash· lock scroll· Esc για κλείσιμο.
  useEffect(() => {
    const onOpen = () => { reset(); setOpen(true) }
    window.addEventListener(EVENT, onOpen)
    if (window.location.hash === '#eligibility') onOpen()
    return () => window.removeEventListener(EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) setOpen(false) }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, pending])

  function submitForm(e: React.FormEvent) {
    e.preventDefault(); setError(null); setFieldErrors({}); setPhase('lookup')
    startTransition(async () => {
      const res = await startLeadRequest({ afm, email, phone, newsletterOptIn: newsletter })
      setPhase('idle')
      if (!res.ok) { setError(res.error ?? 'Κάτι πήγε στραβά.'); if (res.fieldErrors) setFieldErrors(res.fieldErrors); return }
      setRequestId(res.requestId ?? null); setCompanyName(res.companyName ?? null); setStep('otp')
    })
  }

  function submitOtp(e: React.FormEvent) {
    e.preventDefault(); if (!requestId) return; setError(null); setPhase('verify')
    startTransition(async () => {
      const res = await verifyLeadOtp({ requestId, code })
      setPhase('idle')
      if (!res.ok) { setError(res.error ?? 'Λάθος κωδικός.'); setRemaining(res.remainingAttempts ?? null); return }
      setEligible(res.eligible ?? []); setCompanyName(res.companyName ?? companyName); setStep('done')
    })
  }

  function resend() {
    if (!requestId) return; setError(null); setResent(false)
    startTransition(async () => {
      const res = await resendLeadOtp(requestId)
      if (!res.ok) setError(res.error ?? 'Δεν ήταν δυνατή η αποστολή.')
      else { setResent(true); setCode(''); setRemaining(null) }
    })
  }

  if (!open) return null

  const stepIdx = step === 'form' ? 0 : step === 'otp' ? 1 : 2
  const showPreloader = pending && phase !== 'idle'

  return (
    <div className="wwa-overlay" role="dialog" aria-modal="true" aria-label="Έλεγχος επιλεξιμότητας"
      onMouseDown={e => { if (e.target === e.currentTarget && !pending) setOpen(false) }}>
      <div className="wwa-modal" ref={dialogRef} tabIndex={-1} lang="el">
        <button className="close" aria-label="Κλείσιμο" onClick={() => { if (!pending) setOpen(false) }}><X size={18} /></button>

        {showPreloader ? (
          <Preloader key={phase} phase={phase} />
        ) : (
          <>
            <div className="wwa-steps" aria-hidden>
              {['Στοιχεία', 'Επιβεβαίωση', 'Αποτέλεσμα'].map((l, i) => (
                <div key={l} className={`s ${i <= stepIdx ? 'on' : ''}`}><span className="bar" /><span className="lab">{l}</span></div>
              ))}
            </div>

            {step === 'form' && (
              <form onSubmit={submitForm} style={{ display: 'grid', gap: 14 }}>
                <h3>Δωρεάν έλεγχος επιλεξιμότητας</h3>
                <p className="m-lead">Συμπληρώστε τα στοιχεία σας και θα βρούμε άμεσα σε ποια ενεργά επιδοτούμενα προγράμματα μπορεί να ενταχθεί η επιχείρησή σας.</p>
                <div className="field"><label htmlFor="el-afm">ΑΦΜ</label>
                  <input id="el-afm" className="input" inputMode="numeric" autoComplete="off" value={afm} onChange={e => setAfm(e.target.value.replace(/[^\d]/g, '').slice(0, 9))} placeholder="9 ψηφία" required />
                  {fieldErrors.afm && <span className="error">{fieldErrors.afm}</span>}
                </div>
                <div className="field"><label htmlFor="el-email">Email</label>
                  <input id="el-email" className="input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.gr" required />
                  {fieldErrors.email && <span className="error">{fieldErrors.email}</span>}
                </div>
                <div className="field"><label htmlFor="el-phone">Τηλέφωνο</label>
                  <input id="el-phone" className="input" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="π.χ. 2101234567" required />
                  {fieldErrors.phone && <span className="error">{fieldErrors.phone}</span>}
                </div>
                <label className="check" style={{ alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-2)' }}>
                  <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} />
                  <span>{NEWSLETTER_CONSENT_TEXT}</span>
                </label>
                {error && <ModalAlert>{error}</ModalAlert>}
                <button type="submit" className="btn btn-lg" style={{ width: '100%' }} disabled={pending}><ShieldCheck size={17} /> Έλεγχος επιλεξιμότητας</button>
                <p className="m-fine">Θα σας στείλουμε 6ψήφιο κωδικό επιβεβαίωσης στο email σας.</p>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={submitOtp} style={{ display: 'grid', gap: 14 }}>
                <h3>Επιβεβαίωση</h3>
                <p className="m-lead" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Mail size={18} style={{ flex: 'none', marginTop: 2, color: 'var(--brand)' }} />
                  <span>Στείλαμε 6ψήφιο κωδικό στο <b style={{ color: 'var(--fg-1)' }}>{email}</b>{companyName ? <> για <b style={{ color: 'var(--fg-1)' }}>{companyName}</b></> : null}.</span>
                </p>
                <div className="field"><label htmlFor="el-code">Κωδικός επιβεβαίωσης</label>
                  <input id="el-code" className="otp-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))} placeholder="••••••" required />
                </div>
                {resent && <p className="m-fine" style={{ color: 'var(--success-500)' }}>Στάλθηκε νέος κωδικός.</p>}
                {remaining != null && remaining > 0 && <p className="m-fine">Απομένουν {remaining} προσπάθειες.</p>}
                {error && <ModalAlert>{error}</ModalAlert>}
                <button type="submit" className="btn btn-lg" style={{ width: '100%' }} disabled={pending || code.length !== 6}><CheckCircle2 size={17} /> Επιβεβαίωση</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={pending} style={{ justifySelf: 'center' }}><RefreshCw size={14} /> Νέος κωδικός</button>
              </form>
            )}

            {step === 'done' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 999, background: 'var(--success-100)', color: 'var(--success-500)', flex: 'none' }}><CheckCircle2 size={22} /></span>
                  <div><h3 style={{ margin: 0 }}>Ολοκληρώθηκε ο έλεγχος</h3>{companyName && <p style={{ margin: '2px 0 0', fontSize: 14, color: 'var(--fg-3)' }}>{companyName}</p>}</div>
                </div>
                {eligible.length > 0 ? (
                  <>
                    <p className="m-lead">Η επιχείρησή σας φαίνεται <b style={{ color: 'var(--fg-1)' }}>επιλέξιμη</b> σε {eligible.length} {eligible.length === 1 ? 'ενεργό πρόγραμμα' : 'ενεργά προγράμματα'}:</p>
                    <ul className="elig-result">
                      {eligible.map(p => (
                        <li key={p.id}>
                          <div style={{ fontWeight: 700 }}>{p.title}</div>
                          {p.matchedKads.length > 0 && (
                            <div className="kads">{p.matchedKads.slice(0, 8).map(k => <span key={k} className="badge badge-brand badge-nodot">{k}</span>)}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="m-lead">Αυτή τη στιγμή δεν εντοπίσαμε ενεργό πρόγραμμα που να ταιριάζει πλήρως. Η ομάδα μας έλαβε το αίτημά σας και θα επικοινωνήσει μαζί σας για εναλλακτικές δυνατότητες.</p>
                )}
                <button type="button" className="btn btn-lg" style={{ width: '100%' }} onClick={() => setOpen(false)}>Κλείσιμο</button>
                <p className="m-fine">Ένας σύμβουλός μας θα επικοινωνήσει σύντομα μαζί σας με τα επόμενα βήματα.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ModalAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="alert alert-danger" style={{ fontSize: 14 }}>
      <AlertCircle size={18} /><span>{children}</span>
    </div>
  )
}

function Preloader({ phase }: { phase: Phase }) {
  const msgs = phase === 'verify' ? VERIFY_MSGS : LOOKUP_MSGS
  // key={phase} στον caller → fresh mount ανά φάση, οπότε i ξεκινά από 0 χωρίς
  // synchronous setState μέσα σε effect (react-hooks/set-state-in-effect).
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(prev => (prev + 1) % msgs.length), 1400)
    return () => clearInterval(t)
  }, [msgs.length])
  return (
    <div className="wwa-preloader" aria-live="polite" aria-busy="true">
      <div className="wwa-spinner" />
      <div className="pl-title">{phase === 'verify' ? 'Έλεγχος επιλεξιμότητας' : 'Εντοπισμός στοιχείων'}</div>
      <div className="pl-msg">{msgs[i]}</div>
      <div className="pl-dots" aria-hidden><i /><i /><i /></div>
    </div>
  )
}
