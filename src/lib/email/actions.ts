'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { sendMail, isMailerConfigured, renderEmailShell } from '@/lib/mailer'
import { bunnyDownload } from '@/lib/bunny-storage'
import { getIntegration } from '@/lib/settings'
import { logActivity } from '@/lib/activity/log'
import { newToken } from '@/lib/pm/portal-token'
import {
  newCorrelationToken,
  ensureSubjectTag,
  buildMessageId,
  buildReplyTo,
} from '@/lib/email/correlation'

/**
 * Αποστολή email σε πελάτη με συσχέτιση (πελάτης/πρόγραμμα/έργο/task) + threading
 * (Message-Id/Reply-To/subject tag) ώστε οι μελλοντικές απαντήσεις να καταχωρούνται
 * στο ιστορικό. Προαιρετικά: attachments (Bunny URLs) + αίτημα δικαιολογητικών
 * (FileRequest one-time link). Gated: customer.edit (αποστολή) / customer.view (ιστορικό).
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

export type ComposeAttachment = { name: string; key: string; size?: number; mime?: string }

export type SendCustomerEmailInput = {
  threadId?: string // reply σε υπάρχον νήμα
  trdrId?: string
  programId?: string
  applicationId?: string
  obligationId?: string
  to: string
  cc?: string
  subject: string
  bodyHtml: string
  attachments?: ComposeAttachment[]
  fileRequest?: {
    title: string
    message?: string
    expiresAt: string // ISO
    items: { label: string; description?: string; required?: boolean }[]
  }
}

export type SendCustomerEmailResult = {
  ok: boolean
  error?: string
  threadId?: string
  messageId?: string
  fileRequestUrl?: string
}

async function mailConfig(): Promise<{ domain: string; fromEmail: string }> {
  const cfg = await getIntegration<{ domain?: string; fromEmail?: string }>('mailgun')
  return { domain: cfg.domain?.trim() || 'wwa.gr', fromEmail: cfg.fromEmail?.trim() || 'system' }
}

/** Κατεβάζει τα συνημμένα από το private storage (key) ώστε να σταλούν ως πραγματικά attachments. */
async function resolveAttachments(attachments: ComposeAttachment[]): Promise<{ filename: string; content: Buffer; contentType?: string }[]> {
  const out: { filename: string; content: Buffer; contentType?: string }[] = []
  for (const a of attachments) {
    try {
      const content = await bunnyDownload(a.key)
      out.push({ filename: a.name, content, contentType: a.mime })
    } catch (err) {
      console.error(`resolveAttachments: αποτυχία λήψης ${a.name} (${a.key})`, err)
    }
  }
  return out
}

