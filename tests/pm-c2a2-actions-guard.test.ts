import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    // Task 5 (certification) actions load the parent expense row (to
    // discover applicationId for the visibility gate) BEFORE the gate
    // itself runs — provide these so the rejection we assert on is
    // actually coming from requirePermission, not an unrelated
    // "cannot read property of undefined" from an unmocked prisma delegate.
    programExpense: { findUniqueOrThrow: vi.fn(async () => ({ id: 'e1', applicationId: 'app-1' })) },
    programApplication: { findFirst: vi.fn(async () => null) },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/bunny-storage', () => ({ bunnyUploadPrivate: vi.fn() }))

import { requirePermission } from '@/lib/rbac-server'
import { getBudgetCompliance, replaceExpense, listCertifications, upsertCertification, uploadCertificationFile } from '@/lib/pm/actions'

beforeEach(() => {
  vi.mocked(requirePermission).mockReset()
  vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
})

describe('C2a.2 budget/replace actions enforce pm access', () => {
  it('getBudgetCompliance rejects', async () => {
    await expect(getBudgetCompliance('a1')).rejects.toThrow()
  })

  it('replaceExpense rejects', async () => {
    await expect(replaceExpense('e1', { description: 'x', amount: 1 })).rejects.toThrow()
  })
})

describe('C2a.2 certification actions enforce pm access', () => {
  it('listCertifications rejects', async () => {
    await expect(listCertifications('a1')).rejects.toThrow()
  })

  it('upsertCertification rejects', async () => {
    await expect(upsertCertification('e1', { serialNumber: 'SN-1' })).rejects.toThrow()
  })

  it('uploadCertificationFile rejects', async () => {
    await expect(
      uploadCertificationFile('e1', 'photo', { base64: 'YWJj', mimeType: 'image/jpeg', ext: 'jpg' }),
    ).rejects.toThrow()
  })
})
