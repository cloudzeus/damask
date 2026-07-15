'use server'

import { prisma } from '@/lib/prisma'
import { createResetToken } from '@/lib/password-reset'

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
      // TODO(SMTP): δεν έχει ρυθμιστεί ακόμα mailer — προσωρινά logάρουμε το link.
      console.log(`[password-reset] ${email} → ${resetUrl}`)
    }
  }

  return { submitted: true, message: GENERIC_MESSAGE }
}
