import crypto from 'crypto'

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function newToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex')
  return { raw, hash: hashToken(raw) }
}

export function isExpired(expiresAt: Date, nowMs: number): boolean {
  return expiresAt.getTime() < nowMs
}
