import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const TOKEN_BYTES = 32
const TTL_MINUTES = 30

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Δημιουργεί ένα νέο reset token για τον χρήστη. Αποθηκεύεται μόνο το SHA-256
 * hash — το RAW token επιστρέφεται μία φορά, για να μπει στο link του email.
 */
export async function createResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000)
  await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } })
  return token
}

export type VerifyResetTokenResult =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' }

/** Επαληθεύει ένα RAW token: πρέπει να υπάρχει, να μην έχει λήξει, να μην έχει ήδη χρησιμοποιηθεί. */
export async function verifyResetToken(token: string): Promise<VerifyResetTokenResult> {
  const tokenHash = hashToken(token)
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!record) return { ok: false, reason: 'not_found' }
  if (record.usedAt) return { ok: false, reason: 'used' }
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }
  return { ok: true, userId: record.userId, tokenId: record.id }
}

/** Σημειώνει το token ως χρησιμοποιημένο — αποτρέπει replay. */
export async function consumeResetToken(tokenId: string): Promise<void> {
  await prisma.passwordResetToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } })
}
