import Link from 'next/link'
import { verifyResetToken } from '@/lib/password-reset'
import { PortalResetForm } from '../../_components/auth-forms'

export const metadata = { title: 'Νέος κωδικός — Portal World Wide Associates' }

export default async function PortalReset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const ok = token ? (await verifyResetToken(token)).ok : false
  if (!ok) {
    return (
      <div className="p-auth-form">
        <h1>Ο σύνδεσμος έληξε</h1>
        <p className="p-muted">Ο σύνδεσμος ισχύει 30 λεπτά και μία μόνο φορά. Ζητήστε νέο — θα έρθει αμέσως στο email σας.</p>
        <Link className="p-btn" href="/portal/xechasa-kodiko">Νέος σύνδεσμος</Link>
        <p className="p-auth-links"><Link href="/portal/syndesi">← Πίσω στη σύνδεση</Link></p>
      </div>
    )
  }
  return <PortalResetForm token={token!} />
}
