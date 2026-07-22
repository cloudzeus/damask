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
import { deleteRole } from './actions'
import type { RoleData } from './roles-matrix'

export function DeleteRoleDialog({
  role,
  roles,
  open,
  onOpenChange,
}: {
  role: RoleData
  roles: RoleData[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reassignTo, setReassignTo] = useState<string>('')
  const [pending, startTransition] = useTransition()

  const otherRoles = roles.filter(r => r.id !== role.id)
  const needsReassign = role.userCount > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (needsReassign && !reassignTo) {
      toast.error('Επίλεξε ρόλο μετακίνησης.')
      return
    }
    startTransition(async () => {
      const res = await deleteRole(role.id, needsReassign ? reassignTo : undefined)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass w-full max-w-[calc(100%-2rem)] sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Διαγραφή ρόλου — {role.name}</DialogTitle>
          <DialogDescription>
            {needsReassign
              ? `Ο ρόλος έχει ${role.userCount} ${role.userCount === 1 ? 'χρήστη' : 'χρήστες'}. Επίλεξε πού μετακινούνται πριν τη διαγραφή.`
              : 'Ο ρόλος δεν έχει χρήστες και θα διαγραφεί οριστικά.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {needsReassign && (
            <div className="field">
              <label htmlFor="delete-role-reassign">Μετακίνηση χρηστών σε*</label>
              <Select value={reassignTo} onValueChange={value => setReassignTo(value as string)}>
                <SelectTrigger id="delete-role-reassign" aria-label="Μετακίνηση χρηστών σε" className="h-11 w-full rounded-full border-border bg-card px-4">
                  <SelectValue>
                    {(v: string) => otherRoles.find(r => r.id === v)?.name ?? 'Επίλεξε ρόλο…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {otherRoles.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
