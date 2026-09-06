'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Monitor, Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

export type ConsentRow = {
  id: string
  createdAtIso: string
  createdAtRelative: string
  createdAtExact: string
  visitorId: string
  userName: string | null
  ip: string
  os: string
  browser: string | null
  locale: string | null
  analytics: boolean
  marketing: boolean
  policyVersion: string | null
}

const RANGE_OPTIONS: { value: '7' | '30' | 'all'; label: string }[] = [
  { value: '7', label: 'Τελευταίες 7 ημέρες' },
  { value: '30', label: 'Τελευταίες 30 ημέρες' },
  { value: 'all', label: 'Όλες' },
]

type ChoiceFilter = 'all' | 'analytics-on' | 'analytics-off' | 'marketing-on' | 'marketing-off'

const CHOICE_OPTIONS: { value: ChoiceFilter; label: string }[] = [
  { value: 'all', label: 'Όλα' },
  { value: 'analytics-on', label: 'Analytics ✓' },
  { value: 'analytics-off', label: 'Analytics ✗' },
  { value: 'marketing-on', label: 'Marketing ✓' },
  { value: 'marketing-off', label: 'Marketing ✗' },
]

function truncateId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id
}

export function ConsentsTable({ rows, range }: { rows: ConsentRow[]; range: '7' | '30' | 'all' }) {
  const [choiceFilter, setChoiceFilter] = useState<ChoiceFilter>('all')

  const filtered = useMemo(() => {
    switch (choiceFilter) {
      case 'analytics-on': return rows.filter(r => r.analytics)
      case 'analytics-off': return rows.filter(r => !r.analytics)
      case 'marketing-on': return rows.filter(r => r.marketing)
      case 'marketing-off': return rows.filter(r => !r.marketing)
      default: return rows
    }
  }, [rows, choiceFilter])

  const columns: DataTableColumn<ConsentRow>[] = [
    {
      id: 'date',
      header: 'Ημ/νία · ώρα',
      width: 150,
      sortValue: row => row.createdAtIso,
      cell: row => (
        <Tooltip>
          <TooltipTrigger
            render={
              <time dateTime={row.createdAtIso} className="cursor-default">
                {row.createdAtRelative}
              </time>
            }
          />
          <TooltipContent>{row.createdAtExact}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: 'visitor',
      header: 'Visitor',
      width: 150,
      sortValue: row => row.visitorId,
      cell: row => (
        <span className="font-mono text-[0.71875rem] text-muted-foreground" title={row.visitorId}>
          {truncateId(row.visitorId)}
        </span>
      ),
    },
    {
      id: 'user',
      header: 'Χρήστης',
      width: 150,
      sortValue: row => row.userName ?? '',
      cell: row => row.userName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'ip',
      header: 'IP',
      width: 130,
      sortValue: row => row.ip,
      cell: row => <span className="font-mono text-[0.75rem]">{row.ip}</span>,
    },
    {
      id: 'osBrowser',
      header: 'OS · Browser',
      width: 180,
      sortValue: row => row.os,
      cell: row => (
        <span className="inline-flex items-center gap-1.5">
          <Monitor className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
          {row.os}{row.browser ? ` · ${row.browser}` : ''}
        </span>
      ),
    },
    {
      id: 'locale',
      header: 'Locale',
      width: 120,
      sortValue: row => row.locale ?? '',
      cell: row => (
        row.locale ? (
          <span className="inline-flex items-center gap-1.5">
            <Globe2 className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden /> {row.locale}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      ),
    },
    {
      id: 'analytics',
      header: 'Analytics',
      width: 110,
      sortValue: row => row.analytics,
      cell: row => <span className={cn('badge-pill', row.analytics ? 'ok' : 'muted')}>{row.analytics ? '✓' : '✗'}</span>,
    },
    {
      id: 'marketing',
      header: 'Marketing',
      width: 110,
      sortValue: row => row.marketing,
      cell: row => <span className={cn('badge-pill', row.marketing ? 'ok' : 'muted')}>{row.marketing ? '✓' : '✗'}</span>,
    },
    {
      id: 'policyVersion',
      header: 'Έκδοση πολιτικής',
      width: 150,
      sortValue: row => row.policyVersion ?? '',
      cell: row => <span className="text-muted-foreground">{row.policyVersion ?? '—'}</span>,
    },
  ]

  return (
    <DataTable
      tableId="cms-consents"
      columns={columns}
      rows={filtered}
      rowKey={row => row.id}
      emptyMessage={rows.length === 0 ? 'Δεν υπάρχουν καταγεγραμμένες συγκαταθέσεις σε αυτό το εύρος.' : 'Καμία εγγραφή δεν ταιριάζει στο φίλτρο.'}
      footer={<span>{filtered.length} {filtered.length === 1 ? 'εγγραφή' : 'εγγραφές'}{filtered.length !== rows.length ? ` (από ${rows.length})` : ''}</span>}
      toolbarExtras={
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {RANGE_OPTIONS.map(opt => (
              <Link
                key={opt.value}
                href={opt.value === '30' ? '/cms/consents' : `/cms/consents?range=${opt.value}`}
                className={cn('pill', range === opt.value && 'on')}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <div className="mx-1 h-5 w-px shrink-0" style={{ background: 'var(--border)' }} aria-hidden />
          <div className="flex flex-wrap items-center gap-1.5">
            {CHOICE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={cn('pill', choiceFilter === opt.value && 'on')}
                onClick={() => setChoiceFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <button type="button" className="pill" aria-disabled="true" style={{ opacity: 0.55, cursor: 'default' }}>
                  <Download className="size-3.5" strokeWidth={1.8} aria-hidden /> Λήψη Excel
                </button>
              }
            />
            <TooltipContent>Έρχεται με το Excel engine (Φάση 2)</TooltipContent>
          </Tooltip>
        </>
      }
    />
  )
}
