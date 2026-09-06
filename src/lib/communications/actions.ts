'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'

/**
 * Ενοποιημένο ιστορικό επικοινωνίας με πελάτη (Trdr) — emails + καταγραφές
 * επικοινωνίας lead (τηλέφωνο/συνάντηση…) + αιτήματα δικαιολογητικών, ταξινομημένα
 * χρονολογικά, με «για ποιο έργο», «μέσο», «ποιος», και σήμανση εκκρεμοτήτων.
 * Gated customer.view.
 */

export type CommKind = 'EMAIL' | 'CALL' | 'FILE_REQUEST'

export type CommItem = {
  id: string
  kind: CommKind
  medium: string
  direction: 'INBOUND' | 'OUTBOUND' | null
  title: string
  snippet: string | null
  programId: string | null
  programTitle: string | null
  applicationId: string | null
  byName: string | null
  at: string
  pending: boolean
  status: string | null
}

export type CustomerCommunications = {
  items: CommItem[]
  pendingCount: number
}

const MEDIUM_LABEL: Record<string, string> = {
  PHONE: 'Τηλέφωνο', EMAIL: 'Email', SMS: 'SMS', MEETING: 'Συνάντηση', VIDEO_CALL: 'Βιντεοκλήση', OTHER: 'Άλλο',
}

export async function getCustomerCommunications(trdrId: string): Promise<CustomerCommunications> {
  await requirePermission('customer.view')

  const [messages, leadComms, fileRequests] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { trdrId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, direction: true, subject: true, snippet: true, createdAt: true, sentAt: true,
        programId: true, applicationId: true, sentById: true,
      },
    }),
    prisma.leadCommunication.findMany({
      where: { lead: { trdrId } },
      orderBy: { occurredAt: 'desc' },
      take: 200,
      include: { by: { select: { name: true } } },
    }),
    prisma.fileRequest.findMany({
      where: { trdrId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, title: true, status: true, createdAt: true, programId: true, applicationId: true, createdById: true },
    }),
  ])

  // Ανάλυση ονομάτων (users) + τίτλων προγραμμάτων σε batch.
  const userIds = [...new Set([...messages.map(m => m.sentById), ...fileRequests.map(f => f.createdById)].filter((x): x is string => !!x))]
  const programIds = [...new Set([...messages.map(m => m.programId), ...fileRequests.map(f => f.programId)].filter((x): x is string => !!x))]
  const [users, programs] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    programIds.length ? prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
  ])
  const userName = new Map(users.map(u => [u.id, u.name]))
  const programTitle = new Map(programs.map(p => [p.id, p.title]))

  const items: CommItem[] = []

  for (const m of messages) {
    items.push({
      id: `email:${m.id}`,
      kind: 'EMAIL',
      medium: 'Email',
      direction: m.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND',
      title: m.subject,
      snippet: m.snippet,
      programId: m.programId,
      programTitle: m.programId ? programTitle.get(m.programId) ?? null : null,
      applicationId: m.applicationId,
      byName: m.sentById ? userName.get(m.sentById) ?? null : null,
      at: (m.sentAt ?? m.createdAt).toISOString(),
      pending: false,
      status: null,
    })
  }

  for (const c of leadComms) {
    items.push({
      id: `lead:${c.id}`,
      kind: 'CALL',
      medium: MEDIUM_LABEL[c.medium] ?? c.medium,
      direction: 'OUTBOUND',
      title: MEDIUM_LABEL[c.medium] ?? c.medium,
      snippet: c.note,
      programId: null,
      programTitle: null,
      applicationId: null,
      byName: c.by?.name ?? null,
      at: c.occurredAt.toISOString(),
      pending: false,
      status: null,
    })
  }

  const OPEN = new Set(['PENDING', 'UPLOADED', 'PARTIAL'])
  for (const f of fileRequests) {
    items.push({
      id: `fr:${f.id}`,
      kind: 'FILE_REQUEST',
      medium: 'Αίτημα δικαιολογητικών',
      direction: 'OUTBOUND',
      title: f.title,
      snippet: null,
      programId: f.programId,
      programTitle: f.programId ? programTitle.get(f.programId) ?? null : null,
      applicationId: f.applicationId,
      byName: f.createdById ? userName.get(f.createdById) ?? null : null,
      at: f.createdAt.toISOString(),
      pending: OPEN.has(f.status),
      status: f.status,
    })
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const pendingCount = items.filter(i => i.pending).length
  return { items, pendingCount }
}
