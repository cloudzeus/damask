import { getIntegration } from '@/lib/settings'
import { logApiUsage } from '@/lib/api-usage'

/**
 * Αποστολή email μέσω Mailgun REST (messages endpoint). Ρυθμίσεις από
 * getIntegration('mailgun') — DB-only (δεν υπάρχει προϋπάρχον .env fallback,
 * βλ. src/lib/settings.ts). Οι καταναλωτές (forgot-password, approve access
 * request) ελέγχουν πρώτα isMailerConfigured() και κρατάνε console.log
 * fallback όταν δεν έχει ρυθμιστεί ακόμα Mailgun.
 */

/** Συνημμένο για αποστολή: bytes (content) ή fetch από URL (url). filename υποχρεωτικό. */
export type MailAttachment = {
  filename: string
  content?: Buffer | Uint8Array
  url?: string
  contentType?: string
}

export type SendMailInput = {
  to: string
  cc?: string
  bcc?: string
  subject: string
  html: string
  text?: string
  /** Reply-To header — για threading/plus-address ώστε οι απαντήσεις να αναγνωρίζονται. */
  replyTo?: string
  /** Σταθερό RFC Message-Id (χωρίς <>· προστίθενται) — για matching απαντήσεων (In-Reply-To/References). */
  messageId?: string
  /** Επιπλέον custom headers (γίνονται h:<name> στο Mailgun). */
  headers?: Record<string, string>
  /** Mailgun variables (γίνονται v:<name>). Δεν επιβιώνουν στις απαντήσεις — για δικό μας tracking. */
  variables?: Record<string, string>
  /** Συνημμένα — όταν υπάρχουν, η αποστολή γίνεται multipart. */
  attachments?: MailAttachment[]
  /** Προαιρετικά — μόνο για μέτρηση κόστους (src/lib/api-usage.ts), ΔΕΝ επηρεάζουν την αποστολή. */
  userId?: string
  refType?: string
  refId?: string
  /**
   * Mailgun open/click tracking (τροφοδοτεί τα opened/clicked της σελίδας
   * /mail-report). Default true· βάλε false για transactional emails που δεν
   * θέλουμε να μετράνε (π.χ. reset password).
   */
  tracking?: boolean
}
export type SendMailResult = { ok: true; id?: string } | { ok: false; error: string }

type StoredMailgunConfig = { apiKey?: string; domain?: string; region?: string; fromEmail?: string; fromName?: string }

async function loadConfig(): Promise<StoredMailgunConfig> {
  return getIntegration<StoredMailgunConfig>('mailgun')
}

export async function isMailerConfigured(): Promise<boolean> {
  const cfg = await loadConfig()
  return Boolean(cfg.apiKey?.trim() && cfg.domain?.trim() && cfg.fromEmail?.trim())
}

