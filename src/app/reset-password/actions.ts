'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyResetToken, consumeResetToken } from '@/lib/password-reset'

export type ResetPasswordState = {
  error?: string
}

export async function resetPassword(
  _prev: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password.length < 8) return { error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' }
  if (password !== confirm) return { error: 'Οι κωδικοί δεν ταιριάζουν.' }

  const result = await verifyResetToken(token)
  if (!result.ok) return { error: 'Ο σύνδεσμος έχει λήξει ή έχει ήδη χρησιμοποιηθεί. Ζήτησε νέο.' }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.update({ where: { id: result.userId }, data: { passwordHash }, select: { role: { select: { b2b: true } } } })
  await consumeResetToken(result.tokenId)

  // Το redirect() πετάει NEXT_REDIRECT — ζει έξω από οποιοδήποτε try/catch.
  // Πελάτης (portal) → σύνδεση με το ύφος του portal· προσωπικό → /login.
  redirect(user.role?.b2b ? '/portal/syndesi?reset=1' : '/login?reset=1')
}
