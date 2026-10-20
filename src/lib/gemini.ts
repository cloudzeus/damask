import { getIntegration } from '@/lib/settings'
import { buildModelChain, tryModels, type AttemptResult } from '@/lib/ocr/model-fallback'
import { fetchWithRetry } from '@/lib/ocr/fetch-retry'
import { logAiUsage, type AiScope } from '@/lib/ai/usage'
import { AiQuotaError, parseQuotaError, waitForModel, noteMinuteLimit, noteDailyLimit, isExhausted, exhaustedUntilOf } from '@/lib/ai/quota'

/**
 * Καθαρό interface πάνω από το Google Gemini `generateContent` REST API
 * (v1beta) — καταναλώνεται κυρίως από το OCR pipeline (src/lib/ocr/extract.ts)
 * αλλά είναι γενικού σκοπού, ίδιο πνεύμα με το src/lib/deepseek.ts. Ρυθμίσεις
 * από getIntegration('gemini') (DB-only — βλ. src/lib/settings.ts), με
 * δυνατότητα override ανά κλήση μέσω `opts` (π.χ. το κουμπί «Δοκιμή σύνδεσης»
 * με μη-αποθηκευμένα ακόμα στοιχεία).
 *
 * Ανθεκτικότητα σε per-model υπερφόρτωση (Gemini 503 "high demand"):
 * buildModelChain/tryModels (src/lib/ocr/model-fallback.ts) δοκιμάζουν το
 * κύριο μοντέλο και μετά τα fallbackModels με τη σειρά· fetchWithRetry
 * (src/lib/ocr/fetch-retry.ts) κάνει exponential-backoff retry ΜΕΣΑ σε κάθε
 * μοντέλο για 429/500/502/503/504.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite']

export type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } }

export type GeminiOptions = {
  /** Πολλαπλά μέρη (κείμενο + inline εικόνες) — για vision. Αγνοείται αν λείπει, οπότε πέφτει σε `text`. */
  parts?: GeminiPart[]
  /** Απλό κείμενο prompt — συντόμευση όταν δεν χρειάζεται εικόνα. */
  text?: string
  /** System instruction (οδηγίες ρόλου/μορφής) — ξεχωριστό πεδίο από το user content. */
  systemInstruction?: string
  model?: string
  /** Ζήτα αυστηρό JSON (generationConfig.responseMimeType = application/json). */
  json?: boolean
  temperature?: number
  maxOutputTokens?: number
  /** Ελάχιστη «σκέψη» για γρήγορες απαντήσεις (π.χ. Thanos): 2.5 → thinkingBudget 0, 3.x → thinkingLevel low. */
  fast?: boolean
  /** Override του αποθηκευμένου API key (π.χ. «Δοκιμή σύνδεσης» με μη-αποθηκευμένη ακόμα τιμή). */
  apiKey?: string
  /** Override της αποθηκευμένης αλυσίδας fallback μοντέλων. */
  fallbackModels?: string[]
  /** Scope για το AiUsage log (/costs) — προεπιλογή 'OTHER' αν δεν δοθεί (οι callers, π.χ. ocr/extract.ts, περνάνε δικό τους). */
  scope?: AiScope
  refType?: string | null
  refId?: string | null
  userId?: string | null
}

export type GeminiResult = {
  text: string
  /** Το μοντέλο που τελικά απάντησε (μπορεί να διαφέρει από `opts.model` αν έγινε fallback). */
  model: string
  tokensUsed: number | null
}

type StoredGeminiConfig = { apiKey?: string; model?: string; fallbackModels?: string }

