'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, LoaderCircle, Building2, User, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { createReferrer, updateReferrer, deleteReferrer, lookupReferrerAfm, type ReferrerRow, type ReferrerInput } from '@/lib/referrers/actions'

type ReferrerTypeValue = 'COMPANY' | 'INDIVIDUAL'

const TYPE_LABEL: Record<ReferrerTypeValue, string> = { COMPANY: 'Εταιρία', INDIVIDUAL: 'Ιδιώτης' }

export function ReferrersTable({ rows, canManage }: { rows: ReferrerRow[]; canManage: boolean }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ReferrerRow | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(row: ReferrerRow) {
    setEditing(row)
    setDialogOpen(true)
  }

  async function handleDelete(row: ReferrerRow) {
    if (!window.confirm(`Διαγραφή της παραπομπής «${row.name}»;\nΟι πελάτες που συνδέονται θα αποσυνδεθούν (δεν διαγράφονται).`)) return
    setDeletingId(row.id)
    try {
      await deleteReferrer(row.id)
      toast.success('Η παραπομπή διαγράφηκε.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η διαγραφή απέτυχε.')
    } finally {
      setDeletingId(null)
    }
  }

  const columns: DataTableColumn<ReferrerRow>[] = [
    {
      id: 'name',
      header: 'Όνομα',
      width: 240,
      enableHide: false,
      sortValue: r => r.name,
      cell: r => (
        <span className="user-cell">
          <span className="avatar-ring size-8 shrink-0 text-[11px]">
            {r.type === 'COMPANY' ? <Building2 className="size-3.5" aria-hidden /> : <User className="size-3.5" aria-hidden />}
          </span>
          <span><b>{r.name}</b></span>
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Τύπος',
      width: 120,
      sortValue: r => r.type,
      cell: r => <span className="badge-pill muted">{TYPE_LABEL[r.type as ReferrerTypeValue]}</span>,
    },
    { id: 'email', header: 'Email', width: 200, sortValue: r => r.email, cell: r => r.email ?? '—' },
    { id: 'phone', header: 'Τηλέφωνο', width: 140, sortValue: r => r.phone, cell: r => r.phone ?? '—' },
    { id: 'afm', header: 'ΑΦΜ', width: 120, sortValue: r => r.afm, cell: r => <span className="tabular-nums">{r.afm ?? '—'}</span> },
    { id: 'referred', header: 'Πελάτες', align: 'right', width: 100, sortValue: r => r.referredCount, cell: r => r.referredCount },
    {
      id: 'active',
      header: 'Κατάσταση',
      width: 120,
      sortValue: r => r.active,
      cell: r =>
        r.active
          ? <span className="badge-pill ok">Ενεργός</span>
          : <span className="badge-pill" style={{ color: 'var(--muted-foreground)', background: 'var(--muted)' }}>Ανενεργός</span>,
    },
    ...(canManage
      ? [{
          id: 'actions',
          header: '⋯',
          headerLabel: 'Ενέργειες',
          align: 'center' as const,
          width: 90,
          enableHide: false,
          enableResize: false,
          cell: (r: ReferrerRow) => (
            <div className="flex items-center justify-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(r)} aria-label={`Επεξεργασία ${r.name}`}>
                <Pencil className="size-3.5" aria-hidden />
              </Button>
              <Button
                type="button" variant="ghost" size="icon-sm" disabled={deletingId === r.id}
                onClick={() => handleDelete(r)} aria-label={`Διαγραφή ${r.name}`}
              >
                {deletingId === r.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
              </Button>
            </div>
          ),
        }]
      : []),
  ]

  return (
    <>
      <DataTable
        tableId="referrers"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        emptyMessage="Δεν υπάρχουν παραπομπές ακόμη."
        footer={<span>{rows.length} {rows.length === 1 ? 'παραπομπή' : 'παραπομπές'}</span>}
        toolbarExtras={
          canManage ? (
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-3.5" aria-hidden /> Νέα παραπομπή
            </Button>
          ) : undefined
        }
      />

      {canManage && (
        <ReferrerFormDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          onSaved={() => { setDialogOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}

function ReferrerFormDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ReferrerRow | null
  onSaved: () => void
}) {
  const [name, setName] = React.useState(editing?.name ?? '')
  const [type, setType] = React.useState<ReferrerTypeValue>((editing?.type as ReferrerTypeValue) ?? 'COMPANY')
  const [email, setEmail] = React.useState(editing?.email ?? '')
  const [phone, setPhone] = React.useState(editing?.phone ?? '')
  const [afm, setAfm] = React.useState(editing?.afm ?? '')
  const [notes, setNotes] = React.useState(editing?.notes ?? '')
  const [active, setActive] = React.useState(editing?.active ?? true)
  const [saving, setSaving] = React.useState(false)
  const [looking, setLooking] = React.useState(false)

  async function handleAfmLookup() {
    const clean = afm.replace(/\D/g, '')
    if (clean.length !== 9) {
      toast.error('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
      return
    }
    setLooking(true)
    try {
      const res = await lookupReferrerAfm(clean)
      if (!res.found || !res.name) {
        toast.warning('Δεν βρέθηκαν στοιχεία για αυτό το ΑΦΜ στο μητρώο της ΑΑΔΕ.')
        return
      }
      setName(res.name)
      toast.success('Συμπληρώθηκε η επωνυμία από την ΑΑΔΕ.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αναζήτηση ΑΑΔΕ απέτυχε.')
    } finally {
      setLooking(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Το όνομα είναι υποχρεωτικό.')
      return
    }
    setSaving(true)
    const input: ReferrerInput = { name, type, email, phone, afm, notes, active }
    try {
      if (editing) await updateReferrer(editing.id, input)
      else await createReferrer(input)
      toast.success(editing ? 'Η παραπομπή ενημερώθηκε.' : 'Η παραπομπή δημιουργήθηκε.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="glass sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Επεξεργασία παραπομπής' : 'Νέα παραπομπή'}</DialogTitle>
          <DialogDescription>Ποιος έφερε τον πελάτη — εταιρία/συνεργάτης ή ιδιώτης.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label htmlFor="referrer-name">Όνομα*</label>
            <Input id="referrer-name" className="w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Επωνυμία ή ονοματεπώνυμο" />
          </div>

          <div className="field">
            <label htmlFor="referrer-type">Τύπος</label>
            <Select value={type} onValueChange={v => setType(v as ReferrerTypeValue)}>
              <SelectTrigger id="referrer-type" className="h-11 w-full rounded-full border-border bg-card px-4">
                <SelectValue>{(v: string) => TYPE_LABEL[v as ReferrerTypeValue]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPANY">Εταιρία</SelectItem>
                <SelectItem value="INDIVIDUAL">Ιδιώτης</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="field">
            <label htmlFor="referrer-afm">ΑΦΜ</label>
            <div className="flex items-center gap-1.5">
              <Input id="referrer-afm" className="w-full" value={afm} onChange={e => setAfm(e.target.value)} placeholder="Προαιρετικό" />
              {type === 'COMPANY' && (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleAfmLookup} disabled={looking}>
                  {looking ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Search className="size-3.5" aria-hidden />}
                  ΑΑΔΕ
                </Button>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="referrer-email">Email</label>
            <Input id="referrer-email" type="email" className="w-full" value={email} onChange={e => setEmail(e.target.value)} placeholder="Προαιρετικό" />
          </div>

          <div className="field">
            <label htmlFor="referrer-phone">Τηλέφωνο</label>
            <Input id="referrer-phone" className="w-full" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Προαιρετικό" />
          </div>

          <div className="field sm:col-span-2">
            <label htmlFor="referrer-notes">Σημειώσεις</label>
            <Input id="referrer-notes" className="w-full" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Προαιρετικό" />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold sm:col-span-2">
            <Switch checked={active} onCheckedChange={setActive} size="sm" />
            Ενεργός (εμφανίζεται στο combobox των πελατών)
          </label>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
            {editing ? 'Αποθήκευση' : 'Δημιουργία'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
