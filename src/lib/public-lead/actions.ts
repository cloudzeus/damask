'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { Prisma, type PublicLeadRequest } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { aadeLookup, AadeError, normalizeAfm } from '@/lib/trdr/aade'
import { resolveKadForActivity } from '@/lib/registries/kad'
import { matchRegion } from '@/lib/registries/regions'
import { computeSinglePair } from '@/lib/prospects/evaluate-pair'
import { ensureTrdrCdnFolder } from '@/lib/trdr/cdn-folder'
import { sendMail, isMailerConfigured } from '@/lib/mailer'
import { logActivity } from '@/lib/activity/log'
import { createNotification } from '@/lib/notifications/service'
import { otpEmail, teamNewLeadEmail } from '@/lib/public-lead/emails'
import { NEWSLETTER_CONSENT_TEXT, NEWSLETTER_CONSENT_VERSION } from '@/lib/public-lead/consent'
import {
  generateOtp,
  hashOtp,
  hashIp,
  otpExpiry,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
} from '@/lib/public-lead/otp'

/**
 * Δημόσια ροή επιλεξιμότητας (landing) — ΧΩΡΙΣ permission gate (public server
 * actions). Ροή: startLeadRequest (ΑΦΜ+email+τηλ → ΑΑΔΕ επωνυμία → OTP email) →
 * verifyLeadOtp (επιβεβαίωση → εντοπισμός ΚΑΔ/Περιφέρειας → έλεγχος ενεργών
 * προγραμμάτων → καταχώριση υποψηφίου + leads + newsletter/συναίνεση + ειδοποίηση
 * ομάδας). Ποτέ δεν αποθηκεύουμε τον κωδικό OTP (μόνο hash).
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

// Anti-abuse: max αιτήματα ανά IP σε παράθυρο, max ενεργά PENDING ανά ΑΦΜ.
const MAX_REQUESTS_PER_IP_PER_HOUR = 12
const MAX_PENDING_PER_AFM = 3

const startSchema = z.object({
  afm: z.string().trim().regex(/^\d{9}$/, 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.'),
  email: z.email('Μη έγκυρο email.'),
  phone: z.string().trim().regex(/^[\d\s()+-]{7,20}$/, 'Μη έγκυρο τηλέφωνο.'),
  newsletterOptIn: z.boolean().optional().default(false),
})

export type StartLeadState = {
  ok: boolean
  requestId?: string
  companyName?: string | null
  error?: string
  fieldErrors?: Partial<Record<'afm' | 'email' | 'phone', string>>
}

type AadeSnapshot = {
  name: string | null
  address: string | null
  city: string | null
  zip: string | null
  activities: { code: string; description: string; kind: 'PRIMARY' | 'SECONDARY'; order: number }[]
}

async function clientMeta(): Promise<{ ipHash: string | null; ip: string | null; userAgent: string | null }> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0].trim() : h.get('x-real-ip')) || null
  const userAgent = h.get('user-agent')
  return { ipHash: ip ? hashIp(ip) : null, ip, userAgent }
}

/** Βήμα 1: επικύρωση, ΑΑΔΕ lookup επωνυμίας, δημιουργία αιτήματος + αποστολή OTP. */
export async function startLeadRequest(input: {
  afm: string
  email: string
  phone: string
  newsletterOptIn?: boolean
}): Promise<StartLeadState> {
  const parsed = startSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: StartLeadState['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as 'afm' | 'email' | 'phone' | undefined
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors }
  }
  const data = parsed.data
  const afm = normalizeAfm(data.afm)
  const email = data.email.toLowerCase()

  if (!(await isMailerConfigured())) {
    return { ok: false, error: 'Η αποστολή email δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε αργότερα.' }
  }

  const { ipHash, userAgent } = await clientMeta()

  // Rate limiting (DB-based — δεν υπάρχει infra rate-limit στο repo).
  const oneHourAgo = new Date(Date.now() - 60 * 60_000)
  if (ipHash) {
    const recent = await prisma.publicLeadRequest.count({ where: { ipHash, createdAt: { gte: oneHourAgo } } })
    if (recent >= MAX_REQUESTS_PER_IP_PER_HOUR) {
      return { ok: false, error: 'Πολλά αιτήματα σε σύντομο διάστημα. Δοκιμάστε ξανά αργότερα.' }
    }
  }
  const pending = await prisma.publicLeadRequest.count({
    where: { afm, status: 'PENDING_OTP', otpExpiresAt: { gte: new Date() } },
  })
  if (pending >= MAX_PENDING_PER_AFM) {
    return { ok: false, error: 'Υπάρχει ήδη ενεργό αίτημα για αυτό το ΑΦΜ. Ελέγξτε το email σας ή δοκιμάστε σε λίγο.' }
  }

  // ΑΑΔΕ — εντοπισμός επωνυμίας + στιγμιότυπο (ΚΑΔ/διεύθυνση) για το βήμα 2.
  let companyName: string | null = null
  let snapshot: AadeSnapshot | null = null
  try {
    const res = await aadeLookup(afm)
    if (!res) {
      return { ok: false, error: 'Δεν βρέθηκαν στοιχεία για αυτό το ΑΦΜ στο μητρώο ΑΑΔΕ.' }
    }
    companyName = res.mapped.NAME || null
    snapshot = {
      name: res.mapped.NAME || null,
      address: res.mapped.ADDRESS,
      city: res.mapped.CITY,
      zip: res.mapped.ZIP,
      activities: res.activities
        .filter((a): a is { code: string; description: string | null; kind: 'PRIMARY' | 'SECONDARY'; order: number } => a.code != null)
        .map(a => ({ code: a.code, description: a.description ?? '', kind: a.kind, order: a.order })),
    }
  } catch (err) {
    if (err instanceof AadeError) return { ok: false, error: err.message }
    return { ok: false, error: 'Αδυναμία επικοινωνίας με την υπηρεσία ΑΑΔΕ. Δοκιμάστε ξανά σε λίγο.' }
  }

  const code = generateOtp()
  const request = await prisma.publicLeadRequest.create({
    data: {
      afm,
      email,
      phone: data.phone,
      companyName,
      otpHash: hashOtp(code),
      otpExpiresAt: otpExpiry(),
      newsletterOptIn: data.newsletterOptIn ?? false,
      ipHash,
      userAgent,
      aadeSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      status: 'PENDING_OTP',
    },
  })

  const mail = otpEmail(code, companyName)
  const sent = await sendMail({ to: email, subject: mail.subject, html: mail.html, tracking: false, refType: 'public-lead-otp', refId: request.id })
  if (!sent.ok) {
    await prisma.publicLeadRequest.update({ where: { id: request.id }, data: { status: 'FAILED' } }).catch(() => {})
    return { ok: false, error: 'Δεν ήταν δυνατή η αποστολή του κωδικού. Ελέγξτε το email σας ή δοκιμάστε ξανά.' }
  }

  await logActivity('public_lead.request', { userId: null, entityType: 'PublicLeadRequest', entityId: request.id, summary: companyName ?? afm })
  return { ok: true, requestId: request.id, companyName }
}

