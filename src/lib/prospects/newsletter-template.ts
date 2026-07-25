import { escapeHtml } from '@/lib/mailer'

/**
 * Marketing template του newsletter «Ενημέρωση προγράμματος» προς δυνητικούς
 * πελάτες (prospects). Καθαρό module χωρίς I/O — unit-tested στο
 * tests/newsletter-template.test.ts, κοινό για κανονική ΚΑΙ δοκιμαστική
 * αποστολή ώστε το preview να μην αποκλίνει ποτέ από το πραγματικό email.
 *
 * Email-client συμβατότητα: table-based layout, inline styles παντού,
 * bgcolor fallback κάτω από το gradient (το Outlook αγνοεί gradients),
 * χωρίς εξωτερικά assets/fonts.
 */

export type NewsletterProgram = {
  title: string
  summary: string | null
  referenceCode: string | null
  submissionEnd: Date | null
  /** Prisma Decimal περνάει ως number μέσω Number() στον caller. */
  fundingRate: number | null
  totalBudget: number | null
  durationMonths: number | null
}

const EUR = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const DATE = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })

/** «50» από 50.00, «12,5» από 12.5 — χωρίς άχρηστα δεκαδικά στο ποσοστό. */
function formatRate(rate: number): string {
  return new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(rate)
}

/** Συμπαγή ποσά για stat chip: 400.000.000 € → «400 εκατ. €». */
export function formatBudgetShort(amount: number): string {
  if (amount >= 1_000_000_000) return `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(amount / 1_000_000_000)} δισ. €`
  if (amount >= 1_000_000) return `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(amount / 1_000_000)} εκατ. €`
  return `${EUR.format(amount)} €`
}

/** Ημέρες μέχρι την προθεσμία (ceil σε ημερολογιακές) — null χωρίς προθεσμία, αρνητικό αν πέρασε. */
export function daysUntil(deadline: Date | null, now: Date = new Date()): number | null {
  if (!deadline) return null
  return Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000)
}

/** Θέμα με αξία μπροστά — το ποσοστό ενίσχυσης πουλάει περισσότερο από τη λέξη «ενημέρωση». */
export function newsletterSubject(program: NewsletterProgram): string {
  const rate = program.fundingRate != null && program.fundingRate > 0 ? ` — επιδότηση έως ${formatRate(program.fundingRate)}%` : ''
  return `Ευκαιρία χρηματοδότησης: ${program.title}${rate}`
}

function statChip(label: string, value: string): string {
  return `<td align="center" style="padding:0 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="background:#EEF4F6;border-radius:12px;padding:12px 8px;">
        <div style="font-size:19px;font-weight:700;color:#16323F;line-height:1.2;">${value}</div>
        <div style="margin-top:2px;font-size:11px;font-weight:600;letter-spacing:0.04em;color:#5A7482;text-transform:uppercase;">${label}</div>
      </td></tr>
    </table>
  </td>`
}

