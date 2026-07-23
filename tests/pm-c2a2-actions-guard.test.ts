import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))

import { requirePermission } from '@/lib/rbac-server'
import { getBudgetCompliance, replaceExpense } from '@/lib/pm/actions'

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
