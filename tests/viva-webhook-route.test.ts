import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyWebhookGetMock = vi.fn()
const processVivaWebhookEventMock = vi.fn()
vi.mock('@/lib/viva', () => ({
  verifyWebhookGet: (...args: unknown[]) => verifyWebhookGetMock(...args),
  processVivaWebhookEvent: (...args: unknown[]) => processVivaWebhookEventMock(...args),
}))

const revalidatePathMock = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { GET, POST } from '@/app/api/webhooks/viva/route'

beforeEach(() => {
  verifyWebhookGetMock.mockReset()
  processVivaWebhookEventMock.mockReset()
  revalidatePathMock.mockReset()
})

function postRequest(body: unknown): Request {
  return new Request('https://example.com/api/webhooks/viva', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/webhooks/viva — verification handshake', () => {
  it('returns {Key} with 200 when the active environment has a verification key', async () => {
    verifyWebhookGetMock.mockResolvedValueOnce({ Key: 'wkey' })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ Key: 'wkey' })
  })

  it('returns 404 with a friendly error when not configured yet', async () => {
    verifyWebhookGetMock.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)
  })
})

describe('POST /api/webhooks/viva — events', () => {
  it('always responds 200 for a malformed (non-JSON) body, and never calls processVivaWebhookEvent', async () => {
    const res = await POST(new Request('https://example.com/api/webhooks/viva', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, handled: false })
    expect(processVivaWebhookEventMock).not.toHaveBeenCalled()
  })

  it('responds 200 without calling processVivaWebhookEvent when the shape fails validation (no EventTypeId)', async () => {
    const res = await POST(postRequest({ foo: 'bar' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, handled: false })
    expect(processVivaWebhookEventMock).not.toHaveBeenCalled()
  })

  it('delegates a valid 1796 event to processVivaWebhookEvent and revalidates /payments when handled', async () => {
    processVivaWebhookEventMock.mockResolvedValueOnce({ handled: true, reason: 'paid', orderCode: '123' })
    const res = await POST(postRequest({ EventTypeId: 1796, EventData: { OrderCode: '123', TransactionId: 'tx-1' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, handled: true })
    expect(processVivaWebhookEventMock).toHaveBeenCalledWith({ EventTypeId: 1796, EventData: { OrderCode: '123', TransactionId: 'tx-1' } })
    expect(revalidatePathMock).toHaveBeenCalledWith('/payments')
  })

  it('still responds 200 for an unknown orderCode, without revalidating (tolerated, log-only)', async () => {
    processVivaWebhookEventMock.mockResolvedValueOnce({ handled: false, reason: 'unknown-order-code', orderCode: '999' })
    const res = await POST(postRequest({ EventTypeId: 1796, EventData: { OrderCode: '999' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, handled: false })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('still responds 200 (never 5xx) even if processVivaWebhookEvent rejects unexpectedly (e.g. DB down)', async () => {
    processVivaWebhookEventMock.mockRejectedValueOnce(new Error('db down'))
    const res = await POST(postRequest({ EventTypeId: 1796, EventData: { OrderCode: '1' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, handled: false })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
