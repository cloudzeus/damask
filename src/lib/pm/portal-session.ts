import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/rbac'

/**
 * (Plain module.) Η επαφή-πελάτης του τρέχοντος session για το portal + το scope της.
 * Με `previewContactId` ένας χρήστης της εφαρμογής (customer.view) βλέπει το portal
 * ΑΚΡΙΒΩΣ όπως η επαφή — μόνο ανάγνωση (preview: true → καμία εγγραφή).
 */
const CONTACT_SELECT = { id: true, name: true, trdrId: true, portalAllPrograms: true, trdr: { select: { NAME: true } } } as const

export type PortalContact = { id: string; name: string; trdrId: string; portalAllPrograms: boolean; trdr: { NAME: string } | null; preview: boolean }

export async function resolvePortalContact(previewContactId?: string): Promise<PortalContact | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (previewContactId) {
    if (session.user.portalHome || !can(session, 'customer.view')) return null
    const c = await prisma.contact.findUnique({ where: { id: previewContactId }, select: CONTACT_SELECT })
    return c ? { ...c, preview: true } : null
  }
  const contact = await prisma.contact.findFirst({ where: { userId: session.user.id }, select: CONTACT_SELECT })
  return contact ? { ...contact, preview: false } : null
}

/** Τα έργα που βλέπει η επαφή (κεντρική → όλα του πελάτη· αλλιώς τα συνδεδεμένα). */
export function portalApplicationsWhere(c: PortalContact) {
  return c.portalAllPrograms ? { trdrId: c.trdrId } : { trdrId: c.trdrId, contactLinks: { some: { contactId: c.id } } }
}
