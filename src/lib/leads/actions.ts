'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import type { LeadStatus, LeadSource, LeadCommMedium } from '@prisma/client'
import { logActivity } from '@/lib/activity/log'
import { createNotification } from '@/lib/notifications/service'
import { associateTrdrPrograms } from '@/lib/pm/program-link'
import { ensureTrdrCdnFolder } from '@/lib/trdr/cdn-folder'

/**
 * Διαχείριση Leads (ενδιαφερόμενων) — pipeline follow-up. Gated lead.view
 * (προβολή/εργασία) & lead.assign (ανάθεση, admin/super-admin). Scope: όποιος έχει
 * lead.assign βλέπει ΟΛΑ· αλλιώς μόνο τα leads που του έχουν ανατεθεί.
 */

export type LeadRow = {
  id: string
  source: LeadSource
  status: LeadStatus
  companyName: string | null
  afm: string | null
  email: string
  phone: string | null
  eligibleCount: number
  trdrId: string | null
  assignedToId: string | null
  assignedToName: string | null
  commCount: number
  lastCommAt: string | null
  createdAt: string
}

export type LeadCommRow = { id: string; medium: LeadCommMedium; note: string; occurredAt: string; byName: string | null }

export type LeadDetail = LeadRow & { notes: string | null; communications: LeadCommRow[] }

function canSeeAll(permissions: string[]): boolean {
  return permissions.includes('lead.assign')
}

/** Λίστα leads (scoped). */
export async function listLeads(filter?: { status?: LeadStatus; source?: LeadSource }): Promise<LeadRow[]> {
  const session = await requirePermission('lead.view')
  const all = canSeeAll(session.user.permissions ?? [])
  const leads = await prisma.lead.findMany({
    where: {
      ...(all ? {} : { assignedToId: session.user.id }),
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.source ? { source: filter.source } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      assignedTo: { select: { name: true } },
      _count: { select: { communications: true } },
      communications: { orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true } },
    },
    take: 500,
  })
  return leads.map(l => ({
    id: l.id,
    source: l.source,
    status: l.status,
    companyName: l.companyName,
    afm: l.afm,
    email: l.email,
    phone: l.phone,
    eligibleCount: l.eligibleProgramIds.length,
    trdrId: l.trdrId,
    assignedToId: l.assignedToId,
    assignedToName: l.assignedTo?.name ?? null,
    commCount: l._count.communications,
    lastCommAt: l.communications[0]?.occurredAt.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
  }))
}

async function loadScoped(leadId: string, userId: string, permissions: string[]) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return { error: 'Το lead δεν βρέθηκε.' as const }
  if (!canSeeAll(permissions) && lead.assignedToId !== userId) return { error: 'Δεν έχεις πρόσβαση σε αυτό το lead.' as const }
  return { lead }
}

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const session = await requirePermission('lead.view')
  const scoped = await loadScoped(leadId, session.user.id, session.user.permissions ?? [])
  if ('error' in scoped) return null
  const l = scoped.lead
  const [assignee, comms] = await Promise.all([
    l.assignedToId ? prisma.user.findUnique({ where: { id: l.assignedToId }, select: { name: true } }) : Promise.resolve(null),
    prisma.leadCommunication.findMany({ where: { leadId }, orderBy: { occurredAt: 'desc' }, include: { by: { select: { name: true } } } }),
  ])
  return {
    id: l.id,
    source: l.source,
    status: l.status,
    companyName: l.companyName,
    afm: l.afm,
    email: l.email,
    phone: l.phone,
    eligibleCount: l.eligibleProgramIds.length,
    trdrId: l.trdrId,
    assignedToId: l.assignedToId,
    assignedToName: assignee?.name ?? null,
    commCount: comms.length,
    lastCommAt: comms[0]?.occurredAt.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    notes: l.notes,
    communications: comms.map(c => ({ id: c.id, medium: c.medium, note: c.note, occurredAt: c.occurredAt.toISOString(), byName: c.by?.name ?? null })),
  }
}

/** Ανάθεση lead σε υπάλληλο/manager (admin/super-admin) + ειδοποίηση. */
export async function assignLead(leadId: string, userId: string | null): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermission('lead.assign')
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, status: true, companyName: true, email: true } })
  if (!lead) return { ok: false, error: 'Το lead δεν βρέθηκε.' }

  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, active: true } })
    if (!u || !u.active) return { ok: false, error: 'Ο χρήστης δεν βρέθηκε.' }
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      assignedToId: userId,
      assignedById: userId ? session.user.id : null,
      assignedAt: userId ? new Date() : null,
      status: userId && (lead.status === 'NEW') ? 'ASSIGNED' : lead.status,
    },
  })

  if (userId) {
    await createNotification({
      type: 'GENERIC',
      title: `Σου ανατέθηκε lead — ${lead.companyName ?? lead.email}`,
      body: 'Επικοινώνησε και κατάγραψε το follow-up.',
      entityType: 'Lead',
      entityId: leadId,
      meta: { leadId, assignedToId: userId },
    }).catch(() => {})
  }
  await logActivity('lead.assign', { userId: session.user.id, entityType: 'Lead', entityId: leadId, summary: 'Ανάθεση lead', meta: { assignedToId: userId } })
  revalidatePath('/leads')
  return { ok: true }
}

