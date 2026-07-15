'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toggleUserActive, changeUserRole } from './actions'
import { UserFormDialog } from './user-form-dialog'

type RoleOption = { id: string; name: string }

export function UserRowActions({
  userId,
  userName,
  userEmail,
  active,
  roleId,
  roles,
  isSelf,
  phone,
  mobile,
  address,
  city,
  country,
}: {
  userId: string
  userName: string
  userEmail: string
  active: boolean
  roleId: string
  roles: RoleOption[]
  isSelf: boolean
  phone: string | null
  mobile: string | null
  address: string | null
  city: string | null
  country: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState(roleId)

  function handleToggleActive() {
    startTransition(async () => {
      const res = await toggleUserActive(userId)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleChangeRole() {
    startTransition(async () => {
      const res = await changeUserRole(userId, selectedRole)
      if (res.ok) {
        toast.success(res.message)
        setRoleDialogOpen(false)
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${userName}`}>
              <MoreVertical className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
            Επεξεργασία
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf || pending}
            onClick={handleToggleActive}
          >
            {active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setSelectedRole(roleId)
              setRoleDialogOpen(true)
            }}
          >
            Αλλαγή ρόλου
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserFormDialog
        mode="edit"
        roles={roles}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        isSelf={isSelf}
        user={{
          id: userId,
          name: userName,
          email: userEmail,
          roleId,
          active,
          phone,
          mobile,
          address,
          city,
          country,
        }}
      />

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αλλαγή ρόλου</DialogTitle>
            <DialogDescription>
              {userName} — ο νέος ρόλος ισχύει από το επόμενο login του χρήστη.
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedRole} onValueChange={value => setSelectedRole(value as string)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(value: string) => roles.find(role => role.id === value)?.name ?? value}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {roles.map(role => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Άκυρο</Button>} />
            <Button onClick={handleChangeRole} disabled={pending || selectedRole === roleId}>
              Αποθήκευση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
