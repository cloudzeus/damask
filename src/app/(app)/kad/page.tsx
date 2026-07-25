import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { KadView } from '@/components/registries/kad-view'

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
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Ευρωπαϊκά Προγράμματα <span aria-hidden>›</span> <b className="text-foreground">ΚΑΔ</b>
          </div>
          <h1 className="text-[22px]">ΚΑΔ</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Ιεραρχικός κατάλογος Κωδικών Αριθμών Δραστηριότητας.
          </p>
        </div>
      </div>

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
