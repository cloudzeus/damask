'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createRole } from './actions'
import type { RoleData } from './roles-matrix'

const NO_COPY = '__none__'

export function CreateRoleDialog({
  roles,
  open,
  onOpenChange,
}: {
  roles: RoleData[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [b2b, setB2b] = useState(false)
  const [copyFrom, setCopyFrom] = useState<string>(NO_COPY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createRole({
        name,
        description,
        b2b,
        copyFromRoleId: copyFrom === NO_COPY ? '' : copyFrom,
      })
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass w-full max-w-[calc(100%-2rem)] sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Νέος ρόλος</DialogTitle>
          <DialogDescription>Δημιούργησε custom ρόλο και όρισε τα δικαιώματά του.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="create-role-name">Όνομα*</label>
            <div className="inwrap">
              <input
                id="create-role-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="π.χ. SHOP_LEAD"
                required
              />
            </div>
            <div className="help">Λατινικά κεφαλαία/αριθμοί/_ — τα κενά γίνονται _ αυτόματα.</div>
            {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
          </div>

          <div className="field">
            <label htmlFor="create-role-desc">Περιγραφή</label>
            <div className="inwrap">
              <input
                id="create-role-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="π.χ. Υπεύθυνος καταστήματος"
              />
            </div>
            {fieldErrors.description && <div className="error">{fieldErrors.description}</div>}
          </div>

          <div className="field">
            <label htmlFor="create-role-type">Τύπος*</label>
            <Select value={b2b ? 'b2b' : 'internal'} onValueChange={v => setB2b(v === 'b2b')}>
              <SelectTrigger id="create-role-type" aria-label="Τύπος" className="h-11 w-full rounded-full border-border bg-card px-4">
                <SelectValue>{(v: string) => (v === 'b2b' ? 'B2B — πύλη πελατών (/portal)' : 'Εσωτερικός — πίνακας (/dashboard)')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Εσωτερικός — πίνακας (/dashboard)</SelectItem>
                <SelectItem value="b2b">B2B — πύλη πελατών (/portal)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="field">
            <label htmlFor="create-role-copy">Αντιγραφή δικαιωμάτων από</label>
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger id="create-role-copy" aria-label="Αντιγραφή δικαιωμάτων από" className="h-11 w-full rounded-full border-border bg-card px-4">
                <SelectValue>
                  {(v: string) => (v === NO_COPY ? 'Κανένα (κενός ρόλος)' : roles.find(r => r.id === v)?.name ?? '—')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COPY}>Κανένα (κενός ρόλος)</SelectItem>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.copyFromRoleId && <div className="error">{fieldErrors.copyFromRoleId}</div>}
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending}>{pending ? 'Δημιουργία…' : 'Δημιουργία'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
