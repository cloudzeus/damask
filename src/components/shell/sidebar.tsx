'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildNav } from '@/lib/objects'
import { useMobileNav } from '@/components/shell/mobile-nav'
import { Logo } from '@/components/shell/logo'

// ΣΗΜΑΝΤΙΚΟ: το nav υπολογίζεται ΕΔΩ (client), όχι στο (app)/layout server component.
// Τα Lucide icons είναι functions — δεν σειριοποιούνται πάνω από το RSC boundary
// (server→client), οπότε ο server περνά μόνο serializable string[] (enabledKeys,
// permissions) και το buildNav (pure) φτιάχνει το nav με τα icon components client-side.
const STORAGE_KEY = 'sidebar-collapsed'

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
  const { open, setOpen } = useMobileNav()

  // Collapsible groups — το μενού θα μεγαλώσει. Persist ανά χρήστη· το group που
  // περιέχει την ενεργή σελίδα μένει πάντα ανοιχτό ώστε να φαίνεται πού βρίσκεσαι.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    const restore = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]))
      } catch {
        /* private mode — αγνόησε */
      }
    }
    restore()
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]))
    } catch {
      /* private mode — αγνόησε */
    }
  }, [collapsed])

  function toggle(group: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[55] bg-black/45 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={cn(
          'glass fixed inset-y-0 left-0 z-[60] flex w-64 max-w-[85vw] shrink-0 flex-col rounded-none p-2.5 transition-transform duration-200',
          'lg:sticky lg:top-3.5 lg:z-auto lg:my-3.5 lg:ml-3.5 lg:h-[calc(100vh-28px)] lg:w-56 lg:max-w-none lg:rounded-[26px] lg:!translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
      <Link href="/dashboard" aria-label="World Wide Associates" className="flex items-center px-3 pt-3 pb-4">
        <Logo className="h-9 w-auto" />
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {nav.map(section => {
          const hasActive = section.items.some(i => pathname === i.href || pathname.startsWith(`${i.href}/`))
          const open = hasActive || !collapsed.has(section.group)
          return (
            <div key={section.group}>
              <button
                type="button"
                onClick={() => toggle(section.group)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 pt-3 pb-1.5 text-[10px] font-extrabold tracking-[0.11em] text-muted-foreground uppercase transition-colors hover:text-foreground"
              >
                <span className="truncate">{section.group}</span>
                <ChevronDown className={cn('size-3 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden />
              </button>
              {open && section.items.map(item => {
                // Ακριβές match ή υπο-διαδρομή (π.χ. /cms/posts/new) — τα περισσότερα
                // nav items είναι μονο-επίπεδα όπου αυτό ισοδυναμεί με === .
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
          )
        })}
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
    </>
  )
}
