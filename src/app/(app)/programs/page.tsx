import { requirePermission } from '@/lib/rbac-server'
import { listPrograms } from '@/lib/programs/actions'
import { ProgramsTable } from '@/components/programs/programs-table'
import { NewProgramDialog } from '@/components/programs/new-program-dialog'
import { PageHeader } from '@/components/ui/page-header'

export default async function ProgramsPage() {
  await requirePermission('programs.manage')

  const rows = await listPrograms()

  return (
    <div>
      <PageHeader
        breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>}
        title="Προγράμματα"
        subtitle="Ανέβασε την προκήρυξη ενός προγράμματος χρηματοδότησης — η αποδελτίωση εξάγει αυτόματα τα βασικά στοιχεία του."
        actions={<NewProgramDialog />}
      />

      <ProgramsTable rows={rows} />
    </div>
  )
}
