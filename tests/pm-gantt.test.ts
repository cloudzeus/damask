import { describe, it, expect } from 'vitest'
import {
  topoSort,
  criticalPath,
  buildGanttModel,
  type GanttTask,
  type GanttEdge,
} from '@/lib/pm/gantt'

describe('topoSort', () => {
  it('is stable — preserves input order among ready nodes', () => {
    const ids = ['a', 'b', 'c']
    const { order, cyclic } = topoSort(ids, [])
    expect(cyclic).toBe(false)
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('orders a chain a<-b<-c (edges are dependentId->prerequisiteId) so prerequisite comes first', () => {
    // b depends on a, c depends on b: a must precede b, b must precede c
    const ids = ['c', 'b', 'a']
    const edges: GanttEdge[] = [
      { dependentId: 'b', prerequisiteId: 'a', auto: true },
      { dependentId: 'c', prerequisiteId: 'b', auto: true },
    ]
    const { order, cyclic } = topoSort(ids, edges)
    expect(cyclic).toBe(false)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'))
  })

  it('flags cyclic graphs and returns the acyclic prefix', () => {
    const ids = ['a', 'b', 'c']
    const edges: GanttEdge[] = [
      { dependentId: 'a', prerequisiteId: 'b', auto: true },
      { dependentId: 'b', prerequisiteId: 'c', auto: true },
      { dependentId: 'c', prerequisiteId: 'a', auto: true },
    ]
    const { order, cyclic } = topoSort(ids, edges)
    expect(cyclic).toBe(true)
    expect(order.length).toBeLessThan(ids.length)
  })

  it('keeps ready nodes in stable relative order at each step (diamond)', () => {
    // d depends on b and c; b and c both depend on a
    const ids = ['a', 'b', 'c', 'd']
    const edges: GanttEdge[] = [
      { dependentId: 'b', prerequisiteId: 'a', auto: true },
      { dependentId: 'c', prerequisiteId: 'a', auto: true },
      { dependentId: 'd', prerequisiteId: 'b', auto: true },
      { dependentId: 'd', prerequisiteId: 'c', auto: true },
    ]
    const { order, cyclic } = topoSort(ids, edges)
    expect(cyclic).toBe(false)
    expect(order).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('criticalPath', () => {
  it('returns [] when there are no edges', () => {
    expect(criticalPath(['a', 'b', 'c'], [])).toEqual([])
  })

  it('picks the longest chain by node count', () => {
    // a <- b <- c <- d  (chain of 4)
    const ids = ['a', 'b', 'c', 'd']
    const edges: GanttEdge[] = [
      { dependentId: 'b', prerequisiteId: 'a', auto: true },
      { dependentId: 'c', prerequisiteId: 'b', auto: true },
      { dependentId: 'd', prerequisiteId: 'c', auto: true },
    ]
    expect(criticalPath(ids, edges)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('picks the longest path in a diamond (ties broken by stable order)', () => {
    // a <- b <- d (short branch)
    // a <- c <- e <- d (long branch: a,c,e,d has 4 nodes vs a,b,d has 3)
    const ids = ['a', 'b', 'c', 'd', 'e']
    const edges: GanttEdge[] = [
      { dependentId: 'b', prerequisiteId: 'a', auto: true },
      { dependentId: 'c', prerequisiteId: 'a', auto: true },
      { dependentId: 'e', prerequisiteId: 'c', auto: true },
      { dependentId: 'd', prerequisiteId: 'b', auto: true },
      { dependentId: 'd', prerequisiteId: 'e', auto: true },
    ]
    expect(criticalPath(ids, edges)).toEqual(['a', 'c', 'e', 'd'])
  })

  it('breaks ties by first in stable order', () => {
    // two equal-length chains: a<-b and c<-d
    const ids = ['a', 'b', 'c', 'd']
    const edges: GanttEdge[] = [
      { dependentId: 'b', prerequisiteId: 'a', auto: true },
      { dependentId: 'd', prerequisiteId: 'c', auto: true },
    ]
    expect(criticalPath(ids, edges)).toEqual(['a', 'b'])
  })
})

describe('buildGanttModel', () => {
  const tasks: GanttTask[] = [
    { id: 't1', laneKey: 'exp1', phase: 'SUBMISSION', name: 'Task 1', status: 'ACCEPTED', startMs: null, endMs: null },
    { id: 't2', laneKey: 'exp1', phase: 'APPROVAL', name: 'Task 2', status: 'PENDING', startMs: 100, endMs: 200 },
    { id: 't3', laneKey: 'exp2', phase: 'SUBMISSION', name: 'Task 3', status: 'UPLOADED', startMs: null, endMs: null },
  ]
  const edges: GanttEdge[] = [
    { dependentId: 't2', prerequisiteId: 't1', auto: true },
  ]

  it('columns = phases present, in DELIVERABLE_PHASE_ORDER order', () => {
    const model = buildGanttModel(tasks, edges, 0)
    expect(model.columns).toEqual(['SUBMISSION', 'APPROVAL'])
  })

  it('assigns each task a col = index of its phase in columns', () => {
    const model = buildGanttModel(tasks, edges, 0)
    const row1 = model.lanes.flatMap(l => l.rows).find(r => r.task.id === 't1')!
    const row2 = model.lanes.flatMap(l => l.rows).find(r => r.task.id === 't2')!
    const row3 = model.lanes.flatMap(l => l.rows).find(r => r.task.id === 't3')!
    expect(row1.col).toBe(0) // SUBMISSION
    expect(row2.col).toBe(1) // APPROVAL
    expect(row3.col).toBe(0) // SUBMISSION
  })

  it('groups lanes by laneKey, stable input order', () => {
    const model = buildGanttModel(tasks, edges, 0)
    expect(model.lanes.map(l => l.key)).toEqual(['exp1', 'exp2'])
    expect(model.lanes[0].rows.map(r => r.task.id)).toEqual(['t1', 't2'])
    expect(model.lanes[1].rows.map(r => r.task.id)).toEqual(['t3'])
  })

  it('copies arrows from edges (from=prerequisiteId, to=dependentId)', () => {
    const model = buildGanttModel(tasks, edges, 0)
    expect(model.arrows).toEqual([{ from: 't1', to: 't2', auto: true }])
  })

  it('critical = Set of criticalPath over the same tasks/edges', () => {
    const model = buildGanttModel(tasks, edges, 0)
    expect(model.critical).toEqual(new Set(['t1', 't2']))
  })

  it('passes startMs/endMs through untouched (undated tasks fine)', () => {
    const model = buildGanttModel(tasks, edges, 0)
    const row1 = model.lanes.flatMap(l => l.rows).find(r => r.task.id === 't1')!
    const row2 = model.lanes.flatMap(l => l.rows).find(r => r.task.id === 't2')!
    expect(row1.task.startMs).toBeNull()
    expect(row1.task.endMs).toBeNull()
    expect(row2.task.startMs).toBe(100)
    expect(row2.task.endMs).toBe(200)
  })
})
