'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck, Mail, Loader2, CheckCircle2, RefreshCw } from 'lucide-react'
import { startLeadRequest, verifyLeadOtp, resendLeadOtp, type EligibleProgram } from '@/lib/public-lead/actions'
import { NEWSLETTER_CONSENT_TEXT } from '@/lib/public-lead/consent'

type Step = 'form' | 'otp' | 'done'

export function EligibilityWizard() {
  const [step, setStep] = useState<Step>('form')
  const [pending, startTransition] = useTransition()

  // form state
  const [afm, setAfm] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [newsletter, setNewsletter] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'afm' | 'email' | 'phone', string>>>({})

  // shared
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)

  // otp
  const [code, setCode] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [resent, setResent] = useState(false)

  // result
  const [eligible, setEligible] = useState<EligibleProgram[]>([])

  function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const res = await startLeadRequest({ afm, email, phone, newsletterOptIn: newsletter })
      if (!res.ok) {
        setError(res.error ?? 'Κάτι πήγε στραβά.')
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }
      setRequestId(res.requestId ?? null)
      setCompanyName(res.companyName ?? null)
      setStep('otp')
    })
  }

  function submitOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!requestId) return
    setError(null)
    startTransition(async () => {
      const res = await verifyLeadOtp({ requestId, code })
      if (!res.ok) {
        setError(res.error ?? 'Λάθος κωδικός.')
        setRemaining(res.remainingAttempts ?? null)
        return
      }
      setEligible(res.eligible ?? [])
      setCompanyName(res.companyName ?? companyName)
      setStep('done')
    })
  }

  function resend() {
    if (!requestId) return
    setError(null)
    setResent(false)
    startTransition(async () => {
      const res = await resendLeadOtp(requestId)
      if (!res.ok) setError(res.error ?? 'Δεν ήταν δυνατή η αποστολή.')
      else {
        setResent(true)
        setCode('')
        setRemaining(null)
      }
    })
  }

  return (
    <div style={cardStyle}>
      <Stepper step={step} />

      {step === 'form' && (
        <form onSubmit={submitForm} style={{ display: 'grid', gap: '0.85rem' }}>
          <p style={leadStyle}>
            Συμπλήρωσε τα στοιχεία σου και θα βρούμε άμεσα σε ποια ενεργά επιδοτούμενα προγράμματα
            μπορεί να ενταχθεί η επιχείρησή σου.
          </p>
          <Field label="ΑΦΜ" error={fieldErrors.afm}>
            <input
              inputMode="numeric" autoComplete="off" value={afm}
              onChange={e => setAfm(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
              placeholder="9 ψηφία" style={inputStyle} required
            />
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            <input
              type="email" autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="name@company.gr" style={inputStyle} required
            />
          </Field>
          <Field label="Τηλέφωνο" error={fieldErrors.phone}>
            <input
              type="tel" autoComplete="tel" value={phone}
              onChange={e => setPhone(e.target.value)} placeholder="π.χ. 2101234567" style={inputStyle} required
            />
          </Field>

          <label style={consentStyle}>
            <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} style={{ marginTop: '0.2rem', width: '1.05rem', height: '1.05rem' }} />
            <span>{NEWSLETTER_CONSENT_TEXT}</span>
          </label>

          {error && <Alert>{error}</Alert>}

          <button type="submit" disabled={pending} style={primaryBtn}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Έλεγχος επιλεξιμότητας
          </button>
          <p style={fineStyle}>Θα σου στείλουμε 6ψήφιο κωδικό επιβεβαίωσης στο email σου.</p>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={submitOtp} style={{ display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', color: 'var(--muted-foreground, #64748b)' }}>
            <Mail size={18} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              Στείλαμε έναν 6ψήφιο κωδικό στο <b style={{ color: 'var(--foreground, #0f172a)' }}>{email}</b>
              {companyName ? <> για <b style={{ color: 'var(--foreground, #0f172a)' }}>{companyName}</b></> : null}.
            </p>
          </div>
          <Field label="Κωδικός επιβεβαίωσης">
            <input
              inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={e => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              placeholder="______" style={{ ...inputStyle, letterSpacing: '0.5rem', textAlign: 'center', fontSize: '1.4rem', fontWeight: 700 }} required
            />
          </Field>

          {resent && <p style={{ ...fineStyle, color: 'var(--success, #059669)' }}>Στάλθηκε νέος κωδικός.</p>}
          {remaining != null && remaining > 0 && <p style={fineStyle}>Απομένουν {remaining} προσπάθειες.</p>}
          {error && <Alert>{error}</Alert>}

          <button type="submit" disabled={pending || code.length !== 6} style={primaryBtn}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Επιβεβαίωση
          </button>
          <button type="button" onClick={resend} disabled={pending} style={ghostBtn}>
            <RefreshCw size={14} /> Νέος κωδικός
          </button>
        </form>
      )}

      {step === 'done' && (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <span style={successBadge}><CheckCircle2 size={18} /></span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-display)' }}>Ολοκληρώθηκε ο έλεγχος</h3>
              {companyName && <p style={{ margin: '0.1rem 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground, #64748b)' }}>{companyName}</p>}
            </div>
          </div>

          {eligible.length > 0 ? (
            <>
              <p style={leadStyle}>
                Η επιχείρησή σου φαίνεται <b>επιλέξιμη</b> σε {eligible.length}{' '}
                {eligible.length === 1 ? 'ενεργό πρόγραμμα' : 'ενεργά προγράμματα'}:
              </p>
              <ul style={{ display: 'grid', gap: '0.6rem', margin: 0, padding: 0, listStyle: 'none' }}>
                {eligible.map(p => (
                  <li key={p.id} style={programCard}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.title}</div>
                    {p.matchedKads.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                        {p.matchedKads.slice(0, 8).map(k => (
                          <span key={k} className="badge-pill badge-info" lang="el">{k}</span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={leadStyle}>
              Αυτή τη στιγμή δεν εντοπίσαμε ενεργό πρόγραμμα που να ταιριάζει πλήρως. Η ομάδα μας έλαβε το
              αίτημά σου και θα επικοινωνήσει μαζί σου για εναλλακτικές δυνατότητες.
            </p>
          )}
          <p style={fineStyle}>Ένας σύμβουλός μας θα επικοινωνήσει σύντομα μαζί σου με τα επόμενα βήματα.</p>
        </div>
      )}
    </div>
  )
}

function Stepper({ step }: { step: Step }) {
  const idx = step === 'form' ? 0 : step === 'otp' ? 1 : 2
  const labels = ['Στοιχεία', 'Επιβεβαίωση', 'Αποτέλεσμα']
  return (
    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.1rem' }}>
      {labels.map((l, i) => (
        <div key={l} style={{ flex: 1, display: 'grid', gap: '0.35rem' }}>
          <span style={{ height: 4, borderRadius: 999, background: i <= idx ? 'var(--coral, #ff6b57)' : 'var(--border, #e2e8f0)' }} />
          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: i <= idx ? 'var(--foreground, #0f172a)' : 'var(--muted-foreground, #94a3b8)', fontWeight: 600 }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted-foreground, #64748b)' }}>{label}</span>
      {children}
      {error && <span style={{ fontSize: '0.72rem', color: 'var(--coral, #e11d48)' }}>{error}</span>}
    </label>
  )
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{ fontSize: '0.82rem', color: 'var(--coral, #e11d48)', background: 'color-mix(in srgb, var(--coral, #e11d48) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--coral, #e11d48) 30%, transparent)', borderRadius: '0.5rem', padding: '0.55rem 0.7rem' }}>
      {children}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card, #fff)', color: 'var(--foreground, #0f172a)', border: '1px solid var(--border, #e2e8f0)',
  borderRadius: '1rem', padding: '1.5rem', maxWidth: '30rem', width: '100%', boxShadow: '0 18px 50px rgba(2,20,32,0.28)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: '2.9rem', padding: '0 0.8rem', borderRadius: '0.6rem',
  border: '1px solid var(--border, #cbd5e1)', background: 'var(--background, #f8fafc)', color: 'inherit', fontSize: '0.95rem',
}
const leadStyle: React.CSSProperties = { margin: 0, fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--muted-foreground, #475569)' }
const fineStyle: React.CSSProperties = { margin: 0, fontSize: '0.75rem', color: 'var(--muted-foreground, #94a3b8)', textAlign: 'center' }
const consentStyle: React.CSSProperties = { display: 'flex', gap: '0.55rem', alignItems: 'flex-start', fontSize: '0.76rem', lineHeight: 1.45, color: 'var(--muted-foreground, #475569)', cursor: 'pointer' }
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: '2.9rem',
  borderRadius: '999px', border: 'none', background: 'var(--coral, #16323F)', color: '#fff', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer',
}
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minHeight: '2.6rem',
  borderRadius: '999px', border: '1px solid var(--border, #cbd5e1)', background: 'transparent', color: 'inherit', fontSize: '0.82rem', cursor: 'pointer',
}
const successBadge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '2.2rem', height: '2.2rem', borderRadius: '999px', background: 'color-mix(in srgb, var(--success, #059669) 15%, transparent)', color: 'var(--success, #059669)' }
const programCard: React.CSSProperties = { border: '1px solid var(--border, #e2e8f0)', borderRadius: '0.7rem', padding: '0.75rem 0.85rem', background: 'var(--background, #f8fafc)' }