/** Comma-separated string ("gemini-2.5-flash-lite, gemini-2.0-flash") → trimmed, non-empty array. */
export function parseFallbackModels(raw: string | null | undefined): string[] {
  if (raw == null) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

async function resolveConfig(opts: GeminiOptions): Promise<{ apiKey: string; model: string; fallbackModels: string[] }> {
  const stored = await getIntegration<StoredGeminiConfig>('gemini')
  const apiKey = opts.apiKey || stored.apiKey
  if (!apiKey) {
    throw new Error('Gemini: λείπει το API key — ρύθμισέ το στο /settings (Διασυνδέσεις → Google Gemini).')
  }
  const model = opts.model || stored.model || GEMINI_DEFAULT_MODEL
  const fallbackModels = opts.fallbackModels
    ?? (stored.fallbackModels !== undefined ? parseFallbackModels(stored.fallbackModels) : DEFAULT_FALLBACK_MODELS)
  return { apiKey, model, fallbackModels }
}

function extractText(data: { candidates?: { content?: { parts?: { text?: string }[] } }[] }): string {
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return parts.map(p => p.text ?? '').join('')
}

/**
 * Κλήση Gemini `generateContent` με model fallback + retry. Πετάει (throw) σε
 * total failure — με το σφάλμα του ΠΡΩΤΟΥ (κύριου) μοντέλου, όχι κάποιου
 * παραπλανητικού fallback (ίδιο idiom με deepseekChat).
 */
export async function geminiGenerate(opts: GeminiOptions): Promise<GeminiResult> {
  // Δρομολόγηση: μέσω OpenRouter (ίδια μοντέλα Google) όταν υπάρχει κλειδί· απευθείας Gemini ΜΟΝΟ αν δεν έχει
  // ρυθμιστεί OpenRouter. Το «Δοκιμή σύνδεσης» με ρητό apiKey ελέγχει πάντα την απευθείας σύνδεση.
  const or = opts.apiKey ? null : await openrouterKey()
  if (or) {
    const stored = await getIntegration<StoredGeminiConfig>('gemini')
    const chain = buildModelChain(opts.model || stored.model || GEMINI_DEFAULT_MODEL, opts.fallbackModels ?? (stored.fallbackModels !== undefined ? parseFallbackModels(stored.fallbackModels) : DEFAULT_FALLBACK_MODELS))
    // ΜΟΝΟ OpenRouter όταν υπάρχει κλειδί (κανόνας χρήστη): χωρίς σιωπηλή εφεδρεία στο απευθείας Gemini —
    // ένα σφάλμα OpenRouter επιστρέφει στον καλούντα (οι ουρές ξαναδοκιμάζουν).
    return await tryModels(chain, m => viaOpenRouter(or, m, opts))
  }
  return geminiDirect(opts)
}

async function openrouterKey(): Promise<string | null> {
  const c = await getIntegration<{ apiKey?: string }>('openrouter')
  return c.apiKey?.trim() || null
}

const OPENROUTER_API = 'https://openrouter.ai/api/v1'
function openrouterHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.AUTH_URL ?? 'https://wwa.gr', 'X-Title': 'WWA' }
}

