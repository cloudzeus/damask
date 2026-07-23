import Link from 'next/link'
import { requirePermission } from '@/lib/rbac-server'
import { listVisibleApplications } from '@/lib/pm/actions'
import { stageLabel, verdictLabel } from '@/lib/pm/types'

/**
 * «Έργα» (Task 9 — minimal v1): λίστα των αιτήσεων/έργων που βλέπει ο
 * τρέχων χρήστης (listVisibleApplications ήδη κάνει το scoping — pm.manage
 * βλέπει όλα, pm.work μόνο τα δικά του ανατεθειμένα, βλ. src/lib/pm/scoping.ts).
 * requirePermission('pm.work') αρκεί ως gate εδώ: ο SUPER_ADMIN/ADMIN έχει
 * pm.work μέσω ROLE_DEFAULTS=ALL, ο MANAGER/EMPLOYEE το παίρνει ρητά
 * (src/lib/permissions.ts) — δεν χρειάζεται ξεχωριστό pm.manage fallback
 * σαν το requirePmAccess των actions, το permission gate είναι ήδη «broad».
 */
export default async function PmPage() {
  await requirePermission('pm.work')
  const rows = await listVisibleApplications()

  return (
    <div>
      <div className="mb-4 pt-1.5">
        <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          Ευρωπαϊκά Προγράμματα <span aria-hidden>›</span> <b className="text-foreground">Έργα</b>
        </div>
        <h1 className="text-[22px]">Έργα</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Οι αιτήσεις προγραμμάτων που έχεις ανατεθεί (ως διαχειριστής ή εισηγητής).
        </p>
      </div>

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
    </div>
  )
}
