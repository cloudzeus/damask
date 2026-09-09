'use client'

import { Mail, HardDrive, CreditCard, Landmark, MapPin, Server, ExternalLink } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import type { ApiServiceSummary } from './api-costs-data'
import { formatEur, formatUnits } from './costs-format'

const SERVICE_ICONS: Record<string, typeof Mail> = {
  mailgun: Mail,
  bunnycdn: HardDrive,
  viva: CreditCard,
  aade: Landmark,
  geocoding: MapPin,
}

function serviceIcon(service: string) {
  return SERVICE_ICONS[service] ?? Server
}

/**
 * Tab «API Υπηρεσίες» — μία γραμμή ανά υπηρεσία (Mailgun/BunnyCDN/Viva/ΑΑΔΕ/
 * geocoding), τρέχων ημερολογιακός μήνας. Free quota progress bar (όταν η
 * υπηρεσία έχει quota > 0). Role-based στήλες κόστους — ίδιος κανόνας με
 * costs-grouped-table.tsx: SUPER_ADMIN βλέπει «Πραγματικό €/Markup %/Τελικό €»,
 * ο ADMIN μόνο «Κόστος €».
 */
export function ApiServicesTable({ summaries, isSuperAdmin }: { summaries: ApiServiceSummary[]; isSuperAdmin: boolean }) {
  if (summaries.length === 0) {
    return (
      <div className="glass table-card stagger flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Server className="size-5" strokeWidth={1.6} aria-hidden />
        </div>
        <p className="font-semibold">Καμία γνωστή API υπηρεσία.</p>
      </div>
    )
  }

  const columns: DataTableColumn<ApiServiceSummary>[] = [
    {
      id: 'service',
      header: 'Υπηρεσία',
      width: 220,
      sortValue: s => s.displayName,
      cell: s => {
        const Icon = serviceIcon(s.service)
        return (
          <div className="flex items-center gap-2">
            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-[9px]"
              style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
            >
              <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
            </div>
            <span className="font-semibold">{s.displayName}</span>
            {s.documentationUrl && (
              <a
                href={s.documentationUrl} target="_blank" rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Τεκμηρίωση τιμολόγησης ${s.displayName}`}
              >
                <ExternalLink className="size-3" strokeWidth={1.8} />
              </a>
            )}
          </div>
        )
      },
    },
    {
      id: 'calls',
      header: 'Κλήσεις',
      align: 'right',
      width: 100,
      sortValue: s => s.calls,
      cell: s => <span className="tabular-nums">{s.calls.toLocaleString('el-GR')}</span>,
    },
    {
      id: 'units',
      header: 'Μονάδες μήνα',
      align: 'right',
      width: 130,
      sortValue: s => s.units,
      cell: s => <span className="tabular-nums font-semibold">{formatUnits(s.units, s.unitLabel)}</span>,
    },
    {
      id: 'quota',
      header: 'Free quota',
      width: 180,
      cell: s => {
        const pctClamped = s.quotaPct == null ? null : Math.min(100, Math.max(0, s.quotaPct))
        const overQuota = s.quotaPct != null && s.quotaPct >= 100
        return s.freeQuota > 0 && pctClamped != null ? (
          <div className="flex flex-col gap-1">
            <Progress value={pctClamped} className="h-1.5" />
            <span className={`text-[0.6875rem] tabular-nums ${overQuota ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
              {formatUnits(s.units, s.unitLabel)} / {formatUnits(s.freeQuota, s.unitLabel)}
            </span>
          </div>
        ) : (
          <span className="text-[0.75rem] text-muted-foreground">—</span>
        )
      },
    },
    ...(isSuperAdmin
      ? ([
          {
            id: 'real',
            header: 'Πραγματικό €',
            align: 'right',
            width: 120,
            sortValue: s => s.realCostEur,
            cell: s => <span className="tabular-nums text-muted-foreground">{formatEur(s.realCostEur)}</span>,
          },
          {
            id: 'markup',
            header: 'Markup %',
            align: 'right',
            width: 100,
            sortValue: s => s.markupPercent,
            cell: s => <span className="tabular-nums">{s.markupPercent > 0 ? `+${s.markupPercent}%` : `${s.markupPercent}%`}</span>,
          },
          {
            id: 'billed',
            header: 'Τελικό €',
            align: 'right',
            width: 110,
            sortValue: s => s.billedCostEur,
            cell: s => <span className="tabular-nums font-semibold">{formatEur(s.billedCostEur)}</span>,
          },
        ] as DataTableColumn<ApiServiceSummary>[])
      : ([
          {
            id: 'billed',
            header: 'Κόστος €',
            align: 'right',
            width: 110,
            sortValue: s => s.billedCostEur,
            cell: s => <span className="tabular-nums font-semibold">{formatEur(s.billedCostEur)}</span>,
          },
        ] as DataTableColumn<ApiServiceSummary>[])),
  ]

  return (
    <DataTable
      fillHeight={false}
      tableId="api-services"
      columns={columns}
      rows={summaries}
      rowKey={s => s.service}
      emptyMessage="Καμία γνωστή API υπηρεσία."
      footer={<span>{summaries.length} {summaries.length === 1 ? 'υπηρεσία' : 'υπηρεσίες'} · τρέχων μήνας</span>}
    />
  )
}
