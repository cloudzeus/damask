import { describe, it, expect, vi, beforeEach } from 'vitest'

// NOTE: vi.mock factories run before any top-level `const` in this file is
// initialized, so shared mocks are declared via vi.hoisted() (see
// tests/pm-replace-expense.test.ts for the same idiom). We mutate `h.db` in
// place across tests — never reassign it — so every mocked prisma delegate
// stays reachable from the module under test.
const h = vi.hoisted(() => ({
  db: {} as any,
}))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u1', permissions: ['pm.manage'] } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))

import { generateExpenseDeliverables } from '@/lib/pm/actions'

// Fixture: program has 2 active template groups —
//   G1 (EXPENSE): t1 SUBMISSION mandatory, t2 APPROVAL mandatory
//   G2 (APPLICATION): t3 ASSESSMENT mandatory
// Application has 2 ACTIVE expenses e1, e2.
//
// NOTE on phases: the spec draft used FINAL_PAYMENT for t2, but
// src/lib/pm/deliverable-phases.ts (already implemented + tested in
// tests/pm-deliverable-phases.test.ts — see "FINAL_PAYMENT -> PHASE_A_CERTIFICATION
// when MODIFICATION unused") walks back only ONE step through the full
// 9-phase DELIVERABLE_PHASE_ORDER, skipping ONLY unused OPTIONAL_PHASES
// (FIRST_PAYMENT/MODIFICATION). PHASE_A_CERTIFICATION sits between SUBMISSION
// and FINAL_PAYMENT and is never skipped, so with no PHASE_A_CERTIFICATION
// tasks in this fixture, FINAL_PAYMENT would resolve ZERO auto-dependencies —
// not a direct link to SUBMISSION. APPROVAL is the phase that immediately
// follows SUBMISSION in DELIVERABLE_PHASE_ORDER, so it is used here to get a
// genuine, directly-adjacent dependency edge without touching the
// already-tested pure engine.
const G1_TASKS = [
  { id: 't1', phase: 'SUBMISSION', name: 'Υποβολή τιμολογίου', description: null, mandatory: true, onSiteVerification: false, minFiles: 2, order: 0 },
  { id: 't2', phase: 'APPROVAL', name: 'Έγκριση δαπάνης', description: null, mandatory: true, onSiteVerification: false, minFiles: 1, order: 1 },
]
const G2_TASKS = [
  { id: 't3', phase: 'ASSESSMENT', name: 'Αξιολόγηση αίτησης', description: null, mandatory: true, onSiteVerification: false, minFiles: 1, order: 0 },
]

function freshDb() {
  h.db.programApplication = {
    findFirst: vi.fn().mockResolvedValue({ id: 'app1', programId: 'p1' }),
  }
  h.db.programDeliverableTemplate = {
    findMany: vi.fn().mockResolvedValue([
      { id: 'g1', name: 'Παραστατικά δαπάνης', appliesTo: 'EXPENSE', tasks: G1_TASKS },
      { id: 'g2', name: 'Φάκελος αίτησης', appliesTo: 'APPLICATION', tasks: G2_TASKS },
    ]),
  }
  h.db.programExpense = {
    findMany: vi.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]),
  }
  h.db.expenseDeliverable = {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(async ({ data }: any) => ({ id: `${data.templateId}-${data.expenseId ?? 'app'}` })),
  }
  h.db.expenseDeliverableTask = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    // The DAG-rebuild step re-reads the FULL current task-instance set for
    // the application (not derived from whatever `create` returned above —
    // that's a separate mocked call, same as every other test in this repo
    // that mocks each prisma delegate independently).
    findMany: vi.fn().mockResolvedValue([
      { id: 't1-e1', phase: 'SUBMISSION', mandatory: true, deliverable: { expenseId: 'e1' } },
      { id: 't1-e2', phase: 'SUBMISSION', mandatory: true, deliverable: { expenseId: 'e2' } },
      { id: 't2-e1', phase: 'APPROVAL', mandatory: true, deliverable: { expenseId: 'e1' } },
      { id: 't2-e2', phase: 'APPROVAL', mandatory: true, deliverable: { expenseId: 'e2' } },
      { id: 't3-app', phase: 'ASSESSMENT', mandatory: true, deliverable: { expenseId: null } },
    ]),
  }
  h.db.deliverableDependency = {
    // C2g cycle-safety fix: generateExpenseDeliverables now loads surviving manual (auto:false)
    // edges before rebuilding the auto chain (see tests/pm-c2g-dag-cycle.test.ts for the
    // cycle-skipping behavior itself) — default to none here so these materialization-focused
    // tests keep exercising the pre-existing all-auto-pairs-created path unchanged.
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  }
}

