'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuSave } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateOpske } from '@/lib/pm/actions'

/** opskeStatus είναι ελεύθερο String στο schema (χωρίς enum) — δίνουμε ένα
 * κλειστό σύνολο συνηθισμένων καταστάσεων ΟΠΣΚΕ ως Select ώστε να μένει
 * συνεπές, χωρίς να μπλοκάρουμε το DB field σε νέα τιμή. */
const OPSKE_STATUSES = [
  { value: 'NOT_SUBMITTED', label: 'Μη υποβλήθηκε' },
  { value: 'SUBMITTED', label: 'Υποβλήθηκε' },
  { value: 'UNDER_REVIEW', label: 'Υπό εξέταση' },
  { value: 'APPROVED', label: 'Εγκρίθηκε' },
  { value: 'REJECTED', label: 'Απορρίφθηκε' },
]

/**
 * «ΟΠΣΚΕ» tab (Task 13 — πραγματικό σώμα): κατάσταση/αρ. πρωτοκόλλου/ημ.
 * υποβολής της αίτησης στο ΟΠΣΚΕ, αποθηκεύεται μέσω updateOpske. Controlled
 * φόρμα με τις αρχικές τιμές να έρχονται από το ApplicationDetail που ήδη
 * φορτώνει ο hub (όχι self-fetching — δεν υπάρχει λόγος για ξεχωριστό
 * round-trip αφού ο γονιός τα έχει ήδη).
 */
export function OpskeTab({
  applicationId,
  canManage,
  opskeStatus,
  opskeRef,
  opskeSubmittedAt,
}: {
  applicationId: string
  canManage?: boolean
  opskeStatus?: string | null
  opskeRef?: string | null
  opskeSubmittedAt?: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = React.useState(opskeStatus ?? '')
  const [ref, setRef] = React.useState(opskeRef ?? '')
  const [submittedAt, setSubmittedAt] = React.useState(opskeSubmittedAt ? opskeSubmittedAt.slice(0, 10) : '')
  const [saving, setSaving] = React.useState(false)

  const readOnly = canManage === false

  async function handleSave() {
    setSaving(true)
    try {
      await updateOpske(applicationId, {
        opskeStatus: status.trim() ? status.trim() : null,
        opskeRef: ref.trim() ? ref.trim() : null,
        opskeSubmittedAt: submittedAt ? submittedAt : null,
      })
      toast.success('Τα στοιχεία ΟΠΣΚΕ αποθηκεύτηκαν.')
      router.refresh()
    } catch {
      toast.error('Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        ΟΠΣΚΕ
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="field !mb-0">
          <label htmlFor="opske-status">Κατάσταση ΟΠΣΚΕ</label>
          <Select value={status || undefined} onValueChange={v => setStatus(v ?? '')} disabled={readOnly}>
            <SelectTrigger id="opske-status" className="h-10 w-full rounded-full border-border bg-card px-4">
              <SelectValue placeholder="— Επιλογή —" />
            </SelectTrigger>
            <SelectContent>
              {OPSKE_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="field !mb-0">
          <label htmlFor="opske-ref">Αρ. πρωτοκόλλου</label>
          <Input
            id="opske-ref"
            value={ref}
            onChange={e => setRef(e.target.value)}
            placeholder="π.χ. 12345/2026"
            autoComplete="off"
            disabled={readOnly}
          />
        </div>

        <div className="field !mb-0">
          <label htmlFor="opske-submitted">Ημ/νία υποβολής</label>
          <input
            id="opske-submitted"
            type="date"
            value={submittedAt}
            onChange={e => setSubmittedAt(e.target.value)}
            disabled={readOnly}
            className="h-10 w-full rounded-full border border-border bg-card px-4 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
          />
        </div>
      </div>

      {!readOnly && (
        <div className="mt-3.5 flex justify-end pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <Button type="button" onClick={handleSave} disabled={saving}>
            <LuSave className="size-3.5" aria-hidden /> {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Button>
        </div>
      )}
    </section>
  )
}
