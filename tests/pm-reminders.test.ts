import { describe, it, expect } from 'vitest'
import { selectReminderObligations, groupRemindersByAssignee, buildReminderEmail, type ReminderObligation } from '@/lib/pm/reminders'

const TODAY = Date.UTC(2026, 2, 10)
const o = (p: Partial<ReminderObligation>): ReminderObligation => ({ id: 'x', name: 'Έντυπο', status: 'PENDING', dueDate: null, assigneeId: 'u1', customerName: 'ΑΦΟΙ Α', programTitle: 'Πρ.', ...p })

describe('selectReminderObligations', () => {
  it('keeps overdue + due≤3d non-terminal with assignee', () => {
    const r = selectReminderObligations([
      o({ id: 'over', dueDate: '2026-03-01' }),
      o({ id: 'soon', dueDate: '2026-03-12' }),
      o({ id: 'far', dueDate: '2026-03-20' }),
      o({ id: 'done', status: 'APPROVED', dueDate: '2026-03-01' }),
      o({ id: 'noass', assigneeId: null, dueDate: '2026-03-01' }),
      o({ id: 'nodate', dueDate: null }),
    ], TODAY, 3)
    expect(r.map(x => x.id).sort()).toEqual(['over', 'soon'])
  })
})
describe('groupRemindersByAssignee', () => {
  it('splits overdue vs dueSoon per assignee, excludes empty', () => {
    const sel = selectReminderObligations([
      o({ id: 'a', assigneeId: 'u1', dueDate: '2026-03-01' }),
      o({ id: 'b', assigneeId: 'u1', dueDate: '2026-03-11' }),
      o({ id: 'c', assigneeId: 'u2', dueDate: '2026-03-12' }),
    ], TODAY, 3)
    const g = groupRemindersByAssignee(sel, TODAY)
    const u1 = g.find(x => x.assigneeId === 'u1')!
    expect(u1.overdue.map(x => x.id)).toEqual(['a']); expect(u1.dueSoon.map(x => x.id)).toEqual(['b'])
    expect(g.find(x => x.assigneeId === 'u2')!.overdue).toEqual([])
  })
})
describe('buildReminderEmail', () => {
  it('subject counts + escapes html', () => {
    const g = { assigneeId: 'u1', overdue: [o({ id: 'a', name: '<b>X</b>', dueDate: '2026-03-01' })], dueSoon: [o({ id: 'b', dueDate: '2026-03-11' })] }
    const m = buildReminderEmail('Νίκος', g, '10/03/2026')
    expect(m.subject).toContain('1'); expect(m.html).toContain('&lt;b&gt;X&lt;/b&gt;'); expect(m.html).not.toContain('<b>X</b>')
    expect(m.text.length).toBeGreaterThan(0)
  })
})
