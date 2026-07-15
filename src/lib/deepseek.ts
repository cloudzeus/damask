import { getIntegration } from '@/lib/settings'
import { DEEPSEEK_DEFAULT_API_URL, DEEPSEEK_DEFAULT_MODEL } from '@/lib/connection-tests'

/**
 * Καθαρό interface πάνω από το DeepSeek chat-completions API — θα το
 * καταναλώσουν CMS/legal (επόμενο task) για μεταφράσεις/περιγραφές προϊόντων.
 * Ρυθμίσεις από getIntegration('deepseek') (DB → env DEEPSEEK_* fallback),
 * με δυνατότητα override ανά κλήση μέσω `opts`.
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type DeepSeekOptions = {
  apiKey?: string
  apiUrl?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

type StoredDeepSeekConfig = { apiKey?: string; apiUrl?: string; model?: string }

async function resolveConfig(opts: DeepSeekOptions): Promise<{ apiKey: string; apiUrl: string; model: string }> {
  const stored = await getIntegration<StoredDeepSeekConfig>('deepseek')
  const apiKey = opts.apiKey || stored.apiKey
  if (!apiKey) {
    throw new Error('DeepSeek: λείπει το API key — ρύθμισέ το στο /settings ή στο DEEPSEEK_API_KEY.')
  }
  const apiUrl = opts.apiUrl || stored.apiUrl || DEEPSEEK_DEFAULT_API_URL
  const model = opts.model || stored.model || DEEPSEEK_DEFAULT_MODEL
  return { apiKey, apiUrl, model }
}

/** Απευθείας κλήση στο DeepSeek chat-completions endpoint. Επιστρέφει το κείμενο της απάντησης. */
export async function deepseekChat(messages: ChatMessage[], opts: DeepSeekOptions = {}): Promise<string> {
  const { apiKey, apiUrl, model } = await resolveConfig(opts)

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`DeepSeek HTTP ${res.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('DeepSeek: μη αναμενόμενη μορφή απάντησης.')
  return content
}

const LOCALE_LABEL: Record<string, string> = { el: 'Greek', en: 'English' }

/** Μετάφραση κειμένου μέσω DeepSeek. `from`/`to` είναι locale codes, π.χ. "el"/"en". */
export async function translateText(text: string, from: string, to: string, opts: DeepSeekOptions = {}): Promise<string> {
  const fromLabel = LOCALE_LABEL[from] ?? from
  const toLabel = LOCALE_LABEL[to] ?? to
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a professional translator. Translate the user's text from ${fromLabel} to ${toLabel}. Reply with ONLY the translated text — no explanations, no quotes, no extra commentary.`,
    },
    { role: 'user', content: text },
  ]
  const result = await deepseekChat(messages, { temperature: 0.2, ...opts })
  return result.trim()
}

/** Ελεύθερη παραγωγή κειμένου από prompt (περιγραφές προϊόντων κ.λπ.). */
export async function generateText(prompt: string, opts: DeepSeekOptions = {}): Promise<string> {
  const result = await deepseekChat([{ role: 'user', content: prompt }], opts)
  return result.trim()
}
