'use client'

import Link from 'next/link'
import { stageLabel, verdictLabel } from '@/lib/pm/types'
import type { VisibleApplicationItem } from '@/lib/pm/actions'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

/**
 * «Έργα» — πίνακας των αιτήσεων/έργων που βλέπει ο τρέχων χρήστης, πάνω στο κοινό
 * DataTable (resize/wrap/επιλογή στηλών/sorting· persist `dt:pm-applications`).
 * 'use client' γιατί τα cell render fns (Link/labels) περνούν το RSC→client boundary.
 */
export function ApplicationsTable({ rows }: { rows: VisibleApplicationItem[] }) {
  const columns: DataTableColumn<VisibleApplicationItem>[] = [
    {
      id: 'trdr',
      header: 'Πελάτης',
      width: 240,
      enableHide: false,
      sortValue: r => r.trdrName,
      cell: r => (
        <Link href={`/programs/${r.programId}/applications/${r.id}`} className="font-semibold hover:underline">
          {r.trdrName}
        </Link>
      ),
    },
    { id: 'program', header: 'Πρόγραμμα', width: 260, sortValue: r => r.programTitle, cell: r => r.programTitle },
    { id: 'stage', header: 'Στάδιο', width: 150, sortValue: r => stageLabel(r.stage), cell: r => stageLabel(r.stage) },
    { id: 'verdict', header: 'Αξιολόγηση', width: 150, sortValue: r => verdictLabel(r.assessmentVerdict), cell: r => verdictLabel(r.assessmentVerdict) },
    {
      id: 'manager',
      header: 'Διαχειριστής',
      width: 170,
      sortValue: r => r.managerName ?? '',
      cell: r => <span className="text-muted-foreground">{r.managerName ?? '—'}</span>,
    },
  ]

  return (
    <DataTable
      tableId="pm-applications"
      columns={columns}
      rows={rows}
      rowKey={r => r.id}
      emptyMessage="Δεν υπάρχουν έργα."
    />
  )
}
