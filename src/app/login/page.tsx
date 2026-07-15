import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { roleHome } from '@/lib/role-home'
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect(roleHome(session.user.role))
  const { reset } = await searchParams
  return <LoginForm justReset={reset === '1'} />
}
