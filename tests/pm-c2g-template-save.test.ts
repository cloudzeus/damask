import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  db: {
    programDeliverableTemplate: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    programDeliverableTask: {
      findMany: vi.fn(),
    },
    program: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  } as any,
}))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'u1', role: 'ADMIN', permissions: ['programs.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('notFound') }) }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))

import { saveDeliverableTemplate, copyDeliverableTemplates } from '@/lib/pm/actions'

function makeTx() {
  return {
    programDeliverableTemplate: { update: vi.fn(async (args: any) => ({ id: args.where.id })), create: vi.fn(async (args: any) => ({ id: 'new-tpl' })) },
    programDeliverableTask: {
      update: vi.fn(async (args: any) => ({ id: args.where.id })),
      create: vi.fn(async (args: any) => ({ id: 'new-task' })),
      deleteMany: vi.fn(async (_args: any) => ({ count: 1 })),
    },
  }
}

describe('saveDeliverableTemplate', () => {
  beforeEach(() => {
    h.db.programDeliverableTemplate.findMany.mockReset()
    h.db.programDeliverableTemplate.findUniqueOrThrow.mockReset()
    h.db.programDeliverableTemplate.aggregate.mockReset()
    h.db.programDeliverableTemplate.create.mockReset()
    h.db.programDeliverableTemplate.update.mockReset()
    h.db.programDeliverableTemplate.delete.mockReset()
    h.db.programDeliverableTask.findMany.mockReset()
    h.db.program.findMany.mockReset()
    h.db.$transaction.mockReset()
  })

  it('creates a new group with nested tasks and clamps minFiles 0 -> 1', async () => {
    h.db.programDeliverableTemplate.aggregate.mockResolvedValue({ _max: { order: null } })
    h.db.programDeliverableTemplate.create.mockResolvedValue({ id: 'tpl-1' })

    const result = await saveDeliverableTemplate({
      programId: 'p1',
      name: 'Παραδοτέο Α',
      appliesTo: 'EXPENSE',
      tasks: [
        { phase: 'SUBMISSION', name: 'task 1', mandatory: true, onSiteVerification: false, minFiles: 0, order: 0 },
        { phase: 'APPROVAL', name: 'task 2', mandatory: false, onSiteVerification: true, minFiles: 3, order: 1 },
      ],
    })

    expect(result).toEqual({ id: 'tpl-1' })
    expect(h.db.programDeliverableTemplate.create).toHaveBeenCalledTimes(1)
    const createArgs = h.db.programDeliverableTemplate.create.mock.calls[0][0]
    expect(createArgs.data).toMatchObject({ programId: 'p1', name: 'Παραδοτέο Α', appliesTo: 'EXPENSE', order: 0 })
    expect(createArgs.data.tasks.create).toHaveLength(2)
    expect(createArgs.data.tasks.create[0]).toMatchObject({ name: 'task 1', minFiles: 1 })
    expect(createArgs.data.tasks.create[1]).toMatchObject({ name: 'task 2', minFiles: 3 })
  })

  it('save-existing with a removed task deletes it via deleteMany', async () => {
    h.db.programDeliverableTemplate.findUniqueOrThrow.mockResolvedValue({ id: 'tpl-1', programId: 'p1' })
    h.db.programDeliverableTask.findMany.mockResolvedValue([{ id: 'task-a' }, { id: 'task-b' }])
    const tx = makeTx()
    h.db.$transaction.mockImplementation(async (fn: any) => fn(tx))

    const result = await saveDeliverableTemplate({
      id: 'tpl-1',
      programId: 'p1',
      name: 'Παραδοτέο Α',
      appliesTo: 'EXPENSE',
      tasks: [
        { id: 'task-a', phase: 'SUBMISSION', name: 'task 1 kept', mandatory: true, onSiteVerification: false, minFiles: 1, order: 0 },
      ],
    })

    expect(result).toEqual({ id: 'tpl-1' })
    expect(tx.programDeliverableTask.deleteMany).toHaveBeenCalledTimes(1)
    const deleteArgs = tx.programDeliverableTask.deleteMany.mock.calls[0][0]
    expect(deleteArgs.where.id.in).toEqual(['task-b'])
    expect(tx.programDeliverableTask.update).toHaveBeenCalledTimes(1)
    expect(tx.programDeliverableTask.create).not.toHaveBeenCalled()
  })

  it('rejects empty name', async () => {
    await expect(saveDeliverableTemplate({
      programId: 'p1', name: '   ', appliesTo: 'EXPENSE',
      tasks: [{ phase: 'SUBMISSION', name: 't', mandatory: true, onSiteVerification: false, minFiles: 1, order: 0 }],
    })).rejects.toThrow()
  })

  it('rejects zero tasks', async () => {
    await expect(saveDeliverableTemplate({
      programId: 'p1', name: 'x', appliesTo: 'EXPENSE', tasks: [],
    })).rejects.toThrow()
  })
})

describe('copyDeliverableTemplates', () => {
  beforeEach(() => {
    h.db.programDeliverableTemplate.findMany.mockReset()
    h.db.programDeliverableTemplate.aggregate.mockReset()
    h.db.$transaction.mockReset()
  })

  it('creates groups in the target program with sourceTemplateId set', async () => {
    h.db.programDeliverableTemplate.findMany.mockResolvedValue([
      {
        id: 'src-1', name: 'Πρότυπο 1', description: null, appliesTo: 'EXPENSE',
        tasks: [{ phase: 'SUBMISSION', name: 't1', description: null, mandatory: true, onSiteVerification: false, minFiles: 1, order: 0 }],
      },
    ])
    h.db.programDeliverableTemplate.aggregate.mockResolvedValue({ _max: { order: 2 } })
    const txCreate = vi.fn(async (_args: any) => ({ id: 'copied-1' }))
    h.db.$transaction.mockImplementation(async (fn: any) => fn({ programDeliverableTemplate: { create: txCreate } }))

    const result = await copyDeliverableTemplates('target-1', ['src-1'])

    expect(result).toEqual({ copied: 1 })
    expect(txCreate).toHaveBeenCalledTimes(1)
    const args = txCreate.mock.calls[0][0]
    expect(args.data).toMatchObject({ programId: 'target-1', name: 'Πρότυπο 1', sourceTemplateId: 'src-1', order: 3, active: true })
    expect(args.data.tasks.create).toHaveLength(1)
  })
})
