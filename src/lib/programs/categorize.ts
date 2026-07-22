// SERVER: AI-assisted expense categorization — suggests which of a program's
// eligible expense categories a given expense belongs to, via DeepSeek.

import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { buildCategorizeMessages, type CatInput } from '@/lib/programs/category-prompt'

export type CategorySuggestion = { categoryId: string | null; reason: string | null; confidence: number | null }

/**
 * Ζητά από το DeepSeek να ταξινομήσει μια δαπάνη σε μία από τις επιλέξιμες
 * κατηγορίες. Το categoryId της απάντησης επικυρώνεται έναντι των δοθέντων
 * categories (απορρίπτει hallucinated ids) και το confidence κλειδώνεται στο [0,1].
 */
export async function suggestCategory(
  input: CatInput,
  opts: { refId?: string | null; userId?: string | null } = {},
): Promise<CategorySuggestion> {
  const text = await deepseekChat(buildCategorizeMessages(input), {
    model: 'deepseek-chat',
    maxTokens: 400,
    scope: 'OTHER',
    refType: 'program-expense',
    refId: opts.refId,
    userId: opts.userId,
  })

  let raw: Record<string, unknown> = {}
  try {
    const p = parseJsonLoose(text)
    if (p && typeof p === 'object') raw = p as Record<string, unknown>
  } catch {
    /* leave empty — falls back to all-null suggestion below */
  }

  const id = raw.categoryId == null ? null : String(raw.categoryId)
  const valid = id && input.categories.some(c => c.id === id) ? id : null
  const conf = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : null

  return { categoryId: valid, reason: raw.reason == null ? null : String(raw.reason), confidence: conf }
}
