import { getIntegration } from '@/lib/settings'
import { buildModelChain, tryModels } from '@/lib/ocr/model-fallback'
import { fetchWithRetry } from '@/lib/ocr/fetch-retry'
import { logAiUsage, type AiScope } from '@/lib/ai/usage'

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
  const { apiKey, model, fallbackModels } = await resolveConfig(opts)

  const parts: GeminiPart[] = opts.parts ?? (opts.text ? [{ text: opts.text }] : [])
  if (parts.length === 0) {
    throw new Error('Gemini: δεν δόθηκε περιεχόμενο (parts/text).')
  }

  const chain = buildModelChain(model, fallbackModels)
  const startedAt = Date.now()

  return tryModels(chain, async (m) => {
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
            },
          }),
        },
        { label: `gemini:${m}` },
      )
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
  })
}
