'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuPlus, LuTrash2, LuLoaderCircle, LuRefreshCw, LuListChecks } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listObligations, listInternalUsers, addObligation, updateObligation, removeObligation, waiveObligation,
  generateObligations, listApplicationBoardObligations,
  type ObligationItem, type InternalUserOption, type BoardObligation,
} from '@/lib/pm/actions'
import {
  STAGE_ORDER, stageLabel, obligationStatusLabel, obligationKindLabel,
  type StageStr, type ObligationStatusStr, type ObligationKindStr,
} from '@/lib/pm/types'
import { ApplicationDocuments } from './application-documents'
import { ObligationsBoard } from './obligations-board'

/** Sentinel τιμή για «— (κανένας) —» — το base-ui Select δεν επιτρέπει value="" σε Item. */
const NONE_ASSIGNEE = '__none__'

const STATUSES: ObligationStatusStr[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WAIVED']

/**
 * «Εργασίες & Υποχρεώσεις» tab (Task 12, ονομασία C2e) — υποχρεώσεις της αίτησης
 * (γεννημένες από απαιτούμενα έντυπα/παραδοτέα του Προγράμματος μέσω
 * generateObligations, ή προστιθέμενες χειροκίνητα), ομαδοποιημένες ανά
 * STAGE_ORDER, με inline ανέβασμα/λήψη εγγράφων ανά υποχρέωση.
 * Self-fetching client component, mirror του idiom στο required-forms-tab.tsx.
 *
 * `filterKind` (Task 13) — προαιρετικό: όταν δοθεί, εμφανίζονται μόνο οι
 * υποχρεώσεις αυτού του kind (π.χ. `filterKind="DELIVERABLE"` για το tab
 * «Παραδοτέα» στο hub — ίδιο component, φιλτραρισμένη προβολή, αντί για
 * ξεχωριστό read-only component).
 *
 * `showBoardToggle` (C2b) — προαιρετικό, default true: εμφανίζει pill toggle
 * «Λίστα / Πίνακας» ώστε οι υποχρεώσεις ΑΥΤΗΣ της αίτησης να φαίνονται και ως
 * per-έργο Kanban (`<ObligationsBoard>`, το ίδιο global component του C2b,
 * με `listApplicationBoardObligations` scoped στο applicationId). Το board
 * ΔΕΝ φιλτράρεται από `filterKind` — γι' αυτό το tab «Παραδοτέα» στο hub
 * περνάει `showBoardToggle={false}` (θα ήταν μπερδεμένο να δείχνει
 * υποχρεώσεις εκτός παραδοτέων εκεί).
 */
export function ObligationsTab({
  applicationId, canManage, programId, filterKind, title = 'Εργασίες & Υποχρεώσεις', emptyMessage = 'Δεν υπάρχουν υποχρεώσεις για αυτή την αίτηση.',
  showBoardToggle = true,
}: {
  applicationId: string
  canManage: boolean
  programId: string
  filterKind?: ObligationKindStr
  title?: string
  emptyMessage?: string
  showBoardToggle?: boolean
}) {
  const router = useRouter()
  const [obligations, setObligations] = React.useState<ObligationItem[]>([])
  const [users, setUsers] = React.useState<InternalUserOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [syncing, setSyncing] = React.useState(false)

  const [viewMode, setViewMode] = React.useState<'list' | 'board'>('list')
  const [boardObligations, setBoardObligations] = React.useState<BoardObligation[]>([])
  const [boardLoading, setBoardLoading] = React.useState(false)
  const [boardLoaded, setBoardLoaded] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listObligations(applicationId), canManage ? listInternalUsers() : Promise.resolve<InternalUserOption[]>([])])
      .then(([o, u]) => { setObligations(o); setUsers(u) })
      .catch(() => setError('Η φόρτωση των υποχρεώσεων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId, canManage])

  React.useEffect(() => { load() }, [load])

  const loadBoard = React.useCallback(() => {
    setBoardLoading(true)
    listApplicationBoardObligations(applicationId)
      .then(data => { setBoardObligations(data); setBoardLoaded(true) })
      .catch(() => toast.error('Η φόρτωση του πίνακα απέτυχε.'))
      .finally(() => setBoardLoading(false))
  }, [applicationId])

  function handleViewChange(next: 'list' | 'board') {
    setViewMode(next)
    if (next === 'board' && !boardLoaded) loadBoard()
  }

  function handleBoardStatusChange() {
    load()
    loadBoard()
    router.refresh()
  }

  function patchLocal(id: string, patch: Partial<ObligationItem>) {
    setObligations(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)))
  }

  async function persist(id: string, patch: { status?: ObligationStatusStr; dueDate?: string | null; assigneeId?: string | null; notes?: string | null }) {
    try {
      await updateObligation(id, patch)
      router.refresh()
    } catch {
      toast.error('Η ενημέρωση απέτυχε.')
      load()
    }
  }

  function handleStatusChange(o: ObligationItem, status: ObligationStatusStr) {
    if (status === o.status) return
    patchLocal(o.id, { status })
    void persist(o.id, { status })
  }

  function handleDueDateBlur(o: ObligationItem, value: string) {
    const next = value ? value : null
    const prevValue = o.dueDate ? o.dueDate.slice(0, 10) : null
    if (next === prevValue) return
    patchLocal(o.id, { dueDate: next })
    void persist(o.id, { dueDate: next })
  }

  function handleAssigneeChange(o: ObligationItem, value: string) {
    const assigneeId = value === NONE_ASSIGNEE ? null : value
    if (assigneeId === o.assigneeId) return
    const assignee = users.find(u => u.id === assigneeId)
    patchLocal(o.id, { assigneeId, assigneeName: assignee?.name ?? null })
    void persist(o.id, { assigneeId })
  }

  function handleNotesBlur(o: ObligationItem, value: string) {
    const next = value.trim() ? value.trim() : null
    if (next === o.notes) return
    patchLocal(o.id, { notes: next })
    void persist(o.id, { notes: next })
  }

  async function handleWaive(o: ObligationItem) {
    const prevStatus = o.status
    patchLocal(o.id, { status: 'WAIVED' })
    try {
      await waiveObligation(o.id)
      toast.success('Η υποχρέωση απαλλάχθηκε.')
      router.refresh()
    } catch {
      toast.error('Η απαλλαγή απέτυχε.')
      patchLocal(o.id, { status: prevStatus })
    }
  }

  async function handleRemove(o: ObligationItem) {
    if (!window.confirm(`Διαγραφή της υποχρέωσης «${o.name}»;`)) return
    const prevObligations = obligations
    setObligations(prevObligations.filter(x => x.id !== o.id))
    try {
      await removeObligation(o.id)
      toast.success('Η υποχρέωση διαγράφηκε.')
      router.refresh()
    } catch {
      toast.error('Η διαγραφή απέτυχε.')
      setObligations(prevObligations)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const { addedObligations, addedTasks } = await generateObligations(applicationId)
      const total = addedObligations + addedTasks
      if (total === 0) {
        toast.success('Δεν υπάρχουν νέες εγγραφές.')
      } else {
        toast.success(`Προστέθηκαν ${addedTasks} βήματα και ${addedObligations} υποχρεώσεις.`)
      }
      router.refresh()
      load()
    } catch {
      toast.error('Ο συγχρονισμός απέτυχε.')
    } finally {
      setSyncing(false)
    }
  }

  const visibleObligations = filterKind ? obligations.filter(o => o.kind === filterKind) : obligations

  const grouped = STAGE_ORDER.map(stage => ({
    stage,
    items: visibleObligations.filter(o => o.stage === stage),
  })).filter(g => g.items.length > 0)

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          {title} ({visibleObligations.length})
        </div>
        <div className="flex items-center gap-1.5">
          {showBoardToggle && <ListBoardToggle active={viewMode} onChange={handleViewChange} />}
          {canManage && (
            <>
              <Button type="button" variant="outline" onClick={handleSync} disabled={syncing}>
                {syncing ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuRefreshCw className="size-3.5" aria-hidden />}
                Συγχρονισμός από πρόγραμμα
              </Button>
              <AddObligationDialog applicationId={applicationId} onCreated={() => { load(); router.refresh() }} />
            </>
          )}
        </div>
      </div>

      {viewMode === 'board' ? (
        boardLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
          </div>
        ) : (
          <ObligationsBoard obligations={boardObligations} swimlaneBy="assignee" onStatusChange={handleBoardStatusChange} />
        )
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : visibleObligations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuListChecks className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(g => (
            <div key={g.stage}>
              <div className="dotted-leader mb-2 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                {stageLabel(g.stage)} ({g.items.length})
              </div>
              <div className="flex flex-col gap-2">
                {g.items.map(o => (
                  <ObligationRow
                    key={o.id}
                    obligation={o}
                    users={users}
                    canManage={canManage}
                    applicationId={applicationId}
                    programId={programId}
                    onStatusChange={status => handleStatusChange(o, status)}
                    onDueDateBlur={value => handleDueDateBlur(o, value)}
                    onAssigneeChange={value => handleAssigneeChange(o, value)}
                    onNotesBlur={value => handleNotesBlur(o, value)}
                    onWaive={() => handleWaive(o)}
                    onRemove={() => handleRemove(o)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Μικρό pill toggle «Λίστα / Πίνακας» — ίδιο idiom με το ViewBar του
 * pm-workspace.tsx, σε συμπαγές μέγεθος για να χωράει στη σειρά του header. */
function ListBoardToggle({ active, onChange }: { active: 'list' | 'board'; onChange: (key: 'list' | 'board') => void }) {
  const options: { key: 'list' | 'board'; label: string }[] = [
    { key: 'list', label: 'Λίστα' },
    { key: 'board', label: 'Πίνακας' },
  ]
  return (
    <div role="tablist" aria-label="Προβολή υποχρεώσεων" className="flex gap-0.5 rounded-full border border-border bg-card/60 p-1">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={active === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors',
            active === o.key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ObligationRow({
  obligation: o, users, canManage, applicationId, programId,
  onStatusChange, onDueDateBlur, onAssigneeChange, onNotesBlur, onWaive, onRemove,
}: {
  obligation: ObligationItem
  users: InternalUserOption[]
  canManage: boolean
  applicationId: string
  programId: string
  onStatusChange: (status: ObligationStatusStr) => void
  onDueDateBlur: (value: string) => void
  onAssigneeChange: (value: string) => void
  onNotesBlur: (value: string) => void
  onWaive: () => void
  onRemove: () => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isOverdue = !!o.dueDate && new Date(o.dueDate) < today && o.status !== 'APPROVED' && o.status !== 'WAIVED'

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold">{o.name}</span>
          <span className="badge-pill muted shrink-0">{obligationKindLabel(o.kind)}</span>
          <span className={cn('badge-pill shrink-0', o.templateId ? 'ok' : 'muted')}>
            {o.templateId ? 'Βήμα' : 'Πρόγραμμα'}
          </span>
          {o.mandatory && <span className="badge-pill warn shrink-0">Υποχρεωτικό</span>}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {o.status !== 'WAIVED' && (
              <Button type="button" size="sm" variant="outline" onClick={onWaive}>Απαλλαγή</Button>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Διαγραφή — ${o.name}`}
              title="Διαγραφή"
            >
              <LuTrash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="field !mb-0">
          <label htmlFor={`ob-status-${o.id}`}>Κατάσταση</label>
          <Select value={o.status} onValueChange={v => onStatusChange(v as ObligationStatusStr)}>
            <SelectTrigger id={`ob-status-${o.id}`} className="h-8 w-full rounded-full border-border bg-card px-3 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>{obligationStatusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="field !mb-0">
          <label htmlFor={`ob-due-${o.id}`} className="flex items-center gap-1.5">
            Προθεσμία
            {isOverdue && <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>Εκπρόθεσμο</span>}
          </label>
          <input
            id={`ob-due-${o.id}`}
            type="date"
            defaultValue={o.dueDate ? o.dueDate.slice(0, 10) : ''}
            onBlur={e => onDueDateBlur(e.target.value)}
            className="h-8 w-full rounded-full border border-border bg-card px-3 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`ob-assignee-${o.id}`}>Ανάθεση</label>
          <Select value={o.assigneeId ?? NONE_ASSIGNEE} onValueChange={v => onAssigneeChange(v ?? NONE_ASSIGNEE)} disabled={!canManage}>
            <SelectTrigger id={`ob-assignee-${o.id}`} className="h-8 w-full rounded-full border-border bg-card px-3 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_ASSIGNEE}>— (κανένας) —</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
              {!canManage && o.assigneeId && !users.some(u => u.id === o.assigneeId) && (
                <SelectItem value={o.assigneeId}>{o.assigneeName ?? '—'}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="field !mt-2.5 !mb-0">
        <label htmlFor={`ob-notes-${o.id}`}>Σημείωση</label>
        <Input
          id={`ob-notes-${o.id}`}
          defaultValue={o.notes ?? ''}
          placeholder="—"
          onBlur={e => onNotesBlur(e.target.value)}
          className="h-8 text-[12.5px]"
        />
      </div>

      <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px dotted var(--dotted)' }}>
        <ApplicationDocuments applicationId={applicationId} obligationId={o.id} programId={programId} appId={applicationId} />
      </div>
    </div>
  )
}

function AddObligationDialog({ applicationId, onCreated }: { applicationId: string; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [stage, setStage] = React.useState<StageStr>(STAGE_ORDER[0])
  const [name, setName] = React.useState('')
  const [mandatory, setMandatory] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (!next) { setName(''); setMandatory(true); setStage(STAGE_ORDER[0]) }
    setOpen(next)
  }

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Το όνομα της υποχρέωσης είναι υποχρεωτικό.')
      return
    }
    setSaving(true)
    try {
      await addObligation(applicationId, { stage, name: trimmed, mandatory })
      toast.success('Η υποχρέωση προστέθηκε.')
      onCreated()
      handleOpenChange(false)
    } catch {
      toast.error('Η προσθήκη απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <LuPlus className="size-3.5" aria-hidden /> Υποχρέωση
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Νέα υποχρέωση</DialogTitle>
            <DialogDescription>Πρόσθεσε μια χειροκίνητη υποχρέωση στη ροή εργασίας της αίτησης.</DialogDescription>
          </DialogHeader>

          <div className="field !mb-0">
            <label htmlFor="ob-new-stage">Στάδιο</label>
            <Select value={stage} onValueChange={v => setStage(v as StageStr)}>
              <SelectTrigger id="ob-new-stage" className="h-9 w-full rounded-full border-border bg-card px-3" disabled={saving}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map(s => (
                  <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="field !mb-0">
            <label htmlFor="ob-new-name">Όνομα υποχρέωσης</label>
            <Input
              id="ob-new-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="π.χ. Υποβολή αίτησης πληρωμής"
              autoFocus
              autoComplete="off"
              disabled={saving}
            />
          </div>

          <div className={cn('flex items-center gap-2.5')}>
            <Switch checked={mandatory} onCheckedChange={setMandatory} disabled={saving} id="ob-new-mandatory" />
            <label htmlFor="ob-new-mandatory" className="text-[12.5px] font-semibold">Υποχρεωτικό</label>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
            <Button type="button" onClick={handleAdd} disabled={saving || !name.trim()}>
              {saving ? 'Προσθήκη…' : (<><LuPlus className="size-3.5" aria-hidden /> Προσθήκη</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
