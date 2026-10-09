import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/rbac'

/**
 * (Plain module.) Η επαφή-πελάτης του τρέχοντος session για το portal + το scope της.
 *  • Με `previewContactId` ένας χρήστης της εφαρμογής (customer.view) βλέπει το portal ΑΚΡΙΒΩΣ όπως η επαφή (μόνο ανάγνωση).
 *  • Ένας χρήστης μπορεί να είναι επαφή σε ΠΟΛΛΕΣ επιχειρήσεις (π.χ. λογιστής): επαφές με Contact.userId ή με
 *    ίδιο email· η επιλεγμένη επιχείρηση κρατιέται σε cookie (`portal-company`).
 *  • Αυτόματη σύνδεση: επαφή με το email του χρήστη και χωρίς λογαριασμό → συνδέεται (Contact.userId).
 *  • Χρήστης-πελάτης με User.trdrId αλλά χωρίς επαφή → δημιουργείται «κεντρική» επαφή στην επιχείρηση.
 */
const CONTACT_SELECT = { id: true, name: true, trdrId: true, portalAllPrograms: true, userId: true, trdr: { select: { NAME: true } } } as const

export type PortalContact = { id: string; name: string; trdrId: string; portalAllPrograms: boolean; trdr: { NAME: string } | null; preview: boolean }
export type PortalCompany = { contactId: string; trdrId: string; name: string }

export const PORTAL_COMPANY_COOKIE = 'portal-company'

/** Όλες οι επιχειρήσεις στις οποίες ο χρήστης είναι επαφή (για τον επιλογέα εταιρείας). */
export async function portalCompanies(): Promise<PortalCompany[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const contacts = await userContacts(session.user.id, session.user.email ?? null)
  return contacts.map(c => ({ contactId: c.id, trdrId: c.trdrId, name: c.trdr?.NAME ?? '—' }))
}

async function userContacts(userId: string, email: string | null) {
  const mail = email?.trim().toLowerCase() || null
  let contacts = await prisma.contact.findMany({
    where: { OR: [{ userId }, ...(mail ? [{ email: { equals: mail, mode: 'insensitive' as const } }] : [])] },
    select: CONTACT_SELECT, orderBy: { name: 'asc' },
  })
  // Αυτόματη σύνδεση της (μίας) επαφής με το ίδιο email που δεν έχει ακόμα λογαριασμό.
  if (!contacts.some(c => c.userId === userId)) {
    const free = contacts.find(c => !c.userId)
    if (free) await prisma.contact.update({ where: { id: free.id }, data: { userId } }).catch(() => null)
  }
  // Πελάτης με επιχείρηση (User.trdrId) αλλά χωρίς καμία επαφή → «κεντρική» επαφή για να δουλέψει το portal.
  if (!contacts.length) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, trdrId: true, role: { select: { b2b: true } } } })
    if (u?.trdrId && u.role?.b2b) {
      const c = await prisma.contact.create({
        data: { trdrId: u.trdrId, name: u.name || u.email, email: u.email, userId, portalAllPrograms: true, COMMENTS: 'Δημιουργήθηκε αυτόματα από το portal' },
        select: CONTACT_SELECT,
      }).catch(() => null)
      if (c) contacts = [c]
    }
  }
  return contacts
}

export async function resolvePortalContact(previewContactId?: string): Promise<PortalContact | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (previewContactId) {
    if (session.user.portalHome || !can(session, 'customer.view')) return null
    const c = await prisma.contact.findUnique({ where: { id: previewContactId }, select: CONTACT_SELECT })
    return c ? { id: c.id, name: c.name, trdrId: c.trdrId, portalAllPrograms: c.portalAllPrograms, trdr: c.trdr, preview: true } : null
  }
  const contacts = await userContacts(session.user.id, session.user.email ?? null)
  if (!contacts.length) return null
  const chosen = (await cookies()).get(PORTAL_COMPANY_COOKIE)?.value
  const c = contacts.find(x => x.id === chosen) ?? contacts.find(x => x.userId === session.user.id) ?? contacts[0]
  return { id: c.id, name: c.name, trdrId: c.trdrId, portalAllPrograms: c.portalAllPrograms, trdr: c.trdr, preview: false }
}

/** Τα έργα που βλέπει η επαφή (κεντρική → όλα του πελάτη· αλλιώς μόνο όσα είναι συνδεδεμένη). */
export function portalApplicationsWhere(c: PortalContact) {
  return c.portalAllPrograms ? { trdrId: c.trdrId } : { trdrId: c.trdrId, contactLinks: { some: { contactId: c.id } } }
}
