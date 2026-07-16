import { Users, Clock3, Compass, ShieldCheck, Download } from 'lucide-react'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { relativeTime } from '@/lib/relative-time'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { UsersTable, type UserRow } from './users-table'
import { AccessRequestsPanel, type AccessRequestRow } from './access-requests'
import { NewUserButton } from './new-user-button'

export default async function UsersPage() {
  const session = await requirePermission('user.manage')

  const [
    users,
    roles,
    pendingRequests,
    activeCount,
    totalCount,
    architectRoleCount,
    architectCustomerTotal,
    roleCount,
    systemRoleCount,
  ] = await Promise.all([
    prisma.user.findMany({
      include: {
        role: { select: { name: true } },
        customer: { select: { name: true } },
        architect: { include: { _count: { select: { customers: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.accessRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.count(),
    prisma.user.count({ where: { role: { name: 'ARCHITECT' } } }),
    prisma.architectCustomer.count(),
    prisma.role.count(),
    prisma.role.count({ where: { system: true } }),
  ])

  const now = new Date()
  const userRows: UserRow[] = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.active,
    roleId: u.roleId,
    roleName: u.role.name,
    phone: u.phone,
    mobile: u.mobile,
    address: u.address,
    city: u.city,
    country: u.country,
    connectedLabel: u.customer?.name ?? (u.architect ? `${u.architect._count.customers} πελάτες` : '—'),
    updatedLabel: relativeTime(u.updatedAt, now),
  }))

  const requestRows: AccessRequestRow[] = pendingRequests.map(r => ({
    id: r.id,
    type: r.type,
    name: r.name,
    company: r.company,
    afm: r.afm,
    email: r.email,
    fromContact: Boolean(r.contactId),
  }))

  const kpis = [
    {
      key: 'active',
      icon: Users,
      iconStyle: { background: 'var(--info-soft)', color: 'var(--info)' },
      label: 'Ενεργοί χρήστες',
      value: activeCount,
      caption: `${totalCount} συνολικά`,
      captionStyle: { color: 'var(--muted-foreground)', background: 'var(--info-soft)' },
      spark: (
        <svg width="64" height="18" viewBox="0 0 64 18" fill="none" aria-hidden>
          <path d="M2 14 12 12 22 13 32 8 42 10 52 5 62 3" stroke="var(--info)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 4" />
          <circle cx="62" cy="3" r="2.4" fill="var(--coral)" />
        </svg>
      ),
    },
    {
      key: 'pending',
      icon: Clock3,
      iconStyle: { background: 'var(--warning-soft)', color: 'var(--warning)' },
      label: 'Αιτήματα B2B',
      value: pendingRequests.length,
      caption: 'Περιμένουν έγκριση',
      captionStyle: { color: 'var(--warning)', background: 'var(--warning-soft)' },
      spark: null,
    },
    {
      key: 'architects',
      icon: Compass,
      iconStyle: { background: 'var(--info-soft)', color: 'var(--info)' },
      label: 'Αρχιτέκτονες',
      value: architectRoleCount,
      caption: `${architectCustomerTotal} πελάτες`,
      captionStyle: { color: 'var(--muted-foreground)', background: 'var(--info-soft)' },
      spark: null,
    },
    {
      key: 'roles',
      icon: ShieldCheck,
      iconStyle: { background: 'var(--info-soft)', color: 'var(--info)' },
      label: 'Ρόλοι',
      value: roleCount,
      caption: `${systemRoleCount} συστημικοί`,
      captionStyle: { color: 'var(--muted-foreground)', background: 'var(--info-soft)' },
      spark: (
        <svg width="64" height="18" viewBox="0 0 64 18" fill="none" aria-hidden>
          <path d="M2 15 12 13 22 14 32 10 42 12 52 7 62 8" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 4" />
          <circle cx="62" cy="8" r="2.4" fill="var(--success)" />
        </svg>
      ),
    },
  ] as const

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Χρήστες</b>
          </div>
          <h1 className="text-[22px]">Χρήστες</h1>
        </div>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="btn-pill btn-glass"
                aria-disabled="true"
                style={{ opacity: 0.6, cursor: 'default' }}
              >
                <Download className="size-3.5" strokeWidth={1.8} aria-hidden /> Λήψη Excel
              </button>
            }
          />
          <TooltipContent>Έρχεται με το Import/Export Engine (Φάση 2)</TooltipContent>
        </Tooltip>
        <NewUserButton roles={roles} />
      </div>

      <div className="stagger mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(kpi => (
          <div key={kpi.key} className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
            <div className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]" style={kpi.iconStyle}>
              <kpi.icon className="size-[15px]" strokeWidth={1.8} />
            </div>
            <div className="text-[11.5px] font-bold text-muted-foreground">{kpi.label}</div>
            <div className="mt-[3px] text-[33px] leading-none font-[250] tracking-[-0.015em] tabular-nums">
              {kpi.value}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold whitespace-nowrap" style={kpi.captionStyle}>
                {kpi.caption}
              </span>
              {kpi.spark}
            </div>
          </div>
        ))}
      </div>

      <UsersTable users={userRows} roles={roles} currentUserId={session.user.id} />

      <AccessRequestsPanel requests={requestRows} />
    </div>
  )
}
