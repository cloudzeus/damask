'use client'

import { useActionState, useState } from 'react'
import { resetPassword, type ResetPasswordState } from './actions'

const initialState: ResetPasswordState = {}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initialState)
  const [show1, setShow1] = useState(false)
  const [show2, setShow2] = useState(false)

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />

      <div className="field">
        <label htmlFor="password">Νέος κωδικός</label>
        <div className="inwrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="3" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <input
            id="password"
            name="password"
            type={show1 ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button
            type="button"
            className="eye"
            aria-label={show1 ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
            aria-pressed={show1}
            onClick={() => setShow1(v => !v)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
        <div className="help">Τουλάχιστον 8 χαρακτήρες</div>
      </div>

      <div className="field">
        <label htmlFor="confirm">Επιβεβαίωση κωδικού</label>
        <div className="inwrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="3" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <input
            id="confirm"
            name="confirm"
            type={show2 ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button
            type="button"
            className="eye"
            aria-label={show2 ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
            aria-pressed={show2}
            onClick={() => setShow2(v => !v)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      {state.error && <p className="form-error" role="alert">{state.error}</p>}

      <button type="submit" className="btn-pill btn-navy" style={{ width: '100%', marginTop: 8 }} disabled={pending}>
        {pending ? 'Αποθήκευση…' : 'Αλλαγή κωδικού'} <span className="arr">→</span>
      </button>
    </form>
  )
}
