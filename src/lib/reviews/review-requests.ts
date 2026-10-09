import { prisma } from '@/lib/prisma'
import { getIntegration } from '@/lib/settings'
import { escapeHtml } from '@/lib/mailer'
import { createNotification } from '@/lib/notifications/service'

/**
 * (Plain module.) Αιτήματα κριτικής Google (τοπικό SEO): σε «καλές στιγμές» του πελάτη — έγκριση έργου ή
 * πληρωμή δόσης — ευχαριστήριο email με κουμπί «Γράψτε μια κριτική». Μία φορά ανά έργο, ΜΟΝΟ για γεγονότα
 * από την ενεργοποίηση και μετά (όχι μαζικά emails σε παλιούς πελάτες). Καταγραφή στο καμπανάκι του γραφείου.
 */

/** Ενεργοποίηση της λειτουργίας — γεγονότα πριν από αυτή την ημερομηνία αγνοούνται. */
const SINCE = new Date('2026-10-09T00:00:00Z')
/** Καρτέλα επιχείρησης στο Google (έχει κουμπί «Γράψτε κριτική») — όταν δεν έχει οριστεί ο άμεσος σύνδεσμος. */
const FALLBACK_URL = 'https://www.google.com/search?kgmid=/g/11zzcqxtkl'

export async function googleReviewUrl(): Promise<string> {
  const g = await getIntegration<{ reviewUrl?: string }>('gtags').catch(() => ({} as { reviewUrl?: string }))
  return g.reviewUrl?.trim() || FALLBACK_URL
}

type Moment = { applicationId: string; kind: 'approval' | 'payment'; at: Date; amount: number | null }

/** Καθημερινό tick: εντοπίζει νέες εγκρίσεις/πληρωμές και στέλνει (μία φορά ανά έργο) το αίτημα κριτικής. */
export async function runReviewRequests(): Promise<{ sent: number }> {
  const [approvals, payments] = await Promise.all([
    prisma.proposalSubmission.findMany({ where: { status: 'APPROVED', decidedAt: { gte: SINCE } }, select: { applicationId: true, decidedAt: true } }),
    prisma.paymentRequest.findMany({ where: { status: 'PAID', paidAt: { gte: SINCE } }, select: { applicationId: true, paidAt: true, paidAmount: true } }),
  ])
  const moments: Moment[] = [
    ...approvals.map(a => ({ applicationId: a.applicationId, kind: 'approval' as const, at: a.decidedAt!, amount: null })),
    ...payments.map(p => ({ applicationId: p.applicationId, kind: 'payment' as const, at: p.paidAt!, amount: p.paidAmount != null ? Number(p.paidAmount) : null })),
  ]
  if (!moments.length) return { sent: 0 }
  const done = new Set((await prisma.notification.findMany({ where: { entityType: 'ReviewRequest', entityId: { in: moments.map(m => m.applicationId) } }, select: { entityId: true } })).map(n => n.entityId))
  const url = await googleReviewUrl()
  const { deliverCustomerEmail } = await import('@/lib/email/deliver')
  let sent = 0
  for (const m of moments) {
    if (done.has(m.applicationId)) continue
    done.add(m.applicationId)
    const app = await prisma.programApplication.findUnique({
      where: { id: m.applicationId },
      select: {
        id: true, trdrId: true, programId: true, managerId: true,
        trdr: { select: { NAME: true, EMAIL: true } }, program: { select: { title: true } },
        contactLinks: { select: { contact: { select: { name: true, email: true } } } },
      },
    })
    if (!app) continue
    const to = [...new Set([...app.contactLinks.map(l => l.contact.email), app.trdr.EMAIL].filter((e): e is string => !!e && /@/.test(e)).map(e => e.toLowerCase()))].slice(0, 3)
    if (!to.length) continue
    const actor = app.managerId
      ? { id: app.managerId }
      : await prisma.user.findFirst({ where: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN'] } }, active: true }, select: { id: true, name: true } })
    if (!actor) continue
    const greeting = app.contactLinks[0]?.contact.name ? `Καλησπέρα σας, ${escapeHtml(app.contactLinks[0].contact.name.split(' ')[0])}` : 'Καλησπέρα σας'
    const news = m.kind === 'approval'
      ? `Χαιρόμαστε πολύ που το έργο σας στο πρόγραμμα <b>«${escapeHtml(app.program.title)}»</b> <b>εγκρίθηκε</b>! Συγχαρητήρια.`
      : `Χαιρόμαστε πολύ που <b>πληρώθηκε</b> η επιδότηση${m.amount ? ` (${m.amount.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })})` : ''} για το έργο σας στο <b>«${escapeHtml(app.program.title)}»</b>.`
    const bodyHtml = `<p>${greeting},</p><p>${news}</p>`
      + '<p>Αν είστε ικανοποιημένοι από τη συνεργασία μας, θα μας βοηθούσε πολύ μια σύντομη κριτική στο Google — χρειάζεται μόνο ένα λεπτό και βοηθά κι άλλες επιχειρήσεις να μας βρουν.</p>'
      + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:999px;background:#001B72;"><a href="${url}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">★ Γράψτε μια κριτική</a></td></tr></table>`
      + '<p>Σας ευχαριστούμε για την εμπιστοσύνη!<br/>Η ομάδα της World Wide Associates</p>'
    const res = await deliverCustomerEmail(actor, {
      trdrId: app.trdrId, programId: app.programId, applicationId: app.id,
      to: to.join(','), subject: m.kind === 'approval' ? 'Συγχαρητήρια για την έγκριση! — World Wide Associates' : 'Η επιδότησή σας πληρώθηκε — World Wide Associates', bodyHtml,
    }).catch(err => ({ ok: false, error: String(err) }))
    await createNotification({
      title: `Αίτημα κριτικής Google: ${app.trdr.NAME}`,
      body: res.ok ? `Στάλθηκε (${m.kind === 'approval' ? 'έγκριση έργου' : 'πληρωμή'}) σε ${to.join(', ')}.` : `Η αποστολή απέτυχε: ${'error' in res ? res.error : ''}`,
      entityType: 'ReviewRequest', entityId: app.id, meta: { kind: 'review-request', moment: m.kind },
    })
    if (res.ok) sent++
  }
  return { sent }
}
