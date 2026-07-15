'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { requestAccess, type RegisterState } from './actions'

const initialState: RegisterState = {}

export function RegisterForm() {
  const [state, action, pending] = useActionState(requestAccess, initialState)
  const [role, setRole] = useState<'CUSTOMER' | 'ARCHITECT' | 'SUPPLIER'>('CUSTOMER')

  if (state.success) {
    return (
      <div className="auth-card glass stagger">
        <span className="wordmark">DAMASK</span>
        <p className="sub">Αίτημα πρόσβασης B2B</p>
        <div className="notice success" role="status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>Το αίτημα στάλθηκε! Θα λάβεις email μόλις εγκριθεί.</span>
        </div>
        <p className="auth-foot">
          <Link href="/login">← Πίσω στη σύνδεση</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="auth-card glass stagger" style={{ maxWidth: 528 }}>
      <span className="wordmark">DAMASK</span>
      <p className="sub">Αίτημα πρόσβασης B2B</p>

      <form action={action}>
        <input type="hidden" name="type" value={role} />

        <div className="role-pick">
          <button
            type="button"
            className={`opt${role === 'CUSTOMER' ? ' on' : ''}`}
            aria-pressed={role === 'CUSTOMER'}
            onClick={() => setRole('CUSTOMER')}
          >
            <b>🏢 Πελάτης</b>
            <small>Αγοράζω για την επιχείρησή μου</small>
          </button>
          <button
            type="button"
            className={`opt${role === 'ARCHITECT' ? ' on' : ''}`}
            aria-pressed={role === 'ARCHITECT'}
            onClick={() => setRole('ARCHITECT')}
          >
            <b>📐 Αρχιτέκτονας</b>
            <small>Παραγγέλνω για λογαριασμό πελατών μου</small>
          </button>
          <button
            type="button"
            className={`opt${role === 'SUPPLIER' ? ' on' : ''}`}
            aria-pressed={role === 'SUPPLIER'}
            onClick={() => setRole('SUPPLIER')}
          >
            <b>🏭 Προμηθευτής</b>
            <small>Προμηθεύω προϊόντα στην Damask</small>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <div className="field">
            <label htmlFor="name">Ονοματεπώνυμο</label>
            <div className="inwrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a7 7 0 0 1 16 0v1" />
              </svg>
              <input id="name" name="name" placeholder="π.χ. Μαρία Παπαδάκη" required />
            </div>
            {state.fieldErrors?.name && <div className="error">{state.fieldErrors.name}</div>}
          </div>

          <div className="field">
            <label htmlFor="phone">Τηλέφωνο</label>
            <div className="inwrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z" />
              </svg>
              <input id="phone" name="phone" type="tel" placeholder="69…" required />
            </div>
            {state.fieldErrors?.phone && <div className="error">{state.fieldErrors.phone}</div>}
          </div>

          <div className="field">
            <label htmlFor="company">Επωνυμία εταιρείας</label>
            <div className="inwrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
              </svg>
              <input id="company" name="company" required />
            </div>
            {state.fieldErrors?.company && <div className="error">{state.fieldErrors.company}</div>}
          </div>

          <div className="field">
            <label htmlFor="afm">ΑΦΜ</label>
            <div className="inwrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h6" />
              </svg>
              <input id="afm" name="afm" inputMode="numeric" placeholder="9 ψηφία" required />
            </div>
            {state.fieldErrors?.afm && <div className="error">{state.fieldErrors.afm}</div>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="inwrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="2" y="4" width="20" height="16" rx="3" />
              <path d="m2 7 10 6 10-6" />
            </svg>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="help">Εδώ θα λάβεις την έγκριση και τα στοιχεία σύνδεσης</div>
          {state.fieldErrors?.email && <div className="error">{state.fieldErrors.email}</div>}
        </div>

        <div className="notice">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>Το αίτημα εγκρίνεται από την ομάδα μας εντός 1 εργάσιμης. Οι τιμές σου ενεργοποιούνται αυτόματα από το SoftOne.</span>
        </div>

        {state.error && <p className="form-error" role="alert">{state.error}</p>}

        <button type="submit" className="btn-pill btn-navy" style={{ width: '100%' }} disabled={pending}>
          {pending ? 'Υποβολή…' : 'Υποβολή αιτήματος'} <span className="arr">→</span>
        </button>
      </form>

      <p className="auth-foot">
        Έχεις ήδη λογαριασμό; <Link href="/login">Σύνδεση</Link>
      </p>
    </div>
  )
}
