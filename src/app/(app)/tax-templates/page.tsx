import { requirePermission } from '@/lib/rbac-server'
import { listTemplates } from '@/lib/tax/actions'
import { GuidesTable } from '@/components/tax/guides-table'
import { NewGuideDialog } from '@/components/tax/new-guide-dialog'

export default async function TaxTemplatesPage() {
  await requirePermission('taxform.manage')

  const rows = await listTemplates()

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Οδηγοί Εντύπων</b>
          </div>
          <h1 className="text-[22px]">Οδηγοί Εντύπων</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Χαρτογράφησε φορολογικά έντυπα (π.χ. Ε3) σε πεδία, ώστε να σαρώνονται αυτόματα ανά πελάτη.
          </p>
        </div>
        <div className="flex-1" />
        <NewGuideDialog />
      </div>

      <GuidesTable rows={rows} />
    </div>
  )
}
