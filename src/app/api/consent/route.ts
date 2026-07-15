import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getClientIp } from '@/lib/client-ip'
import { parseUserAgent } from '@/lib/user-agent'
import { loadConsentConfig } from '@/lib/settings'
import {
  CONSENT_COOKIE_NAME, VISITOR_COOKIE_NAME, CONSENT_COOKIE_MAX_AGE, parseAcceptLanguageLocale,
} from '@/lib/consent'

export const runtime = 'nodejs'

const bodySchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
})

/**
 * Καταγράφει ΚΑΘΕ submit του consent banner (Αποδοχή όλων / Μόνο απαραίτητα /
 * Προσαρμογή → Αποθήκευση) με πραγματική IP, User-Agent (parsed OS/browser),
 * locale, ώρα. Θέτει τα cookies damask-consent (SSR gating στο (public) layout)
 * + damask-visitor (συνέχεια ConsentLog.visitorId) — και τα δύο httpOnly, το
 * client δεν χρειάζεται να τα διαβάσει (ο banner κλείνει μέσω local state +
 * router.refresh() ξαναδιαβάζει server-side).
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα συγκατάθεσης.' }, { status: 400 })
  }

  const [config, session, cookieStore] = await Promise.all([loadConsentConfig(), auth(), cookies()])

  const visitorId = cookieStore.get(VISITOR_COOKIE_NAME)?.value || randomUUID()
  const ip = getClientIp(request.headers)
  const userAgent = request.headers.get('user-agent') ?? ''
  const { os, browser } = parseUserAgent(userAgent)
  const locale = parseAcceptLanguageLocale(request.headers.get('accept-language'))

  const choices = { necessary: true, analytics: parsed.data.analytics, marketing: parsed.data.marketing }

  const log = await prisma.consentLog.create({
    data: {
      visitorId,
      userId: session?.user?.id ?? null,
      ip,
      userAgent,
      os,
      browser,
      locale,
      choices,
      policyVersion: config.policyVersion,
    },
  })

  const secure = process.env.NODE_ENV === 'production'

  cookieStore.set(VISITOR_COOKIE_NAME, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: CONSENT_COOKIE_MAX_AGE,
    path: '/',
  })
  cookieStore.set(
    CONSENT_COOKIE_NAME,
    JSON.stringify({ analytics: choices.analytics, marketing: choices.marketing, policyVersion: config.policyVersion }),
    { httpOnly: true, sameSite: 'lax', secure, maxAge: CONSENT_COOKIE_MAX_AGE, path: '/' },
  )

  return NextResponse.json({ ok: true, id: log.id })
}
