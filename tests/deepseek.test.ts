import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/settings', () => ({ getIntegration: vi.fn(async () => ({})) }))

import { getIntegration } from '@/lib/settings'
import { deepseekChat, translateText, generateText } from '@/lib/deepseek'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getIntegration).mockReset()
})
afterEach(() => vi.unstubAllGlobals())

function chatResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })
}

describe('deepseekChat', () => {
  it('throws a friendly error when no apiKey is configured anywhere (opts or stored)', async () => {
    vi.mocked(getIntegration).mockResolvedValue({})
    await expect(deepseekChat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/API key/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the stored config (getIntegration merges DB/env) when opts omit fields', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'stored-key', apiUrl: 'https://x.example/chat', model: 'deepseek-chat' })
    fetchMock.mockResolvedValueOnce(chatResponse('pong'))

    const result = await deepseekChat([{ role: 'user', content: 'ping' }])

    expect(result).toBe('pong')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.example/chat')
    expect(init.headers.Authorization).toBe('Bearer stored-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('deepseek-chat')
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }])
  })

  it('opts override the stored config field-by-field', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'stored-key', model: 'deepseek-chat' })
    fetchMock.mockResolvedValueOnce(chatResponse('pong'))

    await deepseekChat([{ role: 'user', content: 'ping' }], { apiKey: 'explicit-key', model: 'deepseek-reasoner', maxTokens: 42 })

    const init = fetchMock.mock.calls[0][1]
    expect(init.headers.Authorization).toBe('Bearer explicit-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('deepseek-reasoner')
    expect(body.max_tokens).toBe(42)
  })

  it('falls back to the documented default apiUrl/model when neither opts nor storage set them', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k' })
    fetchMock.mockResolvedValueOnce(chatResponse('pong'))

    await deepseekChat([{ role: 'user', content: 'ping' }])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(JSON.parse(init.body).model).toBe('deepseek-chat')
  })

  it('throws with the HTTP status and body detail on a non-2xx response', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k' })
    fetchMock.mockResolvedValueOnce(new Response('bad request', { status: 400 }))

    await expect(deepseekChat([{ role: 'user', content: 'ping' }])).rejects.toThrow(/400/)
  })

  it('throws a friendly error when the response has no message content', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k' })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    await expect(deepseekChat([{ role: 'user', content: 'ping' }])).rejects.toThrow(/μη αναμενόμενη/)
  })
})

describe('translateText', () => {
  it('sends a translation system prompt naming the from/to languages and returns trimmed text', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k' })
    fetchMock.mockResolvedValueOnce(chatResponse('  Καλημέρα  '))

    const result = await translateText('Good morning', 'en', 'el')

    expect(result).toBe('Καλημέρα')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toMatch(/English/)
    expect(body.messages[0].content).toMatch(/Greek/)
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Good morning' })
  })
})

describe('generateText', () => {
  it('sends a single user message with the raw prompt and returns trimmed text', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k' })
    fetchMock.mockResolvedValueOnce(chatResponse(' Γεια σου κόσμε '))

    const result = await generateText('Πες γεια')

    expect(result).toBe('Γεια σου κόσμε')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages).toEqual([{ role: 'user', content: 'Πες γεια' }])
  })
})
