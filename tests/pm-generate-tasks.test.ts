import { describe, it, expect, vi, beforeEach } from 'vitest'

const db: any = vi.hoisted(() => ({}))
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u-admin', permissions: ['pm.manage'] } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { generateObligations } from '@/lib/pm/actions'

const CREATED = new Date('2026-03-01T00:00:00Z')
let created: any[] = []

beforeEach(() => {
  created = []
  db.programApplication = {
    findFirst: vi.fn().mockResolvedValue({ id: 'app1', programId: 'p1', managerId: 'mgr', processorId: 'proc', createdAt: CREATED, status: 'ACTIVE' }),
  }
  db.program = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'p1', criteria: [], deliverables: [], requiredForms: [], taskTemplates: [
    { id: 't1', stage: 'DOCUMENTS', title: 'Βήμα', assignTo: 'BOTH', mandatory: true, dueOffsetDays: 10, order: 0, active: true },
  ] }) }
  db.applicationObligation = {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockImplementation(({ data }: any) => { created.push(...data); return { count: data.length } }),
  }
  db.applicationCriterionScore = { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 0 }) }
})

describe('generateObligations materializes tasks', () => {
  it('BOTH template → 2 task rows with resolved assignees + dueDate', async () => {
    const res = await generateObligations('app1')
    expect(res.addedTasks).toBe(2)
    const taskRows = created.filter((r: any) => r.kind === 'TASK')
    expect(taskRows).toHaveLength(2)
    const byAssignee: any = Object.fromEntries(taskRows.map((r: any) => [r.assigneeId, r]))
    expect(Object.keys(byAssignee).sort()).toEqual(['mgr', 'proc'])
    expect(new Date(byAssignee.mgr.dueDate).toISOString().slice(0, 10)).toBe('2026-03-11')
    expect(byAssignee.mgr.templateId).toBe('t1')
    expect(byAssignee.mgr.sourceId).toBe('task:t1:manager')
  })
  it('is idempotent — existing task sourceIds are skipped', async () => {
    db.applicationObligation.findMany = vi.fn().mockResolvedValue([{ sourceId: 'task:t1:manager' }, { sourceId: 'task:t1:processor' }])
    const res = await generateObligations('app1')
    expect(res.addedTasks).toBe(0)
  })
})