/** Gemini parts → OpenAI-compatible content (εικόνες ως image_url, PDF/λοιπά ως file). */
function toOpenRouterContent(parts: GeminiPart[]): unknown[] {
  return parts.map((p, i) => {
    if ('text' in p) return { type: 'text', text: p.text }
    const url = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`
    if (p.inlineData.mimeType.startsWith('image/')) return { type: 'image_url', image_url: { url } }
    const ext = p.inlineData.mimeType.split('/')[1]?.split(/[+;]/)[0] || 'bin'
    return { type: 'file', file: { filename: `document-${i + 1}.${ext}`, file_data: url } }
  })
}

async function viaOpenRouter(key: string, m: string, opts: GeminiOptions): Promise<AttemptResult<GeminiResult>> {
  const parts: GeminiPart[] = opts.parts ?? (opts.text ? [{ text: opts.text }] : [])
  if (!parts.length) return { ok: false, error: new Error('Gemini: δεν δόθηκε περιεχόμενο (parts/text).') }
  const startedAt = Date.now()
  try {
    const reasoning = opts.fast ? (m.startsWith('gemini-2.5') ? { max_tokens: m.includes('pro') ? 128 : 0 } : m.startsWith('gemini-3') ? { effort: 'low' } : undefined) : undefined
    const res = await fetchWithRetry(`${OPENROUTER_API}/chat/completions`, {
      method: 'POST',
      headers: openrouterHeaders(key),
      body: JSON.stringify({
        model: `google/${m}`,
        messages: [
          ...(opts.systemInstruction ? [{ role: 'system', content: opts.systemInstruction }] : []),
          { role: 'user', content: toOpenRouterContent(parts) },
        ],
        temperature: opts.temperature ?? 0.1,
        ...(opts.maxOutputTokens ? { max_tokens: opts.maxOutputTokens } : {}),
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        ...(reasoning ? { reasoning } : {}),
      }),
      signal: AbortSignal.timeout(180_000),
    }, { label: `openrouter:${m}` })
    const data = await res.json().catch(() => null) as { error?: { message?: string }; choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null
    if (!res.ok) return { ok: false, error: new Error(`OpenRouter HTTP ${res.status}: ${data?.error?.message ?? ''}`.slice(0, 300)) }
    const text = data?.choices?.[0]?.message?.content ?? ''
    if (!text) return { ok: false, error: new Error('Gemini (OpenRouter): κενή απάντηση.') }
    void logAiUsage({
      scope: opts.scope ?? 'OTHER', provider: 'openrouter', model: m, operation: 'generateContent',
      inputTokens: data?.usage?.prompt_tokens, outputTokens: data?.usage?.completion_tokens, totalTokens: data?.usage?.total_tokens,
      durationMs: Date.now() - startedAt, userId: opts.userId, refType: opts.refType, refId: opts.refId,
    })
    return { ok: true, value: { text, model: m, tokensUsed: data?.usage?.total_tokens ?? null } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/** Απευθείας Google Gemini API (εφεδρεία ή «Δοκιμή σύνδεσης»). */
async function geminiDirect(opts: GeminiOptions): Promise<GeminiResult> {
  const { apiKey, model, fallbackModels } = await resolveConfig(opts)

  const parts: GeminiPart[] = opts.parts ?? (opts.text ? [{ text: opts.text }] : [])
  if (parts.length === 0) {
    throw new Error('Gemini: δεν δόθηκε περιεχόμενο (parts/text).')
  }

  const fullChain = buildModelChain(model, fallbackModels)
  // Μοντέλα με εξαντλημένη ημερήσια ποσόστωση παρακάμπτονται ως την επαναφορά.
  const chain = fullChain.filter(m => !isExhausted(m))
  if (!chain.length) {
    const at = exhaustedUntilOf(fullChain)
    throw new AiQuotaError(`Εξαντλήθηκε το ημερήσιο όριο του Gemini — συνεχίζει αυτόματα μετά τις ${at ? at.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Athens' }) : '10:00'}.`, 'day', at)
  }
  const startedAt = Date.now()

  return tryModels(chain, async (m) => {
    // Όριο ανά λεπτό: περιμένουμε (όσο είπε το Gemini) και ξαναδοκιμάζουμε το ΙΔΙΟ μοντέλο έως 3 φορές.
    for (let quotaTry = 0; ; quotaTry++) {
    if (!(await waitForModel(m))) return { ok: false as const, error: new AiQuotaError('Το Gemini έφτασε το όριο ανά λεπτό — νέα προσπάθεια σε λίγο.', 'minute', null) }
    try {
      const res = await fetchWithRetry(
        `${GEMINI_API_BASE}/${encodeURIComponent(m)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            ...(opts.systemInstruction ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } } : {}),
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: opts.temperature ?? 0.1,
              ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
              ...(opts.json ? { responseMimeType: 'application/json' } : {}),
              ...(opts.fast ? { thinkingConfig: m.startsWith('gemini-2.5') ? { thinkingBudget: m.includes('pro') ? 128 : 0 } : m.startsWith('gemini-3') ? { thinkingLevel: 'low' } : {} } : {}),
            },
          }),
        },
        { label: `gemini:${m}`, skipStatuses: [429] },
      )
      if (res.status === 429) {
        const q = parseQuotaError(await res.text().catch(() => ''))
        if (q.kind === 'day') {
          const until = noteDailyLimit(m)
          console.warn(`[gemini] ${m}: εξαντλήθηκε η ημερήσια ποσόστωση (${q.quotaId}) ως ${until.toISOString()}`)
          return { ok: false as const, error: new AiQuotaError(`Εξαντλήθηκε το ημερήσιο όριο του Gemini — συνεχίζει αυτόματα μετά τις ${until.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Athens' })}.`, 'day', until) }
        }
        const waitMs = noteMinuteLimit(m, q.retryMs)
        console.warn(`[gemini] ${m}: όριο ανά λεπτό (${q.quotaId ?? '429'}) — αναμονή ${Math.round(waitMs / 1000)}″ (προσπάθεια ${quotaTry + 1})`)
        if (quotaTry < 3) continue
        return { ok: false as const, error: new AiQuotaError('Το Gemini έφτασε το όριο ανά λεπτό — νέα προσπάθεια σε λίγο.', 'minute', new Date(Date.now() + waitMs)) }
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false as const, error: new Error(`Gemini HTTP ${res.status}: ${detail.slice(0, 300)}`) }
      }
      const data = await res.json()
      const text = extractText(data)
      if (!text) {
        const blockReason = data?.promptFeedback?.blockReason
        return {
          ok: false as const,
          error: new Error(blockReason ? `Gemini: το περιεχόμενο μπλοκαρίστηκε (${blockReason}).` : 'Gemini: κενή απάντηση.'),
        }
      }
      const usageMetadata = data?.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined
      const tokensUsed = usageMetadata?.totalTokenCount ?? null

      // Log ΜΟΝΟ την κλήση που τελικά πέτυχε (όχι τα ενδιάμεσα fallback attempts) —
      // fire-and-forget, χωρίς await, ώστε να μη μπει καθυστέρηση στην απάντηση.
      void logAiUsage({
        scope: opts.scope ?? 'OTHER',
        provider: 'gemini',
        model: m,
        operation: 'generateContent',
        inputTokens: usageMetadata?.promptTokenCount,
        outputTokens: usageMetadata?.candidatesTokenCount,
        totalTokens: usageMetadata?.totalTokenCount,
        durationMs: Date.now() - startedAt,
        userId: opts.userId,
        refType: opts.refType,
        refId: opts.refId,
      })

      return { ok: true as const, value: { text, model: m, tokensUsed } }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err : new Error(String(err)) }
    }
    }
  })
}

