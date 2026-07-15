import type { Session } from 'next-auth'

export function can(session: Session | null, permission: string): boolean {
  return !!session?.user?.permissions?.includes(permission)
}
