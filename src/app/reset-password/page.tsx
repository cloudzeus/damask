import Link from 'next/link'
import { verifyResetToken } from '@/lib/password-reset'
import { ResetForm } from './reset-form'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const result = token ? await verifyResetToken(token) : ({ ok: false, reason: 'not_found' } as const)

  return (
    <div className="app-canvas app-canvas--deep">
      <div className="auth-wrap">
        <div
          className="auth-decor dots float-a"
          style={{ width: 195, height: 124, top: '11%', right: '15%', transform: 'rotate(5deg)' }}
          aria-hidden
        />
        <div
          className="auth-decor float-b"
          style={{ width: 130, height: 160, bottom: '12%', left: '14%', transform: 'rotate(-6deg)' }}
          aria-hidden
        />

        <div className="auth-card glass stagger">
          <span className="wordmark">DAMASK</span>
          <p className="sub">Νέος κωδικός</p>

          {result.ok ? (
            <ResetForm token={token!} />
          ) : (
            <>
              <div className="notice" role="alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
                <span>Ο σύνδεσμος έχει λήξει ή έχει ήδη χρησιμοποιηθεί. Ζήτησε νέο σύνδεσμο επαναφοράς.</span>
              </div>
              <Link href="/forgot-password" className="btn-pill btn-navy" style={{ width: '100%' }}>
                Νέο αίτημα επαναφοράς <span className="arr">→</span>
              </Link>
            </>
          )}

          <p className="auth-foot">
            <Link href="/login">← Πίσω στη σύνδεση</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
