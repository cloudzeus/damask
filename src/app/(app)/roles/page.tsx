import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { ROLE_ORDER } from '@/lib/permissions'
import { groupedPermissionsFor } from '@/lib/objects'
import { getEnabledObjectKeys } from '@/lib/objects-server'
import { RolesMatrix, type RoleData } from './roles-matrix'
import { PageHeader } from '@/components/ui/page-header'

export default async function RolesPage() {
  const session = await requirePermission('user.manage')
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'

  const roles = await prisma.role.findMany({
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  })

  const rolesData: RoleData[] = roles
    .map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      system: r.system,
      b2b: r.b2b,
      userCount: r._count.users,
      grantedKeys: r.permissions.map(p => p.permission.key),
    }))
    .sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a.name)
      const ib = ROLE_ORDER.indexOf(b.name)
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })

  const groups = groupedPermissionsFor(await getEnabledObjectKeys())

  return (
    <div>
      <PageHeader
        breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>}
        title="Ρόλοι & Δικαιώματα"
        subtitle="Κλικ σε κελί για εναλλαγή — αποθηκεύεται αυτόματα"
      />

      <RolesMatrix roles={rolesData} groups={groups} isSuperAdmin={isSuperAdmin} />

      <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
        Οι αλλαγές ισχύουν στο επόμενο login κάθε χρήστη.
      </p>
    </div>
  )
}
