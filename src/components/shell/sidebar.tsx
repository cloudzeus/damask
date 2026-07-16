'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Package, FolderTree, Ruler, Users, ClipboardList, Container, Settings, Shield, UserCog, Upload, Images, Newspaper, Scale, Cookie, CreditCard, ScanText, Coins,
} from 'lucide-react'

const NAV = [
  { group: 'Καθημερινά', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: null },
    { href: '/products', label: 'Προϊόντα', icon: Package, permission: 'product.view' },
    { href: '/categories', label: 'Κατηγορίες', icon: FolderTree, permission: 'category.manage' },
    { href: '/units', label: 'Μονάδες μέτρησης', icon: Ruler, permission: 'unit.manage' },
    { href: '/customers', label: 'Πελάτες', icon: Users, permission: 'customer.view' },
    { href: '/orders', label: 'Παραγγελίες', icon: ClipboardList, permission: 'order.view' },
    { href: '/payments', label: 'Πληρωμές', icon: CreditCard, permission: 'payment.view' },
    { href: '/containers', label: 'Containers', icon: Container, permission: 'container.manage' },
    { href: '/import', label: 'Εισαγωγή Excel', icon: Upload, permission: 'import.run' },
    { href: '/media', label: 'Media Gallery', icon: Images, permission: 'media.manage' },
    // TODO: permission 'media.manage' προσωρινό — αλλαγή σε δικό του permission όταν το
    // OCR δεθεί στη ροή παραστατικών (findocs) και αυτό το demo item αποσυρθεί.
    { href: '/ocr-demo', label: 'OCR (δοκιμή)', icon: ScanText, permission: 'media.manage' },
  ] },
  { group: 'CMS', items: [
    { href: '/cms/posts', label: 'Νέα', icon: Newspaper, permission: 'cms.view' },
    { href: '/cms/legal', label: 'Νομικά', icon: Scale, permission: 'cms.view' },
    { href: '/cms/consents', label: 'Συγκαταθέσεις', icon: Cookie, permission: 'cms.view' },
  ] },
  { group: 'Διαχείριση', items: [
    { href: '/users', label: 'Χρήστες', icon: UserCog, permission: 'user.manage' },
    { href: '/roles', label: 'Ρόλοι & Δικαιώματα', icon: Shield, permission: 'user.manage' },
    { href: '/costs', label: 'Κόστη', icon: Coins, permission: 'costs.view' },
    { href: '/settings', label: 'Ρυθμίσεις', icon: Settings, permission: 'settings.manage' },
  ] },
] as const

export function Sidebar({
  permissions,
  userName,
  userRole,
}: {
  permissions: string[]
  userName: string
  userRole: string
}) {
  const pathname = usePathname()
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
        {NAV.map(section => {
          const items = section.items.filter(i => !i.permission || permissions.includes(i.permission))
          if (items.length === 0) return null
          return (
            <div key={section.group}>
              <div className="dotted-leader px-3 pt-3 pb-1.5 text-[10px] font-extrabold tracking-[0.11em] text-muted-foreground uppercase">
                {section.group}
              </div>
              {items.map(item => {
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
  )
}