export type EligibleProgram = { id: string; title: string; matchedKads: string[] }

export type VerifyLeadState = {
  ok: boolean
  companyName?: string | null
  eligible?: EligibleProgram[]
  error?: string
  remainingAttempts?: number
}

/** Βήμα 2: επιβεβαίωση OTP → αξιολόγηση + καταχώριση. */
export async function verifyLeadOtp(input: { requestId: string; code: string }): Promise<VerifyLeadState> {
  const code = (input.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Ο κωδικός πρέπει να έχει 6 ψηφία.' }

  const request = await prisma.publicLeadRequest.findUnique({ where: { id: input.requestId } })
  if (!request) return { ok: false, error: 'Το αίτημα δεν βρέθηκε. Ξεκινήστε ξανά.' }
  if (request.status === 'VERIFIED') {
    return { ok: false, error: 'Το αίτημα έχει ήδη επιβεβαιωθεί.' }
  }
  if (request.status !== 'PENDING_OTP') {
    return { ok: false, error: 'Το αίτημα δεν είναι πλέον ενεργό. Ξεκινήστε ξανά.' }
  }
  if (request.otpExpiresAt.getTime() < Date.now()) {
    await prisma.publicLeadRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } }).catch(() => {})
    return { ok: false, error: 'Ο κωδικός έληξε. Ζητήστε νέο κωδικό.' }
  }
  if (request.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.publicLeadRequest.update({ where: { id: request.id }, data: { status: 'FAILED' } }).catch(() => {})
    return { ok: false, error: 'Υπερβήκατε τον μέγιστο αριθμό προσπαθειών. Ξεκινήστε ξανά.' }
  }

  if (hashOtp(code) !== request.otpHash) {
    const updated = await prisma.publicLeadRequest.update({
      where: { id: request.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts)
    if (remaining === 0) {
      await prisma.publicLeadRequest.update({ where: { id: request.id }, data: { status: 'FAILED' } }).catch(() => {})
      return { ok: false, error: 'Λάθος κωδικός. Υπερβήκατε τις προσπάθειες — ξεκινήστε ξανά.' }
    }
    return { ok: false, error: 'Λάθος κωδικός.', remainingAttempts: remaining }
  }

  // ── Επιτυχής επιβεβαίωση → finalize ────────────────────────────────────────
  return finalizeVerifiedLead(request)
}

/** Νέος OTP κωδικός (rate-limited). */
export async function resendLeadOtp(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const request = await prisma.publicLeadRequest.findUnique({ where: { id: requestId } })
  if (!request) return { ok: false, error: 'Το αίτημα δεν βρέθηκε.' }
  if (request.status !== 'PENDING_OTP') return { ok: false, error: 'Το αίτημα δεν είναι ενεργό.' }
  if (request.resendCount >= OTP_MAX_RESENDS) return { ok: false, error: 'Έχετε ζητήσει ήδη νέο κωδικό αρκετές φορές. Ξεκινήστε ξανά.' }
  if (!(await isMailerConfigured())) return { ok: false, error: 'Η αποστολή email δεν είναι διαθέσιμη.' }

  const code = generateOtp()
  await prisma.publicLeadRequest.update({
    where: { id: request.id },
    data: { otpHash: hashOtp(code), otpExpiresAt: otpExpiry(), resendCount: { increment: 1 }, attempts: 0 },
  })
  const mail = otpEmail(code, request.companyName)
  const sent = await sendMail({ to: request.email, subject: mail.subject, html: mail.html, tracking: false, refType: 'public-lead-otp', refId: request.id })
  if (!sent.ok) return { ok: false, error: 'Δεν ήταν δυνατή η αποστολή του κωδικού.' }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────

async function finalizeVerifiedLead(request: PublicLeadRequest): Promise<VerifyLeadState> {
  const snapshot = (request.aadeSnapshot ?? null) as AadeSnapshot | null
  const now = new Date()

  // 1) Trdr υποψήφιος — upsert κατά ΑΦΜ (AFM δεν είναι unique → findFirst).
  const existing = await prisma.trdr.findFirst({ where: { AFM: request.afm }, select: { id: true, ISPROSP: true } })
  const trdrId = existing
    ? existing.id
    : (
        await prisma.trdr.create({
          data: {
            NAME: snapshot?.name || request.companyName || `ΑΦΜ ${request.afm}`,
            AFM: request.afm,
            SODTYPE: 13,
            ISPROSP: 1,
            EMAIL: request.email,
            PHONE01: request.phone,
            ADDRESS: snapshot?.address ?? undefined,
            CITY: snapshot?.city ?? undefined,
            ZIP: snapshot?.zip ?? undefined,
            appNotes: 'Καταχωρίστηκε αυτόματα από τη δημόσια φόρμα επιλεξιμότητας.',
          },
          select: { id: true },
        })
      ).id

  // Αυτόματος φάκελος στο CDN (idempotent).
  await ensureTrdrCdnFolder(trdrId)

  // 2) ΚΑΔ — γράφουμε μόνο αν δεν υπάρχουν ήδη (μη επεμβαίνουμε σε υπάρχοντα πελάτη).
  const existingKads = await prisma.trdrKad.count({ where: { trdrId } })
  if (existingKads === 0 && snapshot?.activities?.length) {
    const resolved = await Promise.all(
      snapshot.activities.map(async a => ({ ...(await resolveKadForActivity(a.code, a.description)), kind: a.kind, order: a.order })),
    )
    const byCode = new Map<string, { code: string; codeWithoutDots: string; codeAade: string; description: string; kind: 'PRIMARY' | 'SECONDARY'; order: number }>()
    for (const r of resolved) {
      const prev = byCode.get(r.code)
      if (!prev || (prev.kind !== 'PRIMARY' && r.kind === 'PRIMARY')) byCode.set(r.code, r)
    }
    const rows = [...byCode.values()].map(r => ({
      trdrId,
      code: r.code,
      codeWithoutDots: r.codeWithoutDots,
      codeAade: r.codeAade,
      description: r.description,
      kind: r.kind,
      order: r.order,
    }))
    if (rows.length) await prisma.trdrKad.createMany({ data: rows, skipDuplicates: true })
  }

  // 3) Περιφέρεια — geocode/name-match από τη διεύθυνση ΑΑΔΕ (μόνο αν λείπει).
  const trdrRegion = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { regionCode: true } })
  if (!trdrRegion?.regionCode && (snapshot?.city || snapshot?.address)) {
    try {
      const match = await matchRegion({ city: snapshot.city, address: snapshot.address, zip: snapshot.zip })
      if (match) {
        await prisma.trdr.update({ where: { id: trdrId }, data: { regionCode: match.regionCode, geocodedAt: now } })
      }
    } catch (err) {
      console.error('finalizeVerifiedLead: region match failed', err)
    }
  }

  // 4) Αξιολόγηση έναντι ΟΛΩΝ των ενεργών προγραμμάτων.
  const activePrograms = await prisma.program.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, title: true },
    take: 60,
  })
  const eligible: EligibleProgram[] = []
  for (const p of activePrograms) {
    try {
      const r = await computeSinglePair(trdrId, p.id)
      if (r.eligible) eligible.push({ id: p.id, title: p.title, matchedKads: r.matchedKads })
    } catch (err) {
      console.error(`finalizeVerifiedLead: eval failed for program ${p.id}`, err)
    }
  }

  // 5) ProgramLead SAVED για κάθε επιλέξιμο πρόγραμμα.
  for (const e of eligible) {
    await prisma.programLead
      .upsert({
        where: { programId_trdrId: { programId: e.id, trdrId } },
        create: { programId: e.id, trdrId, email: request.email, status: 'SAVED' },
        update: {},
      })
      .catch(err => console.error('finalizeVerifiedLead: lead upsert failed', err))
  }

  // 6) Newsletter + απόδειξη συναίνεσης (double opt-in μέσω OTP).
  if (request.newsletterOptIn) {
    await subscribeWithConsent({
      email: request.email,
      afm: request.afm,
      name: request.companyName,
      trdrId,
      ip: null, // η IP κρατείται στο consent από τα headers παρακάτω
      userAgent: request.userAgent,
      publicLeadRequestId: request.id,
    })
  }

  // 7) Ενημέρωση αιτήματος.
  await prisma.publicLeadRequest.update({
    where: { id: request.id },
    data: { status: 'VERIFIED', verifiedAt: now, trdrId, eligibleProgramIds: eligible.map(e => e.id) },
  })

  // 8) Ειδοποίηση ομάδας — dashboard + email.
  await notifyTeam({
    companyName: request.companyName,
    afm: request.afm,
    email: request.email,
    phone: request.phone,
    newsletterOptIn: request.newsletterOptIn,
    eligible,
    requestId: request.id,
  })

  await logActivity('public_lead.verified', {
    userId: null,
    entityType: 'PublicLeadRequest',
    entityId: request.id,
    summary: request.companyName ?? request.afm,
    meta: { eligible: eligible.length, trdrId },
  })

  return { ok: true, companyName: request.companyName, eligible }
}

