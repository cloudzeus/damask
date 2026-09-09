import * as React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

/**
 * Κοινή «κενή κατάσταση» με καθοδήγηση: εικονίδιο + τίτλος + μία πρόταση + (προαιρετικά)
 * κουμπί επόμενης ενέργειας. Αντικαθιστά τα παθητικά «Δεν υπάρχουν…» ώστε ο
 * μη-τεχνικός χρήστης να ξέρει ΤΙ να κάνει μετά.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  actionLabel,
  actionHref,
  action,
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  actionLabel?: string
  actionHref?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
        <Icon className="size-6" strokeWidth={1.6} aria-hidden />
      </span>
      <p className="text-[0.875rem] font-semibold text-foreground">{title}</p>
      {hint && <p className="max-w-[42ch] text-[0.78125rem] text-muted-foreground">{hint}</p>}
      {action
        ? <div className="mt-1">{action}</div>
        : actionLabel && actionHref && (
          <Link href={actionHref} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[0.8125rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            {actionLabel}
          </Link>
        )}
    </div>
  )
}
