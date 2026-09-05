import { requirePermission } from '@/lib/rbac-server'
import { listAssignableApplications, getAssignableStaff } from '@/lib/assignments/actions'
import { PageHeader } from '@/components/ui/page-header'
import { AssignmentsTable } from './assignments-table'

export default async function AssignmentsPage() {
  await requirePermission('application.assign')
  const [rows, staff] = await Promise.all([listAssignableApplications(), getAssignableStaff()])

  return (
    <div>
      <PageHeader
        breadcrumb={<>Αρχική <span aria-hidden>›</span> Αναθέσεις</>}
        title="Αναθέσεις έργων"
        subtitle={`${rows.length} ${rows.length === 1 ? 'έργο' : 'έργα'}`}
      />

      <AssignmentsTable rows={rows} staff={staff} />
    </div>
  )
}
