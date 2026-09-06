import { requirePermission } from '@/lib/rbac-server'
import { listLeads } from '@/lib/leads/actions'
import { getAssignableStaff, type StaffOption } from '@/lib/assignments/actions'
import { PageHeader } from '@/components/ui/page-header'
import { LeadsClient } from './leads-client'

export default async function LeadsPage() {
  const session = await requirePermission('lead.view')
  const canAssign = (session.user.permissions ?? []).includes('lead.assign')
  const emptyStaff: { managers: StaffOption[]; employees: StaffOption[] } = { managers: [], employees: [] }
  const [rows, staff] = await Promise.all([
    listLeads(),
    canAssign ? getAssignableStaff().catch(() => emptyStaff) : Promise.resolve(emptyStaff),
  ])

  return (
    <div>
      <PageHeader
        breadcrumb={<>Ευρωπαϊκά Προγράμματα <span aria-hidden>›</span> Leads</>}
        title="Leads (Ενδιαφέρον)"
        subtitle={`${rows.length} ${rows.length === 1 ? 'ενδιαφερόμενος' : 'ενδιαφερόμενοι'}`}
      />
      <LeadsClient rows={rows} staff={staff} canAssign={canAssign} />
    </div>
  )
}
