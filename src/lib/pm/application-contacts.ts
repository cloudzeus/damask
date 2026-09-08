'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { grantContactPortalAccess } from '@/lib/portal/contact-access'

/**
 * Σύνδεση έργου (ProgramApplication) με επαφές του πελάτη (Contact) — μία ή
 * περισσότερες. Οι επαφές ανήκουν ΠΑΝΤΑ στον ίδιο Trdr με το έργο.
 * Gated: customer.view (ανάγνωση) / programs.manage (μεταβολή).
 */

export type AppContactOption = {
  contactId: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  linked: boolean
  portalAllPrograms: boolean
  hasPortalAccess: boolean
}

/** Όλες οι επαφές του πελάτη του έργου + flag αν είναι ήδη συνδεδεμένες. */
export async function listApplicationContactOptions(applicationId: string): Promise<AppContactOption[]> {
  await requirePermission('customer.view')
  const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { trdrId: true } })
  const [contacts, links] = await Promise.all([
    prisma.contact.findMany({
      where: { trdrId: app.trdrId },
      select: { id: true, name: true, position: true, email: true, phone: true, mobile: true, isPrimary: true, portalAllPrograms: true, userId: true },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    }),
    prisma.applicationContact.findMany({ where: { applicationId }, select: { contactId: true } }),
  ])
  const linkedIds = new Set(links.map(l => l.contactId))
  return contacts.map(c => ({
    contactId: c.id,
    name: c.name,
    position: c.position,
    email: c.email,
    phone: c.phone ?? c.mobile,
    isPrimary: c.isPrimary,
    linked: linkedIds.has(c.id),
    portalAllPrograms: c.portalAllPrograms,
    hasPortalAccess: c.userId != null,
  }))
}

/** Ορίζει αν μια επαφή έχει «κεντρική» πρόσβαση portal (όλα τα προγράμματα) ή
 * μόνο όσα είναι συνδεδεμένη. */
export async function setContactPortalScope(contactId: string, all: boolean): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  await prisma.contact.update({ where: { id: contactId }, data: { portalAllPrograms: all } })
  revalidatePath('/programs')
  return { ok: true }
}

/** Αντικαθιστά το σύνολο των συνδεδεμένων επαφών του έργου (validate ίδιου Trdr). */
export async function setApplicationContacts(applicationId: string, contactIds: string[]): Promise<{ ok: boolean; error?: string; linked: number }> {
  const session = await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { id: true, trdrId: true } })

  // Ασφάλεια: μόνο επαφές που ανήκουν στον πελάτη του έργου.
  const valid = await prisma.contact.findMany({ where: { id: { in: contactIds }, trdrId: app.trdrId }, select: { id: true } })
  const validIds = valid.map(c => c.id)

  await prisma.$transaction([
    prisma.applicationContact.deleteMany({ where: { applicationId } }),
    ...(validIds.length
      ? [prisma.applicationContact.createMany({ data: validIds.map(contactId => ({ applicationId, contactId, createdById: session.user.id })), skipDuplicates: true })]
      : []),
  ])

  revalidatePath(`/programs`)
  return { ok: true, linked: validIds.length }
}

/** Δημιουργεί ΝΕΑ επαφή στον πελάτη του έργου και τη συνδέει αμέσως με το έργο. */
export async function createAndLinkContact(
  applicationId: string,
  input: { name: string; position?: string; email?: string; phone?: string; portalAccess?: boolean },
): Promise<{ ok: boolean; error?: string; portalError?: string }> {
  const session = await requirePermission('programs.manage')
  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'Το όνομα είναι υποχρεωτικό.' }
  const email = input.email?.trim() || null
  if (input.portalAccess && !email) return { ok: false, error: 'Για πρόσβαση στο portal χρειάζεται email.' }
  const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { trdrId: true } })
  const contact = await prisma.contact.create({
    data: {
      trdrId: app.trdrId,
      name,
      position: input.position?.trim() || null,
      email,
      phone: input.phone?.trim() || null,
    },
  })
  await prisma.applicationContact.create({ data: { applicationId, contactId: contact.id, createdById: session.user.id } })

  // Προαιρετική πρόσβαση portal → δημιουργία User + email ορισμού κωδικού.
  let portalError: string | undefined
  if (input.portalAccess) {
    const res = await grantContactPortalAccess(contact.id)
    if (!res.ok) portalError = res.error
  }

  revalidatePath(`/partners/${app.trdrId}`)
  return { ok: true, portalError }
}

/** Χορήγηση/επαναποστολή πρόσβασης portal σε υπάρχουσα επαφή (⋮ → «Πρόσβαση στο portal»). */
export async function grantPortalAccess(contactId: string): Promise<{ ok: boolean; error?: string; created?: boolean }> {
  await requirePermission('programs.manage')
  const res = await grantContactPortalAccess(contactId)
  if (res.ok) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { trdrId: true } })
    if (contact) revalidatePath(`/partners/${contact.trdrId}`)
  }
  return res
}

/** Επεξεργασία επαφής (company-wide) από το έργο. */
export async function updateLinkedContact(
  contactId: string,
  input: { name: string; position?: string; email?: string; phone?: string },
): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('programs.manage')
  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'Το όνομα είναι υποχρεωτικό.' }
  const contact = await prisma.contact.update({
    where: { id: contactId },
    data: { name, position: input.position?.trim() || null, email: input.email?.trim() || null, phone: input.phone?.trim() || null },
    select: { trdrId: true },
  })
  revalidatePath(`/partners/${contact.trdrId}`)
  return { ok: true }
}

/** Αφαίρεση της σύνδεσης επαφής↔έργου (η επαφή ΜΕΝΕΙ στην εταιρία). */
export async function unlinkApplicationContact(applicationId: string, contactId: string): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  await prisma.applicationContact.deleteMany({ where: { applicationId, contactId } })
  revalidatePath(`/programs`)
  return { ok: true }
}

/** Οριστική διαγραφή επαφής από την εταιρία (αφαιρεί και όλες τις συνδέσεις έργων). */
export async function deleteContactCompletely(contactId: string): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { trdrId: true } })
  await prisma.contact.delete({ where: { id: contactId } })
  if (contact) revalidatePath(`/partners/${contact.trdrId}`)
  return { ok: true }
}
