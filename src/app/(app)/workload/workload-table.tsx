'use client'

import * as React from 'react'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import type { WorkloadRow } from '@/lib/workload/actions'

/** Ελληνικές ετικέτες ρόλων (fallback στο raw όνομα). */
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Διαχειριστής',
  MANAGER: 'Manager',
  EMPLOYEE: 'Υπάλληλος',
  SALESMAN: 'Πωλητής',
}

/** Χρωματιστό badge πλήθους: 0 muted, 1-2 info, 3-4 teal, 5+ warn. */
function CountBadge({ n, title }: { n: number; title?: string }) {
  const variant = n === 0 ? 'muted' : n >= 5 ? 'warn' : n >= 3 ? 'teal' : 'info'
  return (
    <span className={`badge-pill ${variant} shrink-0 tabular-nums`} title={title}>
      {n}
    </span>
  )
}

/** Ανοιχτές εργασίες: 0 muted, ≥1 warn (τραβά την προσοχή). */
function OpenTasksBadge({ n }: { n: number }) {
  const variant = n === 0 ? 'muted' : 'warn'
  return (
    <span className={`badge-pill ${variant} shrink-0 tabular-nums`} title={`${n} ανοιχτές εργασίες`}>
      {n}
    </span>
  )
}

export function WorkloadTable({ rows }: { rows: WorkloadRow[] }) {
  const maxTotal = React.useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.totalApps), 0),
    [rows],
  )

  const columns: DataTableColumn<WorkloadRow>[] = [
    {
      id: 'name',
      header: 'Όνομα',
      width: 240,
      enableHide: false,
      sortValue: r => r.name,
      cell: r => (
        <span className="flex min-w-0 flex-col">
          <b className="truncate">{r.name}</b>
          <span className="truncate text-[0.71875rem] text-muted-foreground">{r.email}</span>
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Ρόλος',
      width: 150,
      sortValue: r => ROLE_LABELS[r.role] ?? r.role,
      cell: r => <span className="badge-pill muted">{ROLE_LABELS[r.role] ?? r.role}</span>,
    },
    {
      id: 'asManager',
      header: 'Ως Manager',
      width: 130,
      align: 'right',
      nowrap: true,
      sortValue: r => r.asManager,
      cell: r => <CountBadge n={r.asManager} title={`${r.asManager} έργα ως υπεύθυνος`} />,
    },
    {
      id: 'asExecutor',
      header: 'Ως Εκτελεστής',
      width: 140,
      align: 'right',
      nowrap: true,
      sortValue: r => r.asExecutor,
      cell: r => <CountBadge n={r.asExecutor} title={`${r.asExecutor} έργα ως εκτελεστής`} />,
    },
    {
      id: 'totalApps',
      header: 'Σύνολο έργων',
      width: 180,
      align: 'right',
      nowrap: true,
      sortValue: r => r.totalApps,
      cell: r => (
        <span className="flex items-center justify-end gap-2">
          <span
            className="h-1.5 max-w-[3.5rem] flex-1 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <span
              className="block h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${maxTotal > 0 ? (r.totalApps / maxTotal) * 100 : 0}%` }}
            />
          </span>
          <CountBadge n={r.totalApps} title={`${r.totalApps} έργα συνολικά`} />
        </span>
      ),
    },
    {
      id: 'openTasks',
      header: 'Ανοιχτές εργασίες',
      width: 160,
      align: 'right',
      nowrap: true,
      sortValue: r => r.openTasks,
      cell: r => <OpenTasksBadge n={r.openTasks} />,
    },
  ]

  return (
    <DataTable
      tableId="workload"
      columns={columns}
      rows={rows}
      rowKey={r => r.id}
      initialSort={{ columnId: 'totalApps', dir: 'desc' }}
      emptyMessage="Δεν υπάρχουν χρήστες."
      footer={<span>{rows.length} {rows.length === 1 ? 'χρήστης' : 'χρήστες'}</span>}
    />
  )
}
