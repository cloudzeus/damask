'use client'

import * as React from 'react'
import { summarizeObligations, type ReportObligation } from '@/lib/pm/reports'
import type { BoardObligation } from '@/lib/pm/actions'

/**
 * «Επισκόπηση» (C2c) — stat cards + ανά πρόγραμμα/υπεύθυνο breakdown πάνω
 * στις ίδιες BoardObligation που τροφοδοτούν το board/deadlines. Καθαρό
 * client-side aggregation μέσω summarizeObligations (lib/pm/reports) — καμία
 * επιπλέον fetch.
 */
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

  if (obligations.length === 0) {
    return <p className="py-8 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν εκκρεμότητες.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Ανοιχτές" value={summary.open} />
        <StatCard title="Εκπρόθεσμες" value={summary.overdue} coral={summary.overdue > 0} />
        <StatCard title="Λήγουν αυτή την εβδομάδα" value={summary.dueThisWeek} />
      </div>

      <section className="glass table-card">
        <div className="dotted-leader px-2.5 pt-2 pb-1 text-[10.5px] font-extrabold tracking-[0.1em] uppercase">
          Ανά πρόγραμμα
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Πρόγραμμα</th>
                <th className="num">Ανοιχτές</th>
                <th className="num">Εκπρόθεσμες</th>
                <th className="num">Εβδομάδα</th>
              </tr>
            </thead>
            <tbody>
              {summary.byProgram.map(p => (
                <tr key={p.programTitle} className="dotted-row-bottom">
                  <td className="font-semibold">{p.programTitle}</td>
                  <td className="num">{p.open}</td>
                  <td className="num" style={p.overdue > 0 ? { color: 'var(--coral)', fontWeight: 700 } : undefined}>
                    {p.overdue}
                  </td>
                  <td className="num">{p.dueThisWeek}</td>
                </tr>
              ))}
              {summary.byProgram.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Δεν υπάρχουν προγράμματα.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {summary.byAssignee.length > 1 && (
        <section className="glass table-card">
          <div className="dotted-leader px-2.5 pt-2 pb-1 text-[10.5px] font-extrabold tracking-[0.1em] uppercase">
            Ανά υπεύθυνο
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Υπεύθυνος</th>
                  <th className="num">Ανοιχτές</th>
                  <th className="num">Εκπρόθεσμες</th>
                  <th className="num">Εβδομάδα</th>
                </tr>
              </thead>
              <tbody>
                {summary.byAssignee.map(a => (
                  <tr key={a.assigneeId} className="dotted-row-bottom">
                    <td className="font-semibold">{a.assigneeName}</td>
                    <td className="num">{a.open}</td>
                    <td className="num" style={a.overdue > 0 ? { color: 'var(--coral)', fontWeight: 700 } : undefined}>
                      {a.overdue}
                    </td>
                    <td className="num">{a.dueThisWeek}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({ title, value, coral = false }: { title: string; value: number; coral?: boolean }) {
  return (
    <div className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
      <div className="text-[11.5px] font-bold text-muted-foreground">{title}</div>
      <div
        className="mt-[3px] text-[33px] leading-none font-[250] tracking-[-0.015em] tabular-nums"
        style={coral ? { color: 'var(--coral)' } : undefined}
      >
        {value}
      </div>
    </div>
  )
}