/** Εγγραφή στο newsletter + append-only απόδειξη συναίνεσης. */
async function subscribeWithConsent(input: {
  email: string
  afm?: string | null
  name?: string | null
  trdrId?: string | null
  ip?: string | null
  userAgent?: string | null
  publicLeadRequestId?: string | null
}): Promise<void> {
  const meta = await clientMeta()
  const now = new Date()
  try {
    await prisma.newsletterSubscription.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        name: input.name ?? null,
        afm: input.afm ?? null,
        trdrId: input.trdrId ?? null,
        source: 'PUBLIC_LEAD',
        status: 'SUBSCRIBED',
        confirmedAt: now,
      },
      update: {
        status: 'SUBSCRIBED',
        confirmedAt: now,
        trdrId: input.trdrId ?? undefined,
        afm: input.afm ?? undefined,
        name: input.name ?? undefined,
      },
    })
    await prisma.newsletterConsent.create({
      data: {
        email: input.email,
        afm: input.afm ?? null,
        trdrId: input.trdrId ?? null,
        action: 'SUBSCRIBE',
        method: 'DOUBLE_OPT_IN_OTP',
        consentText: NEWSLETTER_CONSENT_TEXT,
        consentVersion: NEWSLETTER_CONSENT_VERSION,
        ip: meta.ip,
        userAgent: meta.userAgent ?? input.userAgent ?? null,
        source: 'eligibility-form',
        publicLeadRequestId: input.publicLeadRequestId ?? null,
      },
    })
    await logActivity('newsletter.subscribe', { userId: null, entityType: 'NewsletterSubscription', entityId: input.email, summary: input.name ?? input.email })
  } catch (err) {
    console.error('subscribeWithConsent failed', err)
  }
}

