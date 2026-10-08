import { getIntegration } from '@/lib/settings'
import { logAiUsage } from '@/lib/ai/usage'

/**
 * OpenRouter (OpenAI-compatible): συνομιλία με εργαλεία (Thanos) + speech-to-text (audio input).
 * Ρυθμίσεις: integration.openrouter { apiKey, chatModel, sttModel }. Προεπιλογή chatModel = 'openrouter/auto'
 * (το OpenRouter διαλέγει το καλύτερο μοντέλο για το αίτημα, μόνο από όσα υποστηρίζουν εργαλεία).
 */

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
export const DEFAULT_CHAT_MODEL = 'openrouter/auto'
export const DEFAULT_STT_MODEL = 'google/gemini-2.5-flash'

export type OpenRouterConfig = { apiKey?: string; chatModel?: string; sttModel?: string }

export type ORToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
export type ORMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ORToolCall[] }
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
  return json as { model?: string; choices?: { message?: { content?: string | null; tool_calls?: ORToolCall[] }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
}

/** Ένα βήμα συνομιλίας (μπορεί να επιστρέψει tool_calls). */
export async function openrouterChat(messages: ORMessage[], opts: { tools?: ORTool[]; userId?: string | null; refType?: string; maxTokens?: number } = {}) {
  const c = await cfg()
  const t0 = Date.now()
  const json = await call(c.apiKey, {
    model: c.chatModel,
    messages,
    ...(opts.tools?.length ? { tools: opts.tools, tool_choice: 'auto' } : {}),
    max_tokens: opts.maxTokens ?? 4000,
    temperature: 0.3,
  })
  const choice = json.choices?.[0]
  void logAiUsage({
    provider: 'openrouter', model: json.model ?? c.chatModel, scope: 'OTHER', operation: 'chat',
    inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens,
    durationMs: Date.now() - t0, refType: opts.refType ?? 'thanos', userId: opts.userId ?? null,
  }).catch(() => {})
  return { message: choice?.message ?? { content: '' }, model: json.model ?? c.chatModel, finishReason: choice?.finish_reason ?? null }
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
  void opts
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
