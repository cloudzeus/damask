'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'

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
}

/** Όλες οι επαφές του πελάτη του έργου + flag αν είναι ήδη συνδεδεμένες. */
export async function listApplicationContactOptions(applicationId: string): Promise<AppContactOption[]> {
  await requirePermission('customer.view')
  const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { trdrId: true } })
  const [contacts, links] = await Promise.all([
    prisma.contact.findMany({
      where: { trdrId: app.trdrId },
      select: { id: true, name: true, position: true, email: true, phone: true, mobile: true, isPrimary: true },
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
  }))
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
