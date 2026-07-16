import { prisma } from '@/lib/prisma'
import { computeCostAsync } from '@/lib/ai/pricing'

/**
 * Scope-καταλόγος για τη σελίδα /costs (φίλτρα/ομαδοποίηση) — βλ.
 * src/app/(app)/cms/posts/actions.ts (CMS_GENERATE/TRANSLATION),
 * src/app/(app)/cms/legal/actions.ts (TRANSLATION), src/lib/ocr/extract.ts
 * (OCR_VISION/OCR_TEXT). 'OTHER' είναι το προεπιλεγμένο fallback.
 */
export type AiScope = 'OCR_TEXT' | 'OCR_VISION' | 'TRANSLATION' | 'CMS_GENERATE' | 'OTHER'

interface LogInput {
  scope: AiScope
  provider: string
  model: string
  operation?: string | null
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  durationMs?: number | null
  userId?: string | null
  refType?: string | null
  refId?: string | null
}

/**
 * Fire-and-forget logger για κλήσεις AI provider (DeepSeek/Gemini/Claude/…).
 * ΠΟΤΕ δεν πετάει — τα σφάλματα (π.χ. DB μη διαθέσιμη) καταπίνονται με
 * console.error, ώστε το logging να μην μπορεί ποτέ να σπάσει το user-facing
 * request (μετάφραση/generateText/OCR). Οι caller sites (deepseek.ts, gemini.ts,
 * ocr/extract.ts, CMS actions) καλούν αυτή τη function ΧΩΡΙΣ await.
 */
export async function logAiUsage(input: LogInput): Promise<void> {
  try {
    const totalTokens = input.totalTokens
      ?? ((input.inputTokens ?? 0) + (input.outputTokens ?? 0))

    const cost = await computeCostAsync(input.model, {
      input: input.inputTokens,
      output: input.outputTokens,
      total: input.totalTokens,
    })

    await prisma.aiUsage.create({
      data: {
        scope: input.scope,
        provider: input.provider,
        model: input.model,
        operation: input.operation ?? null,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        totalTokens,
        inputCost: cost.matched ? cost.inputCost : null,
        outputCost: cost.matched ? cost.outputCost : null,
        totalCost: cost.matched ? cost.totalCost : null,
        durationMs: input.durationMs ?? null,
        userId: input.userId ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    })
  } catch (err) {
    console.error('logAiUsage failed', err)
  }
}
