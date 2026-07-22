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
import { deleteProgram, type ProgramListItem } from '@/lib/programs/actions'
import { NewProgramDialog } from './new-program-dialog'

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

  return (
    <div className="glass table-card stagger">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Τίτλος</th>
              <th>Κωδικός</th>
              <th className="num">Π/Υ</th>
              <th className="num">Επιχορήγηση</th>
              <th>Λήξη υποβολής</th>
              <th>Κατάσταση</th>
              <th>Αποδελτίωση</th>
              <th className="ctr" style={{ width: 40 }}>⋯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <ProgramRow key={r.id} row={r} onDeleted={() => router.refresh()} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center">
                  <div className="mb-3 text-[13px] text-muted-foreground">
                    Δεν υπάρχουν ακόμη προγράμματα — δημιούργησε το πρώτο ανεβάζοντας την προκήρυξή του.
                  </div>
                  <NewProgramDialog />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{rows.length} {rows.length === 1 ? 'πρόγραμμα' : 'προγράμματα'}</span>
      </div>
    </div>
  )
}

function ProgramRow({ row, onDeleted }: { row: ProgramListItem; onDeleted: () => void }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const extract = EXTRACT_META[row.extractStatus] ?? EXTRACT_META.PENDING
  const status = STATUS_META[row.status] ?? STATUS_META.DRAFT
  const ExtractIcon = extract.icon

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
      <tr className="dotted-row-bottom cursor-pointer" onClick={openProgram}>
        <td>
          <span className="user-cell">
            <span className="avatar-ring size-8 shrink-0 text-[11px]">
              <LuLandmark className="size-3.5" aria-hidden />
            </span>
            <span>
              <b>{row.title}</b>
            </span>
          </span>
        </td>
        <td className="font-mono text-[12.5px]">{row.referenceCode ?? '—'}</td>
        <td className="num">{formatBudget(row.totalBudget)}</td>
        <td className="num">{formatRate(row.fundingRate)}</td>
        <td>{formatDate(row.submissionEnd)}</td>
        <td>
          <span className={status.badgeClass}>{status.label}</span>
        </td>
        <td>
          <span className={cn(extract.badgeClass)} style={extract.style}>
            <ExtractIcon className={cn('size-3', row.extractStatus === 'RUNNING' && 'animate-spin')} aria-hidden /> {extract.label}
          </span>
        </td>
        <td className="ctr" onClick={e => e.stopPropagation()}>
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
        </td>
      </tr>

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
