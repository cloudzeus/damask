'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LuLayoutDashboard, LuFolderKanban, LuFileText, LuUsers, LuRoute, LuCircleHelp, LuSparkles } from 'react-icons/lu'

const ITEMS = [
  { href: '/portal', label: 'Επισκόπηση', icon: LuLayoutDashboard },
  { href: '/portal/erga', label: 'Έργα', icon: LuFolderKanban },
  { href: '/portal/dikaiologitika', label: 'Δικαιολογητικά', icon: LuFileText },
  { href: '/portal/eukairies', label: 'Ευκαιρίες', icon: LuSparkles },
  { href: '/portal/omada', label: 'Η ομάδα σας', icon: LuUsers },
  { href: '/portal/odigoi', label: 'Οδηγοί', icon: LuRoute },
  { href: '/portal/erotiseis', label: 'Ερωτήσεις', icon: LuCircleHelp },
]

/** Μενού του portal (κρατά το ?preview= της προεπισκόπησης προσωπικού). */
export function PortalNav() {
  const path = usePathname() ?? '/portal'
  const preview = useSearchParams()?.get('preview')
  const q = preview ? `?preview=${encodeURIComponent(preview)}` : ''
  return (
    <nav className="p-nav" aria-label="Μενού portal">
      <div className="p-wrap">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/portal' ? path === '/portal' : path.startsWith(href)
          return (
            <Link key={href} href={`${href}${q}`} className={active ? 'on' : undefined} aria-current={active ? 'page' : undefined}>
              <Icon aria-hidden /> {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
