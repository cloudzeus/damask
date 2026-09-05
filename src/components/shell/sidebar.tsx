'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildNav } from '@/lib/objects'
import { useMobileNav } from '@/components/shell/mobile-nav'
import { Logo } from '@/components/shell/logo'

// ΣΗΜΑΝΤΙΚΟ: το nav υπολογίζεται ΕΔΩ (client), όχι στο (app)/layout server component.
// Τα Lucide icons είναι functions — δεν σειριοποιούνται πάνω από το RSC boundary
// (server→client), οπότε ο server περνά μόνο serializable string[] (enabledKeys,
// permissions) και το buildNav (pure) φτιάχνει το nav με τα icon components client-side.
const COLLAPSED_KEY = 'sidebar-collapsed'
const RAIL_KEY = 'sidebar-rail'

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

  // Collapsible groups (μέσα στο expanded sidebar) — persist ανά χρήστη.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  // Rail collapse (desktop mini) — πλήρες logo ανοιχτό / σήμα κλειστό, icon-only.
  const [rail, setRail] = React.useState(false)

  React.useEffect(() => {
    const restore = () => {
      try {
        const raw = localStorage.getItem(COLLAPSED_KEY)
        if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]))
        setRail(localStorage.getItem(RAIL_KEY) === '1')
      } catch {
        /* private mode — αγνόησε */
      }
    }
    restore()
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]))
    } catch { /* αγνόησε */ }
  }, [collapsed])

  React.useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, rail ? '1' : '0')
    } catch { /* αγνόησε */ }
  }, [rail])

  function toggleGroup(group: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  // Οι rail-κλάσεις ισχύουν ΜΟΝΟ σε lg (σε mobile το sidebar είναι πάντα πλήρες drawer).
  const railHide = rail ? 'lg:hidden' : ''

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[55] bg-black/45 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={cn(
          'glass fixed inset-y-0 left-0 z-[60] flex w-64 max-w-[85vw] shrink-0 flex-col rounded-none p-2.5 transition-[transform,width] duration-200',
          'lg:sticky lg:top-3.5 lg:z-auto lg:my-3.5 lg:ml-3.5 lg:h-[calc(100vh-28px)] lg:max-w-none lg:rounded-[26px] lg:!translate-x-0',
          rail ? 'lg:w-[72px]' : 'lg:w-56',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className={cn('flex items-center gap-1 pt-2', rail ? 'lg:justify-center' : 'justify-between')}>
          <Link
            href="/dashboard"
            aria-label="World Wide Associates"
            className={cn('flex items-center gap-2 px-2', rail && 'lg:justify-center lg:px-0')}
          >
            <Logo variant="mark" className="h-10 w-10 shrink-0" />
            <Logo variant="full" className={cn('h-9 w-auto', railHide)} />
          </Link>
          <button
            type="button"
            onClick={() => setRail(r => !r)}
            aria-label={rail ? 'Ανάπτυξη μενού' : 'Σύμπτυξη μενού'}
            className="hidden size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--glass-strong)] hover:text-foreground lg:flex"
          >
            {rail ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <nav className="mt-3 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {nav.map(section => {
            const hasActive = section.items.some(i => pathname === i.href || pathname.startsWith(`${i.href}/`))
            const groupOpen = hasActive || !collapsed.has(section.group)
            return (
              <div key={section.group}>
                <button
                  type="button"
                  onClick={() => toggleGroup(section.group)}
                  aria-expanded={groupOpen}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 pt-3 pb-1.5 text-[10px] font-extrabold tracking-[0.11em] text-muted-foreground uppercase transition-colors hover:text-foreground',
                    railHide,
                  )}
                >
                  <span className="truncate">{section.group}</span>
                  <ChevronDown className={cn('size-3 shrink-0 transition-transform', !groupOpen && '-rotate-90')} aria-hidden />
                </button>
                {(groupOpen || rail) && section.items.map(item => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={cn(
                        'flex items-center gap-2.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors',
                        rail && 'lg:justify-center lg:px-0',
                        active
                          ? 'bg-primary text-primary-foreground shadow-[0_6px_18px_rgb(22_50_63_/_25%)]'
                          : 'text-muted-foreground hover:bg-[var(--glass-strong)] hover:text-foreground',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                      <span className={cn('truncate', railHide)}>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div
          className={cn(
            'mt-auto flex items-center gap-2.5 rounded-[18px] border border-[var(--glass-border)] bg-[var(--glass-strong)] px-3 py-2.5',
            rail && 'lg:justify-center lg:px-2',
          )}
        >
          <span className="avatar-ring size-8 shrink-0 text-[11px]">{initials}</span>
          <span className={cn('min-w-0', railHide)}>
            <b className="block truncate text-[12.5px] leading-tight">{userName}</b>
            <small className="block text-[10.5px] text-muted-foreground">{userRole}</small>
          </span>
          <span
            className={cn('status-dot pulse ml-auto', railHide)}
            style={{ background: 'var(--success)', color: 'var(--success)' }}
            aria-hidden
          />
        </div>
      </aside>
    </>
  )
}
