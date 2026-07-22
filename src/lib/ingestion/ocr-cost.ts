import { applyMarkup, markupPctForProvider, loadAiMarkup, DEFAULT_USD_TO_EUR_FALLBACK } from '@/lib/ai/markup'
import { getUsdToEurLatest } from '@/lib/ai/fx'
import { computeCostAsync } from '@/lib/ai/pricing'

export function providerFromModel(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('gemini')) return 'gemini'
  if (m.includes('deepseek')) return 'deepseek'
  if (m.includes('claude') || m.includes('anthropic')) return 'claude'
  return 'other'
}

export type OcrCostView = {
  model: string
  showAmount: boolean
  showBreakdown: boolean
  baseUsd?: number
  markupPct?: number
  finalEur?: number
}

const ROLES_WITH_AMOUNT = new Set(['SUPER_ADMIN', 'ADMIN'])

/** PURE core — δέχεται ήδη-φορτωμένα markup/fx. */
export function buildOcrCostView(role: string, args: { model: string; costUsd: number | null; markupPct: number; usdToEur: number }): OcrCostView {
  const showAmount = ROLES_WITH_AMOUNT.has(role) && args.costUsd != null
  if (!showAmount) return { model: args.model, showAmount: false, showBreakdown: false }
  const finalUsd = applyMarkup(args.costUsd!, args.markupPct)
  const finalEur = finalUsd * args.usdToEur
  const showBreakdown = role === 'SUPER_ADMIN'
  return {
    model: args.model, showAmount: true, showBreakdown,
    finalEur,
    ...(showBreakdown ? { baseUsd: args.costUsd!, markupPct: args.markupPct } : {}),
  }
}

/** SERVER wiring: model+tokensUsed → costUsd (pricing) + markup/fx (settings) → role-gated view. */
export async function buildOcrCostViewForSession(role: string, model: string, tokensUsed: number | null): Promise<OcrCostView> {
  const costUsd = tokensUsed == null ? null : (await computeCostAsync(model, { total: tokensUsed })).totalCost
  const markup = await loadAiMarkup()
  const markupPct = markupPctForProvider(markup, providerFromModel(model))
  const usdToEur = await getUsdToEurLatest(markup.usdToEur ?? DEFAULT_USD_TO_EUR_FALLBACK)
  return buildOcrCostView(role, { model, costUsd, markupPct, usdToEur })
}
