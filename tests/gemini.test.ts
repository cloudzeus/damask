import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/settings', () => ({ getIntegration: vi.fn(async () => ({})) }))
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn(async () => {}) }))

import { getIntegration } from '@/lib/settings'
import { logAiUsage } from '@/lib/ai/usage'
import { geminiGenerate, parseFallbackModels } from '@/lib/gemini'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getIntegration).mockReset()
  vi.mocked(logAiUsage).mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

/** Config μόνο για το integration «gemini» (χωρίς OpenRouter → απευθείας Gemini). */
function geminiConfig(cfg: Record<string, unknown>, openrouter: Record<string, unknown> = {}) {
  vi.mocked(getIntegration).mockImplementation(async (name: string) => (name === 'gemini' ? cfg : name === 'openrouter' ? openrouter : {}) as never)
}

function genResponse(text: string, status = 200, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 12, totalTokenCount: 42 },
    ...extra,
  }), { status })
}

describe('parseFallbackModels', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseFallbackModels('a, b ,, c')).toEqual(['a', 'b', 'c'])
  })
  it('returns [] for empty/undefined/null', () => {
    expect(parseFallbackModels('')).toEqual([])
    expect(parseFallbackModels(undefined)).toEqual([])
    expect(parseFallbackModels(null)).toEqual([])
  })
})

describe('geminiGenerate — config resolution', () => {
  it('throws a friendly Greek error when no apiKey is configured anywhere', async () => {
    geminiConfig({})
    await expect(geminiGenerate({ text: 'hi' })).rejects.toThrow(/API key/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the stored config (getIntegration) when opts omit fields', async () => {
    geminiConfig({ apiKey: 'stored-key', model: 'gemini-2.5-pro' })
    fetchMock.mockResolvedValueOnce(genResponse('pong'))

    const result = await geminiGenerate({ text: 'ping' })

    expect(result).toEqual({ text: 'pong', model: 'gemini-2.5-pro', tokensUsed: 42 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('stored-key')
    const body = JSON.parse(init.body)
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'ping' }] }])
  })

  it('opts override the stored config field-by-field', async () => {
    geminiConfig({ apiKey: 'stored-key', model: 'gemini-2.5-flash' })
    fetchMock.mockResolvedValueOnce(genResponse('pong'))

    await geminiGenerate({ text: 'ping', apiKey: 'explicit-key', model: 'gemini-2.5-pro' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('gemini-2.5-pro')
    expect(init.headers['x-goog-api-key']).toBe('explicit-key')
  })

  it('falls back to the documented default model when neither opts nor storage set one', async () => {
    geminiConfig({ apiKey: 'k' })
    fetchMock.mockResolvedValueOnce(genResponse('pong'))

    await geminiGenerate({ text: 'ping' })

    expect(fetchMock.mock.calls[0][0]).toContain('gemini-2.5-flash:generateContent')
  })

  it('uses the documented default fallback chain when storage has no fallbackModels', async () => {
    geminiConfig({ apiKey: 'k', model: 'primary-model' })
    // primary fails non-retryably (404) so tryModels advances immediately, no fetch-retry backoff
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(genResponse('pong'))

    const result = await geminiGenerate({ text: 'ping' })

    expect(result.model).toBe('gemini-2.5-flash-lite')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('an explicit empty stored fallbackModels string disables fallback entirely', async () => {
    geminiConfig({ apiKey: 'k', model: 'only-model', fallbackModels: '' })
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }))

    await expect(geminiGenerate({ text: 'ping' })).rejects.toThrow(/404/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('geminiGenerate — request shape', () => {
  beforeEach(() => geminiConfig({ apiKey: 'k' }))

  it('sends `parts` as-is for vision (inlineData + text)', async () => {
    fetchMock.mockResolvedValueOnce(genResponse('{"ok":true}'))
    const parts = [
      { inlineData: { data: 'QUJD', mimeType: 'image/png' } },
      { text: 'Διάβασε το παραστατικό.' },
    ]
    await geminiGenerate({ parts })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.contents[0].parts).toEqual(parts)
  })

  it('sets responseMimeType=application/json when json:true', async () => {
    fetchMock.mockResolvedValueOnce(genResponse('{}'))
    await geminiGenerate({ text: 'hi', json: true })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('sends systemInstruction as a separate field when provided', async () => {
    fetchMock.mockResolvedValueOnce(genResponse('ok'))
    await geminiGenerate({ text: 'hi', systemInstruction: 'Be concise.' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be concise.' }] })
  })

  it('throws when neither text nor parts are given', async () => {
    await expect(geminiGenerate({})).rejects.toThrow(/δεν δόθηκε/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes opts.scope/refType/refId/userId through to logAiUsage (used by ocr/extract.ts)', async () => {
    fetchMock.mockResolvedValueOnce(genResponse('ok'))
    await geminiGenerate({ text: 'hi', scope: 'OCR_VISION', refType: 'ocr', refId: 'doc-1', userId: 'user-1' })

    expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'OCR_VISION', refType: 'ocr', refId: 'doc-1', userId: 'user-1',
    }))
  })
})

describe('geminiGenerate — model fallback + errors', () => {
  beforeEach(() => geminiConfig({ apiKey: 'k', model: 'a', fallbackModels: 'b' }))

  it('falls through to the next model on a non-2xx response', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('bad', { status: 400 }))
      .mockResolvedValueOnce(genResponse('pong'))

    const result = await geminiGenerate({ text: 'ping' })
    expect(result).toEqual({ text: 'pong', model: 'b', tokensUsed: 42 })
  })

  it('logs AiUsage ONLY for the model that ultimately succeeded, not the failed fallback attempts', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('bad', { status: 400 }))
      .mockResolvedValueOnce(genResponse('pong'))

    await geminiGenerate({ text: 'ping' })

    expect(logAiUsage).toHaveBeenCalledTimes(1)
    expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'gemini', model: 'b', inputTokens: 30, outputTokens: 12, totalTokens: 42, scope: 'OTHER',
    }))
  })

  it('throws the FIRST (primary) model error when every model fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('a says no', { status: 400 }))
      .mockResolvedValueOnce(new Response('b says no', { status: 400 }))

    await expect(geminiGenerate({ text: 'ping' })).rejects.toThrow(/a says no/)
  })

  it('treats an empty candidates/parts response as a failure and falls back', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }))
      .mockResolvedValueOnce(genResponse('pong'))

    const result = await geminiGenerate({ text: 'ping' })
    expect(result.text).toBe('pong')
  })
})

