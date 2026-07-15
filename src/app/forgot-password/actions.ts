'use server'

import { prisma } from '@/lib/prisma'
import { createResetToken } from '@/lib/password-reset'
import { isMailerConfigured, sendMail, renderEmailShell } from '@/lib/mailer'

// Πάντα το ίδιο μήνυμα — ανεξάρτητα αν το email υπάρχει ή όχι (no user enumeration).
const GENERIC_MESSAGE = 'Αν το email υπάρχει, θα λάβεις σύνδεσμο επαναφοράς.'

export type ForgotPasswordState = {
  submitted?: boolean
  message?: string
}

export async function requestPasswordReset(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (user && user.active) {
      const token = await createResetToken(user.id)
      const resetUrl = `${process.env.AUTH_URL ?? 'http://localhost:3000'}/reset-password?token=${token}`

      if (await isMailerConfigured()) {
        const html = renderEmailShell({
          heading: 'Επαναφορά κωδικού πρόσβασης',
          bodyHtml:
            '<p>Ζήτησες επαναφορά του κωδικού πρόσβασής σου στο DAMASK PIM. Πάτησε το παρακάτω κουμπί για να ' +
            'ορίσεις νέο κωδικό — ο σύνδεσμος ισχύει για 30 λεπτά.</p>' +
            '<p>Αν δεν το ζήτησες εσύ, μπορείς να αγνοήσεις αυτό το email — ο κωδικός σου παραμένει ίδιος.</p>',
          ctaLabel: 'Ορισμός νέου κωδικού',
          ctaUrl: resetUrl,
        })
        const result = await sendMail({ to: email, subject: 'Επαναφορά κωδικού — DAMASK PIM', html })
        if (!result.ok) {
          // Mailgun ρυθμισμένο αλλά η αποστολή απέτυχε live — fallback σε log ώστε να μη χαθεί το link.
          console.log(`[password-reset] Αποστολή Mailgun απέτυχε (${result.error}) — ${email} → ${resetUrl}`)
        }
      } else {
        // TODO(SMTP): κρατάμε το log fallback μέχρι να ρυθμιστεί το Mailgun στο /settings.
        console.log(`[password-reset] ${email} → ${resetUrl}`)
      }
    }
  }

  return { submitted: true, message: GENERIC_MESSAGE }
}
