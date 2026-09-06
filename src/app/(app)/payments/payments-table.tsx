'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LuSearch, LuCopy, LuCircleCheck, LuCircleX, LuClock3, LuBan } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { PaymentStatus } from '@prisma/client'
import { cn, formatEuro } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { PaymentRowActions } from './payment-row-actions'

export type PaymentRow = {
  id: string
  orderCode: string
  description: string
  customerName: string | null
  customerEmail: string | null
  amountCents: number
  environment: 'demo' | 'production'
  status: PaymentStatus
  transactionId: string | null
  checkoutUrl: string
  createdAtLabel: string
  /** Ακόμα PENDING αλλά περασμένο το paymentTimeout — heuristic hint μόνο (βλ. page.tsx), δεν αλλάζει το status. */
  stale: boolean
}

const STATUS_META: Record<PaymentStatus, { label: string; badgeClass: string; style?: React.CSSProperties; pulse?: boolean; icon?: IconType }> = {
  PENDING: { label: 'Σε αναμονή', badgeClass: 'badge-pill warn', pulse: true },
  PAID: { label: 'Πληρωμένη', badgeClass: 'badge-pill ok', icon: LuCircleCheck },
  FAILED: {
    label: 'Απέτυχε', badgeClass: 'badge-pill',
    style: { color: 'var(--destructive)', background: 'color-mix(in srgb, var(--destructive) 12%, transparent)' },
    icon: LuCircleX,
  },
  EXPIRED: { label: 'Έληξε', badgeClass: 'badge-pill muted', icon: LuClock3 },
  CANCELED: { label: 'Ακυρώθηκε', badgeClass: 'badge-pill muted', icon: LuBan },
}

function copyText(text: string, okMessage: string) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success(okMessage))
    .catch(() => toast.error('Αποτυχία αντιγραφής.'))
}

export function PaymentsTable({ payments, canManage }: { payments: PaymentRow[]; canManage: boolean }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(p =>
      p.orderCode.includes(q)
      || p.description.toLowerCase().includes(q)
      || (p.customerName ?? '').toLowerCase().includes(q)
      || (p.customerEmail ?? '').toLowerCase().includes(q),
    )
  }, [payments, query])

  const columns: DataTableColumn<PaymentRow>[] = [
    {
      id: 'orderCode',
      header: 'Κωδικός πληρωμής',
      width: 180,
      sortValue: p => p.orderCode,
      cell: p => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[0.75rem]">{p.orderCode}</span>
          <button
            type="button"
            className="rowmenu-btn"
            aria-label={`Αντιγραφή κωδικού πληρωμής ${p.orderCode}`}
            onClick={() => copyText(p.orderCode, 'Ο κωδικός πληρωμής αντιγράφηκε.')}
          >
            <LuCopy className="size-3.5" aria-hidden />
          </button>
        </div>
      ),
    },
    {
      id: 'description',
      header: 'Περιγραφή',
      width: 240,
      sortValue: p => p.description,
      cell: p => <span className="block max-w-[240px] truncate" title={p.description}>{p.description}</span>,
    },
    {
      id: 'customer',
      header: 'Πελάτης',
      width: 180,
      sortValue: p => p.customerName || p.customerEmail || '',
      cell: p => p.customerName || p.customerEmail || '—',
    },
    {
      id: 'amount',
      header: 'Ποσό',
      align: 'right',
      width: 110,
      sortValue: p => p.amountCents,
      cell: p => formatEuro(p.amountCents),
    },
    {
      id: 'environment',
      header: 'Περιβάλλον',
      width: 120,
      sortValue: p => p.environment,
      cell: p => (
        <span className={cn('badge-pill', p.environment === 'production' ? 'ok' : 'info')}>
          {p.environment === 'production' ? 'Παραγωγή' : 'Demo'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 140,
      sortValue: p => STATUS_META[p.status].label,
      cell: p => {
        const meta = STATUS_META[p.status]
        return (
          <span
            className={meta.badgeClass}
            style={meta.style}
            title={p.stale ? 'Πάνω από 30 λεπτά σε αναμονή — πιθανώς έληξε στο Viva.' : undefined}
          >
            {meta.pulse
              ? <span className="status-dot pulse" style={{ background: 'var(--warning)', color: 'var(--warning)' }} aria-hidden />
              : (meta.icon ? <meta.icon className="size-3" aria-hidden /> : null)}
            {meta.label}
            {p.stale ? ' ⚠' : ''}
          </span>
        )
      },
    },
    {
      id: 'date',
      header: 'Ημερομηνία',
      width: 150,
      sortValue: p => p.createdAtLabel,
      cell: p => p.createdAtLabel,
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 48,
      enableHide: false,
      enableResize: false,
      cell: p => <PaymentRowActions payment={p} canManage={canManage} />,
    },
  ]

  return (
    <DataTable
      tableId="payments"
      columns={columns}
      rows={filtered}
      rowKey={p => p.id}
      emptyMessage="Δεν βρέθηκαν πληρωμές."
      footer={<span>{filtered.length} {filtered.length === 1 ? 'πληρωμή' : 'πληρωμές'}</span>}
      toolbarExtras={
        <label className="search">
          <LuSearch className="size-3.5 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Αναζήτηση με κωδικό, περιγραφή ή πελάτη…"
            aria-label="Αναζήτηση πληρωμών"
          />
        </label>
      }
    />
  )
}
