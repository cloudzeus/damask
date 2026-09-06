'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Users, UserPlus, UserRoundPlus, Mail, Phone, Check, LoaderCircle, Search, MoreVertical, Pencil, Unlink, Trash2, FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  listApplicationContactOptions, setApplicationContacts, createAndLinkContact,
  updateLinkedContact, unlinkApplicationContact, deleteContactCompletely, type AppContactOption,
} from '@/lib/pm/application-contacts'
import { getProgramFileTemplateOptions, type PhaseFileRow } from '@/lib/programs/phase-files'
import { requestDocsFromContact } from '@/lib/file-requests/actions'
import { deliverablePhaseLabel, type DeliverablePhaseStr } from '@/lib/pm/deliverable-phases'

/**
 * «Επαφές» tab του έργου (ProgramApplication hub) — συνδέει μία ή περισσότερες
 * επαφές του πελάτη με το συγκεκριμένο έργο. Self-fetching client component,
 * mirror του idiom document-requests-tab.tsx: αρχική φόρτωση μέσα σε effect με
 * setState ΜΕΤΑ το await (react-hooks/set-state-in-effect). Ανάγνωση gated
 * customer.view· η διαχείριση (Dialog με checkbox list) gated programs.manage
 * και εμφανίζεται μόνο όταν canManage.
 */
