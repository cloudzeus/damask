import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getIntegration } from '@/lib/settings'
import { extractCorrelationToken } from '@/lib/email/correlation'
import { createNotification } from '@/lib/notifications/service'

/**
 * Inbound email webhook (Mailgun Routes → store/forward). ΜΕΛΛΟΝΤΙΚΟ: όταν συνδεθεί
 * το mailbox, ο πελάτης απαντά και το Mailgun κάνει POST εδώ. Αναγνωρίζουμε το νήμα
 * μέσω token (plus-address / In-Reply-To / References / subject tag — βλ.
 * extractCorrelationToken) και καταχωρούμε INBOUND μήνυμα στο ιστορικό.
 *
 * Public route (proxy: /api/webhooks/) — κάνει δικό του έλεγχο υπογραφής Mailgun.
 * Πάντα επιστρέφει 200 (εκτός invalid signature) ώστε το Mailgun να μην κάνει retries.
 *
 * ⚠ STUB: απαιτεί ρύθμιση Mailgun inbound route + webhook signing key. Χωρίς
 * ρυθμισμένο signing key, τα αιτήματα ΑΠΟΡΡΙΠΤΟΝΤΑΙ (401) για ασφάλεια.
 */

export const runtime = 'nodejs'
export const maxDuration = 30

type MailgunCfg = { webhookSigningKey?: string; apiKey?: string }

function verifySignature(signingKey: string, timestamp: string, token: string, signature: string): boolean {
  if (!timestamp || !token || !signature) return false
  const computed = crypto.createHmac('sha256', signingKey).update(timestamp + token).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function GET() {
  // Απλό health-check για ρύθμιση route στο Mailgun.
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const get = (k: string) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  }

  const cfg = await getIntegration<MailgunCfg>('mailgun')
  const signingKey = cfg.webhookSigningKey?.trim() || process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim()
  if (!signingKey) {
    // Ασφάλεια: χωρίς signing key δεν εμπιστευόμαστε το payload.
    console.warn('mailgun inbound: δεν έχει ρυθμιστεί webhookSigningKey — απόρριψη.')
    return NextResponse.json({ error: 'not_configured' }, { status: 401 })
  }
  if (!verifySignature(signingKey, get('timestamp') ?? '', get('token') ?? '', get('signature') ?? '')) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }

  const recipient = get('recipient')
  const sender = get('sender') || get('from')
  const subject = get('subject')
  const bodyHtml = get('body-html') || get('stripped-html')
  const bodyText = get('body-plain') || get('stripped-text')
  const messageId = (get('Message-Id') || get('message-id') || '').replace(/^<|>$/g, '') || null
  const inReplyTo = get('In-Reply-To')
  const references = get('References')

  const token = extractCorrelationToken({ recipient, inReplyTo, references, subject })
  if (!token) {
    // Δεν αντιστοιχεί σε νήμα — αγνόησέ το ήσυχα (π.χ. spam/άσχετο).
    return NextResponse.json({ ok: true, matched: false })
  }

  const thread = await prisma.emailThread.findUnique({ where: { token } })
  if (!thread) return NextResponse.json({ ok: true, matched: false })

  // Idempotency — αν το messageId υπάρχει ήδη, μην το ξαναγράψεις.
  if (messageId) {
    const existing = await prisma.emailMessage.findUnique({ where: { messageId } })
    if (existing) return NextResponse.json({ ok: true, duplicate: true })
  }

  const snippet = (bodyText || bodyHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: 'INBOUND',
      messageId,
      inReplyTo,
      references,
      fromEmail: sender ?? 'unknown',
      toEmails: recipient ? [recipient] : [],
      cc: [],
      subject: subject ?? thread.subject,
      bodyHtml,
      bodyText,
      snippet,
      status: 'RECEIVED',
      trdrId: thread.trdrId,
      programId: thread.programId,
      applicationId: thread.applicationId,
      obligationId: thread.obligationId,
    },
  })
  await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } })

  await createNotification({
    type: 'GENERIC',
    title: `Νέα απάντηση: ${thread.subject}`,
    body: snippet || undefined,
    entityType: 'EmailThread',
    entityId: thread.id,
    meta: { trdrId: thread.trdrId, from: sender },
  })

  return NextResponse.json({ ok: true, matched: true })
}
