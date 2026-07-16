'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MoreVertical, Pencil, Star, UserPlus, Trash2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { deleteContact, setPrimaryContact, requestContactAccess } from '../actions'
import { ContactFormDialog, type EditableContact } from './contact-form-dialog'

export function ContactRowActions({ customerId, contact }: { customerId: string; contact: EditableContact & { hasUser: boolean } }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [requesting, startRequest] = useTransition()

  function handleSetPrimary() {
    startTransition(async () => {
      const res = await setPrimaryContact(contact.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleRequestAccess() {
    startRequest(async () => {
      const res = await requestContactAccess(contact.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteContact(contact.id)
      if (res.ok) {
        toast.success(res.message)
        setDeleteOpen(false)
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
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${contact.name}`}>
              <MoreVertical className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" strokeWidth={1.75} /> Επεξεργασία
          </DropdownMenuItem>
          {!contact.isPrimary && (
            <DropdownMenuItem disabled={pending} onClick={handleSetPrimary}>
              <Star className="size-3.5" strokeWidth={1.75} /> Ορισμός κύριας
            </DropdownMenuItem>
          )}
          {!contact.hasUser && (
            <DropdownMenuItem disabled={requesting} onClick={handleRequestAccess}>
              <UserPlus className="size-3.5" strokeWidth={1.75} /> {requesting ? 'Δημιουργία…' : 'Αίτημα πρόσβασης user'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContactFormDialog mode="edit" customerId={customerId} open={editOpen} onOpenChange={setEditOpen} contact={contact} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{contact.name}»;</AlertDialogTitle>
            <AlertDialogDescription>Η διαγραφή της επαφής δεν αναιρείται.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
