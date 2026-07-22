'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuEllipsisVertical, LuFileText, LuTrash2, LuCircleCheck, LuPencilLine,
} from 'react-icons/lu'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { deleteTemplate, type TemplateListItem } from '@/lib/tax/actions'
import { NewGuideDialog } from './new-guide-dialog'

export function GuidesTable({ rows }: { rows: TemplateListItem[] }) {
  const router = useRouter()

  return (
    <div className="glass table-card stagger">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Όνομα</th>
              <th>Κωδικός / Έτος</th>
              <th>Περιγραφή</th>
              <th className="num">Πεδία</th>
              <th>Κατάσταση</th>
              <th className="ctr" style={{ width: 40 }}>⋯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <GuideRow key={r.id} row={r} onDeleted={() => router.refresh()} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center">
                  <div className="mb-3 text-[13px] text-muted-foreground">
                    Δεν υπάρχουν ακόμη οδηγοί εντύπων — δημιούργησε τον πρώτο για να ξεκινήσεις τη χαρτογράφηση πεδίων.
                  </div>
                  <NewGuideDialog />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{rows.length} {rows.length === 1 ? 'οδηγός' : 'οδηγοί'}</span>
      </div>
    </div>
  )
}

function GuideRow({ row, onDeleted }: { row: TemplateListItem; onDeleted: () => void }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  function openGuide() {
    router.push(`/tax-templates/${row.id}`)
  }

  function handleDelete() {
    startDelete(async () => {
      try {
        await deleteTemplate(row.id)
        toast.success('Ο οδηγός διαγράφηκε.')
        setDeleteOpen(false)
        onDeleted()
      } catch {
        toast.error('Η διαγραφή απέτυχε.')
      }
    })
  }

  return (
    <>
      <tr className="dotted-row-bottom cursor-pointer" onClick={openGuide}>
        <td>
          <span className="user-cell">
            <span className="avatar-ring size-8 shrink-0 text-[11px]">
              <LuFileText className="size-3.5" aria-hidden />
            </span>
            <span>
              <b>{row.name}</b>
            </span>
          </span>
        </td>
        <td>
          <span className="font-mono text-[12.5px]">{row.code}</span>
          {row.year != null && <small className="ml-1.5 text-muted-foreground">{row.year}</small>}
        </td>
        <td className="max-w-[280px] truncate text-muted-foreground" title={row.description ?? undefined}>
          {row.description ?? '—'}
        </td>
        <td className="num">{row.fieldCount}</td>
        <td>
          {row.status === 'READY' ? (
            <span className="badge-pill ok">
              <LuCircleCheck className="size-3" aria-hidden /> Έτοιμο
            </span>
          ) : (
            <span className="badge-pill warn">
              <LuPencilLine className="size-3" aria-hidden /> Πρόχειρο
            </span>
          )}
        </td>
        <td className="ctr" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${row.name}`}>
                  <LuEllipsisVertical className="size-4" aria-hidden />
                </button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openGuide}>
                <LuFileText className="size-3.5" aria-hidden /> Άνοιγμα
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <LuTrash2 className="size-3.5" aria-hidden /> Διαγραφή
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{row.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Ο οδηγός και όλα τα χαρτογραφημένα πεδία του θα διαγραφούν οριστικά. Η ενέργεια δεν αναιρείται.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
