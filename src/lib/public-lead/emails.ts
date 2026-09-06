import { renderEmailShell, escapeHtml } from '@/lib/mailer'
import { OTP_TTL_MINUTES } from '@/lib/public-lead/otp'

/**
 * Email templates για τη δημόσια ροή επιλεξιμότητας. Χρησιμοποιούν το κοινό
 * renderEmailShell (inline styles, table-based) — βλ. src/lib/mailer.ts.
 */

export function otpEmail(code: string, companyName?: string | null): { subject: string; html: string } {
  const greeting = companyName?.trim()
    ? `Γεια σας ${escapeHtml(companyName.trim())},`
    : 'Γεια σας,'
  const html = renderEmailShell({
    preheader: `Ο κωδικός επιβεβαίωσης είναι ${code}`,
    heading: 'Κωδικός επιβεβαίωσης',
    bodyHtml: `
      <p style="margin:0 0 14px;">${greeting}</p>
      <p style="margin:0 0 18px;">Χρησιμοποιήστε τον παρακάτω κωδικό για να ολοκληρώσετε τον έλεγχο επιλεξιμότητας στα ενεργά προγράμματα:</p>
      <div style="text-align:center;margin:8px 0 18px;">
        <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:0.32em;color:#001B72;background:#EEF1FA;border:1px solid #DFE2EA;border-radius:12px;padding:14px 22px 14px 30px;">${code}</span>
      </div>
      <p style="margin:0;font-size:12.5px;color:#8098A5;">Ο κωδικός λήγει σε ${OTP_TTL_MINUTES} λεπτά. Αν δεν ζητήσατε εσείς τον έλεγχο, αγνοήστε αυτό το email.</p>
    `,
  })
  return { subject: `Κωδικός επιβεβαίωσης: ${code}`, html }
}

export function teamNewLeadEmail(input: {
  companyName: string | null
  afm: string
  email: string
  phone: string
  eligibleCount: number
  eligibleTitles: string[]
  newsletterOptIn: boolean
  adminUrl: string
  alreadyCustomer?: boolean
}): { subject: string; html: string } {
  const name = input.companyName?.trim() || `ΑΦΜ ${input.afm}`
  if (input.alreadyCustomer) {
    const html = renderEmailShell({
      preheader: `Υπάρχων πελάτης ζητά επικοινωνία: ${name}`,
      heading: 'Υπάρχων πελάτης ζητά επικοινωνία',
      bodyHtml: `
        <p style="margin:0 0 14px;">Ο/Η <b>${escapeHtml(name)}</b> — ήδη καταχωρημένος πελάτης — υπέβαλε έλεγχο επιλεξιμότητας από τον ιστότοπο και ζητά εκ νέου επικοινωνία.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td style="padding:6px 10px 6px 0;color:#8098A5;font-size:12.5px;">ΑΦΜ</td><td style="padding:6px 0;color:#001B72;font-size:13.5px;font-weight:600;">${escapeHtml(input.afm)}</td></tr>
          <tr><td style="padding:6px 10px 6px 0;color:#8098A5;font-size:12.5px;">Email</td><td style="padding:6px 0;color:#001B72;font-size:13.5px;font-weight:600;">${escapeHtml(input.email)}</td></tr>
          <tr><td style="padding:6px 10px 6px 0;color:#8098A5;font-size:12.5px;">Τηλέφωνο</td><td style="padding:6px 0;color:#001B72;font-size:13.5px;font-weight:600;">${escapeHtml(input.phone)}</td></tr>
        </table>
        <p style="margin:14px 0 0;">Επικοινωνήστε μαζί του από την καρτέλα πελάτη.</p>
      `,
      ctaLabel: 'Άνοιγμα καρτέλας πελάτη',
      ctaUrl: input.adminUrl,
    })
    return { subject: `Υπάρχων πελάτης ζητά επικοινωνία — ${name}`, html }
  }
  const rows = [
    ['Επωνυμία', input.companyName || '—'],
    ['ΑΦΜ', input.afm],
    ['Email', input.email],
    ['Τηλέφωνο', input.phone],
    ['Επιλέξιμα προγράμματα', String(input.eligibleCount)],
    ['Newsletter', input.newsletterOptIn ? 'Ναι' : 'Όχι'],
  ]
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px 6px 0;color:#8098A5;font-size:12.5px;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 0;color:#001B72;font-size:13.5px;font-weight:600;">${escapeHtml(v)}</td></tr>`,
    )
    .join('')
  const list = input.eligibleTitles.length
    ? `<ul style="margin:12px 0 0;padding-left:18px;color:#3E5563;font-size:13px;">${input.eligibleTitles
        .map(t => `<li style="margin:0 0 4px;">${escapeHtml(t)}</li>`)
        .join('')}</ul>`
    : '<p style="margin:12px 0 0;font-size:13px;color:#8098A5;">Δεν εντοπίστηκε επιλέξιμο ενεργό πρόγραμμα αυτή τη στιγμή.</p>'
  const html = renderEmailShell({
    preheader: `Νέο αίτημα επιλεξιμότητας: ${name}`,
    heading: 'Νέο αίτημα από τον ιστότοπο',
    bodyHtml: `
      <p style="margin:0 0 14px;">Ένας επισκέπτης ολοκλήρωσε τον έλεγχο επιλεξιμότητας και καταχωρίστηκε ως υποψήφιος πελάτης.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${table}</table>
      ${list}
    `,
    ctaLabel: 'Άνοιγμα στο διαχειριστικό',
    ctaUrl: input.adminUrl,
  })
  return { subject: `Νέο αίτημα επιλεξιμότητας — ${name}`, html }
}
