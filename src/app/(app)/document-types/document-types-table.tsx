'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, LoaderCircle, MoreVertical, CalendarClock, ScanLine,
  Link2, Unlink, FileText, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  createDocumentTypeAdmin, updateDocumentTypeAdmin, deleteDocumentTypeAdmin, setFormGuideDocumentType,
  type DocumentTypeAdminRow, type FormGuideOption, type DocumentTypeInput,
} from '@/lib/documents/type-admin'

function guideLabel(g: { code: string; name: string; year: number | null }): string {
  return `${g.name}${g.year ? ` ${g.year}` : ''}${g.code ? ` · ${g.code}` : ''}`
}

export function DocumentTypesTable({ rows, guides }: { rows: DocumentTypeAdminRow[]; guides: FormGuideOption[] }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<DocumentTypeAdminRow | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  function openCreate() { setEditing(null); setDialogOpen(true) }
  function openEdit(row: DocumentTypeAdminRow) { setEditing(row); setDialogOpen(true) }

  async function handleDelete(row: DocumentTypeAdminRow) {
    if (!window.confirm(`Διαγραφή του τύπου «${row.name}»;`)) return
    setDeletingId(row.id)
    try {
      await deleteDocumentTypeAdmin(row.id)
      toast.success('Ο τύπος διαγράφηκε.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η διαγραφή απέτυχε.')
    } finally {
      setDeletingId(null)
    }
  }

  const columns: DataTableColumn<DocumentTypeAdminRow>[] = [
    {
      id: 'name', header: 'Όνομα', width: 260, enableHide: false, sortValue: r => r.name,
      cell: r => (
        <span className="flex items-center gap-2">
          <b>{r.name}</b>
          {!r.active && <span className="badge-pill" style={{ color: 'var(--muted-foreground)', background: 'var(--muted)' }}>Ανενεργός</span>}
        </span>
      ),
    },
    {
      id: 'expires', header: 'Λήξη', width: 130, align: 'center', sortValue: r => r.expires,
      cell: r => r.expires
        ? <span className="badge-pill warn" title="Ο χρήστης ορίζει ημ. λήξης κατά τη μεταφόρτωση"><CalendarClock className="size-3" aria-hidden /> Έχει λήξη</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'scan', header: 'Σάρωση τιμών', headerLabel: 'Σάρωση τιμών (Οδηγοί Εντύπων)', width: 160, align: 'center', sortValue: r => r.templates.length,
      cell: r => r.templates.length > 0
        ? <span className="badge-pill ok" title="Συνδεδεμένοι Οδηγοί Εντύπων — άνοιξε τη γραμμή"><ScanLine className="size-3" aria-hidden /> {r.templates.length} {r.templates.length === 1 ? 'οδηγός' : 'οδηγοί'}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    { id: 'dossier', header: 'Σε πελάτες', align: 'right', width: 110, sortValue: r => r.dossierCount, cell: r => r.dossierCount || '—' },
    { id: 'required', header: 'Σε προγράμματα', align: 'right', width: 130, sortValue: r => r.requiredFormCount, cell: r => r.requiredFormCount || '—' },
    {
      id: 'actions', header: '⋯', headerLabel: 'Ενέργειες', align: 'center', width: 80, enableHide: false, enableResize: false,
      cell: r => (
        <div className="flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" aria-label={`Ενέργειες ${r.name}`} disabled={deletingId === r.id} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
                  {deletingId === r.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-max min-w-52">
              <DropdownMenuItem onClick={() => openEdit(r)}>
                <Pencil className="size-3.5" aria-hidden /> Επεξεργασία
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleDelete(r)} variant="destructive">
                <Trash2 className="size-3.5" aria-hidden /> Διαγραφή
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        tableId="document-types"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        emptyMessage="Δεν υπάρχουν τύποι δικαιολογητικών ακόμη."
        footer={<span>{rows.length} {rows.length === 1 ? 'τύπος' : 'τύποι'}</span>}
        toolbarExtras={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-3.5" aria-hidden /> Νέος τύπος
          </Button>
        }
        renderExpanded={r => <GuidesPanel row={r} guides={guides} onChanged={() => router.refresh()} />}
      />

      <TypeFormDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => { setDialogOpen(false); router.refresh() }}
      />
    </>
  )
}

/** Expanded panel: συνδεδεμένοι Οδηγοί Εντύπων + σύνδεση αδέσμευτου προτύπου. */
function GuidesPanel({ row, guides, onChanged }: { row: DocumentTypeAdminRow; guides: FormGuideOption[]; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [pick, setPick] = React.useState('')
  const linked = row.templates
  const available = guides.filter(g => g.documentTypeId == null)

  async function link(templateId: string) {
    if (!templateId) return
    setBusy(true)
    try {
      await setFormGuideDocumentType(templateId, row.id)
      toast.success('Ο Οδηγός συνδέθηκε.')
      setPick('')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η σύνδεση απέτυχε.')
    } finally { setBusy(false) }
  }
  async function unlink(templateId: string) {
    setBusy(true)
    try {
      await setFormGuideDocumentType(templateId, null)
      toast.success('Ο Οδηγός αποσυνδέθηκε.')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποσύνδεση απέτυχε.')
    } finally { setBusy(false) }
  }

  return (
    <div className="border-t border-border bg-muted/30 p-3">
      <div className="mb-2 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Οδηγοί Εντύπων (πεδία προς σάρωση) — {row.name}
      </div>

      {linked.length === 0 ? (
        <p className="mb-2 text-[0.75rem] text-muted-foreground">
          Δεν έχει συνδεθεί Οδηγός. Σύνδεσε έναν παρακάτω για να σαρώνονται αυτόματα πεδία/τιμές από αυτόν τον τύπο δικαιολογητικού.
        </p>
      ) : (
        <div className="mb-2 flex flex-col gap-1.5">
          {linked.map(t => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2 text-[0.78125rem]">
              <FileText className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="font-semibold">{guideLabel(t)}</span>
              <span className={cn('badge-pill', t.status === 'READY' ? 'ok' : 'muted')}>{t.status === 'READY' ? 'Έτοιμο' : 'Πρόχειρο'}</span>
              <span className="badge-pill muted">{t.fieldCount} πεδία</span>
              <div className="ml-auto flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" nativeButton={false} render={<Link href={`/tax-templates/${t.id}`} />}>
                  Άνοιγμα <ExternalLink className="size-3.5" aria-hidden />
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => unlink(t.id)}>
                  <Unlink className="size-3.5" aria-hidden /> Αποσύνδεση
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[240px] flex-1 sm:max-w-[360px]">
          <Select value={pick} onValueChange={v => { setPick(v ?? ''); if (v) void link(v) }} disabled={busy || available.length === 0}>
            <SelectTrigger className="h-9 w-full rounded-full border-border bg-card px-3">
              <SelectValue placeholder={available.length ? 'Σύνδεση υπάρχοντος Οδηγού…' : '— Δεν υπάρχουν αδέσμευτοι Οδηγοί —'} />
            </SelectTrigger>
            <SelectContent>
              {available.map(g => <SelectItem key={g.id} value={g.id}>{guideLabel(g)} · {g.fieldCount} πεδία</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" nativeButton={false} render={<Link href="/tax-templates" />}>
          <Link2 className="size-3.5" aria-hidden /> Νέος Οδηγός Εντύπων
        </Button>
      </div>
    </div>
  )
}

function TypeFormDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: DocumentTypeAdminRow | null
  onSaved: () => void
}) {
  const [name, setName] = React.useState(editing?.name ?? '')
  const [expires, setExpires] = React.useState(editing?.expires ?? false)
  const [active, setActive] = React.useState(editing?.active ?? true)
  const [notes, setNotes] = React.useState(editing?.notes ?? '')
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('Το όνομα είναι υποχρεωτικό.'); return }
    setSaving(true)
    const input: DocumentTypeInput = { name, expires, active, notes: notes || null }
    try {
      if (editing) await updateDocumentTypeAdmin(editing.id, input)
      else await createDocumentTypeAdmin(input)
      toast.success(editing ? 'Ο τύπος ενημερώθηκε.' : 'Ο τύπος δημιουργήθηκε.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="glass sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Επεξεργασία τύπου' : 'Νέος τύπος δικαιολογητικού'}</DialogTitle>
          <DialogDescription>Ο κοινός τύπος που επιλέγεται στη μεταφόρτωση (πελάτης/πρόγραμμα).</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="field !mb-0">
            <label htmlFor="dt-name">Όνομα*</label>
            <Input id="dt-name" className="w-full" value={name} onChange={e => setName(e.target.value)} placeholder="π.χ. Φορολογική ενημερότητα" autoComplete="off" />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card/50 p-3">
            <Switch checked={expires} onCheckedChange={setExpires} size="sm" />
            <span className="text-[0.8125rem]">
              <span className="font-semibold">Έχει ημερομηνία λήξης</span>
              <span className="block text-[0.71875rem] text-muted-foreground">Ο χρήστης θα ορίζει «valid μέχρι» κατά τη μεταφόρτωση (π.χ. φορολογική ενημερότητα).</span>
            </span>
          </label>

          <div className="field !mb-0">
            <label htmlFor="dt-notes">Σημειώσεις</label>
            <Input id="dt-notes" className="w-full" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Προαιρετικό" />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[0.78125rem] font-semibold">
            <Switch checked={active} onCheckedChange={setActive} size="sm" />
            Ενεργός (εμφανίζεται στη λίστα επιλογής κατά τη μεταφόρτωση)
          </label>

          {!editing && (
            <p className="text-[0.71875rem] text-muted-foreground">
              Μετά τη δημιουργία, άνοιξε τη γραμμή του τύπου για να συνδέσεις <strong>Οδηγό Εντύπων</strong> (τα πεδία που σαρώνονται για εξαγωγή τιμών).
            </p>
          )}
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