beforeEach(() => {
  freshDb()
})

describe('generateExpenseDeliverables — first run (materialization)', () => {
  it('creates one ExpenseDeliverable group instance per (template x active expense) and one per APPLICATION-level template', async () => {
    await generateExpenseDeliverables('app1')

    expect(h.db.expenseDeliverable.create).toHaveBeenCalledTimes(3)
    const calls = h.db.expenseDeliverable.create.mock.calls.map((c: any) => c[0].data)

    expect(calls).toContainEqual(expect.objectContaining({
      applicationId: 'app1', expenseId: 'e1', templateId: 'g1', name: 'Παραστατικά δαπάνης',
    }))
    expect(calls).toContainEqual(expect.objectContaining({
      applicationId: 'app1', expenseId: 'e2', templateId: 'g1', name: 'Παραστατικά δαπάνης',
    }))
    expect(calls).toContainEqual(expect.objectContaining({
      applicationId: 'app1', expenseId: null, templateId: 'g2', name: 'Φάκελος αίτησης',
    }))
  })

  it('copies each template task onto the nested tasks.create, with taskTemplateId set and minFiles carried over', async () => {
    await generateExpenseDeliverables('app1')

    const calls = h.db.expenseDeliverable.create.mock.calls.map((c: any) => c[0].data)
    const g1e1 = calls.find((d: any) => d.templateId === 'g1' && d.expenseId === 'e1')
    expect(g1e1.tasks.create).toEqual([
      expect.objectContaining({ taskTemplateId: 't1', phase: 'SUBMISSION', minFiles: 2, mandatory: true }),
      expect.objectContaining({ taskTemplateId: 't2', phase: 'APPROVAL', minFiles: 1, mandatory: true }),
    ])

    const g2 = calls.find((d: any) => d.templateId === 'g2' && d.expenseId === null)
    expect(g2.tasks.create).toEqual([
      expect.objectContaining({ taskTemplateId: 't3', phase: 'ASSESSMENT', minFiles: 1, mandatory: true }),
    ])
  })

  it('rebuilds the auto-DAG for the whole application: SUBMISSION -> ASSESSMENT (app-level), APPROVAL -> SUBMISSION (same expense)', async () => {
    await generateExpenseDeliverables('app1')

    expect(h.db.deliverableDependency.deleteMany).toHaveBeenCalledWith({
      where: { auto: true, dependent: { deliverable: { applicationId: 'app1' } } },
    })
    expect(h.db.deliverableDependency.createMany).toHaveBeenCalledTimes(1)
    const arg = h.db.deliverableDependency.createMany.mock.calls[0][0]
    expect(arg.skipDuplicates).toBe(true)
    expect(arg.data).toEqual(expect.arrayContaining([
      { dependentId: 't1-e1', prerequisiteId: 't3-app', auto: true },
      { dependentId: 't1-e2', prerequisiteId: 't3-app', auto: true },
      { dependentId: 't2-e1', prerequisiteId: 't1-e1', auto: true },
      { dependentId: 't2-e2', prerequisiteId: 't1-e2', auto: true },
    ]))
    expect(arg.data).toHaveLength(4)
  })

  it('returns addedDeliverables/addedTasks/rebuiltEdges/skippedCyclePairs counts', async () => {
    const res = await generateExpenseDeliverables('app1')
    expect(res).toEqual({ addedDeliverables: 3, addedTasks: 5, rebuiltEdges: 4, skippedCyclePairs: 0 })
  })
})

