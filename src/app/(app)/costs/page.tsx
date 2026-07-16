import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'
import { loadAiMarkup, DEFAULT_USD_TO_EUR_FALLBACK } from '@/lib/ai/markup'
import { getUsdToEurLatest, getUsdToEurSeries, dayKey } from '@/lib/ai/fx'
import type { PricingOverrides } from '@/lib/ai/pricing'
import { groupUsageRows, computeKpis, costForRow, rangeFromParam, cutoffForRange, type AiUsageRow } from './costs-data'
import { CostsView } from './costs-view'

/** Ανώτατο πλήθος γραμμών που φορτώνουμε ανά περίοδο για aggregation — αρκετό για εσωτερικό cost dashboard, όχι απεριόριστο. */
const MAX_ROWS = 5000

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const session = await requirePermission('costs.view')
  const { range: rawRange } = await searchParams
  const range = rangeFromParam(rawRange)
  const cutoff = cutoffForRange(range)

  const [dbRows, markup, pricingOverrides] = await Promise.all([
    prisma.aiUsage.findMany({
      where: cutoff ? { createdAt: { gte: cutoff } } : {},
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    }),
    loadAiMarkup(),
    getSetting<PricingOverrides>('ai.pricingOverrides'),
  ])

  const rows: AiUsageRow[] = dbRows.map(r => ({
    id: r.id,
    scope: r.scope,
    provider: r.provider,
    model: r.model,
    operation: r.operation,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    totalCost: r.totalCost,
    durationMs: r.durationMs,
    userId: r.userId,
    refType: r.refType,
    refId: r.refId,
    createdAt: r.createdAt,
  }))

  const oldestRow = rows[rows.length - 1]
  const fromISO = cutoff ? dayKey(cutoff) : (oldestRow ? dayKey(oldestRow.createdAt) : dayKey(new Date()))
  const toISO = dayKey(new Date())

  const [fxSeries, fxLatest] = await Promise.all([
    getUsdToEurSeries(fromISO, toISO),
    getUsdToEurLatest(markup.usdToEur ?? DEFAULT_USD_TO_EUR_FALLBACK),
  ])

  const grouped = groupUsageRows(rows, markup, fxSeries, fxLatest)
  const kpis = computeKpis(grouped)

  const last100 = rows.slice(0, 100).map(row => ({
    row,
    ...costForRow(row, markup, fxSeries, fxLatest),
  }))

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Κόστη AI</b>
          </div>
          <h1 className="text-[22px]">Κόστη AI</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Κόστος χρήσης API/AI υπηρεσιών (DeepSeek, Gemini, Claude…) — tokens, USD βάσης, markup, τελικό κόστος σε EUR.
          </p>
        </div>
      </div>

      <CostsView
        role={session.user.role}
        range={range}
        grouped={grouped}
        kpis={kpis}
        last100={last100}
        markup={markup}
        pricingOverrides={pricingOverrides ?? {}}
        fxLatest={fxLatest}
        fxDay={toISO}
      />
    </div>
  )
}
