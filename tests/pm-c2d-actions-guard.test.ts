import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
import { requirePermission } from '@/lib/rbac-server'
import { createDocumentRequest, listDocumentRequests, resendDocumentRequest, cancelDocumentRequest, fulfillDocumentRequest, createPortalAccess, listTrdrContactEmails } from '@/lib/pm/actions'
beforeEach(() => { vi.mocked(requirePermission).mockReset(); vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden')) })
describe('C2d internal actions enforce pm access', () => {
  it('createDocumentRequest', async () => { await expect(createDocumentRequest('a1', { title: 't', email: 'x@y.gr' })).rejects.toThrow() })
  it('listDocumentRequests', async () => { await expect(listDocumentRequests('a1')).rejects.toThrow() })
  it('resendDocumentRequest', async () => { await expect(resendDocumentRequest('r1')).rejects.toThrow() })
  it('cancelDocumentRequest', async () => { await expect(cancelDocumentRequest('r1')).rejects.toThrow() })
  it('fulfillDocumentRequest', async () => { await expect(fulfillDocumentRequest('r1')).rejects.toThrow() })
  it('createPortalAccess', async () => { await expect(createPortalAccess('a1', { email: 'x@y.gr' })).rejects.toThrow() })
  it('listTrdrContactEmails', async () => { await expect(listTrdrContactEmails('a1')).rejects.toThrow() })
})
