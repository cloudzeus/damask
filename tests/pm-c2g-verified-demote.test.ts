import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same hoisted-mock idiom as tests/pm-cert-verified-guard.test.ts / tests/pm-c2g-materialize.test.ts.
const h = vi.hoisted(() => ({
  db: {
    programApplication: { findFirst: vi.fn() },
    expenseDeliverableTask: { findUniqueOrThrow: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    deliverableDependency: { findMany: vi.fn() },
    deliverableFile: { findUniqueOrThrow: vi.fn(), delete: vi.fn(), count: vi.fn() },
    programExpenseCertification: { findUnique: vi.fn(), update: vi.fn() },
  } as any,
}))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'u1', role: 'ADMIN', permissions: ['pm.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))

import { setDeliverableTaskStatus, removeDeliverableTaskFile } from '@/lib/pm/actions'

// Money-integrity fix (C2g review finding 1): ProgramExpenseCertification.verified feeds C2f
// payment eligibility but was previously recomputed ONLY inside upsertCertification. If a
// mandatory cert-phase task (PHASE_A_CERTIFICATION / FULL_CERTIFICATION) is later REJECTED/reset
// or its files removed, `verified` stayed stale=true. setDeliverableTaskStatus/
// removeDeliverableTaskFile must now demote it inline via recomputeExpenseVerified.

const TASK_ROW = {
  id: 't1',
  deliverableId: 'd1',
  status: 'ACCEPTED',
  minFiles: 0,
  phase: 'FULL_CERTIFICATION',
  deliverable: { applicationId: 'app1', expenseId: 'e1' },
}

describe('setDeliverableTaskStatus — demotes stale verified after de-certification', () => {
  beforeEach(() => {
    h.db.programApplication.findFirst.mockReset().mockResolvedValue({ id: 'app1', programId: 'p1' })
    h.db.expenseDeliverableTask.findUniqueOrThrow.mockReset().mockResolvedValue(TASK_ROW)
    h.db.expenseDeliverableTask.findMany.mockReset()
    h.db.expenseDeliverableTask.update.mockReset().mockResolvedValue({})
    h.db.deliverableDependency.findMany.mockReset().mockResolvedValue([])
    h.db.deliverableFile.count.mockReset().mockResolvedValue(0)
    h.db.programExpenseCertification.findUnique.mockReset()
    h.db.programExpenseCertification.update.mockReset().mockResolvedValue({})
  })

  it('(a) REJECTED on a mandatory FULL_CERTIFICATION task of an expense whose certification is verified:true -> demotes', async () => {
    h.db.programExpenseCertification.findUnique.mockResolvedValue({
      id: 'cert1', verified: true, serialNumber: 'SN-1', location: null, assetRegistryRef: 'REG-1', paid: true,
    })
    // recomputeExpenseVerified's own findMany for cert-phase tasks — reflects the just-REJECTED task.
    h.db.expenseDeliverableTask.findMany.mockResolvedValue([
      { phase: 'FULL_CERTIFICATION', mandatory: true, status: 'REJECTED' },
    ])

    await setDeliverableTaskStatus('t1', 'REJECTED', 'μη έγκυρος σειριακός αριθμός')

    expect(h.db.programExpenseCertification.update).toHaveBeenCalledTimes(1)
    expect(h.db.programExpenseCertification.update).toHaveBeenCalledWith({
      where: { id: 'cert1' },
      data: { verified: false, verifiedById: null },
    })
  })

  it('(b) same as (a) but certification already verified:false -> no update (nothing to demote)', async () => {
    h.db.programExpenseCertification.findUnique.mockResolvedValue({
      id: 'cert1', verified: false, serialNumber: 'SN-1', location: null, assetRegistryRef: 'REG-1', paid: true,
    })

    await setDeliverableTaskStatus('t1', 'REJECTED', 'μη έγκυρος σειριακός αριθμός')

    expect(h.db.programExpenseCertification.update).not.toHaveBeenCalled()
    // Early-return in recomputeExpenseVerified — the cert-phase task findMany is never reached.
    expect(h.db.expenseDeliverableTask.findMany).not.toHaveBeenCalled()
  })

  it('(c) ACCEPTED transition -> no demote call at all (recompute is skipped, not just a no-op)', async () => {
    h.db.expenseDeliverableTask.findUniqueOrThrow.mockResolvedValue({ ...TASK_ROW, status: 'UPLOADED' })
    // computeBlockedForTask's findMany (blocked-check, unrelated to cert-phase recompute).
    h.db.expenseDeliverableTask.findMany.mockResolvedValue([{ id: 't1', status: 'UPLOADED', name: 'task' }])

    await setDeliverableTaskStatus('t1', 'ACCEPTED')

    expect(h.db.programExpenseCertification.findUnique).not.toHaveBeenCalled()
    expect(h.db.programExpenseCertification.update).not.toHaveBeenCalled()
  })
})

describe('removeDeliverableTaskFile — demotes stale verified after a cert-phase file is removed', () => {
  beforeEach(() => {
    h.db.programApplication.findFirst.mockReset().mockResolvedValue({ id: 'app1', programId: 'p1' })
    h.db.deliverableFile.findUniqueOrThrow.mockReset().mockResolvedValue({
      id: 'f1',
      taskId: 't1',
      task: { id: 't1', status: 'UPLOADED', phase: 'FULL_CERTIFICATION', deliverable: { applicationId: 'app1', expenseId: 'e1' } },
    })
    h.db.deliverableFile.delete.mockReset().mockResolvedValue({})
    h.db.deliverableFile.count.mockReset().mockResolvedValue(0)
    h.db.expenseDeliverableTask.update.mockReset().mockResolvedValue({})
    h.db.expenseDeliverableTask.findMany.mockReset()
    h.db.programExpenseCertification.findUnique.mockReset()
    h.db.programExpenseCertification.update.mockReset().mockResolvedValue({})
  })

  it('(d) removeDeliverableTaskFile on a cert-phase task with verified:true + now-incomplete -> demotes', async () => {
    h.db.programExpenseCertification.findUnique.mockResolvedValue({
      id: 'cert1', verified: true, serialNumber: 'SN-1', location: null, assetRegistryRef: 'REG-1', paid: true,
    })
    // Last file removed -> task downgraded to PENDING (existing behavior) -> now-incomplete.
    h.db.expenseDeliverableTask.findMany.mockResolvedValue([
      { phase: 'FULL_CERTIFICATION', mandatory: true, status: 'PENDING' },
    ])

    await removeDeliverableTaskFile('f1')

    expect(h.db.expenseDeliverableTask.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'PENDING' } })
    expect(h.db.programExpenseCertification.update).toHaveBeenCalledTimes(1)
    expect(h.db.programExpenseCertification.update).toHaveBeenCalledWith({
      where: { id: 'cert1' },
      data: { verified: false, verifiedById: null },
    })
  })
})
