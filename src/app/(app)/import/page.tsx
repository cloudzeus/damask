import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { prisma } from '@/lib/prisma'
import { ExcelImportWizard } from './import-wizard'
import type { MappingTemplate } from './step-mapping'
import { PageHeader } from '@/components/ui/page-header'

export default async function ImportPage() {
  await requirePermission('import.run')
  await assertObjectEnabled('import')

  const savedMappings = await prisma.importMapping.findMany({
    where: { entity: 'product' },
    orderBy: { updatedAt: 'desc' },
  })

  const templates: MappingTemplate[] = savedMappings.map(m => ({
    id: m.id,
    name: m.name,
    columnMap: m.columnMap as Record<string, string>,
  }))

  return (
    <div>
      <PageHeader
        breadcrumb={<>Καθημερινά <span aria-hidden>›</span></>}
        title="Εισαγωγή Excel"
      />

      <ExcelImportWizard initialTemplates={templates} />
    </div>
  )
}