describe('geminiGenerate — μέσω OpenRouter', () => {
  function orResponse(text: string, status = 200): Response {
    return new Response(JSON.stringify(status === 200
      ? { choices: [{ message: { content: text } }], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } }
      : { error: { message: text } }), { status })
  }

  it('δρομολογεί από OpenRouter με το ίδιο μοντέλο Google όταν υπάρχει κλειδί', async () => {
    geminiConfig({ apiKey: 'g', model: 'gemini-2.5-flash', fallbackModels: '' }, { apiKey: 'or-key' })
    fetchMock.mockResolvedValueOnce(orResponse('{"ok":1}'))
    const r = await geminiGenerate({
      parts: [{ text: 'τι είναι;' }, { inlineData: { data: 'QUJD', mimeType: 'application/pdf' } }, { inlineData: { data: 'WFla', mimeType: 'image/png' } }],
      systemInstruction: 'sys', json: true,
    })
    expect(r).toEqual({ text: '{"ok":1}', model: 'gemini-2.5-flash', tokensUsed: 25 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer or-key')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('google/gemini-2.5-flash')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'τι είναι;' },
      { type: 'file', file: { filename: 'document-2.pdf', file_data: 'data:application/pdf;base64,QUJD' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,WFla' } },
    ])
    expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openrouter', model: 'gemini-2.5-flash', totalTokens: 25 }))
  })

  it('αν αποτύχει το OpenRouter, ΔΕΝ πέφτει στο απευθείας Gemini (μόνο OpenRouter)', async () => {
    geminiConfig({ apiKey: 'g', model: 'm', fallbackModels: '' }, { apiKey: 'or-key' })
    fetchMock.mockResolvedValue(orResponse('insufficient credits', 402))
    await expect(geminiGenerate({ text: 'ping' })).rejects.toThrow()
    expect(fetchMock.mock.calls.every(c => !String(c[0]).includes('generativelanguage.googleapis.com'))).toBe(true)
  })

  it('το «Δοκιμή σύνδεσης» με ρητό apiKey ελέγχει πάντα την απευθείας σύνδεση', async () => {
    geminiConfig({}, { apiKey: 'or-key' })
    fetchMock.mockResolvedValueOnce(genResponse('pong'))
    await geminiGenerate({ text: 'ping', apiKey: 'explicit', fallbackModels: [] })
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com')
  })
})
