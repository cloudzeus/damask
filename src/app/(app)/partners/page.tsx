import { Users, Truck, Sparkles, CalendarPlus } from 'lucide-react'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { PartnersTable, type PartnerRow } from './partners-table'
import { NewPartnerButton } from './new-partner-button'
import { getMapsClientConfig } from './actions'

export default async function PartnersPage() {
  await requirePermission('customer.view')

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [customers, customerCount, supplierCount, leadCount, newThisMonth, mapsConfig] = await Promise.all([
    prisma.customer.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.customer.count({ where: { sodtype: 13, status: 'CUSTOMER' } }),
    prisma.customer.count({ where: { sodtype: 12 } }),
    prisma.customer.count({ where: { status: 'LEAD' } }),
    prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
    getMapsClientConfig(),
  ])

  const partnerRows: PartnerRow[] = customers.map(c => ({
    id: c.id,
    name: c.name,
    afm: c.afm,
    city: c.city,
    phone: c.phone,
    logoUrl: c.logoUrl,
    contactsCount: c._count.contacts,
    status: c.status,
    sodtype: c.sodtype,
    trdr: c.trdr,
  }))

  const kpis = [
    {
      key: 'customers', icon: Users, iconStyle: { background: 'var(--success-soft)', color: 'var(--success)' },
      label: 'Πελάτες', value: customerCount, caption: 'Πελατοποιημένοι', captionStyle: { color: 'var(--success)', background: 'var(--success-soft)' },
    },
    {
      key: 'suppliers', icon: Truck, iconStyle: { background: 'var(--info-soft)', color: 'var(--info)' },
      label: 'Προμηθευτές', value: supplierCount, caption: 'SODTYPE 12', captionStyle: { color: 'var(--muted-foreground)', background: 'var(--info-soft)' },
    },
    {
      key: 'leads', icon: Sparkles, iconStyle: { background: 'var(--warning-soft)', color: 'var(--warning)' },
      label: 'Leads', value: leadCount, caption: 'Υποψήφιοι πελάτες', captionStyle: { color: 'var(--warning)', background: 'var(--warning-soft)' },
    },
    {
      key: 'new', icon: CalendarPlus, iconStyle: { background: 'var(--info-soft)', color: 'var(--info)' },
      label: 'Νέοι μήνα', value: newThisMonth, caption: 'Τρέχων μήνας', captionStyle: { color: 'var(--muted-foreground)', background: 'var(--info-soft)' },
    },
  ] as const

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Καθημερινά <span aria-hidden>›</span> <b className="text-foreground">Συναλλασσόμενοι</b>
          </div>
          <h1 className="text-[22px]">Συναλλασσόμενοι</h1>
        </div>
        <div className="flex-1" />
        <NewPartnerButton mapsConfig={mapsConfig} />
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
            </div>
          </div>
        ))}
      </div>

      <PartnersTable partners={partnerRows} />
    </div>
  )
}
