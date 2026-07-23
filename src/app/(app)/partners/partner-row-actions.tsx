'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { MoreVertical, FileText, ArrowUpRight, Trash2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { ScanActionItem } from '@/components/tax/scan-action-item'
import { AadeCheckActionItem } from '@/components/trdr/aade-check-dialog'
import { GemiSyncActionItem } from '@/components/trdr/gemi-sync-dialog'
import { RegionMatchActionItem } from '@/components/trdr/region-match-action-item'
import { convertLeadToCustomer, deletePartner } from './actions'

export function PartnerRowActions({
  id, name, afm, isProsp, isLocal,
}: {
  id: string
  name: string
  afm: string | null
  isProsp: boolean
  /** trdr === null — δεν έχει συγχρονιστεί με SoftOne, άρα επιτρέπεται διαγραφή. */
  isLocal: boolean
}) {
  const [converting, startConvert] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  function handleConvert() {
    startConvert(async () => {
      const res = await convertLeadToCustomer(id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleDelete() {
    startDelete(async () => {
      const res = await deletePartner(id)
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
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${name}`}>
              <MoreVertical className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/partners/${id}`} />}>
            <FileText className="size-3.5" strokeWidth={1.75} /> Καρτέλα
          </DropdownMenuItem>
          <ScanActionItem trdrId={id} trdrName={name} />
          <DropdownMenuSeparator />
          <AadeCheckActionItem trdrId={id} afm={afm} />
          <GemiSyncActionItem trdrId={id} name={name} />
          <RegionMatchActionItem trdrId={id} name={name} />
          {isProsp && (
            <DropdownMenuItem disabled={converting} onClick={handleConvert}>
              <ArrowUpRight className="size-3.5" strokeWidth={1.75} /> {converting ? 'Μετατροπή…' : 'Μετατροπή σε Πελάτη'}
            </DropdownMenuItem>
          )}
          {isLocal && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isLocal && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Διαγραφή «{name}»;</AlertDialogTitle>
              <AlertDialogDescription>Η διαγραφή της καρτέλας (και των επαφών της) δεν αναιρείται.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Άκυρο</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Διαγραφή…' : 'Διαγραφή'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
