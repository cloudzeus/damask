import { getIntegration } from '@/lib/settings'
import { logAiUsage } from '@/lib/ai/usage'

/**
 * OpenRouter (OpenAI-compatible): συνομιλία με εργαλεία (Thanos) + speech-to-text (audio input).
 * Ρυθμίσεις: integration.openrouter { apiKey, chatModel, sttModel }. Προεπιλογή chatModel = DeepSeek V4 Pro (πιο φυσικός ελληνικός λόγος)
 * — αλλάζει από τις Ρυθμίσεις (π.χ. «openrouter/auto»).
 */

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
export const DEFAULT_CHAT_MODEL = 'deepseek/deepseek-v4-pro'
export const DEFAULT_STT_MODEL = 'google/gemini-2.5-flash'

export type OpenRouterConfig = { apiKey?: string; chatModel?: string; sttModel?: string }

export type ORToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
export type ORMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ORToolCall[]; reasoning_content?: string }
  | { role: 'tool'; tool_call_id: string; content: string }
export type ORTool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

async function cfg(): Promise<Required<OpenRouterConfig>> {
  const c = await getIntegration<OpenRouterConfig>('openrouter')
  if (!c.apiKey?.trim()) throw new Error('Δεν έχει ρυθμιστεί το OpenRouter (Ρυθμίσεις → Διασυνδέσεις).')
  return { apiKey: c.apiKey.trim(), chatModel: c.chatModel?.trim() || DEFAULT_CHAT_MODEL, sttModel: c.sttModel?.trim() || DEFAULT_STT_MODEL }
}

async function call(apiKey: string, body: Record<string, unknown>, timeoutMs = 120_000) {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.AUTH_URL ?? 'https://wwa.gr',
      'X-Title': 'WWA Thanos',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = await res.json().catch(() => null) as Record<string, unknown> | null
  if (!res.ok) {
    const msg = (json?.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`
    throw new Error(`OpenRouter: ${msg}`)
  }
  return json as { model?: string; choices?: { message?: { content?: string | null; tool_calls?: ORToolCall[]; reasoning_content?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
}

/** Απευθείας DeepSeek (δικό μας κλειδί) — ο Thanos μιλά με DeepSeek V4 Pro όταν υπάρχει κλειδί και δεν έχει οριστεί άλλο μοντέλο. */
async function deepseekDirect(): Promise<{ apiKey: string; apiUrl: string } | null> {
  const d = await getIntegration<{ apiKey?: string; apiUrl?: string }>('deepseek')
  if (!d.apiKey?.trim()) return null
  return { apiKey: d.apiKey.trim(), apiUrl: d.apiUrl?.trim() || 'https://api.deepseek.com/v1/chat/completions' }
}
export const DEEPSEEK_DIRECT_MODEL = 'deepseek-v4-pro'

/**
 * Ένα βήμα συνομιλίας (μπορεί να επιστρέψει tool_calls).
 * Δρομολόγηση: αν στις Ρυθμίσεις δεν έχει οριστεί μοντέλο OpenRouter ΚΑΙ υπάρχει κλειδί DeepSeek → απευθείας DeepSeek
 * (χαμηλό reasoning για ταχύτητα)· αλλιώς OpenRouter με το μοντέλο των ρυθμίσεων.
 */
export async function openrouterChat(
  messages: ORMessage[],
  opts: { tools?: ORTool[]; userId?: string | null; refType?: string; maxTokens?: number; onDelta?: (text: string) => void } = {},
) {
  const or = await getIntegration<OpenRouterConfig>('openrouter')
  const direct = or.chatModel?.trim() ? null : await deepseekDirect()
  const t0 = Date.now()
  let url: string
  let headers: Record<string, string>
  let provider: string
  let model: string
  let extra: Record<string, unknown> = {}
  if (direct) {
    provider = 'deepseek'; model = DEEPSEEK_DIRECT_MODEL; url = direct.apiUrl
    headers = { Authorization: `Bearer ${direct.apiKey}`, 'Content-Type': 'application/json' }
    extra = { reasoning_effort: 'low' }
  } else {
    const c = await cfg()
    provider = 'openrouter'; model = c.chatModel; url = `${OPENROUTER_BASE}/chat/completions`
    headers = { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.AUTH_URL ?? 'https://wwa.gr', 'X-Title': 'WWA Thanos' }
  }
  const res = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({
      model, messages, ...extra,
      ...(opts.tools?.length ? { tools: opts.tools, tool_choice: 'auto' } : {}),
      max_tokens: opts.maxTokens ?? 3000, temperature: 0.5,
      stream: true, stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(`${provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'}: ${j?.error?.message ?? `HTTP ${res.status}`}`)
  }

  // SSE (OpenAI-compatible): συναρμολόγηση κειμένου, reasoning και tool_calls (ανά index) από τα deltas.
  let content = ''
  let reasoning = ''
  let finishReason: string | null = null
  let usedModel = model
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
  const calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue // σχόλια keep-alive («: OPENROUTER PROCESSING»)
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let chunk: {
        model?: string; usage?: typeof usage
        choices?: { delta?: { content?: string | null; reasoning_content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[]
      }
      try { chunk = JSON.parse(data) } catch { continue }
      if (chunk.model) usedModel = chunk.model
      if (chunk.usage) usage = chunk.usage
      const ch = chunk.choices?.[0]
      if (!ch) continue
      if (ch.finish_reason) finishReason = ch.finish_reason
      const d = ch.delta
      if (d?.reasoning_content) reasoning += d.reasoning_content
      if (d?.content) { content += d.content; opts.onDelta?.(d.content) }
      for (const tc of d?.tool_calls ?? []) {
        const cur = calls[tc.index] ?? (calls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } })
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.function.name += tc.function.name
        if (tc.function?.arguments) cur.function.arguments += tc.function.arguments
      }
    }
  }
  void logAiUsage({
    provider, model: usedModel, scope: 'OTHER', operation: 'chat',
    inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens,
    durationMs: Date.now() - t0, refType: opts.refType ?? 'thanos', userId: opts.userId ?? null,
  }).catch(() => {})
  const toolCalls = calls.filter(Boolean)
  return {
    message: {
      content: content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(reasoning ? { reasoning_content: reasoning } : {}),
    } as { content: string | null; tool_calls?: ORToolCall[]; reasoning_content?: string },
    model: usedModel,
    finishReason,
  }
}

