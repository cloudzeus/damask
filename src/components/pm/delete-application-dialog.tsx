'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { getApplicationDeletionImpact, deleteApplication, type ApplicationDeletionImpact } from '@/lib/pm/program-link'

/** Επιβεβαίωση διαγραφής έργου: δείχνει τι θα σβηστεί και ζητά «ΔΙΑΓΡΑΦΗ». */
export function DeleteApplicationDialog({ applicationId, open, onOpenChange, onDeleted }: {
  applicationId: string; open: boolean; onOpenChange: (o: boolean) => void; onDeleted: () => void
}) {
  const [impact, setImpact] = React.useState<ApplicationDeletionImpact | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [text, setText] = React.useState('')
  const [pending, start] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    let alive = true
    getApplicationDeletionImpact(applicationId)
      .then(r => { if (alive) setImpact(r) })
      .catch(() => { if (alive) setImpact(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, applicationId])

  const ready = text.trim().toUpperCase() === 'ΔΙΑΓΡΑΦΗ'
  const submit = () => start(async () => {
    const r = await deleteApplication(applicationId, text).catch(() => ({ ok: false, error: 'Η διαγραφή απέτυχε.' }))
    if (!r.ok) { toast.error(r.error ?? 'Η διαγραφή απέτυχε.'); return }
    toast.success('Το έργο διαγράφηκε.')
    onDeleted()
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!pending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TriangleAlert className="size-5 text-[color:var(--destructive)]" aria-hidden /> Οριστική διαγραφή έργου</DialogTitle>
          <DialogDescription>
            {loading ? 'Φόρτωση…' : impact ? <>Θα διαγραφεί το έργο <b>{impact.trdrName}</b> · <b>{impact.programTitle}</b> με όλα τα στοιχεία του. Η ενέργεια <b>δεν αναιρείται</b>.</> : 'Το έργο δεν βρέθηκε.'}
          </DialogDescription>
        </DialogHeader>
        {impact && (
          <div className="flex flex-col gap-3 text-[length:var(--fs-13)]">
            {impact.counts.length > 0 ? (
              <div className="rounded-lg border border-[color:var(--destructive)]/30 bg-[color:var(--destructive)]/5 p-3">
                <div className="mb-1 font-semibold">Θα διαγραφούν επίσης:</div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">{impact.counts.map(c => <li key={c.label}><b className="tabular-nums">{c.n}</b> {c.label}</li>)}</ul>
              </div>
            ) : <p className="text-muted-foreground">Το έργο δεν έχει δαπάνες, παραδοτέα ή άλλα στοιχεία.</p>}
            <p className="text-muted-foreground">Τα email, οι συνομιλίες και τα αιτήματα δικαιολογητικών μένουν ως ιστορικό· ο φάκελος αρχείων του πελάτη δεν αγγίζεται.</p>
            <label className="flex flex-col gap-1.5">
              <span>Πληκτρολογήστε <b>ΔΙΑΓΡΑΦΗ</b> για επιβεβαίωση</span>
              <Input value={text} onChange={e => setText(e.target.value)} autoComplete="off" placeholder="ΔΙΑΓΡΑΦΗ" />
            </label>
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending}>Άκυρο</Button>} />
          <Button type="button" variant="destructive" disabled={!impact || !ready || pending} onClick={submit}>
            {pending && <LoaderCircle className="size-4 animate-spin" />} Διαγραφή έργου
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
