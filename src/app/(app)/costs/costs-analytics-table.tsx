'use client'

import { ListTree } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { relativeTime } from '@/lib/relative-time'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import type { AiUsageRow } from './costs-data'
import { formatEur, formatUsd, formatTokens, formatDuration, scopeLabel } from './costs-format'

export type AnalyticsEntry = {
  row: AiUsageRow
  baseCostUsd: number
  markupPct: number
  finalCostUsd: number
  finalCostEur: number
}

/** Δεύτερο tab «Αναλυτικά» — τελευταίες 100 κλήσεις, dotted table, role-based κόστος (ίδιος κανόνας με το grouped table). */
export function CostsAnalyticsTable({ entries, isSuperAdmin }: { entries: AnalyticsEntry[]; isSuperAdmin: boolean }) {
  if (entries.length === 0) {
    return (
      <div className="glass table-card stagger flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <ListTree className="size-5" strokeWidth={1.6} aria-hidden />
        </div>
        <p className="font-semibold">Καμία κλήση AI σε αυτό το εύρος.</p>
      </div>
    )
  }

  const now = new Date()

  const columns: DataTableColumn<AnalyticsEntry>[] = [
    {
      id: 'time',
      header: 'Ώρα',
      width: 150,
      sortValue: ({ row }) => row.createdAt.getTime(),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger
            render={
              <time dateTime={row.createdAt.toISOString()} className="cursor-default">
                {relativeTime(row.createdAt, now)}
              </time>
            }
          />
          <TooltipContent>{row.createdAt.toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'medium' })}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: 'model',
      header: 'Provider / Μοντέλο',
      width: 220,
      sortValue: ({ row }) => row.provider,
      cell: ({ row }) => (
        <>
          <span className="badge-pill info capitalize">{row.provider}</span>{' '}
          <span className="font-mono text-[0.71875rem] text-muted-foreground">{row.model}</span>
        </>
      ),
    },
    {
      id: 'scope',
      header: 'Scope',
      width: 140,
      sortValue: ({ row }) => scopeLabel(row.scope),
      cell: ({ row }) => <span className="badge-pill muted">{scopeLabel(row.scope)}</span>,
    },
    {
      id: 'tokens',
      header: 'Tokens',
      align: 'right',
      width: 110,
      sortValue: ({ row }) => row.totalTokens,
      cell: ({ row }) => <span className="tabular-nums">{formatTokens(row.totalTokens)}</span>,
    },
    ...(isSuperAdmin
      ? ([
          {
            id: 'base',
            header: 'Βάση $',
            align: 'right',
            width: 100,
            sortValue: ({ baseCostUsd }) => baseCostUsd,
            cell: ({ baseCostUsd }) => <span className="tabular-nums text-muted-foreground">{formatUsd(baseCostUsd)}</span>,
          },
          {
            id: 'markup',
            header: 'Markup %',
            align: 'right',
            width: 100,
            sortValue: ({ markupPct }) => markupPct,
            cell: ({ markupPct }) => <span className="tabular-nums">{markupPct > 0 ? `+${markupPct}%` : `${markupPct}%`}</span>,
          },
          {
            id: 'final',
            header: 'Τελικό €',
            align: 'right',
            width: 110,
            sortValue: ({ finalCostEur }) => finalCostEur,
            cell: ({ finalCostEur }) => <span className="tabular-nums font-semibold">{formatEur(finalCostEur)}</span>,
          },
        ] as DataTableColumn<AnalyticsEntry>[])
      : ([
          {
            id: 'final',
            header: 'Κόστος €',
            align: 'right',
            width: 110,
            sortValue: ({ finalCostEur }) => finalCostEur,
            cell: ({ finalCostEur }) => <span className="tabular-nums font-semibold">{formatEur(finalCostEur)}</span>,
          },
        ] as DataTableColumn<AnalyticsEntry>[])),
    {
      id: 'duration',
      header: 'Διάρκεια',
      align: 'right',
      width: 100,
      sortValue: ({ row }) => row.durationMs,
      cell: ({ row }) => <span className="text-muted-foreground">{formatDuration(row.durationMs)}</span>,
    },
    {
      id: 'ref',
      header: 'Ref',
      width: 140,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.refType ? (
            <span className="font-mono text-[0.6875rem]" title={row.refId ?? undefined}>
              {row.refType}{row.refId ? `:${row.refId.slice(0, 8)}` : ''}
            </span>
          ) : '—'}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      fillHeight={false}
      tableId="costs-analytics"
      columns={columns}
      rows={entries}
      rowKey={({ row }) => row.id}
      emptyMessage="Καμία κλήση AI σε αυτό το εύρος."
      footer={<span>{entries.length} {entries.length === 1 ? 'κλήση' : 'κλήσεις'} (τελευταίες 100)</span>}
    />
  )
}
