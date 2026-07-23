'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { VisibleApplicationItem, BoardObligation } from '@/lib/pm/actions'
import { ApplicationsTable } from './applications-table'
import { ObligationsBoard } from './obligations-board'
import { DeadlinesView } from './deadlines-view'

/**
 * `/pm` tabbed workspace (C2b) — τρεις προβολές πάνω στα ίδια δεδομένα που
 * φέρνει το RSC (pm/page.tsx): «Έργα» (υπάρχων πίνακας αιτήσεων), «Πίνακας»
 * (global status Kanban με swimlanes ανά ανάθεση) και «Προθεσμίες» (deadline
 * radar). Ίδιο lightweight pill-row tab idiom με το TabBar του
 * program-editor.tsx (δεν υπάρχει Tabs primitive στο src/components/ui).
 */

type ViewKey = 'applications' | 'board' | 'deadlines'

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'applications', label: 'Έργα' },
  { key: 'board', label: 'Πίνακας' },
  { key: 'deadlines', label: 'Προθεσμίες' },
]

function ViewBar({ active, onChange }: { active: ViewKey; onChange: (key: ViewKey) => void }) {
  return (
    <div role="tablist" aria-label="Προβολές" className="glass mb-4 flex w-fit gap-1 rounded-full p-1.5">
      {VIEWS.map(v => (
        <button
          key={v.key}
          type="button"
          role="tab"
          aria-selected={active === v.key}
          onClick={() => onChange(v.key)}
          className={cn(
            'rounded-full px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
            active === v.key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function PmWorkspace({
  applications, obligations,
}: {
  applications: VisibleApplicationItem[]
  obligations: BoardObligation[]
}) {
  const router = useRouter()
  const [view, setView] = React.useState<ViewKey>('applications')

  return (
    <div>
      <ViewBar active={view} onChange={setView} />
      {view === 'applications' && <ApplicationsTable rows={applications} />}
      {view === 'board' && (
        <ObligationsBoard obligations={obligations} swimlaneBy="assignee" onStatusChange={() => router.refresh()} />
      )}
      {view === 'deadlines' && <DeadlinesView obligations={obligations} />}
    </div>
  )
}
