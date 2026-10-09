import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications/service'
import { sendMail, isMailerConfigured, escapeHtml } from '@/lib/mailer'
import { emailFacts, emailNote, appUrl } from '@/lib/email/blocks'
import { documentHint } from './doc-hints'

/**
 * (Plain module.) Αρχείο που ΑΠΟΡΡΙΦΘΗΚΕ στον σύνδεσμο αιτήματος (π.χ. ο λογιστής έστειλε λάθος έγγραφο):
 *  • ειδοποίηση στο γραφείο (καμπανάκι) — τι ανέβηκε, γιατί απορρίφθηκε, τι εκκρεμεί·
 *  • email στον πελάτη (αν τον σύνδεσμο τον χρησιμοποιεί ΑΛΛΟΣ, π.χ. ο λογιστής του) με τα ζητούμενα.
 * Το πολύ μία φορά ανά αίτημα κάθε 60' — να μη γεμίζουν ειδοποιήσεις/emails σε διαδοχικές προσπάθειες.
 */
const THROTTLE_MS = 60 * 60 * 1000

export async function notifyRejectedUpload(input: { fileRequestId: string; itemLabel: string; fileName: string; reason: string }): Promise<void> {
  const fr = await prisma.fileRequest.findUnique({
    where: { id: input.fileRequestId },
    select: { id: true, title: true, email: true, trdrId: true, applicationId: true, createdById: true, items: { orderBy: { order: 'asc' }, select: { label: true, description: true, fileKey: true, fileUrl: true } } },
  })
  if (!fr) return
  const recent = await prisma.notification.findFirst({
    where: { entityType: 'FileRequest', entityId: fr.id, createdAt: { gte: new Date(Date.now() - THROTTLE_MS) } },
    select: { id: true },
  })
  if (recent) return

  const trdr = await prisma.trdr.findUnique({ where: { id: fr.trdrId }, select: { NAME: true, EMAIL: true } })
  const pending = fr.items.filter(i => !i.fileKey && !i.fileUrl)
  const who = fr.email ?? 'ο παραλήπτης του συνδέσμου'

  await createNotification({
    title: `Λάθος έγγραφο στο αίτημα: ${trdr?.NAME ?? ''}`,
    body: `${who} ανέβασε «${input.fileName}» για «${input.itemLabel}» — απορρίφθηκε από τον έλεγχο AI: ${input.reason} Εκκρεμούν ${pending.length}: ${pending.map(p => p.label).join(', ')}.`,
    entityType: 'FileRequest', entityId: fr.id,
    meta: { kind: 'file-request-rejected', trdrId: fr.trdrId, applicationId: fr.applicationId },
  })

  // Ο πελάτης: ο χρήστης-πελάτης που έστειλε τον σύνδεσμο, αλλιώς το email της επιχείρησης.
  const creator = fr.createdById ? await prisma.user.findUnique({ where: { id: fr.createdById }, select: { email: true, name: true, role: { select: { b2b: true } } } }) : null
  const customerEmail = (creator?.role?.b2b ? creator.email : null) ?? trdr?.EMAIL ?? null
  if (!customerEmail || customerEmail.toLowerCase() === (fr.email ?? '').toLowerCase()) return // ανεβάζει ο ίδιος ο πελάτης → το βλέπει στην οθόνη
  if (!(await isMailerConfigured())) return

  const list = pending.map(p => {
    const hint = documentHint(p.label, p.description)
    return `<li style="margin:0 0 8px;"><b>${escapeHtml(p.label)}</b>${hint ? `<br/><span style="font-size:13px;color:#474C60;">${escapeHtml(hint)}</span>` : ''}</li>`
  }).join('')
  const html = `<p>Καλησπέρα σας${creator?.name ? `, ${escapeHtml(creator.name.split(' ')[0])}` : ''},</p>`
    + `<p>Ο/Η <b>${escapeHtml(who)}</b> ανέβασε ένα έγγραφο στον σύνδεσμο που του στείλατε, αλλά <b>δεν ήταν αυτό που ζητήσαμε</b> — ο αυτόματος έλεγχος το απέρριψε, οπότε δεν αποθηκεύτηκε.</p>`
    + emailFacts([['Ανέβηκε', escapeHtml(input.fileName)], ['Για', escapeHtml(input.itemLabel)], ['Λόγος', escapeHtml(input.reason)]])
    + (pending.length ? `<p style="margin:18px 0 8px;"><b>Εκκρεμούν ακόμα:</b></p><ul style="padding-left:18px;margin:0;">${list}</ul>` : '')
    + emailNote('Θα του εμφανίστηκε ήδη η εξήγηση στη σελίδα ανεβάσματος. Αν χρειάζεται, προωθήστε του αυτό το email ή ζητήστε από τον βοηθό Thanos να του ξαναστείλει τον σύνδεσμο.')
  await sendMail({
    to: customerEmail, subject: `Λάθος έγγραφο από ${who} — ${trdr?.NAME ?? ''}`, html,
    heading: 'Το έγγραφο δεν έγινε δεκτό', preheader: `Εκκρεμούν ${pending.length} δικαιολογητικά`,
    ctaLabel: 'Άνοιγμα του portal', ctaUrl: appUrl('/portal'), refType: 'file-request-rejected', refId: fr.id,
  }).catch(() => null)
}
