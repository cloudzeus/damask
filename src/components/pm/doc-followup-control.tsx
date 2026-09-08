'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuBellRing, LuLoaderCircle } from 'react-icons/lu'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setDocFollowupDays } from '@/lib/pm/actions'

/**
 * Ρύθμιση συχνότητας υπενθύμισης επανεπικοινωνίας δικαιολογητικών ανά αίτηση
 * (πρόγραμμα × πελάτης). Ο διαχειριστής ορίζει κάθε πόσες ημέρες θα δημιουργείται
 * alert στον manager + διεκπεραιωτή όσο υπάρχουν μη-εγκεκριμένα υποχρεωτικά
 * δικαιολογητικά. Default 7 (εβδομαδιαία), 0 = απενεργοποιημένο.
 */
export function DocFollowupControl({
  applicationId, initialDays, canManage,
}: {
  applicationId: string
  initialDays: number
  canManage: boolean
}) {
  const [days, setDays] = React.useState(String(initialDays))
  const [saving, setSaving] = React.useState(false)
  const [savedDays, setSavedDays] = React.useState(initialDays)

  const parsed = Math.max(0, Math.min(365, Math.round(Number(days) || 0)))
  const dirty = parsed !== savedDays

  async function handleSave() {
    setSaving(true)
    try {
      const res = await setDocFollowupDays(applicationId, parsed)
      setSavedDays(res.days)
      setDays(String(res.days))
      toast.success(res.days === 0 ? 'Οι υπενθυμίσεις απενεργοποιήθηκαν.' : `Υπενθύμιση κάθε ${res.days} ημέρες.`)
    } catch {
      toast.error('Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-[0.71875rem] font-semibold text-foreground">
          <LuBellRing className="size-3.5 text-muted-foreground" aria-hidden />
          Υπενθύμιση επανεπικοινωνίας δικαιολογητικών
        </span>
        {canManage ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[0.71875rem] text-muted-foreground">κάθε</span>
            <Input
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={e => setDays(e.target.value)}
              className="h-8 w-16 text-center text-[0.78125rem]"
              aria-label="Ημέρες υπενθύμισης"
            />
            <span className="text-[0.71875rem] text-muted-foreground">ημέρες (0 = ανενεργό)</span>
            {dirty && (
              <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : 'Αποθήκευση'}
              </Button>
            )}
          </div>
        ) : (
          <span className="badge-pill muted">{savedDays === 0 ? 'Ανενεργό' : `κάθε ${savedDays} ημέρες`}</span>
        )}
      </div>
      <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
        Όσο υπάρχουν μη-εγκεκριμένα υποχρεωτικά δικαιολογητικά, δημιουργείται alert στον διαχειριστή &amp; διεκπεραιωτή του έργου (in-app + email).
      </p>
    </section>
  )
}
