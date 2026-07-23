import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same vi.hoisted() idiom as tests/programs-enrollment-tasks.test.ts — the
// generateObligations trigger already covered there. This file covers the
// C2g (Task 4) generateExpenseDeliverables triggers: createExpense (the
// expense-creating action in src/lib/programs/actions.ts) and
// createApplication's second, independent try/catch.
const { genDeliverablesMock, genObligationsMock, db } = vi.hoisted(() => ({
  genDeliverablesMock: vi.fn().mockResolvedValue({ addedDeliverables: 0, addedTasks: 0, rebuiltEdges: 0 }),
  genObligationsMock: vi.fn().mockResolvedValue({ addedObligations: 0, addedScores: 0, addedTasks: 0 }),
  db: {
    programApplication: { upsert: vi.fn().mockResolvedValue({ id: 'app-new' }) },
    programExpense: { create: vi.fn().mockResolvedValue({ id: 'exp-new' }) },
  } as any,
}))

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/pm/actions', () => ({
  generateObligations: (...a: any[]) => genObligationsMock(...a),
  generateExpenseDeliverables: (...a: any[]) => genDeliverablesMock(...a),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { createApplication, createExpense } from '@/lib/programs/actions'

beforeEach(() => {
  genDeliverablesMock.mockClear()
  genObligationsMock.mockClear()
  genDeliverablesMock.mockResolvedValue({ addedDeliverables: 0, addedTasks: 0, rebuiltEdges: 0 })
  genObligationsMock.mockResolvedValue({ addedObligations: 0, addedScores: 0, addedTasks: 0 })
  db.programExpense.create.mockClear()
  db.programExpense.create.mockResolvedValue({ id: 'exp-new' })
})

describe('createExpense auto-generates deliverables', () => {
  it('calls generateExpenseDeliverables with the applicationId after creating the expense', async () => {
    const res = await createExpense('app1', { description: 'Τιμολόγιο', amount: 100 })
    expect(res.id).toBe('exp-new')
    expect(genDeliverablesMock).toHaveBeenCalledWith('app1')
  })

  it('does not fail expense creation if deliverable generation throws', async () => {
    genDeliverablesMock.mockRejectedValueOnce(new Error('boom'))
    const res = await createExpense('app1', { description: 'Τιμολόγιο', amount: 100 })
    expect(res.id).toBe('exp-new')
  })
})

describe('createApplication also auto-generates deliverables (independent of generateObligations)', () => {
  it('calls both generateObligations and generateExpenseDeliverables with the new app id', async () => {
    const res = await createApplication({ trdrId: 'tr1', programId: 'p1' })
    expect(res.id).toBe('app-new')
    expect(genObligationsMock).toHaveBeenCalledWith('app-new')
    expect(genDeliverablesMock).toHaveBeenCalledWith('app-new')
  })

  it('still enrolls (and still calls generateExpenseDeliverables) if generateObligations throws', async () => {
    genObligationsMock.mockRejectedValueOnce(new Error('obligations boom'))
    const res = await createApplication({ trdrId: 'tr1', programId: 'p1' })
    expect(res.id).toBe('app-new')
    expect(genDeliverablesMock).toHaveBeenCalledWith('app-new')
  })

  it('does not roll back enrollment if generateExpenseDeliverables throws', async () => {
    genDeliverablesMock.mockRejectedValueOnce(new Error('deliverables boom'))
    const res = await createApplication({ trdrId: 'tr1', programId: 'p1' })
    expect(res.id).toBe('app-new')
  })
})
