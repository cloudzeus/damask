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
  /**
   * URL/mailto για List-Unsubscribe header → οι email clients δείχνουν καθαρό
   * native «Unsubscribe» (αντί για το άσχημο auto-footer της Mailgun). Μόνο για
   * newsletter/bulk — όχι transactional.
   */
  listUnsubscribe?: string
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
  if (input.listUnsubscribe?.trim()) {
    const u = input.listUnsubscribe.trim()
    fields.push(['h:List-Unsubscribe', u.startsWith('<') ? u : `<${u}>`])
    fields.push(['h:List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'])
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
const EMAIL_APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

export function renderEmailShell(opts: {
  preheader?: string
  heading: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  /** Branded «διαγραφή από λίστα» link στο footer (newsletter). Αντικαθιστά το άσχημο auto-footer. */
  unsubscribeUrl?: string
}): string {
  // WWA design system (email-safe: tables + inline styles· condensed look μέσω
  // 'Arial Narrow'/bold/uppercase γιατί τα email clients δεν φορτώνουν Roboto Condensed).
  const NAVY = '#001B72', NAVY_950 = '#000022', CYAN = '#34C8F6', INK = '#0B0F2A', MUTED = '#666C80', RULE = '#DFE2EA', CANVAS = '#EEF1FA'
  const condensed = "'Arial Narrow',Arial,sans-serif"
  const body = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const year = new Date().getFullYear()
  return `<!doctype html>
<html lang="el">
  <body style="margin:0;padding:28px 16px;background:${CANVAS};font-family:${body};">
    ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <!-- header band -->
          <tr>
            <td style="background:${NAVY_950};border-radius:18px 18px 0 0;padding:24px 30px;">
              <img src="${EMAIL_APP_URL}/wwa/wwa-logo-light-text.png" alt="World Wide Associates" height="40" style="height:40px;width:auto;display:block;border:0;outline:none;text-decoration:none;" />
              <div style="margin-top:8px;font-size:12px;letter-spacing:0.02em;color:${CYAN};">Σύμβουλοι ΕΣΠΑ &amp; Ευρωπαϊκών Προγραμμάτων</div>
            </td>
          </tr>
          <!-- card -->
          <tr>
            <td style="background:#FFFFFF;border:1px solid ${RULE};border-top:0;border-radius:0 0 18px 18px;padding:34px 30px;">
              <h1 style="margin:0 0 16px;font-family:${condensed};font-size:23px;line-height:1.2;color:${NAVY};font-weight:700;text-transform:uppercase;letter-spacing:0.01em;">${opts.heading}</h1>
              <div style="font-size:15px;line-height:1.65;color:${INK};">${opts.bodyHtml}</div>
              ${
                opts.ctaLabel && opts.ctaUrl
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;">
                <tr><td style="border-radius:999px;background:${NAVY};">
                  <a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${opts.ctaLabel}</a>
                </td></tr>
              </table>
              <div style="margin-top:14px;font-size:12px;color:${MUTED};word-break:break-all;">${opts.ctaUrl}</div>`
                  : ''
              }
            </td>
          </tr>
          <!-- footer -->
          <tr>
            <td style="padding:22px 30px 6px;text-align:center;font-size:12px;line-height:1.7;color:${MUTED};">
              <div style="font-weight:600;color:${INK};">World Wide Associates Ε.Ε.</div>
              Αλεξανδρουπόλεως 25, Αθήνα 115 27 · <a href="tel:+302107218758" style="color:${NAVY};text-decoration:none;">210 721 8758</a> · <a href="mailto:info@wwa-espa.com" style="color:${NAVY};text-decoration:none;">info@wwa-espa.com</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 30px 0;text-align:center;font-size:11px;color:#8B93A6;">
              Αυτοματοποιημένο μήνυμα από το World Wide Associates — μην απαντήσετε σε αυτό το email.<br/>© ${year} World Wide Associates Ε.Ε.
              ${opts.unsubscribeUrl ? `<br/><a href="${opts.unsubscribeUrl}" style="color:#8B93A6;text-decoration:underline;">Διαγραφή από τη λίστα ενημερώσεων</a>` : ''}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
