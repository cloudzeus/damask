'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuEllipsisVertical, LuLandmark, LuTrash2, LuClock3, LuLoaderCircle, LuCircleCheck, LuCircleX, LuArrowUpDown, LuCheck,
} from 'react-icons/lu'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { deleteProgram, setProgramOnSite, savePublicOrder, type ProgramListItem } from '@/lib/programs/actions'
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

/** Διακόπτης «φαίνεται στο website» ανά πρόγραμμα (αισιόδοξη ενημέρωση). */
function SiteSwitch({ row, onChanged }: { row: ProgramListItem; onChanged: () => void }) {
  const [on, setOn] = useState(row.status === 'ACTIVE' && !row.hiddenFromSite)
  const [busy, setBusy] = useState(false)
  const disabled = row.status !== 'ACTIVE'
  return (
    <span className="inline-flex items-center gap-2" onClick={e => e.stopPropagation()} title={disabled ? 'Μόνο τα ενεργά προγράμματα εμφανίζονται στο website' : on ? (row.onSite ? 'Εμφανίζεται στο website' : 'Θα εμφανιστεί — η υποβολή όμως έχει λήξει') : 'Κρυφό από το website'}>
      <Switch
        checked={on && !disabled}
        disabled={disabled || busy}
        aria-label={`Εμφάνιση στο website: ${row.title}`}
        onCheckedChange={async (v: boolean) => {
          setOn(v); setBusy(true)
          const r = await setProgramOnSite(row.id, v).catch(() => ({ ok: false, message: 'Η αλλαγή απέτυχε.' }))
          setBusy(false)
          if (!r.ok) { setOn(!v); toast.error(r.message ?? 'Η αλλαγή απέτυχε.'); return }
          toast.success(v ? 'Εμφανίζεται στο website.' : 'Κρύφτηκε από το website.')
          onChanged()
        }}
      />
      <span className="text-[length:var(--fs-11-5)] text-muted-foreground">{disabled ? '—' : on ? 'Ναι' : 'Κρυφό'}</span>
    </span>
  )
}

export function ProgramsTable({ rows }: { rows: ProgramListItem[] }) {
  const router = useRouter()
  // Λειτουργία «Σειρά στο website»: μόνο όσα φαίνονται στο site, με τη σειρά τους, σύρσιμο από λαβή.
  const [ordering, setOrdering] = useState(false)
  const [order, setOrder] = useState<string[] | null>(null)
  const siteRows = rows
    .filter(r => r.onSite)
    .sort((a, b) => (a.publicOrder ?? 1e9) - (b.publicOrder ?? 1e9))
  const orderedSiteRows = order ? order.map(id => siteRows.find(r => r.id === id)).filter((r): r is ProgramListItem => !!r) : siteRows
  async function reorder(keys: string[]) {
    setOrder(keys)
    const r = await savePublicOrder(keys).catch(() => ({ ok: false }))
    if (!r.ok) { toast.error('Η αποθήκευση της σειράς απέτυχε.'); setOrder(null); return }
    toast.success('Η σειρά στο website αποθηκεύτηκε.')
    router.refresh()
  }

  const columns: DataTableColumn<ProgramListItem>[] = [
    {
      id: 'title',
      header: 'Τίτλος',
      width: 280,
      enableHide: false,
      sortValue: r => r.title,
      cell: r => (
        <span className="user-cell">
          <span className="avatar-ring size-8 shrink-0 text-[length:var(--fs-11)]">
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
      cell: r => <span className="font-mono text-[length:var(--fs-12-5)]">{r.referenceCode ?? '—'}</span>,
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
      id: 'site',
      header: 'Website',
      width: 120,
      sortValue: r => (r.onSite ? 2 : r.status === 'ACTIVE' ? 1 : 0),
      cell: r => <SiteSwitch key={`${r.id}-${r.hiddenFromSite}-${r.status}`} row={r} onChanged={() => router.refresh()} />,
    },
    ...(ordering ? [{ id: 'pos', header: '#', width: 56, align: 'center' as const, cell: (r: ProgramListItem) => <span className="tabular-nums font-semibold">{orderedSiteRows.indexOf(r) + 1}</span> }] : []),
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
      rows={ordering ? orderedSiteRows : rows}
      rowKey={r => r.id}
      reorder={ordering ? { onReorder: keys => { void reorder(keys) } } : undefined}
      onRowClick={r => router.push(`/programs/${r.id}`)}
      toolbarExtras={
        <Button type="button" size="sm" variant={ordering ? 'default' : 'outline'} onClick={() => { setOrdering(o => !o); setOrder(null) }}>
          {ordering ? <><LuCheck className="size-3.5" aria-hidden /> Τέλος σειράς</> : <><LuArrowUpDown className="size-3.5" aria-hidden /> Σειρά στο website</>}
        </Button>
      }
      emptyMessage={
        <div>
          <div className="mb-3 text-[length:var(--fs-13)] text-muted-foreground">
            Δεν υπάρχουν ακόμη προγράμματα — δημιούργησε το πρώτο ανεβάζοντας την προκήρυξή του.
          </div>
          <ProgramWizard />
        </div>
      }
      footer={ordering
        ? <span>Σύρετε από τη λαβή ⋮⋮ για να αλλάξει η σειρά στο website · {orderedSiteRows.length} προγράμματα στο site</span>
        : <span>{rows.length} {rows.length === 1 ? 'πρόγραμμα' : 'προγράμματα'} · {rows.filter(r => r.onSite).length} στο website</span>}
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
