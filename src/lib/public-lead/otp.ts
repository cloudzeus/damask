import crypto from 'node:crypto'

/**
 * 6ψήφιο OTP για τη δημόσια φόρμα επιλεξιμότητας. Ποτέ δεν αποθηκεύουμε τον
 * κωδικό — μόνο το sha256 hash (PublicLeadRequest.otpHash). Ίδιο idiom hashing
 * με το src/lib/pm/portal-token.ts, αλλά εδώ ο «κωδικός» πληκτρολογείται από τον
 * χρήστη (numeric), δεν είναι magic-link token.
 */

export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_MAX_RESENDS = 3

/** Ομοιόμορφο 6ψήφιο (επιτρέπονται leading zeros: 000000–999999). */
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0')
}

export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex')
}

export function otpExpiry(fromMs: number = Date.now()): Date {
  return new Date(fromMs + OTP_TTL_MINUTES * 60_000)
}

/** sha256(ip) — αποθηκεύουμε hash της IP για anti-abuse/rate-limit, όχι την ίδια την IP. */
export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex')
}
