'use client'

import { Coins } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import type { GroupedRow } from './costs-data'
import { formatEur, formatUsd, formatTokens, scopeLabel } from './costs-format'

/**
 * Πίνακας ομαδοποιημένος ανά provider→model→scope. Role-based στήλες:
 * SUPER_ADMIN βλέπει «Κόστος βάσης $ / Markup % / Τελικό €», ο ADMIN βλέπει
 * ΜΟΝΟ «Κόστος €» (το τελικό με markup, χωρίς ένδειξη markup — MASTER
 * requirement: ο ADMIN δεν βλέπει το base/markup breakdown).
 */
export function CostsGroupedTable({ grouped, isSuperAdmin, fxLatest, fxDay }: {
  grouped: GroupedRow[]
  isSuperAdmin: boolean
  fxLatest: number
  fxDay: string
}) {
  if (grouped.length === 0) {
    return (
      <div className="glass table-card stagger flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Coins className="size-5" strokeWidth={1.6} aria-hidden />
        </div>
        <div>
          <p className="font-semibold">Καμία κλήση AI σε αυτό το εύρος.</p>
          <p className="mt-0.5 text-[0.78125rem] text-muted-foreground">Το κόστος θα εμφανιστεί εδώ μόλις καταγραφεί η πρώτη κλήση.</p>
        </div>
      </div>
    )
  }

  const columns: DataTableColumn<GroupedRow>[] = [
    {
      id: 'provider',
      header: 'Provider',
      width: 140,
      sortValue: g => g.provider,
      cell: g => <span className="badge-pill info capitalize">{g.provider}</span>,
    },
    {
      id: 'model',
      header: 'Μοντέλο',
      width: 200,
      sortValue: g => g.model,
      cell: g => <span className="font-mono text-[0.75rem]">{g.model}</span>,
    },
    {
      id: 'scope',
      header: 'Scope',
      width: 140,
      sortValue: g => scopeLabel(g.scope),
      cell: g => <span className="badge-pill muted">{scopeLabel(g.scope)}</span>,
    },
    {
      id: 'calls',
      header: 'Κλήσεις',
      align: 'right',
      width: 100,
      sortValue: g => g.calls,
      cell: g => <span className="tabular-nums">{formatTokens(g.calls)}</span>,
    },
    {
      id: 'inputTokens',
      header: 'Input tokens',
      align: 'right',
      width: 120,
      sortValue: g => g.inputTokens,
      cell: g => <span className="tabular-nums">{formatTokens(g.inputTokens)}</span>,
    },
    {
      id: 'outputTokens',
      header: 'Output tokens',
      align: 'right',
      width: 120,
      sortValue: g => g.outputTokens,
      cell: g => <span className="tabular-nums">{formatTokens(g.outputTokens)}</span>,
    },
    {
      id: 'totalTokens',
      header: 'Σύνολο tokens',
      align: 'right',
      width: 130,
      sortValue: g => g.totalTokens,
      cell: g => <span className="tabular-nums font-semibold">{formatTokens(g.totalTokens)}</span>,
    },
    ...(isSuperAdmin
      ? ([
          {
            id: 'base',
            header: 'Κόστος βάσης $',
            align: 'right',
            width: 130,
            sortValue: g => g.baseCostUsd,
            cell: g => <span className="tabular-nums text-muted-foreground">{formatUsd(g.baseCostUsd)}</span>,
          },
          {
            id: 'markup',
            header: 'Markup %',
            align: 'right',
            width: 100,
            sortValue: g => g.markupPct,
            cell: g => <span className="tabular-nums">{g.markupPct > 0 ? `+${g.markupPct}%` : `${g.markupPct}%`}</span>,
          },
          {
            id: 'final',
            header: 'Τελικό €',
            align: 'right',
            width: 110,
            sortValue: g => g.finalCostEur,
            cell: g => <span className="tabular-nums font-semibold">{formatEur(g.finalCostEur)}</span>,
          },
        ] as DataTableColumn<GroupedRow>[])
      : ([
          {
            id: 'final',
            header: 'Κόστος €',
            align: 'right',
            width: 110,
            sortValue: g => g.finalCostEur,
            cell: g => <span className="tabular-nums font-semibold">{formatEur(g.finalCostEur)}</span>,
          },
        ] as DataTableColumn<GroupedRow>[])),
  ]

  return (
    <DataTable
      tableId="costs-grouped"
      columns={columns}
      rows={grouped}
      rowKey={g => g.key}
      emptyMessage="Καμία κλήση AI σε αυτό το εύρος."
      footer={
        <>
          <span>{grouped.length} {grouped.length === 1 ? 'ομάδα' : 'ομάδες'} (provider · μοντέλο · scope)</span>
          <span className="ml-auto text-muted-foreground">Ισοτιμία Frankfurter ({fxDay}): 1 USD = {fxLatest.toFixed(4)} EUR</span>
        </>
      }
    />
  )
}
