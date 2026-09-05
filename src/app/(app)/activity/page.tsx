import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { ActivityDashboard } from './activity-dashboard'

export default async function ActivityPage() {
  await requirePermission('activity.view')
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <div>
      <div className="mb-4 pt-1.5">
        <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Δραστηριότητα</b>
        </div>
        <h1 className="text-[22px]">Δραστηριότητα χρηστών</h1>
      </div>
      <ActivityDashboard users={users} />
    </div>
  )
}
