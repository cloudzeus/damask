import { requirePermission } from '@/lib/rbac-server'
import { listPrograms } from '@/lib/programs/actions'
import { ProgramsTable } from '@/components/programs/programs-table'
import { ProgramWizard } from '@/components/programs/program-wizard'
import { HarvestEspaButton } from '@/components/programs/harvest-button'
import { PotentialMatchButton } from '@/components/programs/potential-match-button'
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
        actions={<div className="flex flex-wrap gap-2"><PotentialMatchButton /><HarvestEspaButton /><ProgramWizard /></div>}
      />

      <ProgramsTable rows={rows} />
    </div>
  )
}
