import { describe, it, expect } from 'vitest'
import { summarizeObligations, type ReportObligation } from '@/lib/pm/reports'

const TODAY = Date.UTC(2026, 2, 10)
const o = (p: Partial<ReportObligation>): ReportObligation => ({ id: 'x', status: 'PENDING', dueDate: null, assigneeId: 'u1', assigneeName: 'Νίκος', programTitle: 'Πρ.Α', ...p })

describe('summarizeObligations', () => {
  it('counts open/overdue/dueThisWeek and breaks down', () => {
    const s = summarizeObligations([
      o({ id: '1', dueDate: '2026-03-01' }),
      o({ id: '2', dueDate: '2026-03-12' }),
      o({ id: '3', status: 'APPROVED', dueDate: '2026-03-01' }),
      o({ id: '4', dueDate: null }),
      o({ id: '5', dueDate: '2026-03-12', programTitle: 'Πρ.Β', assigneeId: 'u2', assigneeName: 'Άννα' }),
    ], TODAY)
    expect(s.open).toBe(4)
    expect(s.overdue).toBe(1)
    expect(s.dueThisWeek).toBe(2)
    expect(s.byProgram.find(p => p.programTitle === 'Πρ.Α')!.open).toBe(3)
    expect(s.byAssignee.find(a => a.assigneeId === 'u2')!.dueThisWeek).toBe(1)
  })
})