/** Πολύ απλός stripper — μόνο για το plain-text fallback part όταν ο caller δεν δίνει δικό του. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** HTML-escape για τιμές που προέρχονται από χρήστη (όνομα, email) πριν μπουν σε email template. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const cfg = await loadConfig()
  if (!cfg.apiKey?.trim() || !cfg.domain?.trim() || !cfg.fromEmail?.trim()) {
    return { ok: false, error: 'Το Mailgun δεν έχει ρυθμιστεί πλήρως (apiKey/domain/fromEmail).' }
  }

  const base = cfg.region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
  const from = cfg.fromName?.trim() ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail

  // Κοινά πεδία (κλειδί→τιμή) — μπαίνουν είτε σε urlencoded είτε σε multipart body.
  const fields: [string, string][] = [
    ['from', from],
    ['to', input.to],
    ['subject', input.subject],
    ['html', input.html],
    ['text', input.text ?? stripHtml(input.html)],
  ]
  if (input.cc?.trim()) fields.push(['cc', input.cc])
  if (input.bcc?.trim()) fields.push(['bcc', input.bcc])
  if (input.replyTo?.trim()) fields.push(['h:Reply-To', input.replyTo])
  if (input.messageId?.trim()) fields.push(['h:Message-Id', `<${input.messageId.replace(/^<|>$/g, '')}>`])
  for (const [k, v] of Object.entries(input.headers ?? {})) fields.push([`h:${k}`, v])
  for (const [k, v] of Object.entries(input.variables ?? {})) fields.push([`v:${k}`, v])
  if (input.tracking !== false) {
    fields.push(['o:tracking', 'yes'], ['o:tracking-opens', 'yes'], ['o:tracking-clicks', 'htmlonly'])
  }

  const attachments = input.attachments ?? []
  // Υλοποίηση fetch attachment bytes (όταν δίνεται url αντί για content).
  const resolvedAttachments: { filename: string; bytes: Uint8Array; contentType?: string }[] = []
  for (const a of attachments) {
    try {
      let bytes: Uint8Array | null = null
      if (a.content) bytes = a.content instanceof Buffer ? new Uint8Array(a.content) : a.content
      else if (a.url) {
        const r = await fetch(a.url, { signal: AbortSignal.timeout(20_000) })
        if (r.ok) bytes = new Uint8Array(await r.arrayBuffer())
      }
      if (bytes) resolvedAttachments.push({ filename: a.filename, bytes, contentType: a.contentType })
    } catch (err) {
      console.error(`sendMail: αποτυχία λήψης συνημμένου ${a.filename}`, err)
    }
  }

  const useMultipart = resolvedAttachments.length > 0
  let body: BodyInit
  const reqHeaders: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}`,
  }
  if (useMultipart) {
    const fd = new FormData()
    for (const [k, v] of fields) fd.append(k, v)
    for (const a of resolvedAttachments) {
      fd.append('attachment', new Blob([a.bytes as BlobPart], { type: a.contentType || 'application/octet-stream' }), a.filename)
    }
    body = fd // fetch θέτει μόνο του το multipart boundary Content-Type
  } else {
    const form = new URLSearchParams()
    for (const [k, v] of fields) form.append(k, v)
    reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
    body = form.toString()
  }

  try {
    const res = await fetch(`${base}/v3/${cfg.domain}/messages`, {
      method: 'POST',
      headers: reqHeaders,
      body,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `Mailgun HTTP ${res.status}: ${detail.slice(0, 300)}` }
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    void logApiUsage({
      service: 'mailgun', operation: 'send', units: 1,
      userId: input.userId, refType: input.refType, refId: input.refId,
    })
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Κοινό «κέλυφος» HTML email με Steel & Frost αίσθηση (inline styles — τα email
 * clients δεν υποστηρίζουν backdrop-filter/εξωτερικά CSS). Table-based layout
 * για συμβατότητα. Χρησιμοποιείται από forgot-password + approve access request.
 */
export function renderEmailShell(opts: {
  preheader?: string
  heading: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
}): string {
  return `<!doctype html>
<html lang="el">
  <body style="margin:0;padding:32px 16px;background:#F2F6F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding-bottom:20px;text-align:center;">
                <span style="font-size:15px;font-weight:700;letter-spacing:0.14em;color:#16323F;">World Wide Associates</span>
              </td>
            </tr>
            <tr>
              <td style="background:#FFFFFF;border:1px solid #DCE5E9;border-radius:18px;padding:32px 28px;">
                <h1 style="margin:0 0 14px;font-size:19px;line-height:1.3;color:#16323F;font-weight:700;">${opts.heading}</h1>
                <div style="font-size:14px;line-height:1.65;color:#3E5563;">${opts.bodyHtml}</div>
                ${
                  opts.ctaLabel && opts.ctaUrl
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                  <tr>
                    <td style="border-radius:999px;background:#16323F;">
                      <a href="${opts.ctaUrl}" style="display:inline-block;padding:12px 26px;font-size:13.5px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${opts.ctaLabel}</a>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:14px;font-size:11.5px;color:#8098A5;word-break:break-all;">${opts.ctaUrl}</div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding-top:18px;text-align:center;font-size:11.5px;color:#8098A5;">
                Αυτό είναι αυτοματοποιημένο μήνυμα από το World Wide Associates — μην απαντήσεις σε αυτό το email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