describe('generateExpenseDeliverables — second run (idempotency, incl. NULL-safe APPLICATION-level group)', () => {
  beforeEach(() => {
    // Simulate that the first run already materialized all 3 groups —
    // including the APPLICATION-level one with expenseId: null. The
    // (templateId, expenseId) matching MUST be NULL-safe at the code level:
    // Postgres treats two NULLs as distinct under @@unique([applicationId,
    // expenseId, templateId]), so relying on the DB constraint alone would
    // let this group re-materialize forever.
    h.db.expenseDeliverable.findMany = vi.fn().mockResolvedValue([
      { id: 'g1-e1', templateId: 'g1', expenseId: 'e1', tasks: [{ id: 't1-e1', taskTemplateId: 't1' }, { id: 't2-e1', taskTemplateId: 't2' }] },
      { id: 'g1-e2', templateId: 'g1', expenseId: 'e2', tasks: [{ id: 't1-e2', taskTemplateId: 't1' }, { id: 't2-e2', taskTemplateId: 't2' }] },
      { id: 'g2-app', templateId: 'g2', expenseId: null, tasks: [{ id: 't3-app', taskTemplateId: 't3' }] },
    ])
  })

  it('creates 0 new groups and 0 new tasks', async () => {
    const res = await generateExpenseDeliverables('app1')
    expect(h.db.expenseDeliverable.create).not.toHaveBeenCalled()
    expect(h.db.expenseDeliverableTask.createMany).not.toHaveBeenCalled()
    expect(res.addedDeliverables).toBe(0)
    expect(res.addedTasks).toBe(0)
  })

  it('still rebuilds the auto-DAG from the current task-instance set', async () => {
    const res = await generateExpenseDeliverables('app1')
    expect(h.db.deliverableDependency.deleteMany).toHaveBeenCalledTimes(1)
    expect(h.db.deliverableDependency.createMany).toHaveBeenCalledTimes(1)
    expect(res.rebuiltEdges).toBe(4)
  })
})

describe('generateExpenseDeliverables — top-up of missing task instances', () => {
  it('adds only the newly-added template task to an already-materialized group, leaves existing tasks untouched', async () => {
    // g1-e1 already exists but is missing t2 (added to the template later).
    h.db.expenseDeliverable.findMany = vi.fn().mockResolvedValue([
      { id: 'g1-e1', templateId: 'g1', expenseId: 'e1', tasks: [{ id: 't1-e1', taskTemplateId: 't1' }] },
      { id: 'g1-e2', templateId: 'g1', expenseId: 'e2', tasks: [{ id: 't1-e2', taskTemplateId: 't1' }, { id: 't2-e2', taskTemplateId: 't2' }] },
      { id: 'g2-app', templateId: 'g2', expenseId: null, tasks: [{ id: 't3-app', taskTemplateId: 't3' }] },
    ])

    const res = await generateExpenseDeliverables('app1')

    expect(h.db.expenseDeliverable.create).not.toHaveBeenCalled()
    expect(h.db.expenseDeliverableTask.createMany).toHaveBeenCalledTimes(1)
    const arg = h.db.expenseDeliverableTask.createMany.mock.calls[0][0]
    expect(arg.data).toEqual([
      expect.objectContaining({ deliverableId: 'g1-e1', taskTemplateId: 't2', phase: 'APPROVAL', minFiles: 1 }),
    ])
    expect(res.addedDeliverables).toBe(0)
    expect(res.addedTasks).toBe(1)
  })
})
