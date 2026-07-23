import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
import { requirePermission } from '@/lib/rbac-server'
import { listVisibleObligations, listApplicationBoardObligations } from '@/lib/pm/actions'
beforeEach(() => { vi.mocked(requirePermission).mockReset(); vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden')) })
describe('C2b board actions enforce pm access', () => {
  it('listVisibleObligations', async () => { await expect(listVisibleObligations()).rejects.toThrow() })
  it('listApplicationBoardObligations', async () => { await expect(listApplicationBoardObligations('a1')).rejects.toThrow() })
})
