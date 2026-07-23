import { describe, it, expect } from 'vitest'
import { KANBAN_COLUMNS, isBoardStatus, groupByStatus, groupBySwimlane, bucketByDeadline, type BoardObligationLike } from '@/lib/pm/board'

const o = (p: Partial<BoardObligationLike>): BoardObligationLike => ({ id: 'x', status: 'PENDING', dueDate: null, assigneeId: null, assigneeName: null, ...p })

describe('KANBAN_COLUMNS / isBoardStatus', () => {
  it('four columns', () => { expect(KANBAN_COLUMNS).toEqual(['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED']) })
  it('WAIVED/REJECTED not board', () => { expect(isBoardStatus('WAIVED')).toBe(false); expect(isBoardStatus('PENDING')).toBe(true) })
})
describe('groupByStatus', () => {
  it('buckets into columns + other', () => {
    const g = groupByStatus([o({ id: 'a', status: 'PENDING' }), o({ id: 'b', status: 'APPROVED' }), o({ id: 'c', status: 'REJECTED' })])
    expect(g.PENDING.map(x => x.id)).toEqual(['a'])
    expect(g.APPROVED.map(x => x.id)).toEqual(['b'])
    expect(g.other.map(x => x.id)).toEqual(['c'])
  })
})
describe('groupBySwimlane', () => {
  it('named lanes alphabetical, Χωρίς ανάθεση last', () => {
    const lanes = groupBySwimlane([o({ id: '1', assigneeId: 'u2', assigneeName: 'Βασιλική' }), o({ id: '2', assigneeId: null }), o({ id: '3', assigneeId: 'u1', assigneeName: 'Ανδρέας' })])
    expect(lanes.map(l => l.label)).toEqual(['Ανδρέας', 'Βασιλική', 'Χωρίς ανάθεση'])
    expect(lanes[2].key).toBe('__none__')
  })
})
describe('bucketByDeadline', () => {
  const TODAY = Date.UTC(2026, 2, 10) // 2026-03-10 midnight
  it('buckets overdue/today/thisWeek/later/noDate; excludes APPROVED/WAIVED', () => {
    const r = bucketByDeadline([
      o({ id: 'over', status: 'PENDING', dueDate: '2026-03-01' }),
      o({ id: 'today', status: 'PENDING', dueDate: '2026-03-10' }),
      o({ id: 'week', status: 'IN_PROGRESS', dueDate: '2026-03-14' }),
      o({ id: 'later', status: 'PENDING', dueDate: '2026-04-01' }),
      o({ id: 'none', status: 'PENDING', dueDate: null }),
      o({ id: 'done', status: 'APPROVED', dueDate: '2026-03-01' }),
    ], TODAY)
    expect(r.overdue.map(x => x.id)).toEqual(['over'])
    expect(r.today.map(x => x.id)).toEqual(['today'])
    expect(r.thisWeek.map(x => x.id)).toEqual(['week'])
    expect(r.later.map(x => x.id)).toEqual(['later'])
    expect(r.noDate.map(x => x.id)).toEqual(['none'])
    expect([...r.overdue, ...r.today, ...r.thisWeek, ...r.later, ...r.noDate].some(x => x.id === 'done')).toBe(false)
  })
})
