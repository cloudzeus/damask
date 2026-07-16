'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiMarkupSettings } from '@/lib/ai/markup'
import type { PricingOverrides } from '@/lib/ai/pricing'
import type { GroupedRow, CostsKpis, CostsRange } from './costs-data'
import { CostsKpiCards } from './costs-kpis'
import { CostsGroupedTable } from './costs-grouped-table'
import { CostsAnalyticsTable, type AnalyticsEntry } from './costs-analytics-table'
import { MarkupCard } from './markup-card'
import { PricingOverridesCard } from './pricing-overrides-card'

const RANGE_OPTIONS: { value: CostsRange; label: string }[] = [
  { value: '7', label: '7 ημέρες' },
  { value: '30', label: '30 ημέρες' },
  { value: 'month', label: 'Μήνας' },
  { value: 'all', label: 'Όλα' },
]

const TABS = [
  { key: 'overview', label: 'Επισκόπηση', icon: LayoutGrid },
  { key: 'analytics', label: 'Αναλυτικά', icon: ListTree },
] as const
type TabKey = (typeof TABS)[number]['key']

export function CostsView({
  role, range, grouped, kpis, last100, markup, pricingOverrides, fxLatest, fxDay,
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

      <CostsKpiCards kpis={kpis} />

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
    </div>
  )
}
