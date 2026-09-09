'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuEllipsisVertical, LuLandmark, LuTrash2, LuClock3, LuLoaderCircle, LuCircleCheck, LuCircleX,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { deleteProgram, type ProgramListItem } from '@/lib/programs/actions'
import { ProgramWizard } from './program-wizard'

const EXTRACT_META: Record<string, { label: string; badgeClass: string; style?: React.CSSProperties; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { label: 'Εκκρεμεί', badgeClass: 'badge-pill warn', icon: LuClock3 },
  RUNNING: { label: 'Σε εξέλιξη', badgeClass: 'badge-pill info', icon: LuLoaderCircle },
  DONE: { label: 'Ολοκληρώθηκε', badgeClass: 'badge-pill ok', icon: LuCircleCheck },
  FAILED: {
    label: 'Απέτυχε', badgeClass: 'badge-pill',
    style: { color: 'var(--destructive)', background: 'color-mix(in srgb, var(--destructive) 12%, transparent)' },
    icon: LuCircleX,
  },
}

const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  DRAFT: { label: 'Πρόχειρο', badgeClass: 'badge-pill muted' },
  ACTIVE: { label: 'Ενεργό', badgeClass: 'badge-pill ok' },
  CLOSED: { label: 'Κλειστό', badgeClass: 'badge-pill muted' },
}

function formatBudget(v: number | null): string {
  if (v == null) return '—'
  return `${v.toLocaleString('el-GR')} €`
}

function formatRate(v: number | null): string {
  if (v == null) return '—'
  return `${v.toLocaleString('el-GR')}%`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('el-GR')
}

export function ProgramsTable({ rows }: { rows: ProgramListItem[] }) {
  const router = useRouter()

  const columns: DataTableColumn<ProgramListItem>[] = [
    {
      id: 'title',
      header: 'Τίτλος',
      width: 280,
      enableHide: false,
      sortValue: r => r.title,
      cell: r => (
        <span className="user-cell">
          <span className="avatar-ring size-8 shrink-0 text-[0.6875rem]">
            <LuLandmark className="size-3.5" aria-hidden />
          </span>
          <span>
            <b>{r.title}</b>
          </span>
        </span>
      ),
    },
    {
      id: 'code',
      header: 'Κωδικός',
      width: 150,
      sortValue: r => r.referenceCode,
      cell: r => <span className="font-mono text-[0.78125rem]">{r.referenceCode ?? '—'}</span>,
    },
    { id: 'budget', header: 'Π/Υ', align: 'right', width: 130, sortValue: r => r.totalBudget, cell: r => formatBudget(r.totalBudget) },
    { id: 'rate', header: 'Επιχορήγηση', align: 'right', width: 130, sortValue: r => r.fundingRate, cell: r => formatRate(r.fundingRate) },
    { id: 'deadline', header: 'Λήξη υποβολής', width: 150, sortValue: r => r.submissionEnd, cell: r => formatDate(r.submissionEnd) },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 120,
      sortValue: r => r.status,
      cell: r => {
        const status = STATUS_META[r.status] ?? STATUS_META.DRAFT
        return <span className={status.badgeClass}>{status.label}</span>
      },
    },
    {
      id: 'extract',
      header: 'Αποδελτίωση',
      width: 160,
      sortValue: r => r.extractStatus,
      cell: r => {
        const extract = EXTRACT_META[r.extractStatus] ?? EXTRACT_META.PENDING
        const ExtractIcon = extract.icon
        return (
          <span className={cn(extract.badgeClass)} style={extract.style}>
            <ExtractIcon className={cn('size-3', r.extractStatus === 'RUNNING' && 'animate-spin')} aria-hidden /> {extract.label}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 48,
      enableHide: false,
      enableResize: false,
      cell: r => (
        <span onClick={e => e.stopPropagation()}>
          <ProgramRowActions row={r} onDeleted={() => router.refresh()} />
        </span>
      ),
    },
  ]

  return (
    <DataTable
      tableId="programs"
      columns={columns}
      rows={rows}
      rowKey={r => r.id}
      onRowClick={r => router.push(`/programs/${r.id}`)}
      emptyMessage={
        <div>
          <div className="mb-3 text-[0.8125rem] text-muted-foreground">
            Δεν υπάρχουν ακόμη προγράμματα — δημιούργησε το πρώτο ανεβάζοντας την προκήρυξή του.
          </div>
          <ProgramWizard />
        </div>
      }
      footer={<span>{rows.length} {rows.length === 1 ? 'πρόγραμμα' : 'προγράμματα'}</span>}
    />
  )
}

function ProgramRowActions({ row, onDeleted }: { row: ProgramListItem; onDeleted: () => void }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  function openProgram() {
    router.push(`/programs/${row.id}`)
  }

  function handleDelete() {
    startDelete(async () => {
      try {
        await deleteProgram(row.id)
        toast.success('Το πρόγραμμα διαγράφηκε.')
        setDeleteOpen(false)
        onDeleted()
      } catch {
        toast.error('Η διαγραφή απέτυχε.')
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${row.title}`}>
              <LuEllipsisVertical className="size-4" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={openProgram}>
            <LuLandmark className="size-3.5" aria-hidden /> Άνοιγμα
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
            <AlertDialogTitle>Διαγραφή «{row.title}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Το πρόγραμμα, το εξαγμένο περιεχόμενό του και οι σχετικές αιτήσεις/δαπάνες θα διαγραφούν οριστικά. Η ενέργεια δεν αναιρείται.
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
