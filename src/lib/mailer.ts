import { getIntegration } from '@/lib/settings'
import { logApiUsage } from '@/lib/api-usage'

/**
 * Αποστολή email μέσω Mailgun REST (messages endpoint). Ρυθμίσεις από
 * getIntegration('mailgun') — DB-only (δεν υπάρχει προϋπάρχον .env fallback,
 * βλ. src/lib/settings.ts). Οι καταναλωτές (forgot-password, approve access
 * request) ελέγχουν πρώτα isMailerConfigured() και κρατάνε console.log
 * fallback όταν δεν έχει ρυθμιστεί ακόμα Mailgun.
 */

export type SendMailInput = {
  to: string
  subject: string
  html: string
  text?: string
  /** Προαιρετικά — μόνο για μέτρηση κόστους (src/lib/api-usage.ts), ΔΕΝ επηρεάζουν την αποστολή. */
  userId?: string
  refType?: string
  refId?: string
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

  const form = new URLSearchParams()
  form.set('from', from)
  form.set('to', input.to)
  form.set('subject', input.subject)
  form.set('html', input.html)
  form.set('text', input.text ?? stripHtml(input.html))

  try {
    const res = await fetch(`${base}/v3/${cfg.domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(20_000),
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
                <span style="font-size:15px;font-weight:700;letter-spacing:0.14em;color:#16323F;">DAMASK</span>
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
                Αυτό είναι αυτοματοποιημένο μήνυμα από το DAMASK PIM — μην απαντήσεις σε αυτό το email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
