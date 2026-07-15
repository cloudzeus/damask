import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { ROLE_ORDER, groupedPermissions } from '@/lib/permissions'
import { RolesMatrix, type RoleData } from './roles-matrix'

export default async function RolesPage() {
  await requirePermission('user.manage')

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

  const groups = groupedPermissions()

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Ρόλοι &amp; Δικαιώματα</b>
          </div>
          <h1 className="text-[22px]">Ρόλοι &amp; Δικαιώματα</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Κλικ σε κελί για εναλλαγή — αποθηκεύεται αυτόματα
          </p>
        </div>
      </div>

      <RolesMatrix roles={rolesData} groups={groups} />

      <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
        Οι αλλαγές ισχύουν στο επόμενο login κάθε χρήστη.
      </p>
    </div>
  )
}
