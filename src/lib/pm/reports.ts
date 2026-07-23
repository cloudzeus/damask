import type { ObligationStatusStr } from '@/lib/pm/types'

export type ReportObligation = { id: string; status: ObligationStatusStr; dueDate: string | null; assigneeId: string | null; assigneeName: string | null; programTitle: string }
type Counts = { open: number; overdue: number; dueThisWeek: number }
export type ObligationSummary = Counts & { total: number
  byProgram: ({ programTitle: string } & Counts)[]
  byAssignee: ({ assigneeId: string; assigneeName: string } & Counts)[]
}

const OPEN: ObligationStatusStr[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED']
const DAY = 86_400_000

export function summarizeObligations(items: ReportObligation[], todayMs: number): ObligationSummary {
  const weekEnd = todayMs + 7 * DAY
  const blank = (): Counts => ({ open: 0, overdue: 0, dueThisWeek: 0 })
  const progs = new Map<string, Counts>(); const asgs = new Map<string, { assigneeName: string } & Counts>()
  let open = 0, overdue = 0, dueThisWeek = 0
  for (const it of items) {
    const isOpen = OPEN.includes(it.status)
    let od = false, wk = false
    if (isOpen && it.dueDate) {
      const d = Date.parse(it.dueDate.slice(0, 10) + 'T00:00:00Z')
      if (!Number.isNaN(d)) { if (d < todayMs) od = true; else if (d < weekEnd) wk = true }
    }
    if (isOpen) open++; if (od) overdue++; if (wk) dueThisWeek++
    if (!progs.has(it.programTitle)) progs.set(it.programTitle, blank())
    const p = progs.get(it.programTitle)!; if (isOpen) p.open++; if (od) p.overdue++; if (wk) p.dueThisWeek++
    if (it.assigneeId) {
      if (!asgs.has(it.assigneeId)) asgs.set(it.assigneeId, { assigneeName: it.assigneeName ?? '—', ...blank() })
      const a = asgs.get(it.assigneeId)!; if (isOpen) a.open++; if (od) a.overdue++; if (wk) a.dueThisWeek++
    }
  }
  const bySeverity = (a: Counts, b: Counts) => b.overdue - a.overdue || b.open - a.open
  return {
    total: items.length, open, overdue, dueThisWeek,
    byProgram: [...progs.entries()].map(([programTitle, c]) => ({ programTitle, ...c })).sort(bySeverity),
    byAssignee: [...asgs.entries()].map(([assigneeId, c]) => ({ assigneeId, ...c })).sort(bySeverity),
  }
}