async function notifyTeam(input: {
  companyName: string | null
  afm: string
  email: string
  phone: string
  newsletterOptIn: boolean
  eligible: EligibleProgram[]
  requestId: string
}): Promise<void> {
  const name = input.companyName || `ΑΦΜ ${input.afm}`
  await createNotification({
    type: 'PUBLIC_LEAD',
    title: `Νέο αίτημα επιλεξιμότητας — ${name}`,
    body: `${input.eligible.length} επιλέξιμα προγράμματα · ${input.email} · ${input.phone}`,
    entityType: 'PublicLeadRequest',
    entityId: input.requestId,
    meta: {
      afm: input.afm,
      email: input.email,
      phone: input.phone,
      newsletterOptIn: input.newsletterOptIn,
      eligibleCount: input.eligible.length,
    },
  })

  // Email στην ομάδα (admins/managers).
  try {
    if (!(await isMailerConfigured())) return
    const staff = await prisma.user.findMany({
      where: { active: true, role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] } } },
      select: { email: true },
    })
    const recipients = [...new Set(staff.map(s => s.email).filter(Boolean))]
    if (recipients.length === 0) return
    const mail = teamNewLeadEmail({
      companyName: input.companyName,
      afm: input.afm,
      email: input.email,
      phone: input.phone,
      eligibleCount: input.eligible.length,
      eligibleTitles: input.eligible.map(e => e.title),
      newsletterOptIn: input.newsletterOptIn,
      adminUrl: `${APP_URL}/newsletter`,
    })
    await sendMail({ to: recipients.join(','), subject: mail.subject, html: mail.html, tracking: false, refType: 'public-lead-team', refId: input.requestId })
  } catch (err) {
    console.error('notifyTeam email failed', err)
  }
}
