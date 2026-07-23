'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuUserCog } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { assignApplication, listInternalUsers, type InternalUserOption } from '@/lib/pm/actions'

/** Sentinel τιμή για το «— (κανένας) —» option — το base-ui Select δεν
 * επιτρέπει value="" σε Item (ίδιο idiom με required-forms-tab.tsx). */
const NONE_USER = '__none__'

/**
 * «Ανάθεση» dialog (Task 10) — ορίζει διαχειριστή/εισηγητή μιας αίτησης.
 * Το trigger button είναι εδώ (ίδιο idiom με LinkApplicationDialog) ώστε ο
 * caller (ApplicationHub) απλά το τοποθετεί μέσα στο assignment row του
 * χωρίς να κρατάει δικό του open state.
 */
export function AssignApplicationDialog({
  app, onAssigned,
}: {
  app: { id: string; managerId: string | null; processorId: string | null }
  onAssigned: () => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <LuUserCog className="size-3.5" aria-hidden /> Ανάθεση
      </Button>
      <AssignApplicationDialogContent app={app} open={open} onOpenChange={setOpen} onAssigned={onAssigned} />
    </>
  )
}

function AssignApplicationDialogContent({
  app, open, onOpenChange, onAssigned,
}: {
  app: { id: string; managerId: string | null; processorId: string | null }
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
}) {
  const [users, setUsers] = React.useState<InternalUserOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [managerId, setManagerId] = React.useState(app.managerId ?? NONE_USER)
  const [processorId, setProcessorId] = React.useState(app.processorId ?? NONE_USER)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setManagerId(app.managerId ?? NONE_USER)
    setProcessorId(app.processorId ?? NONE_USER)
    setLoading(true)
    listInternalUsers()
      .then(setUsers)
      .catch(() => toast.error('Η φόρτωση χρηστών απέτυχε.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleOpenChange(next: boolean) {
    if (saving) return
    onOpenChange(next)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await assignApplication(app.id, {
        managerId: managerId === NONE_USER ? null : managerId,
        processorId: processorId === NONE_USER ? null : processorId,
      })
      toast.success('Η ανάθεση αποθηκεύτηκε.')
      onAssigned()
      handleOpenChange(false)
    } catch {
      toast.error('Η ανάθεση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Ανάθεση έργου</DialogTitle>
          <DialogDescription>Όρισε διαχειριστή και εισηγητή/διεκπεραιωτή για αυτή την αίτηση.</DialogDescription>
        </DialogHeader>

        <div className="field !mb-0">
          <label htmlFor="assign-manager">Διαχειριστής</label>
          <Select value={managerId} onValueChange={v => setManagerId(v as string)} disabled={loading || saving}>
            <SelectTrigger id="assign-manager" className="h-11 w-full rounded-full border-border bg-card px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_USER}>— (κανένας) —</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="field !mb-0">
          <label htmlFor="assign-processor">Διεκπεραιωτής</label>
          <Select value={processorId} onValueChange={v => setProcessorId(v as string)} disabled={loading || saving}>
            <SelectTrigger id="assign-processor" className="h-11 w-full rounded-full border-border bg-card px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_USER}>— (κανένας) —</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
