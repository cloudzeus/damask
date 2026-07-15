'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordReset, type ForgotPasswordState } from './actions'

const initialState: ForgotPasswordState = {}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState)

  return (
    <div className="auth-card glass stagger">
      <span className="wordmark">DAMASK</span>
      <p className="sub">Ανάκτηση κωδικού</p>

      {state.submitted ? (
        <div className="notice success" role="status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{state.message}</span>
        </div>
      ) : (
        <form action={action}>
          <div className="field">
            <label htmlFor="email">Email λογαριασμού</label>
            <div className="inwrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <path d="m2 7 10 6 10-6" />
              </svg>
              <input id="email" name="email" type="email" placeholder="you@company.gr" required />
            </div>
            <div className="help">Θα σου στείλουμε σύνδεσμο επαναφοράς που ισχύει για 30 λεπτά</div>
          </div>

          <button type="submit" className="btn-pill btn-navy" style={{ width: '100%', marginTop: 8 }} disabled={pending}>
            {pending ? 'Αποστολή…' : 'Αποστολή συνδέσμου'} <span className="arr">→</span>
          </button>
        </form>
      )}

      <p className="auth-foot">
        <Link href="/login">← Πίσω στη σύνδεση</Link>
      </p>

      <div className="auth-secure">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="4" y="10" width="16" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        Δεν αποκαλύπτουμε αν το email υπάρχει — έλεγξε τα εισερχόμενά σου
      </div>
    </div>
  )
}
