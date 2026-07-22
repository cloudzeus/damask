'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { OBJECT_REGISTRY } from '@/lib/objects'
import { saveEnabledObjects } from './objects-actions'
import { Button } from '@/components/ui/button'

/** `enabled` = stored non-core keys currently on. Core items render locked/always-on. */
export function ObjectsTab({ enabled }: { enabled: string[] }) {
  const [on, setOn] = useState<Set<string>>(() => new Set(enabled))
  const [pending, start] = useTransition()

  function toggle(key: string) {
    setOn(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function save() {
    start(async () => {
      const res = await saveEnabledObjects([...on])
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted-foreground">
        Επίλεξε ποιες οντότητες είναι διαθέσιμες σε αυτή την εγκατάσταση. Οι απενεργοποιημένες
        κρύβονται από το μενού και τα δικαιώματά τους από τους ρόλους. Τα βασικά (🔒) είναι πάντα ενεργά.
      </p>
      {OBJECT_REGISTRY.map(module => (
        <div key={module.key} className="rounded-2xl border border-[var(--glass-border)] p-3">
          <div className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            {module.label}
          </div>
          <div className="flex flex-col gap-1.5">
            {module.items.map(item => {
              const isCore = !!item.core
              const checked = isCore || on.has(item.key)
              return (
                <label
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-[var(--glass-strong)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isCore || pending}
                    onChange={() => toggle(item.key)}
                  />
                  <item.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="font-semibold">{item.label}</span>
                  {item.softone && (
                    <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] text-muted-foreground">
                      SoftOne {item.softone.object}
                    </span>
                  )}
                  {isCore && <Lock className="ml-auto size-3.5 text-muted-foreground" aria-label="Πάντα ενεργό" />}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>
    </div>
  )
}
