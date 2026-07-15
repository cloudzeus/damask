import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { roleHome } from '@/lib/role-home'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect(roleHome(session.user.role))
  return <LoginForm />
}