// ── Embeddings (σημασιολογική αναζήτηση — pgvector) ──────────────────────────

export const EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIM = 768

/**
 * Embeddings κειμένων (batch έως 100) — `RETRIEVAL_DOCUMENT` για ευρετηρίαση,
 * `RETRIEVAL_QUERY` για ερωτήματα. Διάσταση 768 (Matryoshka) — αρκετή και φθηνή.
 */
export async function geminiEmbed(
  texts: string[],
  opts: { task: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'; refType?: string; userId?: string | null } = { task: 'RETRIEVAL_DOCUMENT' },
): Promise<number[][]> {
  if (texts.length === 0) return []
  // Μέσω OpenRouter όταν υπάρχει κλειδί — ΟΛΑ τα vectors (ευρετήριο + ερωτήματα) από την ίδια πηγή, γιατί το OpenRouter
  // δεν περνά taskType και τα vectors διαφέρουν ελαφρά από τα απευθείας (ανάμειξη = χειρότερη αναζήτηση).
  const or = await openrouterKey()
  if (or) return embedViaOpenRouter(or, texts, opts)
  const { apiKey } = await resolveConfig({ parts: [] } as unknown as GeminiOptions)
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100)
    const startedAt = Date.now()
    const res = await fetch(`${GEMINI_API_BASE}/${EMBEDDING_MODEL}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: chunk.map(text => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, 8000) }] },
          taskType: opts.task,
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
    })
    if (!res.ok) throw new Error(`Gemini embeddings HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const data = (await res.json()) as { embeddings?: { values: number[] }[] }
    const vecs = data.embeddings?.map(e => e.values) ?? []
    if (vecs.length !== chunk.length) throw new Error('Gemini embeddings: λάθος πλήθος αποτελεσμάτων.')
    out.push(...vecs)
    void logAiUsage({
      scope: 'OTHER', provider: 'gemini', model: EMBEDDING_MODEL, operation: 'embed',
      inputTokens: Math.ceil(chunk.reduce((a, t) => a + Math.min(t.length, 8000), 0) / 4), outputTokens: 0,
      durationMs: Date.now() - startedAt, userId: opts.userId ?? null, refType: opts.refType ?? 'search-embed',
    })
  }
  return out
}

/** Πηγή των vectors — όταν αλλάζει, το ευρετήριο ξαναφτιάχνεται (βλ. search/documents.ts). */
export async function embeddingSource(): Promise<'openrouter' | 'gemini'> {
  return (await openrouterKey()) ? 'openrouter' : 'gemini'
}

async function embedViaOpenRouter(key: string, texts: string[], opts: { refType?: string; userId?: string | null }): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100).map(t => t.slice(0, 8000))
    const startedAt = Date.now()
    const res = await fetchWithRetry(`${OPENROUTER_API}/embeddings`, {
      method: 'POST',
      headers: openrouterHeaders(key),
      body: JSON.stringify({ model: `google/${EMBEDDING_MODEL}`, input: chunk, dimensions: EMBEDDING_DIM }),
    }, { label: 'openrouter:embed' })
    const data = await res.json().catch(() => null) as { error?: { message?: string }; data?: { index?: number; embedding: number[] }[]; usage?: { prompt_tokens?: number } } | null
    if (!res.ok || !data?.data) throw new Error(`OpenRouter embeddings HTTP ${res.status}: ${data?.error?.message ?? ''}`.slice(0, 200))
    const vecs = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(d => d.embedding)
    if (vecs.length !== chunk.length) throw new Error('OpenRouter embeddings: λάθος πλήθος αποτελεσμάτων.')
    out.push(...vecs)
    void logAiUsage({
      scope: 'OTHER', provider: 'openrouter', model: EMBEDDING_MODEL, operation: 'embed',
      inputTokens: data.usage?.prompt_tokens ?? Math.ceil(chunk.reduce((a, t) => a + t.length, 0) / 4), outputTokens: 0,
      durationMs: Date.now() - startedAt, userId: opts.userId ?? null, refType: opts.refType ?? 'search-embed',
    })
  }
  return out
}
