'use server'

import { prisma } from '@/lib/prisma'
import { deliverCustomerEmail } from '@/lib/email/deliver'
import { openrouterTranscribe } from '@/lib/openrouter'
import { isTtsConfigured } from '@/lib/voice/elevenlabs'
import { getIntegration } from '@/lib/settings'
import { resolveThanosContext, can, type PageContext } from './context'
import { runThanos, type ChatTurn, type ThanosReply } from './agent'
import type { ActionPayload } from './tools'
import { executeOperation, type OperationPayload } from './operations'

/**
 * Server actions του Thanos (app + portal). Ο ρόλος/scope προκύπτει ΠΑΝΤΑ από το session (resolveThanosContext).
 * Η αποστολή ενέργειας ξαναελέγχει ιδιοκτήτη + scope τη στιγμή του «Αποστολή».
 */

type Res<T> = { ok: true; data: T } | { ok: false; error: string }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export async function thanosStatus(): Promise<{ chat: boolean; tts: boolean; mode: 'STAFF' | 'CUSTOMER' | null }> {
  const ctx = await resolveThanosContext()
  if (!ctx) return { chat: false, tts: false, mode: null }
  const or = await getIntegration<{ apiKey?: string }>('openrouter')
  return { chat: !!or.apiKey?.trim(), tts: await isTtsConfigured(), mode: ctx.mode }
}

