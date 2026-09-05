import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { listReferrers } from '@/lib/referrers/actions'
import { ReferrersTable } from './referrers-table'
import { PageHeader } from '@/components/ui/page-header'

export default async function ReferrersPage() {
  const session = await requirePermission('referrer.view')
  const rows = await listReferrers()
  const canManage = can(session, 'referrer.manage')

  return (
    <div>
      <PageHeader
        breadcrumb={<>Συναλλασσόμενοι <span aria-hidden>›</span></>}
        title="Παραπομπές"
      />

      <ReferrersTable rows={rows} canManage={canManage} />
    </div>
  )
}
