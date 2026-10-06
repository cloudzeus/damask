'use client'


import { Phone } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Τηλέφωνο ως σύνδεσμος κλήσης (tel:) — σε κινητό ανοίγει τον dialer. */
export function PhoneLink({ phone, className }: { phone: string | null | undefined; className?: string }) {
  const value = phone?.trim()
  if (!value) return <span className="text-muted-foreground">—</span>
  const tel = value.replace(/[^\d+]/g, '')
  return (
    <a
      href={`tel:${tel}`}
      onClick={e => e.stopPropagation()}
      title={`Κλήση ${value}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 -mx-1.5 text-[0.71875rem] font-semibold tabular-nums text-primary transition-colors hover:bg-primary/10 hover:underline',
        className,
      )}
    >
      <Phone className="size-3 shrink-0" strokeWidth={1.8} aria-hidden />
      {value}
    </a>
  )
}
