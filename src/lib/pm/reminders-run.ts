import { prisma } from '@/lib/prisma'
import { isMailerConfigured, sendMail } from '@/lib/mailer'
import { selectReminderObligations, groupRemindersByAssignee, buildReminderEmail, type ReminderObligation } from '@/lib/pm/reminders'
import type { ObligationStatusStr } from '@/lib/pm/types'

function startOfDayUtc(nowMs: number): number { const d = new Date(nowMs); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }

export async function runPmReminders(nowMs: number): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!(await isMailerConfigured())) { console.log('[pm-reminders] mailer not configured — skip'); return { sent: 0, skipped: 0, failed: 0 } }
  const todayMs = startOfDayUtc(nowMs)
  const rows = await prisma.applicationObligation.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS', 'SUBMITTED'] }, dueDate: { not: null }, assigneeId: { not: null } },
    include: { assignee: { select: { id: true, email: true, name: true } }, application: { select: { trdr: { select: { NAME: true } }, program: { select: { title: true } } } } },
  })
  const items: ReminderObligation[] = rows.map(r => ({
    id: r.id, name: r.name, status: r.status as ObligationStatusStr, dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    assigneeId: r.assigneeId, customerName: r.application?.trdr?.NAME ?? '—', programTitle: r.application?.program?.title ?? '—',
  }))
  const emailByAssignee = new Map<string, { email: string | null; name: string }>()
  for (const r of rows) if (r.assigneeId && !emailByAssignee.has(r.assigneeId)) emailByAssignee.set(r.assigneeId, { email: r.assignee?.email ?? null, name: r.assignee?.name ?? '' })

  const digests = groupRemindersByAssignee(selectReminderObligations(items, todayMs, 3), todayMs)
  const todayLabel = new Date(todayMs).toLocaleDateString('el-GR')
  let sent = 0, skipped = 0, failed = 0
  for (const d of digests) {
    const who = emailByAssignee.get(d.assigneeId)
    if (!who?.email) { skipped++; await prisma.reminderLog.create({ data: { userId: d.assigneeId, email: '', dueSoonCount: d.dueSoon.length, overdueCount: d.overdue.length, status: 'SKIPPED', error: 'no email' } }).catch(() => {}); continue }
    const already = await prisma.reminderLog.findFirst({ where: { userId: d.assigneeId, status: 'SENT', sentAt: { gte: new Date(todayMs) } } })
    if (already) { skipped++; continue }
    const mail = buildReminderEmail(who.name, d, todayLabel)
    const res = await sendMail({ to: who.email, subject: mail.subject, html: mail.html, text: mail.text, userId: d.assigneeId, refType: 'pm-reminder' })
    if (res.ok) { sent++; await prisma.reminderLog.create({ data: { userId: d.assigneeId, email: who.email, dueSoonCount: d.dueSoon.length, overdueCount: d.overdue.length, status: 'SENT' } }).catch(() => {}) }
    else { failed++; await prisma.reminderLog.create({ data: { userId: d.assigneeId, email: who.email, dueSoonCount: d.dueSoon.length, overdueCount: d.overdue.length, status: 'FAILED', error: res.error } }).catch(() => {}) }
  }
  console.log(`[pm-reminders] sent=${sent} skipped=${skipped} failed=${failed}`)
  return { sent, skipped, failed }
}
