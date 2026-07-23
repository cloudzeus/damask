import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * C2g (Task 9, Part A) — createDocumentRequest now optionally targets a
 * specific ExpenseDeliverableTask. The task MUST belong to the SAME
 * application as the request; a cross-application task is rejected before
 * any token/email side effect. rbac passes here (mirrors
 * tests/pm-c2g-instance-guard.test.ts's hoisted-mock idiom) so the throw we
 * assert on is genuinely the ownership check, not requirePermission.
 */
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn(async () => ({ user: { id: 'u1', permissions: ['pm.manage'] } })) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    programApplication: { findFirst: vi.fn(async () => ({ id: 'app-REAL', trdrId: 'trdr-1' })) },
    applicationObligation: { findUnique: vi.fn() },
    expenseDeliverableTask: { findUnique: vi.fn() },
    trdr: { findUniqueOrThrow: vi.fn(async () => ({ NAME: 'ΑΦΟΙ' })) },
    documentRequest: { create: vi.fn(async (args: any) => ({ id: 'req1', ...args.data })) },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/pm/portal-token', () => ({ newToken: () => ({ raw: 'raw-token', hash: 'hash-token' }) }))
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn(async () => {}), isMailerConfigured: vi.fn(async () => false), escapeHtml: (s: string) => s }))

import { prisma } from '@/lib/prisma'
import { createDocumentRequest } from '@/lib/pm/actions'

beforeEach(() => {
  vi.mocked(prisma.expenseDeliverableTask.findUnique).mockReset()
  vi.mocked(prisma.documentRequest.create).mockClear()
})

describe('createDocumentRequest — deliverableTaskId ownership', () => {
  it('task belongs to ANOTHER application → throws, request not created', async () => {
    vi.mocked(prisma.expenseDeliverableTask.findUnique).mockResolvedValue({ deliverable: { applicationId: 'app-OTHER' } } as any)
    await expect(
      createDocumentRequest('app-REAL', { deliverableTaskId: 'task-1', title: 't', email: 'x@y.gr' }),
    ).rejects.toThrow('Το παραδοτέο ανήκει σε άλλο έργο.')
    expect(prisma.documentRequest.create).not.toHaveBeenCalled()
  })

  it('task belongs to the SAME application → succeeds, stores deliverableTaskId on the row', async () => {
    vi.mocked(prisma.expenseDeliverableTask.findUnique).mockResolvedValue({ deliverable: { applicationId: 'app-REAL' } } as any)
    const r = await createDocumentRequest('app-REAL', { deliverableTaskId: 'task-1', title: 't', email: 'x@y.gr' })
    expect(r.id).toBe('req1')
    const data = vi.mocked(prisma.documentRequest.create).mock.calls[0][0].data
    expect(data.deliverableTaskId).toBe('task-1')
  })

  it('no deliverableTaskId → unaffected, findUnique not called', async () => {
    const r = await createDocumentRequest('app-REAL', { title: 't', email: 'x@y.gr' })
    expect(r.id).toBe('req1')
    expect(prisma.expenseDeliverableTask.findUnique).not.toHaveBeenCalled()
    const data = vi.mocked(prisma.documentRequest.create).mock.calls[0][0].data
    expect(data.deliverableTaskId).toBeNull()
  })
})
