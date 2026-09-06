import { requirePermission } from '@/lib/rbac-server'
import { getWorkload } from '@/lib/workload/actions'
import { PageHeader } from '@/components/ui/page-header'
import { WorkloadTable } from './workload-table'

export default async function WorkloadPage() {
  await requirePermission('application.assign')
  const rows = await getWorkload()

  return (
    <div>
      <PageHeader
        breadcrumb={<>Αρχική <span aria-hidden>›</span> Φόρτος εργασίας</>}
        title="Φόρτος εργασίας"
        subtitle={`${rows.length} ${rows.length === 1 ? 'χρήστης' : 'χρήστες'}`}
      />

      <WorkloadTable rows={rows} />
    </div>
  )
}