export async function sendCustomerEmail(input: SendCustomerEmailInput): Promise<SendCustomerEmailResult> {
  const session = await requirePermission('customer.edit')
  if (!input.to?.trim()) return { ok: false, error: 'Λείπει ο παραλήπτης.' }
  if (!input.subject?.trim()) return { ok: false, error: 'Λείπει το θέμα.' }
  if (!(await isMailerConfigured())) return { ok: false, error: 'Το Mailgun δεν έχει ρυθμιστεί.' }

  const { domain, fromEmail } = await mailConfig()

  // 1) Νήμα — reply ή νέο.
  let thread = input.threadId
    ? await prisma.emailThread.findUnique({ where: { id: input.threadId }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    : null
  if (!thread) {
    thread = await prisma.emailThread.create({
      data: {
        token: newCorrelationToken(),
        subject: input.subject,
        trdrId: input.trdrId ?? null,
        programId: input.programId ?? null,
        applicationId: input.applicationId ?? null,
        obligationId: input.obligationId ?? null,
        createdById: session.user.id,
      },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
  }

  const messageId = buildMessageId(thread.token, domain)
  const replyTo = buildReplyTo(thread.token, domain)
  const taggedSubject = ensureSubjectTag(input.subject, thread.token)
  const previous = thread.messages[0]
  const references = [previous?.references, previous?.messageId].filter(Boolean).join(' ') || undefined

  // 2) Προαιρετικό αίτημα δικαιολογητικών → FileRequest + link.
  let fileRequestUrl: string | undefined
  let fileRequestCtaHtml = ''
  if (input.fileRequest && input.trdrId) {
    const { raw, hash } = newToken()
    const fr = await prisma.fileRequest.create({
      data: {
        tokenHash: hash,
        title: input.fileRequest.title,
        message: input.fileRequest.message ?? null,
        email: input.to,
        expiresAt: new Date(input.fileRequest.expiresAt),
        trdrId: input.trdrId,
        programId: input.programId ?? null,
        applicationId: input.applicationId ?? null,
        obligationId: input.obligationId ?? null,
        createdById: session.user.id,
        emailThreadId: thread.id,
        items: {
          create: input.fileRequest.items.map((it, i) => ({
            label: it.label,
            description: it.description ?? null,
            required: it.required ?? true,
            order: i,
          })),
        },
      },
    })
    fileRequestUrl = `${APP_URL}/r/${raw}`
    fileRequestCtaHtml = `<div style="margin-top:20px;padding:14px 16px;background:#EEF4F5;border:1px solid #DCE5E9;border-radius:10px;">
      <div style="font-weight:700;color:#16323F;margin-bottom:6px;">Ζητούμενα δικαιολογητικά</div>
      <div style="font-size:13px;color:#3E5563;">Ανεβάστε τα αρχεία μέσω του ασφαλούς συνδέσμου: <a href="${fileRequestUrl}" style="color:#1f6feb;">${fileRequestUrl}</a></div>
    </div>`
    await logActivity('file_request.create', { entityType: 'FileRequest', entityId: fr.id, summary: fr.title, meta: { items: input.fileRequest.items.length } })
  }

  // 3) HTML shell γύρω από το authored content.
  const html = renderEmailShell({
    heading: input.subject,
    bodyHtml: `${input.bodyHtml}${fileRequestCtaHtml}`,
  })

  // 4) Αποστολή.
  const result = await sendMail({
    to: input.to,
    cc: input.cc,
    subject: taggedSubject,
    html,
    replyTo,
    messageId,
    headers: {
      'X-WWA-Thread': thread.token,
      ...(previous?.messageId ? { 'In-Reply-To': `<${previous.messageId}>` } : {}),
      ...(references ? { References: references.split(' ').map(r => `<${r.replace(/^<|>$/g, '')}>`).join(' ') } : {}),
    },
    variables: { threadId: thread.id, ...(input.trdrId ? { trdrId: input.trdrId } : {}) },
    attachments: await resolveAttachments(input.attachments ?? []),
    userId: session.user.id,
    refType: 'customer-email',
    refId: thread.id,
  })

  // 5) Καταγραφή μηνύματος.
  const snippet = input.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: 'OUTBOUND',
      messageId,
      references,
      fromEmail,
      toEmails: input.to.split(',').map(s => s.trim()).filter(Boolean),
      cc: (input.cc ?? '').split(',').map(s => s.trim()).filter(Boolean),
      subject: taggedSubject,
      bodyHtml: html,
      bodyText: snippet,
      snippet,
      mailgunId: result.ok ? result.id : null,
      status: result.ok ? 'SENT' : 'FAILED',
      error: result.ok ? null : result.error,
      sentById: session.user.id,
      trdrId: thread.trdrId,
      programId: thread.programId,
      applicationId: thread.applicationId,
      obligationId: thread.obligationId,
      attachments: input.attachments && input.attachments.length ? (input.attachments as unknown as object) : undefined,
      sentAt: result.ok ? new Date() : null,
    },
  })
  await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } })

  if (!result.ok) return { ok: false, error: result.error, threadId: thread.id, fileRequestUrl }

  await logActivity('email.send', { entityType: 'EmailThread', entityId: thread.id, summary: input.subject, meta: { trdrId: thread.trdrId, hasRequest: Boolean(fileRequestUrl) } })
  if (thread.trdrId) revalidatePath(`/partners/${thread.trdrId}`)
  return { ok: true, threadId: thread.id, messageId, fileRequestUrl }
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