export function ApplicationContactsTab({ applicationId, canManage, programId }: { applicationId: string; canManage: boolean; programId?: string }) {
  const [options, setOptions] = React.useState<AppContactOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [manageOpen, setManageOpen] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AppContactOption | null>(null)
  const [confirm, setConfirm] = React.useState<{ mode: 'unlink' | 'delete'; contact: AppContactOption } | null>(null)
  const [requesting, setRequesting] = React.useState<AppContactOption | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [acting, startActing] = React.useTransition()

  // Καθαρή ανάκτηση — δεν αγγίζει state, ώστε να καλείται και μέσα σε effect
  // (μετά το await) και από event handlers.
  const fetchOptions = React.useCallback(() => listApplicationContactOptions(applicationId), [applicationId])

  // Manual reload — καλείται ΜΟΝΟ από event handlers (μετά το save), όπου το
  // synchronous setState επιτρέπεται.
  const reload = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setOptions(await fetchOptions())
    } catch {
      setError('Η φόρτωση των επαφών απέτυχε.')
    } finally {
      setLoading(false)
    }
  }, [fetchOptions])

  // Αρχική φόρτωση — setState ΜΕΤΑ το await.
  React.useEffect(() => {
    let cancelled = false
    fetchOptions()
      .then(rows => { if (!cancelled) setOptions(rows) })
      .catch(() => { if (!cancelled) setError('Η φόρτωση των επαφών απέτυχε.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchOptions])

  const linked = options.filter(o => o.linked)
  const hasContacts = options.length > 0

  const openNew = React.useCallback(() => { setEditing(null); setFormOpen(true) }, [])
  const openEdit = React.useCallback((c: AppContactOption) => { setEditing(c); setFormOpen(true) }, [])

  function runConfirm() {
    if (!confirm) return
    const { mode, contact } = confirm
    setBusyId(contact.contactId)
    startActing(async () => {
      try {
        const res = mode === 'unlink'
          ? await unlinkApplicationContact(applicationId, contact.contactId)
          : await deleteContactCompletely(contact.contactId)
        if (!res.ok) throw new Error()
        toast.success(mode === 'unlink' ? 'Η επαφή αφαιρέθηκε από το έργο.' : 'Η επαφή διαγράφηκε.')
        setConfirm(null)
        await reload()
      } catch {
        toast.error(mode === 'unlink' ? 'Η αφαίρεση απέτυχε.' : 'Η διαγραφή απέτυχε.')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Επαφές έργου ({linked.length})
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={openNew}>
              <UserRoundPlus className="size-4" aria-hidden /> Νέα επαφή
            </Button>
            <Button type="button" onClick={() => setManageOpen(true)} disabled={loading || options.length === 0}>
              <UserPlus className="size-4" aria-hidden /> Σύνδεση επαφών
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[0.78125rem] text-coral">{error}</p>
      ) : linked.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Users className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[0.78125rem] text-muted-foreground">Δεν έχουν συνδεθεί επαφές.</p>
          {canManage && (
            <p className="text-[0.71875rem] text-muted-foreground">
              {hasContacts
                ? 'Πάτησε «Σύνδεση επαφών» για υπάρχουσες επαφές, ή «Νέα επαφή» για να προσθέσεις νέα.'
                : 'Πάτησε «Νέα επαφή» για να προσθέσεις (καταχωρείται και ως επαφή της εταιρίας).'}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {linked.map(c => (
            <ContactCard
              key={c.contactId}
              contact={c}
              canManage={canManage}
              busy={acting && busyId === c.contactId}
              onEdit={openEdit}
              onRequestDocs={c => setRequesting(c)}
              onUnlink={c => setConfirm({ mode: 'unlink', contact: c })}
              onDelete={c => setConfirm({ mode: 'delete', contact: c })}
            />
          ))}
        </div>
      )}

      {canManage && (
        <>
          <ManageContactsDialog
            applicationId={applicationId}
            options={options}
            open={manageOpen}
            onOpenChange={setManageOpen}
            onSaved={() => { setManageOpen(false); void reload() }}
          />
          <ContactFormDialog
            applicationId={applicationId}
            contact={editing}
            open={formOpen}
            onOpenChange={setFormOpen}
            onSaved={() => { setFormOpen(false); void reload() }}
          />
          <ConfirmActionDialog
            state={confirm}
            busy={acting}
            onCancel={() => { if (!acting) setConfirm(null) }}
            onConfirm={runConfirm}
          />
          <RequestDocsDialog
            applicationId={applicationId}
            programId={programId}
            contact={requesting}
            open={!!requesting}
            onOpenChange={next => { if (!next) setRequesting(null) }}
            onSent={() => setRequesting(null)}
          />
        </>
      )}
    </section>
  )
}

/** Επιβεβαίωση για αφαίρεση-από-έργο (αναστρέψιμη) ή οριστική διαγραφή επαφής. */
function ConfirmActionDialog({
  state, busy, onCancel, onConfirm,
}: {
  state: { mode: 'unlink' | 'delete'; contact: AppContactOption } | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const isDelete = state?.mode === 'delete'
  return (
    <Dialog open={!!state} onOpenChange={next => { if (!next) onCancel() }}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] bg-popover sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isDelete ? 'Διαγραφή επαφής' : 'Αφαίρεση από το έργο'}</DialogTitle>
          <DialogDescription>
            {isDelete
              ? <>Η επαφή «{state?.contact.name}» θα διαγραφεί οριστικά από την εταιρία και θα αποσυνδεθεί από όλα τα έργα. Η ενέργεια δεν αναιρείται.</>
              : <>Η επαφή «{state?.contact.name}» θα αφαιρεθεί από αυτό το έργο. Παραμένει καταχωρημένη ως επαφή της εταιρίας.</>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Άκυρο</Button>
          <Button
            type="button"
            variant={isDelete ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy
              ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              : isDelete ? <Trash2 className="size-3.5" aria-hidden /> : <Unlink className="size-3.5" aria-hidden />}
            {isDelete ? 'Διαγραφή' : 'Αφαίρεση'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Ενιαία φόρμα επαφής για create ΚΑΙ edit (in-place, χωρίς αλλαγή σελίδας —
 * βλ. κανόνα «manage everything from everywhere»). Όταν δοθεί `contact` →
 * edit mode (updateLinkedContact, company-wide)· αλλιώς create+link
 * (createAndLinkContact).
 */
function ContactFormDialog({
  applicationId, contact, open, onOpenChange, onSaved,
}: {
  applicationId: string
  contact?: AppContactOption | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = !!contact
  const [name, setName] = React.useState('')
  const [position, setPosition] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [saving, startSaving] = React.useTransition()

  // Prefill/reset κατά το άνοιγμα (documented render-time pattern, όχι effect).
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setName(contact?.name ?? '')
      setPosition(contact?.position ?? '')
      setEmail(contact?.email ?? '')
      setPhone(contact?.phone ?? '')
    }
  }

  function handleSave() {
    if (!name.trim()) { toast.error('Συμπλήρωσε όνομα.'); return }
    startSaving(async () => {
      try {
        const res = isEdit
          ? await updateLinkedContact(contact!.contactId, { name, position, email, phone })
          : await createAndLinkContact(applicationId, { name, position, email, phone })
        if (!res.ok) throw new Error(res.error)
        toast.success(isEdit ? 'Η επαφή ενημερώθηκε.' : 'Η επαφή προστέθηκε και συνδέθηκε με το έργο.')
        onSaved()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : isEdit ? 'Η ενημέρωση απέτυχε.' : 'Η προσθήκη απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] bg-popover sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Επεξεργασία επαφής' : 'Νέα επαφή'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Οι αλλαγές ενημερώνουν την επαφή σε όλη την εταιρία.'
              : 'Δημιουργείται στον πελάτη (καταχωρείται ως επαφή της εταιρίας) και συνδέεται με αυτό το έργο.'}
          </DialogDescription>
        </DialogHeader>

        {/* autoComplete="off" παντού: αλλιώς ο browser autofill γεμίζει τα πεδία με
            το προφίλ του συνδεδεμένου χρήστη και μπορεί να «γράψει» πάνω στην επαφή. */}
        <form className="flex flex-col gap-3" autoComplete="off" onSubmit={e => { e.preventDefault(); handleSave() }}>
          <div className="field !mb-0">
            <label htmlFor="nc-name">Ονοματεπώνυμο*</label>
            <Input id="nc-name" name="contact-name" value={name} onChange={e => setName(e.target.value)} placeholder="π.χ. Μαρία Παπαδοπούλου" autoComplete="off" autoFocus />
          </div>
          <div className="field !mb-0">
            <label htmlFor="nc-position">Θέση/Ρόλος</label>
            <Input id="nc-position" name="contact-position" value={position} onChange={e => setPosition(e.target.value)} placeholder="π.χ. Οικονομικός Διευθυντής" autoComplete="off" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field !mb-0">
              <label htmlFor="nc-email">Email</label>
              <Input id="nc-email" name="contact-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.gr" autoComplete="off" />
            </div>
            <div className="field !mb-0">
              <label htmlFor="nc-phone">Τηλέφωνο</label>
              <Input id="nc-phone" name="contact-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="2101234567" autoComplete="off" />
            </div>
          </div>
        </form>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving
              ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              : isEdit ? <Pencil className="size-3.5" aria-hidden /> : <UserRoundPlus className="size-3.5" aria-hidden />}
            {isEdit ? 'Αποθήκευση' : 'Προσθήκη'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ContactCard({
  contact, canManage, busy, onEdit, onRequestDocs, onUnlink, onDelete,
}: {
  contact: AppContactOption
  canManage: boolean
  busy: boolean
  onEdit: (contact: AppContactOption) => void
  onRequestDocs: (contact: AppContactOption) => void
  onUnlink: (contact: AppContactOption) => void
  onDelete: (contact: AppContactOption) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.8125rem] font-semibold">{contact.name}</span>
            {contact.isPrimary && <span className="badge-pill ok shrink-0">Κύρια</span>}
          </div>
          {contact.position && <p className="mt-1 text-[0.75rem] text-muted-foreground">{contact.position}</p>}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="flex flex-col items-end gap-1 text-[0.71875rem] text-muted-foreground">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline">
                <Mail className="size-3.5" aria-hidden /> {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline">
                <Phone className="size-3.5" aria-hidden /> {contact.phone}
              </a>
            )}
          </div>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Ενέργειες επαφής"
                    disabled={busy}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-max min-w-52">
                <DropdownMenuItem
                  onClick={() => onRequestDocs(contact)}
                  disabled={!contact.email}
                  title={contact.email ? undefined : 'Η επαφή δεν έχει email'}
                >
                  <FileCheck2 className="size-3.5" aria-hidden /> Αίτημα δικαιολογητικών
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(contact)}>
                  <Pencil className="size-3.5" aria-hidden /> Επεξεργασία
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUnlink(contact)}>
                  <Unlink className="size-3.5" aria-hidden /> Αφαίρεση από έργο
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(contact)} style={{ color: 'var(--destructive)' }}>
                  <Trash2 className="size-3.5" aria-hidden /> Διαγραφή επαφής
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}

/** Προεπιλεγμένη λήξη: +14 ημέρες από σήμερα (YYYY-MM-DD για <input type=date>). */
function defaultExpiry(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

/**
 * «Αίτημα δικαιολογητικών» προς μία επαφή του έργου — ανοίγει από το ⋮ menu της
 * κάρτας. Ο χρήστης επιλέγει ποια από τα ορισμένα (ανά φάση) δικαιολογητικά θέλει
 * (checkboxes) + προαιρετικά custom, ορίζει τίτλο/λήξη, και στέλνεται one-time
 * link στο email της επαφής (requestDocsFromContact). Το αίτημα εμφανίζεται στην
 * καρτέλα «Δικαιολογητικά» για έλεγχο.
 */
function RequestDocsDialog({
  applicationId, programId, contact, open, onOpenChange, onSent,
}: {
  applicationId: string
  programId?: string
  contact: AppContactOption | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  const [templates, setTemplates] = React.useState<PhaseFileRow[]>([])
  const [loadingTpl, setLoadingTpl] = React.useState(false)
  const [checked, setChecked] = React.useState<Set<string>>(new Set())
  const [custom, setCustom] = React.useState<{ label: string; required: boolean }[]>([])
  const [title, setTitle] = React.useState('')
  const [expires, setExpires] = React.useState(defaultExpiry())
  const [saving, startSaving] = React.useTransition()

  // Reset + φόρτωση προτύπου ανά φάση σε κάθε άνοιγμα (render-time pattern).
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setChecked(new Set())
      setCustom([])
      setTitle('Δικαιολογητικά')
      setExpires(defaultExpiry())
      setTemplates([])
    }
  }

  React.useEffect(() => {
    if (!open || !programId) return
    let cancelled = false
    // Nested async ώστε κανένα setState να μην τρέχει σύγχρονα στο σώμα του effect
    // (react-hooks/set-state-in-effect).
    const load = async () => {
      setLoadingTpl(true)
      try {
        const rows = await getProgramFileTemplateOptions(programId)
        if (!cancelled) { setTemplates(rows); setChecked(new Set(rows.filter(r => r.required).map(r => r.id))) }
      } catch {
        if (!cancelled) setTemplates([])
      } finally {
        if (!cancelled) setLoadingTpl(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [open, programId])

  // Ομαδοποίηση προτύπου ανά φάση για ευανάγνωστη επιλογή.
  const groups = React.useMemo(() => {
    const map = new Map<string, PhaseFileRow[]>()
    for (const r of templates) {
      const arr = map.get(r.phase) ?? []
      arr.push(r)
      map.set(r.phase, arr)
    }
    return [...map.entries()]
  }, [templates])

  const selectedCount = checked.size + custom.filter(c => c.label.trim()).length

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleSend() {
    if (!contact) return
    const items = [
      ...templates.filter(t => checked.has(t.id)).map(t => ({ label: t.label, description: t.description ?? undefined, required: t.required })),
      ...custom.filter(c => c.label.trim()).map(c => ({ label: c.label.trim(), required: c.required })),
    ]
    if (items.length === 0) { toast.error('Επίλεξε τουλάχιστον ένα δικαιολογητικό.'); return }
    if (!title.trim()) { toast.error('Δώσε τίτλο στο αίτημα.'); return }
    if (!expires) { toast.error('Δώσε ημερομηνία λήξης.'); return }
    startSaving(async () => {
      try {
        const res = await requestDocsFromContact({ applicationId, contactId: contact.contactId, title: title.trim(), expiresAt: expires, items })
        if (!res.ok) throw new Error(res.error)
        toast.success(`Το αίτημα στάλθηκε στο ${contact.email}.`)
        onSent()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η αποστολή απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="flex max-h-[88vh] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden bg-popover sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Αίτημα δικαιολογητικών</DialogTitle>
          <DialogDescription>
            Επίλεξε τα δικαιολογητικά και στείλε σύνδεσμο μεταφόρτωσης στην επαφή
            {contact?.email ? <> «{contact.name}» ({contact.email})</> : null}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field !mb-0">
            <label htmlFor="rq-title">Τίτλος*</label>
            <Input id="rq-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Δικαιολογητικά αξιολόγησης" autoComplete="off" />
          </div>
          <div className="field !mb-0">
            <label htmlFor="rq-expires">Ημ/νία λήξης*</label>
            <Input id="rq-expires" type="date" value={expires} onChange={e => setExpires(e.target.value)} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border p-2">
          {loadingTpl ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση προτύπου…
            </div>
          ) : groups.length === 0 ? (
            <p className="px-1 py-3 text-[0.75rem] text-muted-foreground">
              Δεν υπάρχουν ορισμένα δικαιολογητικά ανά φάση για αυτό το πρόγραμμα. Πρόσθεσε custom παρακάτω.
            </p>
          ) : (
            groups.map(([phase, rows]) => (
              <div key={phase} className="mb-2">
                <div className="px-1 py-1 text-[0.65625rem] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                  {deliverablePhaseLabel(phase as DeliverablePhaseStr)}
                </div>
                <ul className="flex flex-col">
                  {rows.map(r => (
                    <li key={r.id}>
                      <label className="flex min-h-[42px] cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted">
                        <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} className="size-4 shrink-0" />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.8125rem] font-medium">{r.label}</span>
                            {r.required
                              ? <span className="badge-pill warn shrink-0">Υποχρεωτικό</span>
                              : <span className="badge-pill muted shrink-0">Προαιρετικό</span>}
                          </span>
                          {r.description && <span className="truncate text-[0.71875rem] text-muted-foreground">{r.description}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {custom.length > 0 && (
            <div className="mb-1 mt-1">
              <div className="px-1 py-1 text-[0.65625rem] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Custom</div>
              <div className="flex flex-col gap-1.5">
                {custom.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-1">
                    <Input
                      value={c.label}
                      onChange={e => setCustom(items => items.map((it, i) => i === idx ? { ...it, label: e.target.value } : it))}
                      placeholder={`Δικαιολογητικό ${idx + 1}`}
                      autoComplete="off"
                      className="h-9 flex-1"
                    />
                    <label className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-[0.6875rem] font-semibold">
                      <input type="checkbox" checked={c.required} onChange={e => setCustom(items => items.map((it, i) => i === idx ? { ...it, required: e.target.checked } : it))} className="size-3.5" />
                      Υποχρ.
                    </label>
                    <button
                      type="button"
                      aria-label="Αφαίρεση"
                      onClick={() => setCustom(items => items.filter((_, i) => i !== idx))}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button type="button" variant="outline" size="sm" className="mt-1 ml-1" onClick={() => setCustom(items => [...items, { label: '', required: true }])}>
            <UserPlus className="size-3.5" aria-hidden /> Προσθήκη custom δικαιολογητικού
          </Button>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSend} disabled={saving || selectedCount === 0}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FileCheck2 className="size-3.5" aria-hidden />}
            Αποστολή ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManageContactsDialog({
  applicationId, options, open, onOpenChange, onSaved,
}: {
  applicationId: string
  options: AppContactOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [query, setQuery] = React.useState('')
  const [saving, startSaving] = React.useTransition()

  // Κάθε άνοιγμα προεπιλέγει τις ήδη συνδεδεμένες επαφές. Ρυθμίζεται κατά το
  // render όταν αλλάζει το `open` (documented React pattern), αντί για effect —
  // αποφεύγει το react-hooks/set-state-in-effect.
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSelected(new Set(options.filter(o => o.linked).map(o => o.contactId)))
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return q
      ? options.filter(o =>
          o.name.toLowerCase().includes(q)
          || (o.position?.toLowerCase().includes(q) ?? false)
          || (o.email?.toLowerCase().includes(q) ?? false))
      : options
  }, [options, query])

  const allFilteredSelected = filtered.length > 0 && filtered.every(o => selected.has(o.contactId))

  function toggle(contactId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(contactId)) next.delete(contactId)
      else next.add(contactId)
      return next
    })
  }
  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) filtered.forEach(o => next.delete(o.contactId))
      else filtered.forEach(o => next.add(o.contactId))
      return next
    })
  }

  function handleSave() {
    startSaving(async () => {
      try {
        const res = await setApplicationContacts(applicationId, [...selected])
        if (!res.ok) throw new Error(res.error)
        toast.success(`Συνδέθηκαν ${res.linked} ${res.linked === 1 ? 'επαφή' : 'επαφές'}.`)
        onSaved()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden bg-popover sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Διαχείριση επαφών έργου</DialogTitle>
          <DialogDescription>Επίλεξε μία ή περισσότερες επαφές του πελάτη για σύνδεση με αυτό το έργο.</DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-[0.78125rem] text-muted-foreground">Ο πελάτης δεν έχει καταχωρημένες επαφές.</p>
            <p className="text-[0.71875rem] text-muted-foreground">Οι επαφές διαχειρίζονται από την καρτέλα πελάτη.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
                <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Αναζήτηση επαφής…" className="w-full bg-transparent text-[0.8125rem] outline-none"
                  aria-label="Αναζήτηση επαφής"
                />
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[0.78125rem] font-semibold whitespace-nowrap">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} disabled={filtered.length === 0} className="size-4" />
                Επιλογή όλων
              </label>
              <span className="text-[0.75rem] text-muted-foreground">{selected.size} επιλεγμένες</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-[0.78125rem] text-muted-foreground">Δεν βρέθηκαν επαφές.</p>
              ) : (
                <ul className="flex flex-col">
                  {filtered.map(o => (
                    <li key={o.contactId} className="dotted-row-bottom">
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                        <input type="checkbox" checked={selected.has(o.contactId)} onChange={() => toggle(o.contactId)} className="size-4 shrink-0" />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.8125rem] font-semibold">{o.name}</span>
                            {o.isPrimary && <span className="badge-pill ok shrink-0">Κύρια</span>}
                          </span>
                          {(o.position || o.email) && (
                            <span className="truncate text-[0.71875rem] text-muted-foreground">
                              {[o.position, o.email].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          {options.length > 0 && (
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              Αποθήκευση ({selected.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