/** Καταγραφή επικοινωνίας follow-up (ο ανατεθειμένος ή admin). */
export async function logLeadCommunication(
  leadId: string,
  input: { medium: LeadCommMedium; note: string; occurredAt?: string },
): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermission('lead.view')
  const scoped = await loadScoped(leadId, session.user.id, session.user.permissions ?? [])
  if ('error' in scoped) return { ok: false, error: scoped.error }
  const note = input.note?.trim()
  if (!note) return { ok: false, error: 'Γράψε τι ειπώθηκε.' }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt.length <= 10 ? `${input.occurredAt}T12:00:00` : input.occurredAt) : new Date()
  if (Number.isNaN(occurredAt.getTime())) return { ok: false, error: 'Μη έγκυρη ημερομηνία.' }

  await prisma.leadCommunication.create({ data: { leadId, medium: input.medium, note, occurredAt, byUserId: session.user.id } })

  // NEW/ASSIGNED → IN_PROGRESS μόλις ξεκινήσει η επικοινωνία.
  if (scoped.lead.status === 'NEW' || scoped.lead.status === 'ASSIGNED') {
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'IN_PROGRESS' } })
  }
  await logActivity('lead.communicate', { userId: session.user.id, entityType: 'Lead', entityId: leadId, summary: `Επικοινωνία (${input.medium})` })
  revalidatePath('/leads')
  return { ok: true }
}

/** Αλλαγή κατάστασης (π.χ. «Δεν ενδιαφέρεται»). */
export async function setLeadStatus(leadId: string, status: LeadStatus): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermission('lead.view')
  const scoped = await loadScoped(leadId, session.user.id, session.user.permissions ?? [])
  if ('error' in scoped) return { ok: false, error: scoped.error }
  await prisma.lead.update({ where: { id: leadId }, data: { status } })
  revalidatePath('/leads')
  return { ok: true }
}

/**
 * Αναγωγή σε δυνητικό πελάτη: εξασφαλίζει Trdr «Υποψήφιο», δημιουργεί
 * ProgramApplication(s) POTENTIAL για τα επιλέξιμα προγράμματα, και μαρκάρει το
 * lead ως CONVERTED. Επιστρέφει το trdrId για deep-link στην καρτέλα.
 */
export async function promoteLead(leadId: string): Promise<{ ok: boolean; error?: string; trdrId?: string; linked?: number }> {
  const session = await requirePermission('lead.view')
  const scoped = await loadScoped(leadId, session.user.id, session.user.permissions ?? [])
  if ('error' in scoped) return { ok: false, error: scoped.error }
  const lead = scoped.lead

  // 1) Εξασφάλιση Trdr «Υποψήφιος».
  let trdrId = lead.trdrId
  if (!trdrId) {
    const existing = lead.afm ? await prisma.trdr.findFirst({ where: { AFM: lead.afm }, select: { id: true } }) : null
    if (existing) {
      trdrId = existing.id
    } else {
      const created = await prisma.trdr.create({
        data: {
          NAME: lead.companyName || (lead.afm ? `ΑΦΜ ${lead.afm}` : lead.email),
          AFM: lead.afm ?? undefined,
          SODTYPE: 13,
          ISPROSP: 1,
          EMAIL: lead.email,
          PHONE01: lead.phone ?? undefined,
          appNotes: 'Δημιουργήθηκε από αναγωγή lead (ενδιαφέρον).',
        },
        select: { id: true },
      })
      trdrId = created.id
      await ensureTrdrCdnFolder(trdrId).catch(() => {})
    }
    await prisma.lead.update({ where: { id: leadId }, data: { trdrId } })
  }

  // 2) ProgramApplication(s) POTENTIAL για τα επιλέξιμα.
  let linked = 0
  if (lead.eligibleProgramIds.length) {
    const res = await associateTrdrPrograms(trdrId, lead.eligibleProgramIds)
    linked = res.linked
  }

  // 3) Μαρκάρισμα CONVERTED.
  await prisma.lead.update({ where: { id: leadId }, data: { status: 'CONVERTED', convertedAt: new Date() } })
  await logActivity('lead.convert', { userId: session.user.id, entityType: 'Lead', entityId: leadId, summary: 'Αναγωγή σε δυνητικό πελάτη', meta: { trdrId, linked } })
  revalidatePath('/leads')
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true, trdrId, linked }
}
