import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications/service'
import { isMailerConfigured, sendMail, escapeHtml } from '@/lib/mailer'

/**
 * Λήξη-reopen: FORM δικαιολογητικά που είχαν καλυφθεί (SUBMITTED/APPROVED) αλλά
 * το έγγραφό τους ΕΛΗΞΕ (κανένα σε ισχύ) → ξαναγίνονται PENDING (ξαναμπλοκάρουν
 * το στάδιο μέσω του hard gate) + alert στον manager/διεκπεραιωτή για ανανέωση.
 * Fire μία φορά ανά λήξη (μόλις γίνει PENDING δεν ξαναπιάνεται). Καλείται από το
 * ημερήσιο pg-boss tick. Non-throwing ανά εγγραφή.
 */

export async function runDocExpiryReopen(nowMs: number): Promise<{ reopened: number; emailed: number }> {
  const now = new Date(nowMs)
  const mailerOk = await isMailerConfigured()

  const candidates = await prisma.applicationObligation.findMany({
    where: {
      kind: 'FORM',
      status: { in: ['APPROVED', 'SUBMITTED'] },
      documents: { some: { expiresAt: { lt: now } } },
    },
    select: {
      id: true, name: true,
      documents: { select: { expiresAt: true } },
      application: {
        select: {
          id: true, trdrId: true,
          trdr: { select: { NAME: true } },
          program: { select: { title: true } },
          manager: { select: { name: true, email: true } },
          processor: { select: { name: true, email: true } },
        },
      },
    },
  })

  let reopened = 0
  let emailed = 0
  for (const o of candidates) {
    try {
      // Έγκυρο αν υπάρχει ΕΣΤΩ ΕΝΑ έγγραφο χωρίς λήξη ή με λήξη στο μέλλον.
      const stillValid = o.documents.some(d => !d.expiresAt || d.expiresAt.getTime() > nowMs)
      if (stillValid) continue

      await prisma.applicationObligation.update({
        where: { id: o.id },
        data: { status: 'PENDING', notes: 'Το δικαιολογητικό έληξε — απαιτείται ανανέωση.' },
      })

      const trdrName = o.application?.trdr?.NAME ?? 'Εταιρία'
      const programTitle = o.application?.program?.title ?? 'πρόγραμμα'
      const owners = [o.application?.manager?.name, o.application?.processor?.name].filter(Boolean).join(' / ') || '—'

      await createNotification({
        title: `Έληξε δικαιολογητικό: ${trdrName}`,
        body: `«${o.name}» για «${programTitle}» έληξε — απαιτείται ανανέωση. Υπεύθυνοι: ${owners}.`,
        entityType: 'Trdr',
        entityId: o.application?.trdrId ?? null,
        meta: { applicationId: o.application?.id, obligationId: o.id, kind: 'doc-expiry' },
      })
      reopened++

      if (mailerOk) {
        const recipients = [...new Set([o.application?.manager?.email, o.application?.processor?.email].filter((e): e is string => !!e))]
        for (const to of recipients) {
          const html = `<p>Το δικαιολογητικό <b>${escapeHtml(o.name)}</b> του πελάτη <b>${escapeHtml(trdrName)}</b> (πρόγραμμα <b>${escapeHtml(programTitle)}</b>) <b>έληξε</b>.</p><p>Η εκκρεμότητα άνοιξε ξανά — παρακαλώ φροντίστε για την ανανέωσή του.</p>`
          const res = await sendMail({ to, subject: `Έληξε δικαιολογητικό — ${trdrName}`, html, text: `Το δικαιολογητικό «${o.name}» (${trdrName} — ${programTitle}) έληξε. Απαιτείται ανανέωση.`, refType: 'doc-expiry' })
          if (res.ok) emailed++
        }
      }
    } catch (err) {
      console.error('[doc-expiry] αποτυχία για εκκρεμότητα', o.id, err)
    }
  }
  console.log(`[doc-expiry] reopened=${reopened} emailed=${emailed}`)
  return { reopened, emailed }
}
