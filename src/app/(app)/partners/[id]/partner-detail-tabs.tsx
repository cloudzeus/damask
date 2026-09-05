'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Tabbed pane για την καρτέλα πελάτη — συγκεντρώνει τις (πρώην απλωμένες)
 * ενότητες σε ένα σημείο: Στοιχεία / ΓΕΜΗ & ΑΑΔΕ / ΚΑΔ / Έγγραφα ΓΕΜΗ /
 * Χάρτης / Επαφές. Τα panels έρχονται ΕΤΟΙΜΑ (React elements) από το RSC
 * (page.tsx) — έτσι κρατάμε το data-fetching server-side και απλώς εναλλάσσουμε
 * ποιο θα δείξουμε. Μόνο το ενεργό panel γίνεται mount (π.χ. ο χάρτης/Leaflet
 * δεν φορτώνει μέχρι να επιλεγεί το tab). Το ενεργό tab persist-άρεται τοπικά.
 */

type TabKey = 'info' | 'gemi' | 'kad' | 'docs' | 'map' | 'contacts'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info', label: 'Στοιχεία' },
  { key: 'gemi', label: 'ΓΕΜΗ & ΑΑΔΕ' },
  { key: 'kad', label: 'ΚΑΔ' },
  { key: 'docs', label: 'Έγγραφα ΓΕΜΗ' },
  { key: 'map', label: 'Χάρτης' },
  { key: 'contacts', label: 'Επαφές' },
]

const STORAGE_KEY = 'partner-detail-tab'

export function PartnerDetailTabs({
  info, gemi, kad, docs, map, contacts,
}: {
  info: React.ReactNode
  gemi: React.ReactNode
  kad: React.ReactNode
  docs: React.ReactNode
  map: React.ReactNode
  contacts: React.ReactNode
}) {
  const [active, setActive] = React.useState<TabKey>('info')

  // Load persisted tab σε effect (όχι lazy init) για να μη σπάει η hydration·
  // το setState μπαίνει σε nested function (react-hooks lint).
  React.useEffect(() => {
    const restore = () => {
      try {
        const v = localStorage.getItem(STORAGE_KEY)
        if (v && TABS.some(t => t.key === v)) setActive(v as TabKey)
      } catch {
        /* private mode — αγνόησε */
      }
    }
    restore()
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, active)
    } catch {
      /* private mode — αγνόησε */
    }
  }, [active])

  const panels: Record<TabKey, React.ReactNode> = { info, gemi, kad, docs, map, contacts }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Ενότητες πελάτη" className="glass flex flex-wrap gap-1 rounded-full p-1.5">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              'rounded-full px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
              active === t.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{panels[active]}</div>
    </div>
  )
}
