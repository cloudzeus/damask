import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import iconv from 'iconv-lite'

// Mock prisma ΠΡΙΝ το import του client
const mem: { session: { clientId: string; date: string } | null } = { session: null }
vi.mock('@/lib/prisma', () => ({
  prisma: {
    s1Session: {
      findUnique: vi.fn(async () => mem.session ? { id: 1, ...mem.session } : null),
      upsert: vi.fn(async ({ create }: any) => {
        mem.session = { clientId: create.clientId, date: create.date }
        return { id: 1, ...mem.session }
      }),
      deleteMany: vi.fn(async () => { mem.session = null; return { count: 1 } }),
    },
  },
}))

import { s1, __resetForTests } from '@/lib/softone'

function s1Response(obj: unknown): Response {
  const buf = iconv.encode(JSON.stringify(obj), 'win1253')
  return new Response(new Uint8Array(buf))
}

const fetchMock = vi.fn()

beforeEach(() => {
  mem.session = null
  __resetForTests()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.S1_SERIAL = 'test'
  process.env.S1_APP_ID = '1001'
})
afterEach(() => vi.unstubAllGlobals())

describe('softone client', () => {
  it('authenticates two-step and decodes win1253 Greek', async () => {
    fetchMock
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'temp1' }))       // Login
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'sess1' }))       // authenticate
      .mockResolvedValueOnce(s1Response({ success: true, rows: [{ NAME: 'Καλημέρα' }] })) // service

    const res = await s1('GetTable', { TABLE: 'MTRL' })
    expect(res.rows[0].NAME).toBe('Καλημέρα')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const loginBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(loginBody.SERVICE).toBe('Login')
    const authBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(authBody.service).toBe('authenticate')
    expect(authBody.clientID).toBe('temp1')
  })

  it('reuses cached session for the same day', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mem.session = { clientId: 'cached', date: today }
    fetchMock.mockResolvedValueOnce(s1Response({ success: true, rows: [] }))

    await s1('GetTable', { TABLE: 'MTRL' })
    expect(fetchMock).toHaveBeenCalledTimes(1) // κανένα Login/authenticate
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.clientID).toBe('cached')
  })

  it('re-authenticates on errorcode -101 and retries once', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mem.session = { clientId: 'stale', date: today }
    fetchMock
      .mockResolvedValueOnce(s1Response({ success: false, errorcode: -101 }))  // expired
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'temp2' })) // Login
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'fresh' })) // authenticate
      .mockResolvedValueOnce(s1Response({ success: true, rows: [{ ok: 1 }] })) // retry

    const res = await s1('GetTable', { TABLE: 'MTRL' })
    expect(res.rows[0].ok).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('throws on non-JSON HTML error page', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mem.session = { clientId: 'cached', date: today }
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(iconv.encode('<html>502 Bad Gateway</html>', 'win1253')), { status: 502 })
    )

    await expect(s1('GetTable', { TABLE: 'MTRL' })).rejects.toThrow(/S1 HTTP 502/)
  })

  it('throws when retry also returns -101', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mem.session = { clientId: 'stale', date: today }
    fetchMock
      .mockResolvedValueOnce(s1Response({ success: false, errorcode: -101 }))  // expired
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'temp2' })) // Login
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'fresh' })) // authenticate
      .mockResolvedValueOnce(s1Response({ success: false, errorcode: -101 }))  // retry still expired

    await expect(s1('GetTable', { TABLE: 'MTRL' })).rejects.toThrow(/auth failed after retry/)
  })

  it('skips re-auth when another caller already refreshed the session', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mem.session = { clientId: 'stale', date: today }
    fetchMock
      .mockImplementationOnce(async () => {
        // simulate another concurrent caller refreshing the session in the meantime
        mem.session = { clientId: 'refreshed', date: today }
        return s1Response({ success: false, errorcode: -101 })
      })
      .mockResolvedValueOnce(s1Response({ success: true, rows: [{ ok: 1 }] }))

    const res = await s1('GetTable', { TABLE: 'MTRL' })
    expect(res.rows[0].ok).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2) // no Login/authenticate calls
  })
})
