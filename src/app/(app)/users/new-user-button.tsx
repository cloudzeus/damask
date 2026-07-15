'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { UserFormDialog } from './user-form-dialog'

type RoleOption = { id: string; name: string }

export function NewUserButton({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="btn-pill btn-navy" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" strokeWidth={2} aria-hidden /> Νέος χρήστης
      </button>
      <UserFormDialog mode="create" roles={roles} open={open} onOpenChange={setOpen} />
    </>
  )
}
