import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { listReferrers } from '@/lib/referrers/actions'
import { ReferrersTable } from './referrers-table'

export default async function ReferrersPage() {
  const session = await requirePermission('referrer.view')
  const rows = await listReferrers()
  const canManage = can(session, 'referrer.manage')

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Συναλλασσόμενοι <span aria-hidden>›</span> <b className="text-foreground">Παραπομπές</b>
          </div>
          <h1 className="text-[22px]">Παραπομπές</h1>
        </div>
      </div>

      <ReferrersTable rows={rows} canManage={canManage} />
    </div>
  )
}
