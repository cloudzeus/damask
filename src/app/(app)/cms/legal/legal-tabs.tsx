'use client'

import { useState } from 'react'
import { FileText, Cookie } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'pages', label: 'Σελίδες', icon: FileText },
  { key: 'consent', label: 'Consent Modal', icon: Cookie },
] as const

type TabKey = (typeof TABS)[number]['key']

/** Pill tabs (ίδιο idiom με CmsPostsTabs/SettingsTabs) — τα 2 panels είναι server-rendered μία φορά και περνάνε ως children. */
export function LegalTabs({ pages, consent }: { pages: React.ReactNode; consent: React.ReactNode }) {
  const [active, setActive] = useState<TabKey>('pages')

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-1.5" role="tablist" aria-label="Ενότητες Νομικών">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`legal-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`legal-panel-${tab.key}`}
            className={cn('pill', active === tab.key && 'on')}
            onClick={() => setActive(tab.key)}
          >
            <tab.icon className="size-3.5" strokeWidth={1.8} aria-hidden />
            {tab.label}
          </button>
        ))}
      </div>

      <div id="legal-panel-pages" role="tabpanel" aria-labelledby="legal-tab-pages" hidden={active !== 'pages'}>
        {pages}
      </div>
      <div id="legal-panel-consent" role="tabpanel" aria-labelledby="legal-tab-consent" hidden={active !== 'consent'}>
        {consent}
      </div>
    </div>
  )
}
