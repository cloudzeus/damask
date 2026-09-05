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
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { deleteTemplate, type TemplateListItem } from '@/lib/tax/actions'
import { NewGuideDialog } from './new-guide-dialog'

export function GuidesTable({ rows }: { rows: TemplateListItem[] }) {
  const router = useRouter()

  const columns: DataTableColumn<TemplateListItem>[] = [
    {
      id: 'name',
      header: 'Όνομα',
      width: 260,
      enableHide: false,
      sortValue: r => r.name,
      cell: r => (
        <span className="user-cell">
          <span className="avatar-ring size-8 shrink-0 text-[11px]">
            <LuFileText className="size-3.5" aria-hidden />
          </span>
          <span>
            <b>{r.name}</b>
          </span>
        </span>
      ),
    },
    {
      id: 'code',
      header: 'Κωδικός / Έτος',
      width: 160,
      sortValue: r => r.code,
      cell: r => (
        <>
          <span className="font-mono text-[12.5px]">{r.code}</span>
          {r.year != null && <small className="ml-1.5 text-muted-foreground">{r.year}</small>}
        </>
      ),
    },
    {
      id: 'description',
      header: 'Περιγραφή',
      width: 280,
      sortValue: r => r.description ?? '',
      cell: r => (
        <span className="block max-w-[280px] truncate text-muted-foreground" title={r.description ?? undefined}>
          {r.description ?? '—'}
        </span>
      ),
    },
    {
      id: 'fieldCount',
      header: 'Πεδία',
      align: 'right',
      width: 90,
      sortValue: r => r.fieldCount,
      cell: r => r.fieldCount,
    },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 130,
      sortValue: r => r.status,
      cell: r => (
        r.status === 'READY' ? (
          <span className="badge-pill ok">
            <LuCircleCheck className="size-3" aria-hidden /> Έτοιμο
          </span>
        ) : (
          <span className="badge-pill warn">
            <LuPencilLine className="size-3" aria-hidden /> Πρόχειρο
          </span>
        )
      ),
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 48,
      enableHide: false,
      enableResize: false,
      cell: r => <GuideActionsCell row={r} onDeleted={() => router.refresh()} />,
    },
  ]

  return (
    <DataTable
      tableId="tax-guides"
      columns={columns}
      rows={rows}
      rowKey={r => r.id}
      onRowClick={r => router.push(`/tax-templates/${r.id}`)}
      emptyMessage={
        <div>
          <div className="mb-3 text-[13px] text-muted-foreground">
            Δεν υπάρχουν ακόμη οδηγοί εντύπων — δημιούργησε τον πρώτο για να ξεκινήσεις τη χαρτογράφηση πεδίων.
          </div>
          <NewGuideDialog />
        </div>
      }
      footer={<span>{rows.length} {rows.length === 1 ? 'οδηγός' : 'οδηγοί'}</span>}
    />
  )
}

function GuideActionsCell({ row, onDeleted }: { row: TemplateListItem; onDeleted: () => void }) {
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
    <span onClick={e => e.stopPropagation()}>
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
    </span>
  )
}
