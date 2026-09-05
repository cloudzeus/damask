'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { logActivity } from '@/lib/activity/log'
import { newToken, hashToken } from '@/lib/pm/portal-token'
import { NEWSLETTER_CONSENT_TEXT, NEWSLETTER_CONSENT_VERSION } from '@/lib/public-lead/consent'
import type { NewsletterStatus } from '@prisma/client'

/**
 * Διαχείριση newsletter (admin). Λίστα εγγεγραμμένων, αποδείξεις συναίνεσης
 * (GDPR), αιτήματα δημόσιας φόρμας, χειροκίνητη εγγραφή/διαγραφή. Κάθε
 * subscribe/unsubscribe αφήνει αμετάβλητο ίχνος στο NewsletterConsent.
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

export type SubscriberRow = {
  id: string
  email: string
  name: string | null
  afm: string | null
  trdrId: string | null
  source: string
  status: NewsletterStatus
  confirmedAt: string | null
  createdAt: string
}

export async function listSubscribers(): Promise<SubscriberRow[]> {
  await requirePermission('newsletter.view')
  const rows = await prisma.newsletterSubscription.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    afm: r.afm,
    trdrId: r.trdrId,
    source: r.source,
    status: r.status,
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export type ConsentRow = {
  id: string
  email: string
  afm: string | null
  action: string
  method: string
  consentText: string
  consentVersion: string | null
  ip: string | null
  userAgent: string | null
  source: string | null
  createdAt: string
}

export async function listConsents(email?: string): Promise<ConsentRow[]> {
  await requirePermission('newsletter.view')
  const rows = await prisma.newsletterConsent.findMany({
    where: email ? { email } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return rows.map(r => ({
    id: r.id,
    email: r.email,
    afm: r.afm,
    action: r.action,
    method: r.method,
    consentText: r.consentText,
    consentVersion: r.consentVersion,
    ip: r.ip,
    userAgent: r.userAgent,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  }))
}

export type LeadRequestRow = {
  id: string
  afm: string
  companyName: string | null
  email: string
  phone: string
  status: string
  newsletterOptIn: boolean
  eligibleCount: number
  trdrId: string | null
  createdAt: string
  verifiedAt: string | null
}

export async function listLeadRequests(): Promise<LeadRequestRow[]> {
  await requirePermission('newsletter.view')
  const rows = await prisma.publicLeadRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 300 })
  return rows.map(r => ({
    id: r.id,
    afm: r.afm,
    companyName: r.companyName,
    email: r.email,
    phone: r.phone,
    status: r.status,
    newsletterOptIn: r.newsletterOptIn,
    eligibleCount: r.eligibleProgramIds.length,
    trdrId: r.trdrId,
    createdAt: r.createdAt.toISOString(),
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
  }))
}

async function ip(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : h.get('x-real-ip')) || null
}

/** Χειροκίνητη εγγραφή από υπάλληλο (καταγράφεται ως method ADMIN). */
export async function adminSubscribe(input: { email: string; name?: string; afm?: string }): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('newsletter.manage')
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Μη έγκυρο email.' }
  await prisma.newsletterSubscription.upsert({
    where: { email },
    create: { email, name: input.name?.trim() || null, afm: input.afm?.trim() || null, source: 'ADMIN', status: 'SUBSCRIBED', confirmedAt: new Date() },
    update: { status: 'SUBSCRIBED', confirmedAt: new Date(), name: input.name?.trim() || undefined },
  })
  await prisma.newsletterConsent.create({
    data: {
      email, afm: input.afm?.trim() || null, action: 'SUBSCRIBE', method: 'ADMIN',
      consentText: NEWSLETTER_CONSENT_TEXT, consentVersion: NEWSLETTER_CONSENT_VERSION,
      ip: await ip(), source: 'admin', userAgent: 'admin-panel',
    },
  })
  await logActivity('newsletter.subscribe', { entityType: 'NewsletterSubscription', entityId: email, summary: email })
  revalidatePath('/newsletter')
  return { ok: true }
}

/** Διαγραφή (opt-out) από υπάλληλο — αφήνει ίχνος UNSUBSCRIBE. */
export async function adminUnsubscribe(email: string): Promise<{ ok: boolean }> {
  await requirePermission('newsletter.manage')
  const e = email.trim().toLowerCase()
  await prisma.newsletterSubscription.update({ where: { email: e }, data: { status: 'UNSUBSCRIBED' } }).catch(() => {})
  await prisma.newsletterConsent.create({
    data: { email: e, action: 'UNSUBSCRIBE', method: 'ADMIN', consentText: '(Διαγραφή από υπάλληλο)', ip: await ip(), source: 'admin' },
  })
  await logActivity('newsletter.unsubscribe', { entityType: 'NewsletterSubscription', entityId: e, summary: e })
  revalidatePath('/newsletter')
  return { ok: true }
}

/** Δημιουργεί (rotate) unsubscribe token για μια εγγραφή και επιστρέφει το URL. */
export async function getUnsubscribeUrl(subscriptionId: string): Promise<{ ok: boolean; url?: string }> {
  await requirePermission('newsletter.manage')
  const { raw, hash } = newToken()
  await prisma.newsletterSubscription.update({ where: { id: subscriptionId }, data: { unsubscribeTokenHash: hash } })
  return { ok: true, url: `${APP_URL}/unsubscribe/${raw}` }
}

/** Δημόσια διαγραφή μέσω one-click token (χωρίς gate). */
export async function unsubscribeByToken(rawToken: string): Promise<{ ok: boolean; email?: string }> {
  const sub = await prisma.newsletterSubscription.findUnique({ where: { unsubscribeTokenHash: hashToken(rawToken) } })
  if (!sub) return { ok: false }
  await prisma.newsletterSubscription.update({ where: { id: sub.id }, data: { status: 'UNSUBSCRIBED' } })
  await prisma.newsletterConsent.create({
    data: { email: sub.email, afm: sub.afm, trdrId: sub.trdrId, action: 'UNSUBSCRIBE', method: 'UNSUBSCRIBE_LINK', consentText: '(One-click unsubscribe)', source: 'email-link' },
  })
  await logActivity('newsletter.unsubscribe', { userId: null, entityType: 'NewsletterSubscription', entityId: sub.email, summary: sub.email })
  return { ok: true, email: sub.email }
}
