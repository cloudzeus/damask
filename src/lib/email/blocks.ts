/** (Plain module.) Δομικά κομμάτια για emails με το πρότυπο WWA (email-safe inline styles). */

/** Πίνακας «ετικέτα: τιμή» για emails (email-safe). Οι τιμές πρέπει να είναι ήδη escaped. */
export function emailFacts(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border:1px solid #DFE2EA;border-radius:12px;border-collapse:separate;">${rows
    .map(([k, v], i) => `<tr><td style="padding:10px 14px;font-size:13px;color:#666C80;width:42%;${i ? 'border-top:1px solid #DFE2EA;' : ''}">${k}</td><td style="padding:10px 14px;font-size:14px;color:#0B0F2A;font-weight:600;${i ? 'border-top:1px solid #DFE2EA;' : ''}">${v}</td></tr>`)
    .join('')}</table>`
}

/** Σημείωση/υπόδειξη σε πλαίσιο (email-safe). */
export function emailNote(html: string): string {
  return `<div style="margin:16px 0;padding:12px 14px;background:#EEF1FA;border-left:4px solid #001B72;border-radius:8px;font-size:14px;color:#0B0F2A;">${html}</div>`
}

/** Απόλυτο URL της εφαρμογής (για κουμπιά στα emails). */
export const appUrl = (path: string) => `${(process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}${path}`