export function newsletterHtml(
  recipientName: string,
  program: NewsletterProgram,
  url: string,
  now: Date = new Date(),
): string {
  const name = escapeHtml(recipientName)
  const title = escapeHtml(program.title)
  const safeUrl = escapeHtml(url)

  const deadline = program.submissionEnd ? DATE.format(program.submissionEnd) : null
  const daysLeft = daysUntil(program.submissionEnd, now)

  const chips: string[] = []
  if (program.fundingRate != null && program.fundingRate > 0) chips.push(statChip('Επιδοτηση', `έως ${formatRate(program.fundingRate)}%`))
  if (program.totalBudget != null && program.totalBudget > 0) chips.push(statChip('Προϋπολογισμος', formatBudgetShort(program.totalBudget)))
  if (program.durationMonths != null && program.durationMonths > 0) chips.push(statChip('Διαρκεια', `${program.durationMonths} μήνες`))

  const preheader = [
    program.fundingRate != null && program.fundingRate > 0 ? `Επιδότηση έως ${formatRate(program.fundingRate)}%` : 'Νέο πρόγραμμα χρηματοδότησης',
    deadline ? `υποβολές έως ${deadline}` : null,
  ].filter(Boolean).join(' · ')

  return `<!doctype html>
<html lang="el">
  <body style="margin:0;padding:32px 12px;background:#F2F6F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header band -->
          <tr><td bgcolor="#16323F" style="background:linear-gradient(135deg,#16323F 0%,#1F4A5C 60%,#27616F 100%);border-radius:18px 18px 0 0;padding:30px 30px 26px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;color:#8FD1C8;text-transform:uppercase;">
              Ευκαιρία χρηματοδοτησης${program.referenceCode ? `&nbsp;&nbsp;·&nbsp;&nbsp;<span style="color:#7FA6B3;">${escapeHtml(program.referenceCode)}</span>` : ''}
            </div>
            <h1 style="margin:10px 0 0;font-size:23px;line-height:1.3;color:#FFFFFF;font-weight:700;">${title}</h1>
          </td></tr>

          <!-- Body card -->
          <tr><td style="background:#FFFFFF;border:1px solid #DCE5E9;border-top:0;border-radius:0 0 18px 18px;padding:28px 30px 26px;">

            <p style="margin:0 0 14px;font-size:14.5px;line-height:1.65;color:#3E5563;">Καλημέρα σας,</p>
            <p style="margin:0 0 14px;font-size:14.5px;line-height:1.65;color:#3E5563;">
              Με βάση τα στοιχεία που τηρούμε για την επιχείρηση <b style="color:#16323F;">${name}</b>
              (δραστηριότητα, περιοχή, μέγεθος), η επιχείρησή σας
              <b style="color:#16323F;">ενδέχεται να είναι επιλέξιμη</b> για το νέο πρόγραμμα ενίσχυσης.
            </p>
            ${program.summary ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#3E5563;">${escapeHtml(program.summary)}</p>` : ''}

            ${chips.length > 0 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;"><tr>${chips.join('')}</tr></table>` : ''}

            ${deadline ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
              <tr><td style="background:#FDF3E3;border:1px solid #F0DCB6;border-radius:12px;padding:12px 16px;">
                <div style="font-size:13.5px;line-height:1.55;color:#7A5A18;">
                  ⏳ Οι αιτήσεις κλείνουν στις <b>${deadline}</b>${daysLeft != null && daysLeft > 0 && daysLeft <= 30 ? ` — απομένουν μόλις <b>${daysLeft} ${daysLeft === 1 ? 'ημέρα' : 'ημέρες'}</b>` : ''}.
                  Οι φάκελοι που προετοιμάζονται έγκαιρα έχουν σημαντικά καλύτερες πιθανότητες έγκρισης.
                </div>
              </td></tr>
            </table>` : ''}

            <!-- CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:2px auto 10px;">
              <tr><td align="center" bgcolor="#16323F" style="border-radius:999px;">
                <a href="${safeUrl}" style="display:inline-block;padding:14px 34px;font-size:14.5px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">
                  Θέλω δωρεάν προαξιολόγηση&nbsp;→
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 18px;text-align:center;font-size:12px;line-height:1.5;color:#8098A5;">
              Χωρίς καμία δέσμευση — ένας σύμβουλός μας θα επικοινωνήσει μαζί σας εντός 1–2 εργάσιμων.
            </p>

            <div style="border-top:1px solid #E8EFF2;padding-top:14px;font-size:11.5px;line-height:1.6;color:#8098A5;">
              Αν το κουμπί δεν λειτουργεί, αντιγράψτε τον σύνδεσμο: <span style="word-break:break-all;color:#5A7482;">${safeUrl}</span>
            </div>
          </td></tr>

          <!-- Footer -->
          <tr><td style="padding:16px 10px 0;text-align:center;font-size:11.5px;line-height:1.6;color:#8098A5;">
            Λαμβάνετε αυτή την ενημέρωση επειδή είστε καταχωρημένη επιχειρηματική επαφή μας.<br/>
            Αν δεν επιθυμείτε ενημερώσεις για προγράμματα χρηματοδότησης, απαντήστε σε αυτό το email με θέμα «Διαγραφή».
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
