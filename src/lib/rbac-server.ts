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

/**
 * Για ενέργειες που απαιτούν ρητά ρόλο SUPER_ADMIN (όχι απλώς ένα permission —
 * π.χ. ο ADMIN έχει user.manage/costs.view αλλά ΔΕΝ είναι super admin). Πρώτα
 * ελέγχει το `permission` (ότι βλέπει καν τη σελίδα), μετά το όνομα ρόλου.
 */
export async function requireSuperAdmin(permission: string): Promise<Session> {
  const session = await requirePermission(permission)
  if (session.user.role !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: απαιτείται ρόλος SUPER_ADMIN')
  }
  return session
}
