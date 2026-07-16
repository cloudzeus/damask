import { markupPctForProvider, applyMarkup, type AiMarkupSettings } from '@/lib/ai/markup'
import { usdToEurOnDay } from '@/lib/ai/fx'

/**
 * Καθαρές (χωρίς DB/network) functions πάνω στις γραμμές AiUsage — ο server
 * component (page.tsx) κάνει το prisma.aiUsage.findMany + fetch FX rates και
 * περνάει τα αποτελέσματα εδώ. Ξεχωριστό module ώστε markup/fx/grouping να
 * είναι εύκολα unit-testable χωρίς DB (βλ. tests/costs-data.test.ts).
 */

export type AiUsageRow = {
  id: string
  scope: string
  provider: string
  model: string
  operation: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Base USD cost (AiUsage.totalCost) — null όταν το μοντέλο δεν αναγνωρίστηκε κατά το logging. */
  totalCost: number | null
  durationMs: number | null
  userId: string | null
  refType: string | null
  refId: string | null
  createdAt: Date
}

export type GroupedRow = {
  key: string
  provider: string
  model: string
  scope: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Άθροισμα base USD cost (χωρίς markup) — μόνο SUPER_ADMIN το βλέπει στη σελίδα. */
  baseCostUsd: number
  /** Markup % που εφαρμόστηκε (ίδιο για όλες τις γραμμές της ομάδας — ίδιος provider). */
  markupPct: number
  finalCostUsd: number
  finalCostEur: number
}

/** Ένα κόστος + η ημέρα του, σε EUR μετά markup — βοηθητικό για last-100/grouping ώστε να μη διπλογράφεται η λογική. */
export function costForRow(row: Pick<AiUsageRow, 'provider' | 'totalCost' | 'createdAt'>, markup: AiMarkupSettings, fxSeries: Record<string, number>, fxLatest: number): {
  baseCostUsd: number; markupPct: number; finalCostUsd: number; finalCostEur: number
} {
  const markupPct = markupPctForProvider(markup, row.provider)
  const baseCostUsd = row.totalCost ?? 0
  const finalCostUsd = applyMarkup(baseCostUsd, markupPct)
  const finalCostEur = usdToEurOnDay(finalCostUsd, row.createdAt, fxSeries, fxLatest)
  return { baseCostUsd, markupPct, finalCostUsd, finalCostEur }
}

/** Ομαδοποίηση provider→model→scope, ταξινομημένη από το ακριβότερο (τελικό €) στο φθηνότερο. */
export function groupUsageRows(
  rows: AiUsageRow[], markup: AiMarkupSettings, fxSeries: Record<string, number>, fxLatest: number,
): GroupedRow[] {
  const map = new Map<string, GroupedRow>()
  for (const row of rows) {
    const key = `${row.provider}|${row.model}|${row.scope}`
    const { baseCostUsd, markupPct, finalCostUsd, finalCostEur } = costForRow(row, markup, fxSeries, fxLatest)
    const existing = map.get(key)
    if (existing) {
      existing.calls += 1
      existing.inputTokens += row.inputTokens
      existing.outputTokens += row.outputTokens
      existing.totalTokens += row.totalTokens
      existing.baseCostUsd += baseCostUsd
      existing.finalCostUsd += finalCostUsd
      existing.finalCostEur += finalCostEur
    } else {
      map.set(key, {
        key, provider: row.provider, model: row.model, scope: row.scope,
        calls: 1, inputTokens: row.inputTokens, outputTokens: row.outputTokens, totalTokens: row.totalTokens,
        baseCostUsd, markupPct, finalCostUsd, finalCostEur,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.finalCostEur - a.finalCostEur)
}

export type CostsKpis = {
  calls: number
  totalTokens: number
  finalCostEur: number
  byProvider: { provider: string; finalCostEur: number }[]
}

export function computeKpis(grouped: GroupedRow[]): CostsKpis {
  const calls = grouped.reduce((s, g) => s + g.calls, 0)
  const totalTokens = grouped.reduce((s, g) => s + g.totalTokens, 0)
  const finalCostEur = grouped.reduce((s, g) => s + g.finalCostEur, 0)

  const byProviderMap = new Map<string, number>()
  for (const g of grouped) byProviderMap.set(g.provider, (byProviderMap.get(g.provider) ?? 0) + g.finalCostEur)
  const byProvider = [...byProviderMap.entries()]
    .map(([provider, providerFinalCostEur]) => ({ provider, finalCostEur: providerFinalCostEur }))
    .sort((a, b) => b.finalCostEur - a.finalCostEur)

  return { calls, totalTokens, finalCostEur, byProvider }
}

export type CostsRange = '7' | '30' | 'month' | 'all'

export function rangeFromParam(raw: string | undefined): CostsRange {
  return raw === '7' || raw === 'month' || raw === 'all' ? raw : '30'
}

/** null σημαίνει «χωρίς φίλτρο ημερομηνίας» (εύρος "all"). */
export function cutoffForRange(range: CostsRange, now: Date = new Date()): Date | null {
  if (range === '7') { const d = new Date(now); d.setDate(d.getDate() - 7); return d }
  if (range === '30') { const d = new Date(now); d.setDate(d.getDate() - 30); return d }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  return null
}
