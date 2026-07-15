'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LuSearch, LuCopy, LuCircleCheck, LuCircleX, LuClock3, LuBan } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { PaymentStatus } from '@prisma/client'
import { cn, formatEuro } from '@/lib/utils'
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

  return (
    <div className="glass table-card stagger">
      <div className="table-toolbar">
        <label className="search">
          <LuSearch className="size-3.5 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Αναζήτηση με κωδικό, περιγραφή ή πελάτη…"
            aria-label="Αναζήτηση πληρωμών"
          />
        </label>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Κωδικός πληρωμής</th>
              <th>Περιγραφή</th>
              <th>Πελάτης</th>
              <th className="num">Ποσό</th>
              <th>Περιβάλλον</th>
              <th>Κατάσταση</th>
              <th>Ημερομηνία</th>
              <th className="ctr" style={{ width: 40 }}>⋯</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(payment => {
              const meta = STATUS_META[payment.status]
              return (
                <tr key={payment.id} className="dotted-row-bottom">
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[12px]">{payment.orderCode}</span>
                      <button
                        type="button"
                        className="rowmenu-btn"
                        aria-label={`Αντιγραφή κωδικού πληρωμής ${payment.orderCode}`}
                        onClick={() => copyText(payment.orderCode, 'Ο κωδικός πληρωμής αντιγράφηκε.')}
                      >
                        <LuCopy className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                  <td className="max-w-[240px] truncate" title={payment.description}>{payment.description}</td>
                  <td>{payment.customerName || payment.customerEmail || '—'}</td>
                  <td className="num">{formatEuro(payment.amountCents)}</td>
                  <td>
                    <span className={cn('badge-pill', payment.environment === 'production' ? 'ok' : 'info')}>
                      {payment.environment === 'production' ? 'Παραγωγή' : 'Demo'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={meta.badgeClass}
                      style={meta.style}
                      title={payment.stale ? 'Πάνω από 30 λεπτά σε αναμονή — πιθανώς έληξε στο Viva.' : undefined}
                    >
                      {meta.pulse
                        ? <span className="status-dot pulse" style={{ background: 'var(--warning)', color: 'var(--warning)' }} aria-hidden />
                        : (meta.icon ? <meta.icon className="size-3" aria-hidden /> : null)}
                      {meta.label}
                      {payment.stale ? ' ⚠' : ''}
                    </span>
                  </td>
                  <td>{payment.createdAtLabel}</td>
                  <td className="ctr">
                    <PaymentRowActions payment={payment} canManage={canManage} />
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Δεν βρέθηκαν πληρωμές.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{filtered.length} {filtered.length === 1 ? 'πληρωμή' : 'πληρωμές'}</span>
      </div>
    </div>
  )
}
