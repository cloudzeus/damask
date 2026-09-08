import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications/service'
import { isMailerConfigured, sendMail, escapeHtml } from '@/lib/mailer'

/**
 * Υπενθύμιση επανεπικοινωνίας για εκκρεμή δικαιολογητικά. Ανά αίτηση (πρόγραμμα ×
 * πελάτη) ο διαχειριστής ορίζει κάθε πότε (docFollowupDays, default 7) θα
 * δημιουργείται alert στον manager + διεκπεραιωτή να ξανακάνουν επικοινωνία.
 * Fire όταν: υπάρχουν υποχρεωτικά δικαιολογητικά (FORM) που ΔΕΝ έχουν εγκριθεί,
 * ΚΑΙ πέρασαν ≥ docFollowupDays από το τελευταίο alert. Καλείται από το ημερήσιο
 * pg-boss tick (queue-start.ts). Non-throwing ανά αίτηση.
 */

const DAY_MS = 86_400_000

export async function runDocFollowupReminders(nowMs: number): Promise<{ alerts: number; emailed: number }> {
  const mailerOk = await isMailerConfigured()
  const apps = await prisma.programApplication.findMany({
    where: {
      docFollowupDays: { gt: 0 },
      obligations: { some: { kind: 'FORM', mandatory: true, status: { notIn: ['APPROVED', 'WAIVED'] } } },
    },
    select: {
      id: true, trdrId: true, docFollowupDays: true, docFollowupLastAt: true,
      trdr: { select: { NAME: true } },
      program: { select: { title: true } },
      manager: { select: { name: true, email: true } },
      processor: { select: { name: true, email: true } },
      _count: { select: { obligations: { where: { kind: 'FORM', mandatory: true, status: { notIn: ['APPROVED', 'WAIVED'] } } } } },
    },
  })

  let alerts = 0
  let emailed = 0
  for (const a of apps) {
    try {
      const dueMs = (a.docFollowupLastAt?.getTime() ?? 0) + a.docFollowupDays * DAY_MS
      if (a.docFollowupLastAt && nowMs < dueMs) continue // δεν πέρασε ακόμη το διάστημα

      const n = a._count.obligations
      const trdrName = a.trdr?.NAME ?? 'Εταιρία'
      const programTitle = a.program?.title ?? 'πρόγραμμα'
      const owners = [a.manager?.name, a.processor?.name].filter(Boolean).join(' / ') || '—'

      await createNotification({
        title: `Επανεπικοινωνία δικαιολογητικών: ${trdrName}`,
        body: `${n} εκκρεμή δικαιολογητικά για «${programTitle}». Υπεύθυνοι: ${owners}. Επικοινωνήστε με τον πελάτη.`,
        entityType: 'Trdr',
        entityId: a.trdrId,
        meta: { applicationId: a.id, kind: 'doc-followup', pending: n },
      })
      alerts++

      // Στοχευμένο email σε manager + διεκπεραιωτή (αν υπάρχει mailer + emails).
      if (mailerOk) {
        const recipients = [...new Set([a.manager?.email, a.processor?.email].filter((e): e is string => !!e))]
        for (const to of recipients) {
          const subject = `Εκκρεμή δικαιολογητικά — ${trdrName}`
          const html = `<p>Υπάρχουν <b>${n}</b> εκκρεμή (μη εγκεκριμένα) δικαιολογητικά για τον πελάτη <b>${escapeHtml(trdrName)}</b> στο πρόγραμμα <b>${escapeHtml(programTitle)}</b>.</p><p>Παρακαλώ επικοινωνήστε με τον πελάτη για τη συλλογή/συμπλήρωσή τους.</p>`
          const res = await sendMail({ to, subject, html, text: `${n} εκκρεμή δικαιολογητικά για ${trdrName} — ${programTitle}. Επικοινωνήστε με τον πελάτη.`, refType: 'doc-followup' })
          if (res.ok) emailed++
        }
      }

      await prisma.programApplication.update({ where: { id: a.id }, data: { docFollowupLastAt: new Date(nowMs) } })
    } catch (err) {
      console.error('[doc-followup] αποτυχία για αίτηση', a.id, err)
    }
  }
  console.log(`[doc-followup] alerts=${alerts} emailed=${emailed}`)
  return { alerts, emailed }
}
