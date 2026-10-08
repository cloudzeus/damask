import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { PageContext, ThanosContext } from './context'

/**
 * (Plain module.) Cache συνηθισμένων ερωτήσεων — ίδια (κανονικοποιημένη) ερώτηση στην ΑΡΧΗ συζήτησης → αποθηκευμένη
 * απάντηση, χωρίς κλήση AI. Αποθηκεύεται ΜΟΝΟ ό,τι δεν εξαρτάται από προσωπικά δεδομένα (βλ. CACHEABLE_TOOLS) και
 * δεν ετοίμασε ενέργεια. Στο portal το κλειδί περιέχει και τον πελάτη (η απάντηση μπορεί να τον προσφωνεί).
 */

const TTL_MS = 3 * 86_400_000
/** Εργαλεία με γενική (όχι προσωπική) γνώση — απαντήσεις που τα χρησιμοποίησαν μπορούν να ξαναδοθούν. */
export const CACHEABLE_TOOLS = new Set(['program_question', 'check_expense', 'app_help'])

const normalize = (q: string) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function cacheKey(ctx: ThanosContext, page: PageContext | undefined, message: string): string {
  const scope = ctx.mode === 'CUSTOMER' ? `C|${ctx.trdrId}` : 'S'
  const where = [page?.programId ?? '', page?.trdrId ?? '', page?.applicationId ?? ''].join('|')
  return createHash('sha256').update(`${scope}|${where}|${normalize(message)}`).digest('hex')
}

export async function getCachedAnswer(ctx: ThanosContext, page: PageContext | undefined, message: string): Promise<{ reply: string; model: string | null } | null> {
  const key = cacheKey(ctx, page, message)
  const row = await prisma.thanosAnswerCache.findUnique({ where: { key } }).catch(() => null)
  if (!row || row.expiresAt < new Date()) return null
  void prisma.thanosAnswerCache.update({ where: { key }, data: { hits: { increment: 1 } } }).catch(() => {})
  return { reply: row.reply, model: row.model }
}

export async function putCachedAnswer(ctx: ThanosContext, page: PageContext | undefined, message: string, reply: string, model: string | null): Promise<void> {
  const key = cacheKey(ctx, page, message)
  const data = { mode: ctx.mode, question: message.slice(0, 500), reply, model, expiresAt: new Date(Date.now() + TTL_MS) }
  await prisma.thanosAnswerCache.upsert({ where: { key }, create: { key, ...data }, update: data }).catch(() => {})
}
