import { requirePermission } from '@/lib/rbac-server'
import { listTemplates } from '@/lib/tax/actions'
import { GuidesTable } from '@/components/tax/guides-table'
import { NewGuideDialog } from '@/components/tax/new-guide-dialog'
import { PageHeader } from '@/components/ui/page-header'

export default async function TaxTemplatesPage() {
  await requirePermission('taxform.manage')

  const rows = await listTemplates()

  return (
    <div>
      <PageHeader
        breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>}
        title="Οδηγοί Εντύπων"
        subtitle="Χαρτογράφησε φορολογικά έντυπα (π.χ. Ε3) σε πεδία, ώστε να σαρώνονται αυτόματα ανά πελάτη."
        actions={<NewGuideDialog />}
      />

      <GuidesTable rows={rows} />
    </div>
  )
}
