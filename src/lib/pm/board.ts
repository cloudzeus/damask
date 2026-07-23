import type { ObligationStatusStr } from '@/lib/pm/types'

export const KANBAN_COLUMNS: ObligationStatusStr[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED']
export function isBoardStatus(s: ObligationStatusStr): boolean { return (KANBAN_COLUMNS as string[]).includes(s) }

export type BoardObligationLike = {
  id: string
  status: ObligationStatusStr
  dueDate: string | null
  assigneeId: string | null
  assigneeName: string | null
}

export type StatusGroups<T> = Record<'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'other', T[]>
export function groupByStatus<T extends BoardObligationLike>(items: T[]): StatusGroups<T> {
  const g: StatusGroups<T> = { PENDING: [], IN_PROGRESS: [], SUBMITTED: [], APPROVED: [], other: [] }
  for (const it of items) (isBoardStatus(it.status) ? g[it.status as keyof StatusGroups<T>] : g.other).push(it)
  return g
}

export type Swimlane<T> = { key: string; label: string; items: T[] }
export function groupBySwimlane<T extends BoardObligationLike>(items: T[]): Swimlane<T>[] {
  const byKey = new Map<string, Swimlane<T>>()
  for (const it of items) {
    const key = it.assigneeId ?? '__none__'
    const label = it.assigneeId ? (it.assigneeName ?? '—') : 'Χωρίς ανάθεση'
    if (!byKey.has(key)) byKey.set(key, { key, label, items: [] })
    byKey.get(key)!.items.push(it)
  }
  const lanes = [...byKey.values()]
  const none = lanes.filter(l => l.key === '__none__')
  const named = lanes.filter(l => l.key !== '__none__').sort((a, b) => a.label.localeCompare(b.label, 'el'))
  return [...named, ...none]
}

export type DeadlineBuckets<T> = { overdue: T[]; today: T[]; thisWeek: T[]; later: T[]; noDate: T[] }
export function bucketByDeadline<T extends BoardObligationLike>(items: T[], todayMidnightMs: number): DeadlineBuckets<T> {
  const DAY = 86_400_000
  const weekEnd = todayMidnightMs + 7 * DAY
  const r: DeadlineBuckets<T> = { overdue: [], today: [], thisWeek: [], later: [], noDate: [] }
  for (const it of items) {
    if (it.status === 'APPROVED' || it.status === 'WAIVED') continue
    if (!it.dueDate) { r.noDate.push(it); continue }
    const d = Date.parse(it.dueDate.slice(0, 10) + 'T00:00:00Z')
    if (Number.isNaN(d)) { r.noDate.push(it); continue }
    if (d < todayMidnightMs) r.overdue.push(it)
    else if (d === todayMidnightMs) r.today.push(it)
    else if (d < weekEnd) r.thisWeek.push(it)
    else r.later.push(it)
  }
  const byDate = (a: T, b: T) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  r.overdue.sort(byDate); r.today.sort(byDate); r.thisWeek.sort(byDate); r.later.sort(byDate)
  return r
}
