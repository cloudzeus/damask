'use client'

import { ListTree } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { relativeTime } from '@/lib/relative-time'
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

  return (
    <div className="glass table-card stagger">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ώρα</th>
              <th>Provider / Μοντέλο</th>
              <th>Scope</th>
              <th className="num">Tokens</th>
              {isSuperAdmin ? (
                <>
                  <th className="num">Βάση $</th>
                  <th className="num">Markup %</th>
                  <th className="num">Τελικό €</th>
                </>
              ) : (
                <th className="num">Κόστος €</th>
              )}
              <th className="num">Διάρκεια</th>
              <th>Ref</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ row, baseCostUsd, markupPct, finalCostEur }) => (
              <tr key={row.id} className="dotted-row-bottom">
                <td>
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
                </td>
                <td>
                  <span className="badge-pill info capitalize">{row.provider}</span>{' '}
                  <span className="font-mono text-[11.5px] text-muted-foreground">{row.model}</span>
                </td>
                <td><span className="badge-pill muted">{scopeLabel(row.scope)}</span></td>
                <td className="num tabular-nums">{formatTokens(row.totalTokens)}</td>
                {isSuperAdmin ? (
                  <>
                    <td className="num tabular-nums text-muted-foreground">{formatUsd(baseCostUsd)}</td>
                    <td className="num tabular-nums">{markupPct > 0 ? `+${markupPct}%` : `${markupPct}%`}</td>
                    <td className="num tabular-nums font-semibold">{formatEur(finalCostEur)}</td>
                  </>
                ) : (
                  <td className="num tabular-nums font-semibold">{formatEur(finalCostEur)}</td>
                )}
                <td className="num text-muted-foreground">{formatDuration(row.durationMs)}</td>
                <td className="text-muted-foreground">
                  {row.refType ? (
                    <span className="font-mono text-[11px]" title={row.refId ?? undefined}>
                      {row.refType}{row.refId ? `:${row.refId.slice(0, 8)}` : ''}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{entries.length} {entries.length === 1 ? 'κλήση' : 'κλήσεις'} (τελευταίες 100)</span>
      </div>
    </div>
  )
}
