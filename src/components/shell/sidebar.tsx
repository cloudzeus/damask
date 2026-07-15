'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Package, FolderTree, Ruler, Users, ClipboardList, Container, Settings, Shield, Upload, Image as ImageIcon,
} from 'lucide-react'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: null },
  { href: '/products', label: 'Προϊόντα', icon: Package, permission: 'product.view' },
  { href: '/categories', label: 'Κατηγορίες', icon: FolderTree, permission: 'category.manage' },
  { href: '/units', label: 'Μονάδες μέτρησης', icon: Ruler, permission: 'unit.manage' },
  { href: '/customers', label: 'Πελάτες', icon: Users, permission: 'customer.view' },
  { href: '/orders', label: 'Παραγγελίες', icon: ClipboardList, permission: 'order.view' },
  { href: '/containers', label: 'Containers', icon: Container, permission: 'container.manage' },
  { href: '/import', label: 'Εισαγωγή Excel', icon: Upload, permission: 'product.edit' },
  { href: '/media-demo', label: 'Media (δοκιμή)', icon: ImageIcon, permission: 'media.manage' },
  { href: '/users', label: 'Χρήστες & Ρόλοι', icon: Shield, permission: 'user.manage' },
  { href: '/settings', label: 'Ρυθμίσεις', icon: Settings, permission: 'settings.manage' },
] as const

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname()
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-sidebar sticky top-0">
      <div className="flex h-14 items-center px-5">
        <Link href="/" className="text-lg font-semibold tracking-[0.18em] text-sidebar-foreground">
          DAMASK
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.filter(i => !i.permission || permissions.includes(i.permission)).map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-h-9 items-center gap-2.5 rounded-md border-l-2 border-transparent px-3 py-2 text-[13.5px] transition-colors',
              pathname === item.href
                ? 'border-(--brass) bg-sidebar-accent font-semibold text-sidebar-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )}
          >
            <item.icon className="size-4" strokeWidth={1.75} />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="px-5 py-3 text-[11.5px] text-muted-foreground">DAMASK PIM · v0.1</div>
    </aside>
  )
}
