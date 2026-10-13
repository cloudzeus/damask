'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'

/** Κρυφή μνήμη κειμένου εγγράφου ανά SHA-256 (βλ. DocumentTextCache) — για να μη ξαναγίνεται OCR. */

const HASH = /^[0-9a-f]{64}$/

export async function getCachedDocText(hash: string): Promise<string | null> {
  await requirePermission('customer.view')
  if (!HASH.test(hash)) return null
  const row = await prisma.documentTextCache.findUnique({ where: { hash }, select: { text: true } })
  if (!row) return null
  void prisma.documentTextCache.update({ where: { hash }, data: { usedAt: new Date() } }).catch(() => {})
  return row.text
}

export async function putCachedDocText(hash: string, text: string, source: 'pdf-text' | 'ocr' | 'office'): Promise<void> {
  await requirePermission('customer.view')
  if (!HASH.test(hash) || !text.trim()) return
  // Χωρίς χαρακτήρες ελέγχου (το Postgres δεν δέχεται \u0000).
  const t = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 120_000)
  if (!t.trim()) return
  await prisma.documentTextCache.upsert({ where: { hash }, create: { hash, source, text: t }, update: { source, text: t, usedAt: new Date() } })
}
