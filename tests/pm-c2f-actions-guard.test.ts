import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
import { requirePermission } from '@/lib/rbac-server'
import { listPaymentRequests, createPaymentRequest, updatePaymentRequest, deletePaymentRequest, setPaymentRequestStatus, listPaymentEligibleExpenses, addExpenseToRequest, removeExpenseFromRequest } from '@/lib/pm/actions'
beforeEach(() => { vi.mocked(requirePermission).mockReset(); vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden')) })
describe('C2f actions enforce pm access', () => {
  it('listPaymentRequests', async () => { await expect(listPaymentRequests('a1')).rejects.toThrow() })
  it('createPaymentRequest', async () => { await expect(createPaymentRequest('a1', {})).rejects.toThrow() })
  it('updatePaymentRequest', async () => { await expect(updatePaymentRequest('r1', { title: 'x' })).rejects.toThrow() })
  it('deletePaymentRequest', async () => { await expect(deletePaymentRequest('r1')).rejects.toThrow() })
  it('setPaymentRequestStatus', async () => { await expect(setPaymentRequestStatus('r1', 'SUBMITTED')).rejects.toThrow() })
  it('listPaymentEligibleExpenses', async () => { await expect(listPaymentEligibleExpenses('a1')).rejects.toThrow() })
  it('addExpenseToRequest', async () => { await expect(addExpenseToRequest('r1', 'e1')).rejects.toThrow() })
  it('removeExpenseFromRequest', async () => { await expect(removeExpenseFromRequest('e1')).rejects.toThrow() })
})
