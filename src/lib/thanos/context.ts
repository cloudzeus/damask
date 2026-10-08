import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * Ποιος μιλά με τον Thanos:
 *  • STAFF — χρήστης της εφαρμογής (δικαιώματα ρόλου).
 *  • CUSTOMER — επαφή πελάτη στο portal (scope: ο πελάτης της· όλα τα έργα αν «κεντρική», αλλιώς τα συνδεδεμένα).
 */
export type ThanosContext =
  | { mode: 'STAFF'; userId: string; name: string; permissions: Set<string> }
  | { mode: 'CUSTOMER'; userId: string; name: string; contactId: string; trdrId: string; companyName: string; applicationIds: string[] }

export type PageContext = { path?: string; trdrId?: string | null; programId?: string | null; applicationId?: string | null }

export async function resolveThanosContext(): Promise<ThanosContext | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const u = session.user as { id: string; name?: string | null; permissions?: string[]; portalHome?: boolean }
  if (!u.portalHome) {
    return { mode: 'STAFF', userId: u.id, name: u.name ?? 'Χρήστης', permissions: new Set(u.permissions ?? []) }
  }
  const contact = await prisma.contact.findFirst({
    where: { userId: u.id },
    select: { id: true, name: true, trdrId: true, portalAllPrograms: true, trdr: { select: { NAME: true } } },
  })
  if (!contact) return null
  const apps = await prisma.programApplication.findMany({
    where: contact.portalAllPrograms ? { trdrId: contact.trdrId } : { trdrId: contact.trdrId, contactLinks: { some: { contactId: contact.id } } },
    select: { id: true },
  })
  return {
    mode: 'CUSTOMER', userId: u.id, name: contact.name, contactId: contact.id, trdrId: contact.trdrId,
    companyName: contact.trdr?.NAME ?? '', applicationIds: apps.map(a => a.id),
  }
}

export function can(ctx: ThanosContext, permission: string): boolean {
  return ctx.mode === 'STAFF' && ctx.permissions.has(permission)
}
