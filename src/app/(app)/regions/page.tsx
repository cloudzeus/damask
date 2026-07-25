import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { RegionsView } from '@/components/registries/regions-view'

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
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Ευρωπαϊκά Προγράμματα <span aria-hidden>›</span> <b className="text-foreground">Περιφέρειες</b>
          </div>
          <h1 className="text-[22px]">Περιφέρειες</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Δενδροειδής δομή Καλλικράτη — Περιφέρεια › Περιφερειακή Ενότητα/Νομός › Δήμος ({total.toLocaleString('el-GR')} εγγραφές).
          </p>
        </div>
      </div>

      <RegionsView total={total} canManage={canManage} />
    </div>
  )
}
