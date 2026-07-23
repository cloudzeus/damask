import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { RegionsView } from '@/components/registries/regions-view'

/**
 * `/regions` — μητρώο Περιφερειών (Καλλικράτης). RSC: μόνο gate + total count
 * server-side· decoder + lazy δέντρο ζουν στο client (RegionsView), ίδιο
 * idiom με το pm/page.tsx (requirePermission + breadcrumb header, χωρίς
 * assertObjectEnabled — το 'regions' item δεν είναι toggle-able σαν τα
 * cms/media, mirror του 'pm' item).
 */
export default async function RegionsPage() {
  await requirePermission('regions.view')
  const total = await prisma.region.count()

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Μητρώα <span aria-hidden>›</span> <b className="text-foreground">Περιφέρειες</b>
          </div>
          <h1 className="text-[22px]">Περιφέρειες</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Δενδροειδής δομή Καλλικράτη — Περιφέρεια › Περιφερειακή Ενότητα/Νομός › Δήμος ({total.toLocaleString('el-GR')} εγγραφές).
          </p>
        </div>
      </div>

      <RegionsView total={total} />
    </div>
  )
}
