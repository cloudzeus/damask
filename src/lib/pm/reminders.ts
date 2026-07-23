import type { ObligationStatusStr } from '@/lib/pm/types'

export type ReminderObligation = { id: string; name: string; status: ObligationStatusStr; dueDate: string | null; assigneeId: string | null; customerName: string; programTitle: string }
export type AssigneeDigest = { assigneeId: string; overdue: ReminderObligation[]; dueSoon: ReminderObligation[] }

const OPEN: ObligationStatusStr[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED']
const DAY = 86_400_000
function dueMs(d: string): number { return Date.parse(d.slice(0, 10) + 'T00:00:00Z') }

export function selectReminderObligations(items: ReminderObligation[], todayMs: number, windowDays = 3): ReminderObligation[] {
  const horizon = todayMs + windowDays * DAY
  return items.filter(it => {
    if (!OPEN.includes(it.status) || !it.assigneeId || !it.dueDate) return false
    const d = dueMs(it.dueDate); if (Number.isNaN(d)) return false
    return d < todayMs || d <= horizon
  })
}

export function groupRemindersByAssignee(selected: ReminderObligation[], todayMs: number): AssigneeDigest[] {
  const by = new Map<string, AssigneeDigest>()
  const byDate = (a: ReminderObligation, b: ReminderObligation) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  for (const it of selected) {
    const key = it.assigneeId!; if (!by.has(key)) by.set(key, { assigneeId: key, overdue: [], dueSoon: [] })
    ;(dueMs(it.dueDate!) < todayMs ? by.get(key)!.overdue : by.get(key)!.dueSoon).push(it)
  }
  const lanes = [...by.values()].filter(d => d.overdue.length + d.dueSoon.length > 0)
  for (const d of lanes) { d.overdue.sort(byDate); d.dueSoon.sort(byDate) }
  return lanes
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
function row(o: ReminderObligation): string { return `<li>${esc(o.name)} — ${esc(o.customerName)} · ${esc(o.programTitle)} — προθεσμία ${esc(o.dueDate ?? '')}</li>` }

export function buildReminderEmail(name: string, d: AssigneeDigest, todayLabel: string): { subject: string; html: string; text: string } {
  const subject = `Εκκρεμότητες έργων — ${d.overdue.length} εκπρόθεσμες, ${d.dueSoon.length} λήγουν σύντομα`
  const sec = (title: string, list: ReminderObligation[]) => list.length ? `<h3>${esc(title)}</h3><ul>${list.map(row).join('')}</ul>` : ''
  const html = `<p>Καλημέρα ${esc(name)},</p><p>Οι εκκρεμότητες των έργων σου (${esc(todayLabel)}):</p>` +
    sec('Εκπρόθεσμες', d.overdue) + sec('Λήγουν σε ≤3 ημέρες', d.dueSoon) +
    `<p>— Σύστημα Διαχείρισης Προγραμμάτων</p>`
  const text = [`Καλημέρα ${name},`, ...d.overdue.map(o => `[ΕΚΠΡΟΘΕΣΜΟ] ${o.name} — ${o.customerName} · ${o.programTitle} — ${o.dueDate}`), ...d.dueSoon.map(o => `[ΛΗΓΕΙ] ${o.name} — ${o.customerName} · ${o.programTitle} — ${o.dueDate}`)].join('\n')
  return { subject, html, text }
}
