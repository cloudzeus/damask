import type { Session } from 'next-auth'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'

/** Για server components/actions: επιστρέφει session ή πετάει. */
export async function requirePermission(permission: string): Promise<Session> {
  const session = await auth()
  if (!can(session, permission)) {
    throw new Error(`Forbidden: απαιτείται ${permission}`)
  }
  return session!
}
