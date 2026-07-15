import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import iconv from 'iconv-lite'
import { testSoftOne, testMailgun, testBunny, testDeepSeek, testClaude, testGemini } from '@/lib/connection-tests'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function win1253Response(obj: unknown, status = 200): Response {
  return new Response(new Uint8Array(iconv.encode(JSON.stringify(obj), 'win1253')), { status })
}

describe('testSoftOne', () => {
  it('returns a clean ⚠ result (no throw, no fetch) when creds are empty', async () => {
    const result = await testSoftOne({})
    expect(result.ok).toBe(false)
    expect(result.message).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('succeeds on a valid login→authenticate sequence and never touches prisma/session', async () => {
    fetchMock
      .mockResolvedValueOnce(win1253Response({ success: true, clientID: 'temp1' }))
      .mockResolvedValueOnce(win1253Response({ success: true, clientID: 'sess1' }))

    const result = await testSoftOne({
      serial: 'demo', username: 'u', password: 'p', appId: '1001', company: '1000', branch: '1000', module: '0', refid: '111',
    })

    expect(result).toEqual({ ok: true, message: 'Επιτυχής σύνδεση με το SoftOne.' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(loginBody.SERVICE).toBe('Login')
    const authBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(authBody.service).toBe('authenticate')
    expect(authBody.clientID).toBe('temp1')
  })

  it('reports a friendly message when login itself fails', async () => {
    fetchMock.mockResolvedValueOnce(win1253Response({ success: false, error: 'bad creds' }))
    const result = await testSoftOne({ serial: 'demo', username: 'u', password: 'wrong', appId: '1001' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('bad creds')
    expect(fetchMock).toHaveBeenCalledTimes(1) // δεν προχωράει σε authenticate
  })

  it('catches network errors without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('DNS fail'))
    const result = await testSoftOne({ serial: 'demo', username: 'u', password: 'p', appId: '1001' })
    expect(result.ok).toBe(false)
  })
})

describe('testMailgun', () => {
  it('returns ⚠ without calling fetch when apiKey/domain are missing', async () => {
    const result = await testMailgun({})
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hits the US endpoint by default and succeeds on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const result = await testMailgun({ apiKey: 'k', domain: 'mg.example.com' })
    expect(result.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.mailgun.net/v3/domains/mg.example.com')
  })

  it('hits the EU endpoint when region is "EU"', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await testMailgun({ apiKey: 'k', domain: 'mg.example.com', region: 'EU' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.eu.mailgun.net/v3/domains/mg.example.com')
  })

  it('maps 401 to an invalid API key message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }))
    const result = await testMailgun({ apiKey: 'bad', domain: 'mg.example.com' })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/API key/)
  })
})

describe('testBunny', () => {
  it('returns ⚠ without calling fetch when required fields are missing', async () => {
    const result = await testBunny({})
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists the storage zone root with the AccessKey header and succeeds on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }))
    const result = await testBunny({ storageZone: 'damask', storagePassword: 'secret', storageApi: 'https://storage.bunnycdn.com' })
    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://storage.bunnycdn.com/damask/')
    expect(init.headers.AccessKey).toBe('secret')
  })

  it('maps 401 to a bad-password message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    const result = await testBunny({ storageZone: 'damask', storagePassword: 'wrong', storageApi: 'https://storage.bunnycdn.com' })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/AccessKey/)
  })
})

describe('testDeepSeek', () => {
  it('returns ⚠ without calling fetch when apiKey is missing', async () => {
    const result = await testDeepSeek({})
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a small ping completion (max_tokens 5) to the default endpoint/model', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const result = await testDeepSeek({ apiKey: 'k' })
    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('deepseek-chat')
    expect(body.max_tokens).toBe(5)
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }])
  })

  it('respects a custom apiUrl/model override', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await testDeepSeek({ apiKey: 'k', apiUrl: 'https://custom/x', model: 'deepseek-reasoner' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://custom/x')
    expect(JSON.parse(init.body).model).toBe('deepseek-reasoner')
  })
})

describe('testClaude', () => {
  it('returns ⚠ without calling fetch when apiKey is missing', async () => {
    const result = await testClaude({})
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the correct headers and a small ping (max_tokens 8) to the Messages API', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const result = await testClaude({ apiKey: 'k' })
    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('k')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body)
    expect(body.max_tokens).toBe(8)
    expect(body.model).toBe('claude-fable-5')
  })
})

describe('testGemini', () => {
  it('returns ⚠ without calling fetch when apiKey is missing', async () => {
    const result = await testGemini({})
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the x-goog-api-key header and a small ping to the default model', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const result = await testGemini({ apiKey: 'k' })
    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('k')
    const body = JSON.parse(init.body)
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'ping' }] }])
    expect(body.generationConfig.maxOutputTokens).toBe(5)
  })

  it('respects a custom model override', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await testGemini({ apiKey: 'k', model: 'gemini-2.5-pro' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent')
  })

  it('maps 400/403 to an invalid API key message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }))
    const result = await testGemini({ apiKey: 'bad' })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/API key/)
  })

  it('maps 404 to a model-not-found message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
    const result = await testGemini({ apiKey: 'k', model: 'no-such-model' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('no-such-model')
  })

  it('catches network errors without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('DNS fail'))
    const result = await testGemini({ apiKey: 'k' })
    expect(result.ok).toBe(false)
  })
})
