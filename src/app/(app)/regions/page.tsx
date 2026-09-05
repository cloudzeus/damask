import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { RegionsView } from '@/components/registries/regions-view'
import { PageHeader } from '@/components/ui/page-header'

/**
 * `/regions` — διαχείριση μητρώου Περιφερειών (Καλλικράτης), ενότητα
 * «Ευρωπαϊκά Προγράμματα». RSC: μόνο gate + total count server-side· decoder +
 * lazy δέντρο + CRUD dialogs ζουν στο client (RegionsView). Το canManage
 * (regions.manage) ενεργοποιεί προσθήκη/επεξεργασία/διαγραφή — ίδιο idiom με
 * το canEdit του partners/[id]/page.tsx.
 */
export default async function RegionsPage() {
  const session = await requirePermission('regions.view')
  const canManage = can(session, 'regions.manage')
  const total = await prisma.region.count()

  return (
    <div>
      <PageHeader
        breadcrumb={<>Ευρωπαϊκά Προγράμματα <span aria-hidden>›</span></>}
        title="Περιφέρειες"
        subtitle={<>Δενδροειδής δομή Καλλικράτη — Περιφέρεια › Περιφερειακή Ενότητα/Νομός › Δήμος ({total.toLocaleString('el-GR')} εγγραφές).</>}
      />

      <RegionsView total={total} canManage={canManage} />
    </div>
  )
}
