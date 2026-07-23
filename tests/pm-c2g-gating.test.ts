import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * C2g (Task 5, SECURITY-CRITICAL) — gating invariants of src/lib/pm/actions.ts
 * instance-level actions:
 *  (a) upload on a task whose prerequisite is not ACCEPTED/WAIVED -> throws,
 *      bunnyUploadPrivate NEVER called.
 *  (b) setDeliverableTaskStatus ACCEPTED with files < minFiles -> throws, no update.
 *  (c) setDeliverableTaskStatus ACCEPTED while blocked -> throws.
 *  (d) prerequisite ACCEPTED + files >= minFiles -> ACCEPTED update called with acceptedById.
 *  (e) addTaskDependency cycle -> throws, no create.
 *  (f) addTaskDependency cross-application -> throws.
 *  (g) setDeliverableTaskStatus REJECTED without note -> throws.
 *
 * Hoisted mocks (vi.hoisted) mutated in place per-test — same idiom as
 * tests/pm-cert-verified-guard.test.ts.
 */
const h = vi.hoisted(() => ({
  db: {
    expenseDeliverableTask: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(async () => ({ id: 't-dependent' })),
    },
    deliverableDependency: {
      findMany: vi.fn(),
      create: vi.fn(async () => ({ id: 'edge-new' })),
    },
    deliverableFile: {
      count: vi.fn(),
      create: vi.fn(async () => ({ id: 'file-new' })),
    },
    programApplication: {
      findFirst: vi.fn(async () => ({ id: 'app-1', programId: 'prog-1' })),
    },
  } as any,
  bunnyUploadPrivate: vi.fn().mockResolvedValue({ key: 'k' }),
}))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'u1', role: 'ADMIN', permissions: ['pm.work', 'pm.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/bunny-storage', () => ({ bunnyUploadPrivate: (...a: any[]) => h.bunnyUploadPrivate(...a) }))

import {
  uploadDeliverableTaskFile,
  setDeliverableTaskStatus,
  addTaskDependency,
} from '@/lib/pm/actions'

// t-dependent depends on t-prereq (dependentId=t-dependent, prerequisiteId=t-prereq).
const DEPENDENT_TASK = {
  id: 't-dependent',
  deliverableId: 'd1',
  status: 'PENDING',
  minFiles: 2,
  deliverable: { applicationId: 'app-1', expenseId: 'exp-1' },
}

const ALL_TASKS_BLOCKED = [
  { id: 't-dependent', status: 'PENDING', name: 'Εξαρτημένο' },
  { id: 't-prereq', status: 'PENDING', name: 'Προαπαιτούμενο' },
]

const ALL_TASKS_UNBLOCKED = [
  { id: 't-dependent', status: 'PENDING', name: 'Εξαρτημένο' },
  { id: 't-prereq', status: 'ACCEPTED', name: 'Προαπαιτούμενο' },
]

const EDGES = [{ dependentId: 't-dependent', prerequisiteId: 't-prereq' }]

beforeEach(() => {
  h.db.expenseDeliverableTask.findUniqueOrThrow.mockReset()
  h.db.expenseDeliverableTask.findMany.mockReset()
  h.db.expenseDeliverableTask.update.mockReset().mockResolvedValue({ id: 't-dependent' })
  h.db.deliverableDependency.findMany.mockReset()
  h.db.deliverableDependency.create.mockReset().mockResolvedValue({ id: 'edge-new' })
  h.db.deliverableFile.count.mockReset()
  h.db.deliverableFile.create.mockReset().mockResolvedValue({ id: 'file-new' })
  h.bunnyUploadPrivate.mockReset().mockResolvedValue({ key: 'k' })

  h.db.expenseDeliverableTask.findUniqueOrThrow.mockResolvedValue(DEPENDENT_TASK)
})

describe('(a) uploadDeliverableTaskFile blocked by prerequisite', () => {
  it('throws and never calls bunnyUploadPrivate when prerequisite is PENDING', async () => {
    h.db.deliverableDependency.findMany.mockResolvedValue(EDGES)
    h.db.expenseDeliverableTask.findMany.mockResolvedValue(ALL_TASKS_BLOCKED)

    await expect(
      uploadDeliverableTaskFile('t-dependent', { filename: 'a.pdf', base64: 'YWJj', mimeType: 'application/pdf' }),
    ).rejects.toThrow()

    expect(h.bunnyUploadPrivate).not.toHaveBeenCalled()
    expect(h.db.deliverableFile.create).not.toHaveBeenCalled()
  })
})

