import { requirePermission } from '@/lib/rbac-server'
import { listPrograms } from '@/lib/programs/actions'
import { ProgramsTable } from '@/components/programs/programs-table'
import { NewProgramDialog } from '@/components/programs/new-program-dialog'

export default async function ProgramsPage() {
  await requirePermission('programs.manage')

  const rows = await listPrograms()

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Προγράμματα</b>
          </div>
          <h1 className="text-[22px]">Προγράμματα</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Ανέβασε την προκήρυξη ενός προγράμματος χρηματοδότησης — η αποδελτίωση εξάγει αυτόματα τα βασικά στοιχεία του.
          </p>
        </div>
        <div className="flex-1" />
        <NewProgramDialog />
      </div>

      <ProgramsTable rows={rows} />
    </div>
  )
}
