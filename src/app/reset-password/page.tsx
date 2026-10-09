import Link from 'next/link'
import { verifyResetToken } from '@/lib/password-reset'
import { AuthShell } from '../portal/_components/auth-shell'
import { PortalResetForm } from '../portal/_components/auth-forms'

export const metadata = { title: 'Νέος κωδικός — World Wide Associates', robots: { index: false, follow: false } }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const ok = token ? (await verifyResetToken(token)).ok : false
  return (
    <AuthShell>
      {ok ? <PortalResetForm token={token!} /> : (
        <div className="p-auth-form">
          <h1>Ο σύνδεσμος έληξε</h1>
          <p className="p-muted">Ο σύνδεσμος ισχύει 30 λεπτά και μία μόνο φορά. Ζητήστε νέο — θα έρθει αμέσως στο email σας.</p>
          <Link className="p-btn" href="/forgot-password">Νέος σύνδεσμος</Link>
          <p className="p-auth-links"><Link href="/login">← Πίσω στη σύνδεση</Link></p>
        </div>
      )}
    </AuthShell>
  )
}
