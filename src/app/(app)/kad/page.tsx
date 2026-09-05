import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { KadView } from '@/components/registries/kad-view'
import { PageHeader } from '@/components/ui/page-header'

/**
 * `/kad` — διαχείριση μητρώου ΚΑΔ, ενότητα «Ευρωπαϊκά Προγράμματα». RSC: gate +
 * total count + τελευταίο import log server-side· search/decoder/δέντρο + CRUD
 * dialogs ζουν στο client (KadView). Το canManage (kad.manage) ενεργοποιεί
 * προσθήκη/επεξεργασία/διαγραφή — ίδιο idiom με /regions.
 */
export default async function KadPage() {
  const session = await requirePermission('kad.view')
  const canManage = can(session, 'kad.manage')
  const [total, lastImport] = await Promise.all([
    prisma.kadCode.count(),
    prisma.kadImportLog.findFirst({ orderBy: { importedAt: 'desc' } }),
  ])

  return (
    <div>
      <PageHeader
        breadcrumb={<>Ευρωπαϊκά Προγράμματα <span aria-hidden>›</span></>}
        title="ΚΑΔ"
        subtitle="Ιεραρχικός κατάλογος Κωδικών Αριθμών Δραστηριότητας."
      />

      <KadView
        total={total}
        canManage={canManage}
        lastImport={
          lastImport
            ? { importedAt: lastImport.importedAt.toISOString(), totalCodes: lastImport.totalCodes, sourceVersion: lastImport.sourceVersion }
            : null
        }
      />
    </div>
  )
}
