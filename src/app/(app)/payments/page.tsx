import { LuHourglass, LuCircleCheck, LuCircleX } from 'react-icons/lu'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { getVivaSettings, vivaCheckoutUrl } from '@/lib/viva'
import { relativeTime } from '@/lib/relative-time'
import { formatEuro } from '@/lib/utils'
import { PaymentsTable, type PaymentRow } from './payments-table'
import { NewPaymentButton } from './new-payment-dialog'

// Viva paymentTimeout που στέλνουμε στο createPaymentOrder (βλ. lib/viva.ts) — 30 λεπτά.
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000

export default async function PaymentsPage() {
  const session = await requirePermission('payment.view')
  const canManage = session.user.permissions.includes('payment.manage')

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const staleThreshold = new Date(now.getTime() - PAYMENT_TIMEOUT_MS)

  const [payments, customers, pendingAgg, paidThisMonth, staleCount, vivaSettings] = await Promise.all([
    prisma.paymentOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    prisma.customer.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 500 }),
    prisma.paymentOrder.aggregate({ where: { status: 'PENDING' }, _count: true, _sum: { amountCents: true } }),
    prisma.paymentOrder.count({ where: { status: 'PAID', paidAt: { gte: startOfMonth } } }),
    // «Ληγμένες» = ΔΕΝ υπάρχει EventTypeId λήξης στο documented webhook (μόνο 1796/1797) — heuristic
    // βάσει του paymentTimeout που ζητάμε από τη Viva· ΔΕΝ αλλάζει το status στη DB (μόνο για τον
    // μετρητή του KPI), βλ. σχόλιο στο payments-table.tsx για το πώς φαίνεται στη γραμμή.
    prisma.paymentOrder.count({ where: { status: 'PENDING', createdAt: { lt: staleThreshold } } }),
    getVivaSettings(),
  ])

  const rows: PaymentRow[] = payments.map(p => {
    const environment = p.environment === 'production' ? 'production' : 'demo'
    return {
      id: p.id,
      orderCode: p.orderCode,
      description: p.description,
      customerName: p.customerName,
      customerEmail: p.customerEmail,
      amountCents: p.amountCents,
      environment,
      status: p.status,
      transactionId: p.transactionId,
      checkoutUrl: vivaCheckoutUrl(environment, p.orderCode),
      createdAtLabel: relativeTime(p.createdAt, now),
      stale: p.status === 'PENDING' && p.createdAt < staleThreshold,
    }
  })

  const customerOptions = customers.map(c => ({ id: c.id, name: c.name, email: c.email }))

  const kpis = [
    {
      title: 'Σε αναμονή', value: String(pendingAgg._count), hint: formatEuro(pendingAgg._sum.amountCents ?? 0),
      icon: LuHourglass, color: 'var(--warning)', bg: 'var(--warning-soft)',
    },
    {
      title: 'Πληρωμένες (μήνας)', value: String(paidThisMonth), hint: now.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' }),
      icon: LuCircleCheck, color: 'var(--success)', bg: 'var(--success-soft)',
    },
    {
      title: 'Ληγμένες', value: String(staleCount), hint: '> 30′ σε αναμονή',
      icon: LuCircleX, color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
    },
  ] as const

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Καθημερινά <span aria-hidden>›</span> <b className="text-foreground">Πληρωμές</b>
          </div>
          <h1 className="text-[22px]">Πληρωμές</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Μοναδικοί κωδικοί πληρωμής Viva — κάρτα ή τραπεζική κατάθεση, με αυτόματη παρακολούθηση μέσω webhook.
          </p>
        </div>
        <div className="flex-1" />
        {canManage && (
          <NewPaymentButton customers={customerOptions} bankInstructions={vivaSettings.bankInstructions} />
        )}
      </div>

      <div className="stagger mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map(k => (
          <div key={k.title} className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
            <div className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]" style={{ background: k.bg, color: k.color }}>
              <k.icon className="size-[15px]" aria-hidden />
            </div>
            <div className="text-[11.5px] font-bold text-muted-foreground">{k.title}</div>
            <div className="mt-[3px] text-[33px] leading-none font-[250] tracking-[-0.015em] tabular-nums">{k.value}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ color: k.color, background: k.bg }}>{k.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <PaymentsTable payments={rows} canManage={canManage} />
    </div>
  )
}
