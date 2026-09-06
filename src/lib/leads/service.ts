import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications/service'

/**
 * Δημιουργία/ενημέρωση Lead (ενδιαφερόμενου) στο pipeline follow-up. Plain module
 * (ΟΧΙ 'use server') ώστε να καλείται από τις δημόσιες ροές (eligibility, newsletter).
 * Idempotent: eligibility μέσω publicLeadRequestId (unique), newsletter μέσω
 * (email, source=NEWSLETTER) εφόσον δεν έχει ήδη μετατραπεί.
 */

/** Lead από verified αίτημα επιλεξιμότητας. Επιστρέφει το leadId. */
export async function upsertEligibilityLead(input: {
  publicLeadRequestId: string
  trdrId: string | null
  companyName: string | null
  afm: string
  email: string
  phone: string
  eligibleProgramIds: string[]
}): Promise<string> {
  const existing = await prisma.lead.findUnique({ where: { publicLeadRequestId: input.publicLeadRequestId }, select: { id: true } })
  if (existing) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: { trdrId: input.trdrId, eligibleProgramIds: input.eligibleProgramIds, companyName: input.companyName ?? undefined },
    })
    return existing.id
  }
  const lead = await prisma.lead.create({
    data: {
      source: 'ELIGIBILITY',
      status: 'NEW',
      publicLeadRequestId: input.publicLeadRequestId,
      trdrId: input.trdrId,
      companyName: input.companyName,
      afm: input.afm,
      email: input.email,
      phone: input.phone,
      eligibleProgramIds: input.eligibleProgramIds,
    },
    select: { id: true },
  })
  return lead.id
}

/**
 * Lead από εγγραφή/ενδιαφέρον newsletter — ΜΟΝΟ αν δεν είναι ήδη πελάτης και δεν
 * υπάρχει ήδη ενεργό lead για το email. Δημιουργεί in-app ειδοποίηση ομάδας.
 * Επιστρέφει leadId ή null (αν παραλείφθηκε).
 */
export async function upsertNewsletterLead(input: {
  email: string
  name?: string | null
  afm?: string | null
  trdrId?: string | null
}): Promise<string | null> {
  const email = input.email.trim().toLowerCase()
  if (!email) return null

  // Ήδη πελάτης; (Trdr ISPROSP=0) → δεν είναι lead.
  if (input.trdrId) {
    const t = await prisma.trdr.findUnique({ where: { id: input.trdrId }, select: { ISPROSP: true } })
    if (t && t.ISPROSP === 0) return null
  }
  if (input.afm) {
    const cust = await prisma.trdr.findFirst({ where: { AFM: input.afm, ISPROSP: 0 }, select: { id: true } })
    if (cust) return null
  }

  // Ήδη ενεργό lead για αυτό το email;
  const existing = await prisma.lead.findFirst({
    where: { email, status: { notIn: ['CONVERTED', 'NOT_INTERESTED'] } },
    select: { id: true },
  })
  if (existing) return null

  const lead = await prisma.lead.create({
    data: {
      source: 'NEWSLETTER',
      status: 'NEW',
      email,
      companyName: input.name ?? null,
      afm: input.afm ?? null,
      trdrId: input.trdrId ?? null,
    },
    select: { id: true },
  })

  await createNotification({
    type: 'PUBLIC_LEAD',
    title: `Νέος ενδιαφερόμενος (newsletter) — ${input.name ?? email}`,
    body: email,
    entityType: 'Lead',
    entityId: lead.id,
    meta: { leadId: lead.id, source: 'NEWSLETTER' },
  }).catch(() => {})

  return lead.id
}