export async function thanosChat(input: { history: ChatTurn[]; message: string; page?: PageContext }): Promise<Res<ThanosReply>> {
  const ctx = await resolveThanosContext()
  if (!ctx) return { ok: false, error: 'Δεν είστε συνδεδεμένοι.' }
  const message = input.message?.trim()
  if (!message) return { ok: false, error: 'Κενό μήνυμα.' }
  try {
    const history = (Array.isArray(input.history) ? input.history : [])
      .filter(h => (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    return { ok: true, data: await runThanos(ctx, history, message, input.page) }
  } catch (err) {
    return { ok: false, error: errMsg(err) }
  }
}

export async function thanosTranscribe(audioBase64: string, format: string): Promise<Res<string>> {
  const ctx = await resolveThanosContext()
  if (!ctx) return { ok: false, error: 'Δεν είστε συνδεδεμένοι.' }
  if (!audioBase64 || audioBase64.length > 12_000_000) return { ok: false, error: 'Η ηχογράφηση είναι κενή ή πολύ μεγάλη.' }
  const fmt = ['wav', 'mp3', 'webm', 'ogg', 'm4a', 'mp4', 'aac', 'flac'].includes(format) ? format : 'webm'
  try {
    const text = await openrouterTranscribe(audioBase64, fmt, { userId: ctx.userId })
    return text ? { ok: true, data: text } : { ok: false, error: 'Δεν αναγνωρίστηκε ομιλία.' }
  } catch (err) {
    return { ok: false, error: errMsg(err) }
  }
}

export type ActionEdits = { to?: string; message?: string; items?: string[] }

/** «Αποστολή» κάρτας: ξαναελέγχει δικαιώματα/scope και στέλνει μέσω deliverCustomerEmail (με one-time link). */
export async function executeThanosAction(id: string, edits: ActionEdits = {}): Promise<Res<{ url?: string; message?: string }>> {
  const ctx = await resolveThanosContext()
  if (!ctx) return { ok: false, error: 'Δεν είστε συνδεδεμένοι.' }
  const action = await prisma.thanosAction.findUnique({ where: { id } })
  if (!action || action.userId !== ctx.userId) return { ok: false, error: 'Η ενέργεια δεν βρέθηκε.' }
  if (action.status !== 'PENDING') return { ok: false, error: action.status === 'SENT' ? 'Έχει ήδη σταλεί.' : 'Η ενέργεια δεν είναι πλέον ενεργή.' }

  if (action.kind === 'OPERATION') {
    if (ctx.mode !== 'STAFF') return { ok: false, error: 'Δεν επιτρέπεται.' }
    const claimed = await prisma.thanosAction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'SENT', executedAt: new Date() } })
    if (!claimed.count) return { ok: false, error: 'Έχει ήδη εκτελεστεί.' }
    try {
      const message = await executeOperation(ctx, action.payload as unknown as OperationPayload)
      await prisma.thanosAction.update({ where: { id }, data: { result: { message } } })
      return { ok: true, data: { message } }
    } catch (err) {
      // notFound()/redirect() των actions πετούν ειδικά σφάλματα — εδώ τα δείχνουμε ως απλό μήνυμα.
      const msg = /NEXT_NOT_FOUND|NEXT_HTTP_ERROR/.test(errMsg(err)) ? 'Δεν έχεις πρόσβαση σε αυτό το έργο.' : errMsg(err)
      await prisma.thanosAction.update({ where: { id }, data: { status: 'ERROR', error: msg.slice(0, 400) } })
      return { ok: false, error: msg }
    }
  }

  const p = action.payload as unknown as ActionPayload
  if (action.kind === 'ACCOUNTANT_LINK') {
    if (ctx.mode !== 'CUSTOMER' || ctx.trdrId !== p.trdrId || (p.applicationId && !ctx.applicationIds.includes(p.applicationId))) return { ok: false, error: 'Δεν έχετε πρόσβαση.' }
  } else if (!can(ctx, 'programs.manage')) {
    return { ok: false, error: 'Δεν έχεις δικαίωμα αποστολής αιτημάτων.' }
  }

  const to = (edits.to ?? p.to).trim()
  if (!emailOk(to)) return { ok: false, error: 'Μη έγκυρο email παραλήπτη.' }
  const items = (edits.items ?? p.items).map(s => s.trim()).filter(Boolean).slice(0, 25)
  if (!items.length) return { ok: false, error: 'Επίλεξε τουλάχιστον ένα έγγραφο.' }
  const message = (edits.message ?? p.message).trim().slice(0, 2000)

  // Κλείδωμα: μόνο ένα «Αποστολή» περνά (διπλό κλικ / δύο tabs).
  const claimed = await prisma.thanosAction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'SENT', executedAt: new Date() } })
  if (!claimed.count) return { ok: false, error: 'Έχει ήδη σταλεί.' }

  const greeting = p.toName && to === p.to ? `Γεια σας ${esc(p.toName)},` : 'Γεια σας,'
  const sender = ctx.mode === 'CUSTOMER' ? `<p style="color:#666C80;font-size:13px">Το αίτημα στάλθηκε εκ μέρους της επιχείρησης «${esc(p.trdrName)}» από ${esc(ctx.name)}.</p>` : ''
  const bodyHtml = `<p>${greeting}</p><p>${esc(message).replace(/\n/g, '<br>')}</p><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>${sender}`
  const expiresAt = new Date(Date.now() + (p.expiresInDays || 14) * 86_400_000)

  try {
    const res = await deliverCustomerEmail(
      { id: ctx.userId, name: ctx.name },
      {
        trdrId: p.trdrId, programId: p.programId ?? undefined, applicationId: p.applicationId ?? undefined,
        to, subject: p.subject, bodyHtml,
        fileRequest: { title: p.subject, message, expiresAt: expiresAt.toISOString(), items: items.map(label => ({ label, required: true })) },
      },
    )
    if (!res.ok) throw new Error(res.error ?? 'Η αποστολή απέτυχε.')
    await prisma.thanosAction.update({ where: { id }, data: { result: { threadId: res.threadId, url: res.fileRequestUrl, to, items } } })
    return { ok: true, data: { url: res.fileRequestUrl } }
  } catch (err) {
    await prisma.thanosAction.update({ where: { id }, data: { status: 'ERROR', error: errMsg(err).slice(0, 400) } })
    return { ok: false, error: errMsg(err) }
  }
}

export async function cancelThanosAction(id: string): Promise<Res<null>> {
  const ctx = await resolveThanosContext()
  if (!ctx) return { ok: false, error: 'Δεν είστε συνδεδεμένοι.' }
  const r = await prisma.thanosAction.updateMany({ where: { id, userId: ctx.userId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
  return r.count ? { ok: true, data: null } : { ok: false, error: 'Η ενέργεια δεν είναι πλέον ενεργή.' }
}
