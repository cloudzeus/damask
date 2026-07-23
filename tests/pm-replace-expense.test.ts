import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  db: {
    programExpense: {
      findUniqueOrThrow: vi.fn(),
    },
    programApplication: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  } as any,
  suggest: vi.fn(async () => ({ categoryId: null, reason: null, confidence: null })),
}))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'u1', role: 'ADMIN', permissions: ['pm.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/programs/actions', () => ({ suggestExpenseCategory: h.suggest }))

import { replaceExpense } from '@/lib/pm/actions'

function makeTx() {
  const created = { id: 'new1' }
  const tx = {
    programExpense: {
      create: vi.fn(async (_args: any) => created),
      update: vi.fn(async (args: any) => ({ id: args.where.id })),
    },
  }
  return tx
}

describe('replaceExpense', () => {
  beforeEach(() => {
    h.db.programExpense.findUniqueOrThrow.mockReset()
    h.db.programApplication.findFirst.mockReset()
    h.db.$transaction.mockReset()
    h.suggest.mockClear()

    h.db.programApplication.findFirst.mockResolvedValue({ id: 'app-1', programId: 'prog-1' })
  })

  it('creates a new ACTIVE expense linking replacesExpenseId, marks the old REPLACED', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({
      applicationId: 'app-1',
      status: 'ACTIVE',
      paymentRequestId: null,
      paymentRequest: null,
    })
    const tx = makeTx()
    h.db.$transaction.mockImplementation(async (fn: any) => fn(tx))

    const result = await replaceExpense('old1', { description: 'Νέο τιμολόγιο', amount: 123.45 })

    expect(result).toEqual({ id: 'new1' })
    expect(tx.programExpense.create).toHaveBeenCalledTimes(1)
    const createArgs = tx.programExpense.create.mock.calls[0][0]
    expect(createArgs.data).toMatchObject({
      applicationId: 'app-1',
      status: 'ACTIVE',
      replacesExpenseId: 'old1',
      description: 'Νέο τιμολόγιο',
      amount: 123.45,
    })

    expect(tx.programExpense.update).toHaveBeenCalledTimes(1)
    const updateArgs = tx.programExpense.update.mock.calls[0][0]
    expect(updateArgs).toMatchObject({ where: { id: 'old1' }, data: { status: 'REPLACED' } })
  })

  it('throws when the old expense is already REPLACED', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({
      applicationId: 'app-1',
      status: 'REPLACED',
      paymentRequestId: null,
      paymentRequest: null,
    })

    await expect(replaceExpense('old1', { description: 'x', amount: 1 })).rejects.toThrow()
    expect(h.db.$transaction).not.toHaveBeenCalled()
  })

  it('frees the δόση claim when replacing an expense that is in a DRAFT payment request', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({
      applicationId: 'app-1',
      status: 'ACTIVE',
      paymentRequestId: 'r1',
      paymentRequest: { status: 'DRAFT' },
    })
    const tx = makeTx()
    h.db.$transaction.mockImplementation(async (fn: any) => fn(tx))

    const result = await replaceExpense('old1', { description: 'Νέο τιμολόγιο', amount: 50 })

    expect(result).toEqual({ id: 'new1' })
    expect(tx.programExpense.update).toHaveBeenCalledTimes(1)
    const updateArgs = tx.programExpense.update.mock.calls[0][0]
    expect(updateArgs).toMatchObject({
      where: { id: 'old1' },
      data: { status: 'REPLACED', paymentRequestId: null },
    })
  })

  it('throws when the old expense is claimed in a non-DRAFT (submitted) payment request', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({
      applicationId: 'app-1',
      status: 'ACTIVE',
      paymentRequestId: 'r1',
      paymentRequest: { status: 'SUBMITTED' },
    })

    await expect(replaceExpense('old1', { description: 'x', amount: 1 })).rejects.toThrow()
    expect(h.db.$transaction).not.toHaveBeenCalled()
  })
})
