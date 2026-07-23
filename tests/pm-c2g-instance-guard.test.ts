import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * C2g (Task 5) — instance-level actions (task files, status transitions,
 * manual dependency edit) all funnel through requireVisibleTask ->
 * requireVisibleApplication. Mirrors tests/pm-c2a2-actions-guard.test.ts:
 * provide just enough prisma mock (row that carries applicationId) so the
 * rejection we assert on is genuinely coming from requirePermission, not an
 * unrelated "cannot read property of undefined" from an unmocked delegate.
 */
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    expenseDeliverableTask: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 't1',
        deliverableId: 'd1',
        status: 'PENDING',
        minFiles: 1,
        deliverable: { applicationId: 'app-1', expenseId: null },
      })),
    },
    deliverableFile: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'f1',
        taskId: 't1',
        task: { id: 't1', status: 'UPLOADED', deliverable: { applicationId: 'app-1' } },
      })),
    },
    deliverableDependency: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'd1',
        auto: false,
        dependent: { deliverable: { applicationId: 'app-1' } },
      })),
    },
    programApplication: { findFirst: vi.fn(async () => null) },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/bunny-storage', () => ({ bunnyUploadPrivate: vi.fn() }))

import { requirePermission } from '@/lib/rbac-server'
import {
  listApplicationDeliverables,
  uploadDeliverableTaskFile,
  removeDeliverableTaskFile,
  setDeliverableTaskStatus,
  addTaskDependency,
  removeTaskDependency,
} from '@/lib/pm/actions'

beforeEach(() => {
  vi.mocked(requirePermission).mockReset()
  vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
})

describe('C2g instance actions enforce pm access', () => {
  it('listApplicationDeliverables rejects', async () => {
    await expect(listApplicationDeliverables('a1')).rejects.toThrow()
  })

  it('uploadDeliverableTaskFile rejects', async () => {
    await expect(
      uploadDeliverableTaskFile('t1', { filename: 'a.pdf', base64: '', mimeType: 'application/pdf' }),
    ).rejects.toThrow()
  })

  it('removeDeliverableTaskFile rejects', async () => {
    await expect(removeDeliverableTaskFile('f1')).rejects.toThrow()
  })

  it('setDeliverableTaskStatus rejects', async () => {
    await expect(setDeliverableTaskStatus('t1', 'ACCEPTED')).rejects.toThrow()
  })

  it('addTaskDependency rejects', async () => {
    await expect(addTaskDependency('t1', 't2')).rejects.toThrow()
  })

  it('removeTaskDependency rejects', async () => {
    await expect(removeTaskDependency('d1')).rejects.toThrow()
  })
})
