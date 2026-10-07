'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { isMailerConfigured } from '@/lib/mailer'
import {
  deliverCustomerEmail,
  type DeliverCustomerEmailInput,
  type DeliverCustomerEmailResult,
} from '@/lib/email/deliver'

/**
 * Αποστολή email σε πελάτη με συσχέτιση (πελάτης/πρόγραμμα/έργο/task) + threading
 * (Message-Id/Reply-To/subject tag) ώστε οι μελλοντικές απαντήσεις να καταχωρούνται
 * στο ιστορικό. Προαιρετικά: attachments (Bunny URLs) + αίτημα δικαιολογητικών
 * (FileRequest one-time link). Gated: customer.edit (αποστολή) / customer.view (ιστορικό).
 */

export type SendCustomerEmailInput = DeliverCustomerEmailInput
export type SendCustomerEmailResult = DeliverCustomerEmailResult

/**
 * Αποστολή email σε πελάτη (gated customer.edit). Η υλοποίηση — tags συσχέτισης
 * (Message-Id/Reply-To/subject `[WWA-<token>]`), καταγραφή νήματος + προαιρετικό
 * αίτημα δικαιολογητικών — είναι στο κοινό deliverCustomerEmail ώστε ΟΛΑ τα emails
 * προς πελάτες (compose, αίτημα δικαιολογητικών, επανυποβολή) να το μοιράζονται.
 */
export async function sendCustomerEmail(input: SendCustomerEmailInput): Promise<SendCustomerEmailResult> {
  const session = await requirePermission('customer.edit')
  if (!input.to?.trim()) return { ok: false, error: 'Λείπει ο παραλήπτης.' }
  if (!input.subject?.trim()) return { ok: false, error: 'Λείπει το θέμα.' }
  if (!(await isMailerConfigured())) return { ok: false, error: 'Το Mailgun δεν έχει ρυθμιστεί.' }
  return deliverCustomerEmail({ id: session.user.id, name: session.user.name }, input)
}

// ── Ιστορικό (read) ──────────────────────────────────────────────────────────

export type ThreadRow = {
  id: string
  subject: string
  lastMessageAt: string
  messageCount: number
  lastSnippet: string | null
  status: string
}

async function listThreads(where: { trdrId?: string; programId?: string; applicationId?: string }): Promise<ThreadRow[]> {
  await requirePermission('customer.view')
  const threads = await prisma.emailThread.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { messages: true } } },
    take: 100,
  })
  return threads.map(t => ({
    id: t.id,
    subject: t.subject,
    lastMessageAt: t.lastMessageAt.toISOString(),
    messageCount: t._count.messages,
    lastSnippet: t.messages[0]?.snippet ?? null,
    status: t.status,
  }))
}

export async function listThreadsForTrdr(trdrId: string) {
  return listThreads({ trdrId })
}
export async function listThreadsForProgram(programId: string) {
  return listThreads({ programId })
}
export async function listThreadsForApplication(applicationId: string) {
  return listThreads({ applicationId })
}

export type MessageAttachment = { name: string; size?: number; mime?: string; downloadUrl: string }

export type MessageRow = {
  id: string
  direction: string
  fromEmail: string
  toEmails: string[]
  subject: string
  bodyHtml: string | null
  snippet: string | null
  status: string
  createdAt: string
  attachments: MessageAttachment[]
}

export async function listThreadMessages(threadId: string): Promise<MessageRow[]> {
  await requirePermission('customer.view')
  const rows = await prisma.emailMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } })
  return rows.map(m => {
    const raw = Array.isArray(m.attachments) ? (m.attachments as unknown as { name: string; size?: number; mime?: string }[]) : []
    return {
      id: m.id,
      direction: m.direction,
      fromEmail: m.fromEmail,
      toEmails: m.toEmails,
      subject: m.subject,
      bodyHtml: m.bodyHtml,
      snippet: m.snippet,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      attachments: raw.map((a, i) => ({ name: a.name, size: a.size, mime: a.mime, downloadUrl: `/api/email/attachments/${m.id}/${i}/download` })),
    }
  })
}

// ── Προτάσεις παραληπτών (Προς / CC / BCC) ─────────────────────────────────────

export type RecipientSuggestion = {
  email: string
  name: string
  /** 'contact' = επαφή/στοιχεία του πελάτη · 'user' = συνεργάτης (χρήστης εφαρμογής) */
  kind: 'contact' | 'user'
  hint: string | null
}

/** Επαφές του πελάτη (+ email εταιρίας/λογιστηρίου) και οι ενεργοί χρήστες μας. */
export async function listRecipientSuggestions(trdrId?: string | null): Promise<RecipientSuggestion[]> {
  await requirePermission('customer.view')
  const [trdr, contacts, users] = await Promise.all([
    trdrId ? prisma.trdr.findUnique({ where: { id: trdrId }, select: { NAME: true, EMAIL: true, EMAILACC: true } }) : null,
    trdrId
      ? prisma.contact.findMany({ where: { trdrId, email: { not: null } }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }], select: { name: true, email: true, position: true, isPrimary: true } })
      : [],
    prisma.user.findMany({ where: { active: true, contact: { is: null } }, orderBy: { name: 'asc' }, select: { name: true, email: true, role: { select: { name: true } } } }),
  ])
  const out: RecipientSuggestion[] = []
  const seen = new Set<string>()
  const push = (s: RecipientSuggestion) => {
    const key = s.email.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ ...s, email: s.email.trim() })
  }
  for (const c of contacts) push({ email: c.email!, name: c.name, kind: 'contact', hint: [c.isPrimary ? 'Κύρια επαφή' : null, c.position].filter(Boolean).join(' · ') || null })
  if (trdr?.EMAIL) push({ email: trdr.EMAIL, name: trdr.NAME, kind: 'contact', hint: 'Email εταιρίας' })
  if (trdr?.EMAILACC) push({ email: trdr.EMAILACC, name: trdr.NAME, kind: 'contact', hint: 'Λογιστήριο' })
  // Μόνο εσωτερικοί χρήστες (όχι λογαριασμοί portal πελατών, που είναι ήδη επαφές).
  for (const u of users) push({ email: u.email, name: u.name, kind: 'user', hint: u.role.name })
  return out
}