/** Speech-to-text: ηχογράφηση (base64) → κείμενο, μέσω μοντέλου με audio input. */
export async function openrouterTranscribe(audioBase64: string, format: string, opts: { userId?: string | null } = {}): Promise<string> {
  const c = await cfg()
  const json = await call(c.apiKey, {
    model: c.sttModel,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Μετέγραψε ΑΥΤΟΥΣΙΑ ό,τι λέγεται στην ηχογράφηση (κυρίως ελληνικά). Επέστρεψε ΜΟΝΟ το κείμενο, χωρίς σχόλια.' },
        { type: 'input_audio', input_audio: { data: audioBase64, format } },
      ],
    }],
    max_tokens: 1500,
    temperature: 0,
  }, 60_000)
  void logAiUsage({
    provider: 'openrouter', model: json.model ?? c.sttModel, scope: 'OTHER', operation: 'speech-to-text',
    inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, refType: 'thanos-stt', userId: opts.userId ?? null,
  }).catch(() => {})
  return (json.choices?.[0]?.message?.content ?? '').trim()
}

export async function testOpenRouter(config: OpenRouterConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey?.trim()) return { ok: false, message: 'Συμπλήρωσε το API key.' }
  try {
    const res = await fetch(`${OPENROUTER_BASE}/key`, { headers: { Authorization: `Bearer ${config.apiKey.trim()}` }, signal: AbortSignal.timeout(15_000) })
    if (res.status === 401) return { ok: false, message: 'Μη έγκυρο API key.' }
    if (!res.ok) return { ok: false, message: `Το OpenRouter επέστρεψε HTTP ${res.status}.` }
    const j = await res.json().catch(() => null) as { data?: { limit_remaining?: number | null; usage?: number } } | null
    const rem = j?.data?.limit_remaining
    return { ok: true, message: `Επιτυχής σύνδεση με το OpenRouter${rem != null ? ` — υπόλοιπο ${rem.toFixed(2)} $` : ''}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης (${err instanceof Error ? err.message : String(err)}).` }
  }
}
