'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'

/**
 * Shared state για το mobile sidebar drawer (topbar hamburger ↔ Sidebar).
 * Σε desktop (lg+) το sidebar είναι πάντα ορατό· σε mobile ανοίγει ως drawer.
 */
const MobileNavCtx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null)

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  // Κλείσε το drawer σε κάθε αλλαγή route (mobile navigation). setState σε nested
  // function (react-hooks/set-state-in-effect).
  React.useEffect(() => {
    const closeOnNav = () => setOpen(false)
    closeOnNav()
  }, [pathname])
  return <MobileNavCtx.Provider value={{ open, setOpen }}>{children}</MobileNavCtx.Provider>
}

export function useMobileNav() {
  const ctx = React.useContext(MobileNavCtx)
  if (!ctx) return { open: false, setOpen: () => {} }
  return ctx
}

/** Hamburger — εμφανίζεται μόνο σε mobile (lg:hidden). */
export function MobileNavToggle() {
  const { open, setOpen } = useMobileNav()
  return (
    <button
      type="button"
      className="icon-pill lg:hidden"
      aria-label="Μενού"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <Menu className="size-4" strokeWidth={1.8} />
    </button>
  )
}
