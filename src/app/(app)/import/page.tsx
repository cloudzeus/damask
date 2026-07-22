import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { prisma } from '@/lib/prisma'
import { ExcelImportWizard } from './import-wizard'
import type { MappingTemplate } from './step-mapping'

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
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Καθημερινά <span aria-hidden>›</span> <b className="text-foreground">Εισαγωγή Excel</b>
          </div>
          <h1 className="text-[22px]">Εισαγωγή Excel</h1>
        </div>
      </div>

      <ExcelImportWizard initialTemplates={templates} />
    </div>
  )
}
