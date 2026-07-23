import { requirePermission } from '@/lib/rbac-server'
import { listVisibleApplications, listVisibleObligations } from '@/lib/pm/actions'
import { PmWorkspace } from '@/components/pm/pm-workspace'

/**
 * `/pm` workspace (Task 9 → C2b tabbed workspace): «Έργα» (πίνακας αιτήσεων)
 * · «Πίνακας» (global status Kanban) · «Προθεσμίες» (deadline radar) — και
 * τα τρία πάνω στα ίδια scoped δεδομένα (listVisibleApplications/
 * listVisibleObligations ήδη κάνουν το scoping — pm.manage βλέπει όλα,
 * pm.work μόνο τα δικά του ανατεθειμένα, βλ. src/lib/pm/scoping.ts).
 * requirePermission('pm.work') αρκεί ως gate εδώ: ο SUPER_ADMIN/ADMIN έχει
 * pm.work μέσω ROLE_DEFAULTS=ALL, ο MANAGER/EMPLOYEE το παίρνει ρητά
 * (src/lib/permissions.ts) — δεν χρειάζεται ξεχωριστό pm.manage fallback
 * σαν το requirePmAccess των actions, το permission gate είναι ήδη «broad».
 * Το view switcher + presentational markup ζουν στο PmWorkspace (client) —
 * το page.tsx παραμένει RSC, μόνο fetch + gate.
 */
export default async function PmPage() {
  await requirePermission('pm.work')
  const [applications, obligations] = await Promise.all([listVisibleApplications(), listVisibleObligations()])

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

      <PmWorkspace applications={applications} obligations={obligations} />
    </div>
  )
}
