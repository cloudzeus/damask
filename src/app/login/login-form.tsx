'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { loginAction } from './actions'

export function LoginForm({ justReset = false }: { justReset?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, {})
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="app-canvas app-canvas--deep">
      <div className="auth-wrap">
        <div
          className="auth-decor dots float-a"
          style={{ width: 210, height: 138, top: '17%', left: '13%', transform: 'rotate(-7deg)' }}
          aria-hidden
        />
        <div
          className="auth-decor float-b"
          style={{ width: 165, height: 195, bottom: '14%', right: '12%', transform: 'rotate(6deg)' }}
          aria-hidden
        />
        <div
          className="auth-decor dots float-c"
          style={{
            width: 90,
            height: 90,
            top: '24%',
            right: '22%',
            transform: 'rotate(12deg)',
            borderRadius: 99,
          }}
          aria-hidden
        />

        <div className="auth-card glass stagger">
          <span className="wordmark">DAMASK</span>
          <p className="sub">Product Information Management</p>

          {justReset && (
            <div className="notice success" role="status">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>Ο κωδικός άλλαξε — συνδέσου με τον νέο.</span>
            </div>
          )}

          <form action={action}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="inwrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="m2 7 10 6 10-6" />
                </svg>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@company.gr"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Κωδικός
                <Link href="/forgot-password" style={{ color: 'var(--info)', fontWeight: 700, textDecoration: 'none', fontSize: 12 }}>
                  Τον ξέχασες;
                </Link>
              </label>
              <div className="inwrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="4" y="10" width="16" height="11" rx="3" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="eye"
                  aria-label={showPassword ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(v => !v)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                    {showPassword ? (
                      <>
                        <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 7 10 7a17.2 17.2 0 0 1-2.16 3.19M6.6 6.6C3.6 8.4 2 12 2 12s3 7 10 7a9.3 9.3 0 0 0 4.15-.94" />
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                        <path d="M2 2l20 20" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {state.error && <p className="form-error" role="alert">{state.error}</p>}

            <button type="submit" className="btn-pill btn-navy" style={{ width: '100%', marginTop: 8 }} disabled={pending}>
              {pending ? 'Σύνδεση…' : 'Σύνδεση'} <span className="arr">→</span>
            </button>
          </form>

          <div className="divider">νέος συνεργάτης;</div>
          <Link href="/register" className="btn-pill btn-glass" style={{ width: '100%' }}>
            Αίτημα πρόσβασης B2B
          </Link>

          <p className="auth-foot">
            Μετά τη σύνδεση οδηγείσαι αυτόματα: προσωπικό → Dashboard · πελάτες &amp; αρχιτέκτονες → B2B Portal
          </p>

          <div className="auth-secure">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="4" y="10" width="16" height="11" rx="3" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Κρυπτογραφημένη σύνδεση · GDPR συμμόρφωση
          </div>
        </div>
      </div>
    </div>
  )
}
