import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { roleHome } from '@/lib/role-home'
import { PortalLoginForm } from '../../_components/auth-forms'

export const metadata = { title: 'Σύνδεση — Portal World Wide Associates' }

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const session = await auth()
  if (session?.user) redirect(roleHome(session.user.role, session.user.portalHome))
  const { reset } = await searchParams
  return <PortalLoginForm justReset={reset === '1'} />
}
