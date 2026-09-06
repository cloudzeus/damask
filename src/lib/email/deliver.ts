import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { sendMail, renderEmailShell } from '@/lib/mailer'
import { bunnyDownload } from '@/lib/bunny-storage'
import { getIntegration } from '@/lib/settings'
import { logActivity } from '@/lib/activity/log'
import { newToken } from '@/lib/pm/portal-token'
import {
  newCorrelationToken, buildMessageId, buildReplyTo, ensureSubjectTag,
} from '@/lib/email/correlation'

/**
 * Κοινός πυρήνας αποστολής email σε πελάτη — ΜΕ tags συσχέτισης (Message-Id /
 * Reply-To plus-address / subject `[WWA-<token>]`), καταγραφή σε EmailThread/
 * EmailMessage (ιστορικό «Επικοινωνία») και προαιρετικό αίτημα δικαιολογητικών
 * (FileRequest one-time link). Plain module (ΟΧΙ 'use server') ώστε να καλείται
 * από πολλαπλά server actions ΜΕΤΑ τον δικό τους permission gate — ο έλεγχος
 * δικαιωμάτων ΔΕΝ γίνεται εδώ (ο καλών είναι υπεύθυνος). Έτσι ΟΛΑ τα emails προς
 * πελάτες περνούν από το ίδιο tagged μονοπάτι.
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

export type ComposeAttachment = { name: string; key: string; size?: number; mime?: string }

export type DeliverCustomerEmailInput = {
  threadId?: string
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

export type DeliverCustomerEmailResult = {
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

export async function deliverCustomerEmail(
  actor: { id: string; name?: string | null },
  input: DeliverCustomerEmailInput,
): Promise<DeliverCustomerEmailResult> {
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
        createdById: actor.id,
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
        createdById: actor.id,
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
    fileRequestCtaHtml = `<div style="margin-top:20px;padding:14px 16px;background:#EEF1FA;border:1px solid #DFE2EA;border-radius:10px;">
      <div style="font-weight:700;color:#001B72;margin-bottom:6px;">Ζητούμενα δικαιολογητικά</div>
      <div style="font-size:13px;color:#3E5563;">Ανεβάστε τα αρχεία μέσω του ασφαλούς συνδέσμου: <a href="${fileRequestUrl}" style="color:#001B72;">${fileRequestUrl}</a></div>
    </div>`
    await logActivity('file_request.create', { entityType: 'FileRequest', entityId: fr.id, summary: fr.title, meta: { items: input.fileRequest.items.length } })
  }

  // 3) HTML shell γύρω από το authored content.
  const html = renderEmailShell({
    heading: input.subject,
    bodyHtml: `${input.bodyHtml}${fileRequestCtaHtml}`,
  })

  // 4) Αποστολή (με tags).
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
    userId: actor.id,
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
      sentById: actor.id,
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
