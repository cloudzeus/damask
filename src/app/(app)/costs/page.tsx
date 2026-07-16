import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'
import { loadAiMarkup, DEFAULT_USD_TO_EUR_FALLBACK } from '@/lib/ai/markup'
import { getUsdToEurLatest, getUsdToEurSeries, dayKey } from '@/lib/ai/fx'
import type { PricingOverrides } from '@/lib/ai/pricing'
import { loadAllApiCostConfigs } from '@/lib/api-costs'
import { groupUsageRows, computeKpis, costForRow, rangeFromParam, cutoffForRange, type AiUsageRow } from './costs-data'
import { summarizeApiUsageByService, totalApiCostEur, startOfCurrentMonth, type ApiUsageRow } from './api-costs-data'
import { CostsView } from './costs-view'

/** Ανώτατο πλήθος γραμμών που φορτώνουμε ανά περίοδο για aggregation — αρκετό για εσωτερικό cost dashboard, όχι απεριόριστο. */
const MAX_ROWS = 5000
/** Ανώτατο πλήθος ApiUsage γραμμών για τον τρέχοντα μήνα — αρκετό για ένα εσωτερικό dashboard (π.χ. Mailgun 5000/μήνα free tier + ό,τι ξεπερνά). */
const MAX_API_ROWS = 20000

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const session = await requirePermission('costs.view')
  const { range: rawRange } = await searchParams
  const range = rangeFromParam(rawRange)
  const cutoff = cutoffForRange(range)

  const monthStart = startOfCurrentMonth()

  const [dbRows, markup, pricingOverrides, apiDbRows, apiCostConfigs] = await Promise.all([
    prisma.aiUsage.findMany({
      where: cutoff ? { createdAt: { gte: cutoff } } : {},
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    }),
    loadAiMarkup(),
    getSetting<PricingOverrides>('ai.pricingOverrides'),
    prisma.apiUsage.findMany({
      where: { createdAt: { gte: monthStart } },
      orderBy: { createdAt: 'desc' },
      take: MAX_API_ROWS,
    }),
    loadAllApiCostConfigs(),
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

  const apiRows: ApiUsageRow[] = apiDbRows.map(r => ({
    id: r.id,
    service: r.service,
    operation: r.operation,
    units: r.units,
    costEur: r.costEur,
    userId: r.userId,
    refType: r.refType,
    refId: r.refId,
    createdAt: r.createdAt,
  }))
  const apiSummaries = summarizeApiUsageByService(apiRows, apiCostConfigs)
  const apiMonthCostEur = totalApiCostEur(apiSummaries)

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
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Κόστη</b>
          </div>
          <h1 className="text-[22px]">Κόστη</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Κόστος χρήσης AI (DeepSeek, Gemini, Claude…) και API υπηρεσιών (Mailgun, BunnyCDN, Viva, ΑΑΔΕ…) — μονάδες, free quotas, markup, τελικό κόστος σε EUR.
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
        apiSummaries={apiSummaries}
        apiCostConfigs={apiCostConfigs}
        apiMonthCostEur={apiMonthCostEur}
      />
    </div>
  )
}
