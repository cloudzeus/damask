'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { buildNav } from '@/lib/objects'

// ΣΗΜΑΝΤΙΚΟ: το nav υπολογίζεται ΕΔΩ (client), όχι στο (app)/layout server component.
// Τα Lucide icons είναι functions — δεν σειριοποιούνται πάνω από το RSC boundary
// (server→client), οπότε ο server περνά μόνο serializable string[] (enabledKeys,
// permissions) και το buildNav (pure) φτιάχνει το nav με τα icon components client-side.
export function Sidebar({
  enabledKeys,
  permissions,
  userName,
  userRole,
}: {
  enabledKeys: string[]
  permissions: string[]
  userName: string
  userRole: string
}) {
  const pathname = usePathname()
  const nav = buildNav(new Set(enabledKeys), permissions)
  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <aside
      className="glass sticky top-3.5 flex h-[calc(100vh-28px)] w-56 shrink-0 flex-col rounded-[26px] p-2.5"
      style={{ margin: '14px 0 14px 14px' }}
    >
      <Link href="/dashboard" className="wordmark px-3 pt-3 pb-4 text-[15px] text-foreground">
        DAMASK
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {nav.map(section => (
          <div key={section.group}>
            <div className="dotted-leader px-3 pt-3 pb-1.5 text-[10px] font-extrabold tracking-[0.11em] text-muted-foreground uppercase">
              {section.group}
            </div>
            {section.items.map(item => {
              // Ακριβές match ή υπο-διαδρομή (π.χ. /cms/posts/new, /cms/posts/[id]/edit) —
              // τα περισσότερα nav items είναι μονο-επίπεδα όπου αυτό ισοδυναμεί με === .
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_6px_18px_rgb(22_50_63_/_25%)]'
                      : 'text-muted-foreground hover:bg-[var(--glass-strong)] hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-[18px] border border-[var(--glass-border)] bg-[var(--glass-strong)] px-3 py-2.5">
        <span className="avatar-ring size-8 text-[11px]">{initials}</span>
        <span className="min-w-0">
          <b className="block truncate text-[12.5px] leading-tight">{userName}</b>
          <small className="block text-[10.5px] text-muted-foreground">{userRole}</small>
        </span>
        <span
          className="status-dot pulse ml-auto"
          style={{ background: 'var(--success)', color: 'var(--success)' }}
          aria-hidden
        />
      </div>
    </aside>
  )
}
