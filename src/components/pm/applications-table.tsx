import Link from 'next/link'
import { stageLabel, verdictLabel } from '@/lib/pm/types'
import type { VisibleApplicationItem } from '@/lib/pm/actions'

/**
 * «Έργα» — presentational πίνακας των αιτήσεων/έργων που βλέπει ο τρέχων
 * χρήστης. Εξήχθη από pm/page.tsx (C2b — Task 9→workspace) ώστε το RSC να
 * μπορεί να περάσει τα ίδια δεδομένα και στο PmWorkspace (view switcher)
 * χωρίς να αλλάξει η συμπεριφορά/markup του υπάρχοντος πίνακα.
 */
export function ApplicationsTable({ rows }: { rows: VisibleApplicationItem[] }) {
  return (
    <div className="glass table-card">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Πελάτης</th>
              <th>Πρόγραμμα</th>
              <th>Στάδιο</th>
              <th>Αξιολόγηση</th>
              <th>Διαχειριστής</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="dotted-row-bottom">
                <td>
                  <Link href={`/programs/${row.programId}/applications/${row.id}`} className="font-semibold hover:underline">
                    {row.trdrName}
                  </Link>
                </td>
                <td>{row.programTitle}</td>
                <td>{stageLabel(row.stage)}</td>
                <td>{verdictLabel(row.assessmentVerdict)}</td>
                <td className="text-muted-foreground">{row.managerName ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Δεν υπάρχουν έργα.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
