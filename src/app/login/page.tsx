import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { roleHome } from '@/lib/role-home'
import { AuthShell } from '../portal/_components/auth-shell'
import { PortalLoginForm } from '../portal/_components/auth-forms'

export const metadata = { title: 'Σύνδεση — World Wide Associates', robots: { index: false, follow: false } }

/** Ενιαία σύνδεση (ύφος δημόσιου site): ο ρόλος αποφασίζει τον προορισμό — πελάτες → /portal, προσωπικό → /dashboard. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const session = await auth()
  if (session?.user) redirect(roleHome(session.user.role, session.user.portalHome))
  const { reset } = await searchParams
  return <AuthShell><PortalLoginForm justReset={reset === '1'} forgotHref="/forgot-password" general /></AuthShell>
}
