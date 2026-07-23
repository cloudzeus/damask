import { describe, it, expect, vi, beforeEach } from 'vitest'
const h = vi.hoisted(() => ({ db: {} as any, bunnyUploadPrivate: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/bunny-storage', () => ({ bunnyUploadPrivate: h.bunnyUploadPrivate }))
import { getUploadRequestByToken, submitDocumentUpload, getPortalDashboardByToken } from '@/lib/pm/portal-public'

const FUTURE = new Date(Date.now() + 86_400_000)
const PAST = new Date(Date.now() - 86_400_000)
beforeEach(() => { h.bunnyUploadPrivate.mockReset().mockResolvedValue(undefined); for (const k of Object.keys(h.db)) delete h.db[k] })

describe('getUploadRequestByToken', () => {
  it('unknown token → invalid, no leak', async () => {
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue(null) }
    const r = await getUploadRequestByToken('nope'); expect(r.ok).toBe(false)
  })
  it('expired → not ok', async () => {
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue({ status: 'PENDING', expiresAt: PAST, title: 't', description: null, application: { trdr: { NAME: 'A' }, program: { title: 'P' } } }) }
    const r = await getUploadRequestByToken('x'); expect(r.ok).toBe(false)
  })
  it('valid PENDING → ok, no applicationId leaked in returned shape', async () => {
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue({ status: 'PENDING', expiresAt: FUTURE, title: 't', description: 'd', application: { trdr: { NAME: 'ΑΦΟΙ' }, program: { title: 'Πρ' } } }) }
    const r = await getUploadRequestByToken('x')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.request.customerName).toBe('ΑΦΟΙ'); expect((r.request as any).applicationId).toBeUndefined() }
  })
})
describe('submitDocumentUpload', () => {
  const okRec = { id: 'req1', applicationId: 'app-REAL', obligationId: 'ob-REAL', deliverableTaskId: null as string | null, status: 'PENDING', expiresAt: FUTURE, uploadedDocumentId: null }
  beforeEach(() => {
    h.db.deliverableFile = { create: vi.fn().mockResolvedValue({ id: 'df1' }) }
    h.db.expenseDeliverableTask = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  })
  it('re-derives applicationId/obligationId from the RECORD (ignores any client id)', async () => {
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue(okRec), update: vi.fn().mockResolvedValue({}) }
    h.db.applicationDocument = { create: vi.fn().mockResolvedValue({ id: 'doc1' }) }
    const r = await submitDocumentUpload('x', { filename: 'a.pdf', base64: Buffer.from('hi').toString('base64'), mimeType: 'application/pdf' })
    expect(r.ok).toBe(true)
    const created = h.db.applicationDocument.create.mock.calls[0][0].data
    expect(created.applicationId).toBe('app-REAL'); expect(created.obligationId).toBe('ob-REAL')
    expect(h.bunnyUploadPrivate).toHaveBeenCalledTimes(1)
    expect(h.db.documentRequest.update.mock.calls[0][0].data).toMatchObject({ status: 'UPLOADED', uploadedDocumentId: 'doc1' })
  })
  it('expired token → rejected, no upload', async () => {
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue({ ...okRec, expiresAt: PAST }) }
    const r = await submitDocumentUpload('x', { filename: 'a.pdf', base64: Buffer.from('hi').toString('base64'), mimeType: 'application/pdf' })
    expect(r.ok).toBe(false); expect(h.bunnyUploadPrivate).not.toHaveBeenCalled()
  })
  it('oversized → rejected before upload', async () => {
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue(okRec) }
    const big = Buffer.alloc(26 * 1024 * 1024).toString('base64')
    const r = await submitDocumentUpload('x', { filename: 'a.pdf', base64: big, mimeType: 'application/pdf' })
    expect(r.ok).toBe(false); expect(h.bunnyUploadPrivate).not.toHaveBeenCalled()
  })
  it('deliverableTaskId set → also lands as DeliverableFile on the SAME task (same bunny key) and flips task to UPLOADED', async () => {
    const rec = { ...okRec, deliverableTaskId: 'task-REAL' }
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue(rec), update: vi.fn().mockResolvedValue({}) }
    h.db.applicationDocument = { create: vi.fn().mockResolvedValue({ id: 'doc1' }) }
    const r = await submitDocumentUpload('x', { filename: 'a.pdf', base64: Buffer.from('hi').toString('base64'), mimeType: 'application/pdf' })
    expect(r.ok).toBe(true)
    expect(h.db.deliverableFile.create).toHaveBeenCalledTimes(1)
    const dfData = h.db.deliverableFile.create.mock.calls[0][0].data
    expect(dfData.taskId).toBe('task-REAL')
    const uploadedKey = h.bunnyUploadPrivate.mock.calls[0][0].key
    expect(dfData.storageKey).toBe(uploadedKey)
    expect(h.db.expenseDeliverableTask.updateMany).toHaveBeenCalledTimes(1)
    expect(h.db.expenseDeliverableTask.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'task-REAL', status: { in: ['PENDING', 'REJECTED'] } },
      data: { status: 'UPLOADED' },
    })
  })
  it('deliverableTaskId null → old behaviour intact, no DeliverableFile write', async () => {
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue(okRec), update: vi.fn().mockResolvedValue({}) }
    h.db.applicationDocument = { create: vi.fn().mockResolvedValue({ id: 'doc1' }) }
    const r = await submitDocumentUpload('x', { filename: 'a.pdf', base64: Buffer.from('hi').toString('base64'), mimeType: 'application/pdf' })
    expect(r.ok).toBe(true)
    expect(h.db.deliverableFile.create).not.toHaveBeenCalled()
    expect(h.db.expenseDeliverableTask.updateMany).not.toHaveBeenCalled()
  })
  it('deliverable-side create throws → submitDocumentUpload still returns ok:true (non-fatal)', async () => {
    const rec = { ...okRec, deliverableTaskId: 'task-REAL' }
    h.db.documentRequest = { findUnique: vi.fn().mockResolvedValue(rec), update: vi.fn().mockResolvedValue({}) }
    h.db.applicationDocument = { create: vi.fn().mockResolvedValue({ id: 'doc1' }) }
    h.db.deliverableFile.create.mockRejectedValue(new Error('boom'))
    const r = await submitDocumentUpload('x', { filename: 'a.pdf', base64: Buffer.from('hi').toString('base64'), mimeType: 'application/pdf' })
    expect(r.ok).toBe(true)
  })
})
describe('getPortalDashboardByToken', () => {
  it('scopes findMany to the token trdrId; unknown/expired → not ok', async () => {
    h.db.portalToken = { findUnique: vi.fn().mockResolvedValue(null) }
    expect((await getPortalDashboardByToken('x')).ok).toBe(false)
    h.db.portalToken = { findUnique: vi.fn().mockResolvedValue({ id: 'pt', trdrId: 'trdr-REAL', expiresAt: FUTURE, trdr: { NAME: 'ΑΦΟΙ' } }), update: vi.fn().mockResolvedValue({}) }
    h.db.programApplication = { findMany: vi.fn().mockResolvedValue([]) }
    const r = await getPortalDashboardByToken('x')
    expect(r.ok).toBe(true)
    expect(h.db.programApplication.findMany.mock.calls[0][0].where.trdrId).toBe('trdr-REAL')
  })
})
