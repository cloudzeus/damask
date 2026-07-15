'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { MoreVertical, Pencil, UploadCloud, EyeOff, Trash2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { deleteLegalPage, togglePublishLegalPage } from './actions'
import type { LegalPageRow } from './legal-pages-table'

export function LegalPageRowActions({ page }: { page: LegalPageRow }) {
  const [pending, startTransition] = useTransition()
  const [publishing, startPublish] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  function handleTogglePublish() {
    startPublish(async () => {
      const res = await togglePublishLegalPage(page.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteLegalPage(page.id)
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
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${page.titleEl}`}>
              <MoreVertical className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/cms/legal/${page.id}/edit`} />}>
            <Pencil className="size-3.5" strokeWidth={1.75} /> Επεξεργασία
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={publishing} onClick={handleTogglePublish}>
            {page.published ? (
              <><EyeOff className="size-3.5" strokeWidth={1.75} /> Αναίρεση δημοσίευσης</>
            ) : (
              <><UploadCloud className="size-3.5" strokeWidth={1.75} /> Δημοσίευση</>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{page.titleEl}»;</AlertDialogTitle>
            <AlertDialogDescription>Η διαγραφή της σελίδας (και των μεταφράσεών της) δεν αναιρείται.</AlertDialogDescription>
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
