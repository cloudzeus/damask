'use client'

import { useState } from 'react'
import { Boxes, Building2, Plug, Search } from 'lucide-react'
import { LuDatabaseBackup } from 'react-icons/lu'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'company', label: 'Εταιρεία', icon: Building2 },
  { key: 'integrations', label: 'Διασυνδέσεις', icon: Plug },
  { key: 'seo', label: 'SEO & Analytics', icon: Search },
  { key: 'backups', label: 'Backups', icon: LuDatabaseBackup },
] as const

const OBJECTS_TAB = { key: 'objects', label: 'Αντικείμενα', icon: Boxes } as const

type TabKey = (typeof TABS)[number]['key'] | typeof OBJECTS_TAB['key']

/**
 * Pill tabs, client-side (MASTER §4β «Pills παντού»/ίδιο idiom με τα tabs
 * gallery/upload του MediaPicker). Και τα tab panels είναι server-rendered
 * ΜΙΑ φορά στο page.tsx (παράλληλα) και περνάνε εδώ ως children — η εναλλαγή
 * tab είναι απλή εναλλαγή ορατότητας (`hidden`), όχι re-fetch. Το «Αντικείμενα»
 * tab (SUPER_ADMIN only) εμφανίζεται μόνο όταν περνιέται το `objects` prop.
 */
export function SettingsTabs({
  company, integrations, seo, backups, objects,
}: {
  company: React.ReactNode
  integrations: React.ReactNode
  seo: React.ReactNode
  backups: React.ReactNode
  objects?: React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>('company')
  const tabs = objects !== undefined ? [...TABS, OBJECTS_TAB] : TABS

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-1.5" role="tablist" aria-label="Ενότητες ρυθμίσεων">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`settings-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`settings-panel-${tab.key}`}
            className={cn('pill', active === tab.key && 'on')}
            onClick={() => setActive(tab.key)}
          >
            <tab.icon className="size-3.5" strokeWidth={1.8} aria-hidden />
            {tab.label}
          </button>
        ))}
      </div>

      <div id="settings-panel-company" role="tabpanel" aria-labelledby="settings-tab-company" hidden={active !== 'company'}>
        {company}
      </div>
      <div id="settings-panel-integrations" role="tabpanel" aria-labelledby="settings-tab-integrations" hidden={active !== 'integrations'}>
        {integrations}
      </div>
      <div id="settings-panel-seo" role="tabpanel" aria-labelledby="settings-tab-seo" hidden={active !== 'seo'}>
        {seo}
      </div>
      <div id="settings-panel-backups" role="tabpanel" aria-labelledby="settings-tab-backups" hidden={active !== 'backups'}>
        {backups}
      </div>
      {objects !== undefined && (
        <div id="settings-panel-objects" role="tabpanel" aria-labelledby="settings-tab-objects" hidden={active !== 'objects'}>
          {objects}
        </div>
      )}
    </div>
  )
}
