import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { ActivityDashboard } from './activity-dashboard'
import { PageHeader } from '@/components/ui/page-header'

export default async function ActivityPage() {
  await requirePermission('activity.view')
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <div>
      <PageHeader
        breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>}
        title="Δραστηριότητα χρηστών"
      />
      <ActivityDashboard users={users} />
    </div>
  )
}
