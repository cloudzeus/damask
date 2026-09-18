'use client'

import * as React from 'react'
import { summarizeObligations, type ReportObligation } from '@/lib/pm/reports'
import type { BoardObligation } from '@/lib/pm/actions'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

/**
 * «Επισκόπηση» (C2c) — stat cards + ανά πρόγραμμα/υπεύθυνο breakdown πάνω
 * στις ίδιες BoardObligation που τροφοδοτούν το board/deadlines. Καθαρό
 * client-side aggregation μέσω summarizeObligations (lib/pm/reports) — καμία
 * επιπλέον fetch. Οι πίνακες μέσω του κοινού DataTable engine
 * (resize/επιλογή στηλών/sorting).
 */

type Counts = { open: number; overdue: number; dueThisWeek: number }
type ProgramRow = { programTitle: string } & Counts
type AssigneeRow = { assigneeId: string; assigneeName: string } & Counts

function overdueCell(value: number): React.ReactNode {
  return (
    <span style={value > 0 ? { color: 'var(--coral)', fontWeight: 700 } : undefined}>{value}</span>
  )
}

export function PmOverview({ obligations }: { obligations: BoardObligation[] }) {
  const summary = React.useMemo(() => {
    const mapped: ReportObligation[] = obligations.map(o => ({
      id: o.id,
      status: o.status,
      dueDate: o.dueDate,
      assigneeId: o.assigneeId,
      assigneeName: o.assigneeName,
      programTitle: o.programTitle,
    }))
    const t = new Date()
    const todayMs = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())
    return summarizeObligations(mapped, todayMs)
  }, [obligations])

  const programColumns: DataTableColumn<ProgramRow>[] = [
    {
      id: 'programTitle', header: 'Πρόγραμμα', width: 280, enableHide: false, sortValue: r => r.programTitle,
      cell: r => <span className="font-semibold">{r.programTitle}</span>,
    },
    { id: 'open', header: 'Ανοιχτές', align: 'right', width: 110, nowrap: true, sortValue: r => r.open, cell: r => r.open },
    { id: 'overdue', header: 'Εκπρόθεσμες', align: 'right', width: 120, nowrap: true, sortValue: r => r.overdue, cell: r => overdueCell(r.overdue) },
    { id: 'dueThisWeek', header: 'Εβδομάδα', align: 'right', width: 110, nowrap: true, sortValue: r => r.dueThisWeek, cell: r => r.dueThisWeek },
  ]

  const assigneeColumns: DataTableColumn<AssigneeRow>[] = [
    {
      id: 'assigneeName', header: 'Υπεύθυνος', width: 280, enableHide: false, sortValue: r => r.assigneeName,
      cell: r => <span className="font-semibold">{r.assigneeName}</span>,
    },
    { id: 'open', header: 'Ανοιχτές', align: 'right', width: 110, nowrap: true, sortValue: r => r.open, cell: r => r.open },
    { id: 'overdue', header: 'Εκπρόθεσμες', align: 'right', width: 120, nowrap: true, sortValue: r => r.overdue, cell: r => overdueCell(r.overdue) },
    { id: 'dueThisWeek', header: 'Εβδομάδα', align: 'right', width: 110, nowrap: true, sortValue: r => r.dueThisWeek, cell: r => r.dueThisWeek },
  ]

  if (obligations.length === 0) {
    return <p className="py-8 text-center text-[0.78125rem] text-muted-foreground">Δεν υπάρχουν εκκρεμότητες.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Ανοιχτές" value={summary.open} />
        <StatCard title="Εκπρόθεσμες" value={summary.overdue} coral={summary.overdue > 0} />
        <StatCard title="Λήγουν αυτή την εβδομάδα" value={summary.dueThisWeek} />
      </div>

      <section className="glass table-card">
        <div className="dotted-leader px-2.5 pt-2 pb-1 text-[0.65625rem] font-extrabold tracking-[0.1em] uppercase">
          Ανά πρόγραμμα
        </div>
        <DataTable
          tableId="pm-overview-by-program"
          columns={programColumns}
          rows={summary.byProgram}
          rowKey={r => r.programTitle}
          bare
          fillHeight={false}
          emptyMessage="Δεν υπάρχουν προγράμματα."
        />
      </section>

      {summary.byAssignee.length > 1 && (
        <section className="glass table-card">
          <div className="dotted-leader px-2.5 pt-2 pb-1 text-[0.65625rem] font-extrabold tracking-[0.1em] uppercase">
            Ανά υπεύθυνο
          </div>
          <DataTable
            tableId="pm-overview-by-assignee"
            columns={assigneeColumns}
            rows={summary.byAssignee}
            rowKey={r => r.assigneeId}
            bare
            fillHeight={false}
          />
        </section>
      )}
    </div>
  )
}

function StatCard({ title, value, coral = false }: { title: string; value: number; coral?: boolean }) {
  return (
    <div className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
      <div className="text-[0.71875rem] font-bold text-muted-foreground">{title}</div>
      <div
        className="mt-[3px] text-[2.0625rem] leading-none font-[250] tracking-[-0.015em] tabular-nums"
        style={coral ? { color: 'var(--coral)' } : undefined}
      >
        {value}
      </div>
    </div>
  )
}
