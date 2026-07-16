'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, ListTree, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiMarkupSettings } from '@/lib/ai/markup'
import type { PricingOverrides } from '@/lib/ai/pricing'
import type { ResolvedApiCostConfig } from '@/lib/api-costs'
import type { GroupedRow, CostsKpis, CostsRange } from './costs-data'
import type { ApiServiceSummary } from './api-costs-data'
import { CostsKpiCards } from './costs-kpis'
import { CostsGroupedTable } from './costs-grouped-table'
import { CostsAnalyticsTable, type AnalyticsEntry } from './costs-analytics-table'
import { MarkupCard } from './markup-card'
import { PricingOverridesCard } from './pricing-overrides-card'
import { ApiServicesTable } from './api-services-table'
import { ApiCostConfigCard } from './api-cost-config-card'

const RANGE_OPTIONS: { value: CostsRange; label: string }[] = [
  { value: '7', label: '7 ημέρες' },
  { value: '30', label: '30 ημέρες' },
  { value: 'month', label: 'Μήνας' },
  { value: 'all', label: 'Όλα' },
]

const TABS = [
  { key: 'overview', label: 'Επισκόπηση', icon: LayoutGrid },
  { key: 'analytics', label: 'Αναλυτικά', icon: ListTree },
  { key: 'api', label: 'API Υπηρεσίες', icon: Server },
] as const
type TabKey = (typeof TABS)[number]['key']

export function CostsView({
  role, range, grouped, kpis, last100, markup, pricingOverrides, fxLatest, fxDay,
  apiSummaries, apiCostConfigs, apiMonthCostEur,
}: {
  role: string
  range: CostsRange
  grouped: GroupedRow[]
  kpis: CostsKpis
  last100: AnalyticsEntry[]
  markup: AiMarkupSettings
  pricingOverrides: PricingOverrides
  fxLatest: number
  fxDay: string
  apiSummaries: ApiServiceSummary[]
  apiCostConfigs: Record<string, ResolvedApiCostConfig>
  /** Άθροισμα billedCostEur όλων των apiSummaries — υπολογισμένο server-side (page.tsx) ώστε αυτό το client component να ΜΗΝ χρειάζεται να εισάγει το api-costs-data.ts (το οποίο σέρνει prisma/pg στο browser bundle). */
  apiMonthCostEur: number
}) {
  const [tab, setTab] = useState<TabKey>('overview')
  const isSuperAdmin = role === 'SUPER_ADMIN'

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.map(opt => (
            <Link
              key={opt.value}
              href={opt.value === '30' ? '/costs' : `/costs?range=${opt.value}`}
              className={cn('pill', range === opt.value && 'on')}
            >
              {opt.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Προβολή κόστους AI">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`costs-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`costs-panel-${t.key}`}
              className={cn('pill', tab === t.key && 'on')}
              onClick={() => setTab(t.key)}
            >
              <t.icon className="size-3.5" strokeWidth={1.8} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <CostsKpiCards kpis={kpis} apiMonthCostEur={apiMonthCostEur} />

      <div id="costs-panel-overview" role="tabpanel" aria-labelledby="costs-tab-overview" hidden={tab !== 'overview'}>
        <CostsGroupedTable grouped={grouped} isSuperAdmin={isSuperAdmin} fxLatest={fxLatest} fxDay={fxDay} />

        {isSuperAdmin && (
          <div className="mt-3.5 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <MarkupCard initial={markup} />
            <PricingOverridesCard initial={pricingOverrides} />
          </div>
        )}
      </div>

      <div id="costs-panel-analytics" role="tabpanel" aria-labelledby="costs-tab-analytics" hidden={tab !== 'analytics'}>
        <CostsAnalyticsTable entries={last100} isSuperAdmin={isSuperAdmin} />
      </div>

      <div id="costs-panel-api" role="tabpanel" aria-labelledby="costs-tab-api" hidden={tab !== 'api'}>
        <p className="mb-2.5 text-[12px] text-muted-foreground">
          Χρήση API υπηρεσιών (Mailgun/BunnyCDN/Viva/ΑΑΔΕ/geocoding) — τρέχων ημερολογιακός μήνας, ανεξάρτητα από το επιλεγμένο εύρος πάνω.
        </p>
        <ApiServicesTable summaries={apiSummaries} isSuperAdmin={isSuperAdmin} />

        {isSuperAdmin && (
          <div className="mt-3.5">
            <ApiCostConfigCard initial={apiCostConfigs} />
          </div>
        )}
      </div>
    </div>
  )
}
