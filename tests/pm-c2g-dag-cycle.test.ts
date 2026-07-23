import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Same hoisted-mock idiom as tests/pm-c2g-materialize.test.ts / tests/pm-replace-expense.test.ts —
// vi.mock factories run before top-level `const`s, so shared mocks live behind vi.hoisted() and
// are mutated in place (never reassigned) across tests.
const h = vi.hoisted(() => ({ db: {} as any }))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u1', permissions: ['pm.manage'] } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))

import { generateExpenseDeliverables } from '@/lib/pm/actions'

/**
 * DAG deadlock fix (C2g review finding 2): generateExpenseDeliverables deletes ALL auto:true
 * edges and rebuilds them from scratch on every materialize/replaceExpense re-run, WITHOUT
 * checking the fresh auto pairs against surviving manual (auto:false) edges. Scenario: a manual
 * edge is accepted earlier via addTaskDependency (which itself runs hasCycle at accept-time —
 * but that check only sees the DAG as it existed then); a LATER re-materialization introduces a
 * fresh auto chain that, combined with that still-alive manual edge, closes a cycle — mutual
 * deadlock (neither task can ever leave `blocked`).
 *
 * Fixture: one EXPENSE-scoped template group G1 (t1 SUBMISSION -> t2 APPROVAL, mandatory) + one
 * APPLICATION-scoped group G2 (t3 ASSESSMENT, mandatory), already fully materialized for a single
 * active expense e1 — an idempotent (second-run) shape, so expenseDeliverable.findMany already
 * reports both groups present and no new deliverables/tasks are created. That isolates the test to
 * exactly the DAG-rebuild step, which re-reads the CURRENT task-instance set via
 * expenseDeliverableTask.findMany regardless of what materialization did above it.
 *
 * With this fixture, buildAutoDependencyPairs (already covered by
 * tests/pm-deliverable-phases.test.ts) deterministically produces, in this exact order:
 *   p1 = { dependentId: 't1-e1', prerequisiteId: 't3-app' }   (SUBMISSION -> ASSESSMENT, app-level)
 *   p2 = { dependentId: 't2-e1', prerequisiteId: 't1-e1' }    (APPROVAL -> SUBMISSION, same expense)
 */
const G1_TASKS = [
  { id: 't1', phase: 'SUBMISSION', name: 'Υποβολή τιμολογίου', description: null, mandatory: true, onSiteVerification: false, minFiles: 1, order: 0 },
  { id: 't2', phase: 'APPROVAL', name: 'Έγκριση δαπάνης', description: null, mandatory: true, onSiteVerification: false, minFiles: 1, order: 1 },
]
const G2_TASKS = [
  { id: 't3', phase: 'ASSESSMENT', name: 'Αξιολόγηση αίτησης', description: null, mandatory: true, onSiteVerification: false, minFiles: 1, order: 0 },
]

function freshDb() {
  h.db.programApplication = { findFirst: vi.fn().mockResolvedValue({ id: 'app1', programId: 'p1' }) }
  h.db.programDeliverableTemplate = {
    findMany: vi.fn().mockResolvedValue([
      { id: 'g1', name: 'Παραστατικά δαπάνης', appliesTo: 'EXPENSE', tasks: G1_TASKS },
      { id: 'g2', name: 'Φάκελος αίτησης', appliesTo: 'APPLICATION', tasks: G2_TASKS },
    ]),
  }
  h.db.programExpense = { findMany: vi.fn().mockResolvedValue([{ id: 'e1' }]) }
  h.db.expenseDeliverable = {
    findMany: vi.fn().mockResolvedValue([
      { id: 'g1-e1', templateId: 'g1', expenseId: 'e1', tasks: [{ id: 't1-e1', taskTemplateId: 't1' }, { id: 't2-e1', taskTemplateId: 't2' }] },
      { id: 'g2-app', templateId: 'g2', expenseId: null, tasks: [{ id: 't3-app', taskTemplateId: 't3' }] },
    ]),
    create: vi.fn(),
  }
  h.db.expenseDeliverableTask = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([
      { id: 't1-e1', phase: 'SUBMISSION', mandatory: true, deliverable: { expenseId: 'e1' } },
      { id: 't2-e1', phase: 'APPROVAL', mandatory: true, deliverable: { expenseId: 'e1' } },
      { id: 't3-app', phase: 'ASSESSMENT', mandatory: true, deliverable: { expenseId: null } },
    ]),
  }
  h.db.deliverableDependency = {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  freshDb()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('generateExpenseDeliverables — cycle-safe auto-DAG rebuild against surviving manual edges', () => {
  it('without manual edges: all fresh auto pairs are created, skippedCyclePairs: 0', async () => {
    const res = await generateExpenseDeliverables('app1')

    expect(h.db.deliverableDependency.findMany).toHaveBeenCalledWith({
      where: { auto: false, dependent: { deliverable: { applicationId: 'app1' } } },
      select: { dependentId: true, prerequisiteId: true },
    })
    expect(h.db.deliverableDependency.createMany).toHaveBeenCalledTimes(1)
    const arg = h.db.deliverableDependency.createMany.mock.calls[0][0]
    expect(arg.data).toEqual(expect.arrayContaining([
      { dependentId: 't1-e1', prerequisiteId: 't3-app', auto: true },
      { dependentId: 't2-e1', prerequisiteId: 't1-e1', auto: true },
    ]))
    expect(arg.data).toHaveLength(2)
    expect(res).toEqual({ addedDeliverables: 0, addedTasks: 0, rebuiltEdges: 2, skippedCyclePairs: 0 })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('a manual edge that would close a cycle with an auto pair is honored — the cycle-closing auto pair is skipped', async () => {
    // Manual edge (accepted earlier via addTaskDependency): t3-app (ASSESSMENT, app-level) depends
    // on t2-e1 (APPROVAL of e1). Combined with the fresh auto chain t2-e1 -> t1-e1 -> t3-app, this
    // closes a 3-cycle: t3-app -> t2-e1 -> t1-e1 -> t3-app. p1 (t1-e1 -> t3-app) is admitted first
    // (no cycle yet); p2 (t2-e1 -> t1-e1) is the pair that would close the cycle and must be skipped.
    h.db.deliverableDependency.findMany = vi.fn().mockResolvedValue([{ dependentId: 't3-app', prerequisiteId: 't2-e1' }])

    const res = await generateExpenseDeliverables('app1')

    expect(h.db.deliverableDependency.createMany).toHaveBeenCalledTimes(1)
    const arg = h.db.deliverableDependency.createMany.mock.calls[0][0]
    // The fresh auto pairs MINUS the cycle-closing one: only t1-e1 -> t3-app survives.
    expect(arg.data).toEqual([{ dependentId: 't1-e1', prerequisiteId: 't3-app', auto: true }])
    expect(res).toEqual({ addedDeliverables: 0, addedTasks: 0, rebuiltEdges: 1, skippedCyclePairs: 1 })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('skipped 1 auto dependency pairs'), 'app1')
  })
})