describe('(b) setDeliverableTaskStatus ACCEPTED requires minFiles', () => {
  it('throws and does not update when files < minFiles', async () => {
    h.db.deliverableDependency.findMany.mockResolvedValue(EDGES)
    h.db.expenseDeliverableTask.findMany.mockResolvedValue(ALL_TASKS_UNBLOCKED)
    h.db.deliverableFile.count.mockResolvedValue(1) // minFiles is 2

    await expect(setDeliverableTaskStatus('t-dependent', 'ACCEPTED')).rejects.toThrow()

    expect(h.db.expenseDeliverableTask.update).not.toHaveBeenCalled()
  })
})

describe('(c) setDeliverableTaskStatus ACCEPTED blocked by DAG', () => {
  it('throws when the task is still blocked, before even checking minFiles', async () => {
    h.db.deliverableDependency.findMany.mockResolvedValue(EDGES)
    h.db.expenseDeliverableTask.findMany.mockResolvedValue(ALL_TASKS_BLOCKED)

    await expect(setDeliverableTaskStatus('t-dependent', 'ACCEPTED')).rejects.toThrow()

    expect(h.db.expenseDeliverableTask.update).not.toHaveBeenCalled()
    expect(h.db.deliverableFile.count).not.toHaveBeenCalled()
  })
})

describe('(d) setDeliverableTaskStatus ACCEPTED succeeds when unblocked + enough files', () => {
  it('calls update with status ACCEPTED and acceptedById stamped', async () => {
    h.db.deliverableDependency.findMany.mockResolvedValue(EDGES)
    h.db.expenseDeliverableTask.findMany.mockResolvedValue(ALL_TASKS_UNBLOCKED)
    h.db.deliverableFile.count.mockResolvedValue(2) // minFiles is 2

    await setDeliverableTaskStatus('t-dependent', 'ACCEPTED')

    expect(h.db.expenseDeliverableTask.update).toHaveBeenCalledTimes(1)
    const args = h.db.expenseDeliverableTask.update.mock.calls[0][0]
    expect(args.where).toEqual({ id: 't-dependent' })
    expect(args.data.status).toBe('ACCEPTED')
    expect(args.data.acceptedById).toBe('u1')
    expect(args.data.acceptedAt).toBeInstanceOf(Date)
  })
})

describe('(g) setDeliverableTaskStatus REJECTED requires a note', () => {
  it('throws when note is missing', async () => {
    await expect(setDeliverableTaskStatus('t-dependent', 'REJECTED')).rejects.toThrow()
    expect(h.db.expenseDeliverableTask.update).not.toHaveBeenCalled()
  })

  it('throws when note is blank/whitespace', async () => {
    await expect(setDeliverableTaskStatus('t-dependent', 'REJECTED', '   ')).rejects.toThrow()
    expect(h.db.expenseDeliverableTask.update).not.toHaveBeenCalled()
  })

  it('succeeds with a non-empty note', async () => {
    await setDeliverableTaskStatus('t-dependent', 'REJECTED', 'Λείπει η υπογραφή')
    expect(h.db.expenseDeliverableTask.update).toHaveBeenCalledTimes(1)
    const args = h.db.expenseDeliverableTask.update.mock.calls[0][0]
    expect(args.data.status).toBe('REJECTED')
    expect(args.data.notes).toBe('Λείπει η υπογραφή')
  })
})

describe('(e) addTaskDependency rejects cycles', () => {
  it('throws and never creates the edge when it would close a cycle', async () => {
    // t-a already depends on t-b (t-a -> t-b). Adding t-b -> t-a would cycle.
    h.db.expenseDeliverableTask.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 't-b', deliverableId: 'd1', status: 'PENDING', minFiles: 1, deliverable: { applicationId: 'app-1', expenseId: null } })
      .mockResolvedValueOnce({ id: 't-a', deliverableId: 'd1', status: 'PENDING', minFiles: 1, deliverable: { applicationId: 'app-1', expenseId: null } })
    h.db.deliverableDependency.findMany.mockResolvedValue([{ dependentId: 't-a', prerequisiteId: 't-b' }])

    await expect(addTaskDependency('t-b', 't-a')).rejects.toThrow()

    expect(h.db.deliverableDependency.create).not.toHaveBeenCalled()
  })
})

describe('(f) addTaskDependency rejects cross-application links', () => {
  it('throws and never creates the edge when tasks belong to different applications', async () => {
    h.db.expenseDeliverableTask.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 't-x', deliverableId: 'd1', status: 'PENDING', minFiles: 1, deliverable: { applicationId: 'app-1', expenseId: null } })
      .mockResolvedValueOnce({ id: 't-y', deliverableId: 'd2', status: 'PENDING', minFiles: 1, deliverable: { applicationId: 'app-2', expenseId: null } })

    await expect(addTaskDependency('t-x', 't-y')).rejects.toThrow()

    expect(h.db.deliverableDependency.create).not.toHaveBeenCalled()
    // Cross-application check must short-circuit before even loading edges for cycle detection.
    expect(h.db.deliverableDependency.findMany).not.toHaveBeenCalled()
  })
})
