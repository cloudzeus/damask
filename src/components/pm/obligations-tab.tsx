'use client'

import { SeriesPeriods } from './series-periods'
import { DossierSmartUpload } from '@/components/trdr/dossier-smart-upload'
import type { SeriesDetail } from '@/lib/pm/form-obligations'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuPlus, LuTrash2, LuLoaderCircle, LuRefreshCw, LuListChecks, LuMailPlus, LuFileCheck, LuCircleCheck, LuCircleX, LuEye, LuUpload, LuTriangleAlert, LuChevronRight, LuCircleDashed, LuBan } from 'react-icons/lu'
import { reconcileObligationsNow } from '@/lib/pm/obligations-reconcile-actions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listObligations, listSeriesDetails, listInternalUsers, addObligation, updateObligation, removeObligation, waiveObligation,
  generateObligations, listApplicationBoardObligations,
  type ObligationItem, type InternalUserOption, type BoardObligation,
} from '@/lib/pm/actions'
import {
  STAGE_ORDER, stageLabel, obligationStatusLabel, obligationKindLabel,
  type StageStr, type ObligationStatusStr, type ObligationKindStr,
} from '@/lib/pm/types'
import { ApplicationDocuments } from './application-documents'
import { DocumentPreviewButton } from '@/components/ui/document-preview'
import { ObligationsBoard } from './obligations-board'
import { NewDocumentRequestDialog } from './new-document-request-dialog'

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
  showBoardToggle = true, smartUploadTrdrId,
}: {
  applicationId: string
  canManage: boolean
  programId: string
  filterKind?: ObligationKindStr
  title?: string
  emptyMessage?: string
  showBoardToggle?: boolean
  /** Δικαιολογητικά: «Ανέβασμα με AI» στην κεφαλίδα (αναγνώριση τύπου/περιόδου → κάλυψη ελλείψεων). */
  smartUploadTrdrId?: string
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

  // Σειρές (π.χ. Φ2 ανά μήνα): πίνακας περιόδων κάτω από το αντίστοιχο δικαιολογητικό.
  const [series, setSeries] = React.useState<{ trdrId: string; details: Record<string, SeriesDetail> } | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    if (filterKind === 'FORM') listSeriesDetails(applicationId).then(setSeries).catch(() => setSeries(null))
    Promise.all([listObligations(applicationId), canManage ? listInternalUsers() : Promise.resolve<InternalUserOption[]>([])])
      .then(([o, u]) => { setObligations(o); setUsers(u) })
      .catch(() => setError('Η φόρτωση των υποχρεώσεων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId, canManage, filterKind])

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

  async function handleApprove(o: ObligationItem) {
    patchLocal(o.id, { status: 'APPROVED' })
    await persist(o.id, { status: 'APPROVED' })
    toast.success(`Εγκρίθηκε: ${o.name.slice(0, 60)}`)
  }

  async function handleReject(o: ObligationItem, reason: string) {
    const notes = `Απορρίφθηκε: ${reason.trim() || 'χρειάζεται νέο έγγραφο'}`
    patchLocal(o.id, { status: 'REJECTED', notes })
    await persist(o.id, { status: 'REJECTED', notes })
    toast.info('Απορρίφθηκε — ζητήστε νέο έγγραφο από τον πελάτη.')
  }

  async function handleWaive(o: ObligationItem) {
    const prevStatus = o.status
    patchLocal(o.id, { status: 'WAIVED' })
    try {
      await waiveObligation(o.id)
      toast.success('Σημειώθηκε «Δεν απαιτείται».')
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

  // Πρώτα ό,τι θέλει ενέργεια ΣΑΣ (έλεγχος), μετά τα απορριφθέντα, μετά όσα λείπουν· τα ολοκληρωμένα στο τέλος, μαζεμένα.
  const RANK: Record<ObligationStatusStr, number> = { SUBMITTED: 0, REJECTED: 1, IN_PROGRESS: 2, PENDING: 3, APPROVED: 4, WAIVED: 5 }
  const isDone = (o: ObligationItem) => o.status === 'APPROVED' || o.status === 'WAIVED'
  const grouped = STAGE_ORDER.map(stage => {
    const items = visibleObligations.filter(o => o.stage === stage).sort((a, b) => RANK[a.status] - RANK[b.status] || Number(b.mandatory) - Number(a.mandatory))
    return { stage, open: items.filter(o => !isDone(o)), done: items.filter(isDone) }
  }).filter(g => g.open.length + g.done.length > 0)
  const toReview = visibleObligations.filter(o => o.status === 'SUBMITTED').length
  const missing = visibleObligations.filter(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'REJECTED')
  const doneCount = visibleObligations.filter(isDone).length

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          {title} ({visibleObligations.length})
        </div>
        <div className="flex items-center gap-1.5">
          {smartUploadTrdrId && (
            <DossierSmartUpload trdrId={smartUploadTrdrId} defaultProgramId={programId} onDone={() => { load(); router.refresh() }} label="Ανέβασμα με AI" variant="default" />
          )}
          {showBoardToggle && <ListBoardToggle active={viewMode} onChange={handleViewChange} />}
          {canManage && (
            <>
              <ReconcileButton applicationId={applicationId} onDone={() => { load(); router.refresh() }} />
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
          <div className="flex items-center justify-center gap-2 py-8 text-[length:var(--fs-12-5)] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
          </div>
        ) : (
          <ObligationsBoard obligations={boardObligations} swimlaneBy="assignee" onStatusChange={handleBoardStatusChange} />
        )
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[length:var(--fs-12-5)] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[length:var(--fs-12-5)] text-coral">{error}</p>
      ) : visibleObligations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuListChecks className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[length:var(--fs-12-5)] text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Τι να κάνετε τώρα — με μια ματιά. */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-[length:var(--fs-12-5)]">
            <span className="font-semibold">Τι να κάνετε τώρα:</span>
            {toReview > 0 && <span className="badge-pill ok inline-flex items-center gap-1"><LuEye className="size-3" aria-hidden />{toReview} για έλεγχο & αποδοχή</span>}
            {missing.length > 0 && <span className="badge-pill warn inline-flex items-center gap-1"><LuTriangleAlert className="size-3" aria-hidden />{missing.length} λείπουν{missing.some(o => o.mandatory) ? ` (${missing.filter(o => o.mandatory).length} υποχρεωτικά)` : ''}</span>}
            {doneCount > 0 && <span className="badge-pill muted inline-flex items-center gap-1"><LuCircleCheck className="size-3" aria-hidden />{doneCount} ολοκληρώθηκαν</span>}
            {toReview === 0 && missing.length === 0 && <span className="text-[color:var(--success)]">Όλα είναι εντάξει — τίποτα δεν εκκρεμεί.</span>}
          </div>
          {grouped.map(g => (
            <div key={g.stage}>
              <div className="dotted-leader mb-2 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                {stageLabel(g.stage)} ({g.open.length + g.done.length})
              </div>
              <div className="flex flex-col gap-2">
                {g.open.map(o => (
                  <React.Fragment key={o.id}>
                  <ObligationRow
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
                    onApprove={() => handleApprove(o)}
                    onReject={reason => handleReject(o, reason)}
                    onRemove={() => handleRemove(o)}
                    onReload={load}
                  />
                  {series?.details[o.id] && <SeriesPeriods trdrId={series.trdrId} detail={series.details[o.id]} />}
                  </React.Fragment>
                ))}
                {g.done.length > 0 && (
                  <details className="group rounded-2xl border border-dashed border-border">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-[length:var(--fs-12)] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <LuChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
                      <LuCircleCheck className="size-3.5 text-[color:var(--success)]" aria-hidden /> Ολοκληρωμένα ({g.done.length}) — εγκεκριμένα ή δεν απαιτούνται
                    </summary>
                    <ul className="flex flex-col divide-y divide-border border-t border-dashed border-border">
                      {g.done.map(o => (
                        <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[length:var(--fs-12)]">
                          {o.status === 'APPROVED' ? <LuCircleCheck className="size-3.5 shrink-0 text-[color:var(--success)]" aria-label="Εγκρίθηκε" /> : <LuBan className="size-3.5 shrink-0 text-muted-foreground" aria-label="Δεν απαιτείται" />}
                          <span className="min-w-0 flex-1 truncate" title={o.name}>{o.name}</span>
                          <span className={cn('badge-pill shrink-0', o.status === 'APPROVED' ? 'ok' : 'muted')}>{o.status === 'APPROVED' ? 'Εγκρίθηκε' : 'Δεν απαιτείται'}</span>
                          {canManage && (
                            <button type="button" onClick={() => handleStatusChange(o, 'PENDING')} className="cursor-pointer rounded-full px-2 py-1 text-[length:var(--fs-11)] text-muted-foreground hover:bg-muted hover:text-foreground" title="Ξανανοίγει την εκκρεμότητα">
                              Αναίρεση
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
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
            'rounded-full px-2.5 py-1 text-[length:var(--fs-11)] font-semibold whitespace-nowrap transition-colors',
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
  onStatusChange, onDueDateBlur, onAssigneeChange, onNotesBlur, onWaive, onApprove, onReject, onRemove, onReload,
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
  onApprove: () => void
  onReject: (reason: string) => void
  onRemove: () => void
  onReload: () => void
}) {
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isOverdue = !!o.dueDate && new Date(o.dueDate) < today && o.status !== 'APPROVED' && o.status !== 'WAIVED'

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-[length:var(--fs-13)] font-semibold">{o.name}</span>
          <span className="badge-pill muted shrink-0">{obligationKindLabel(o.kind)}</span>
          <span className={cn('badge-pill shrink-0', o.templateId ? 'ok' : 'muted')}>
            {o.templateId ? 'Βήμα' : 'Πρόγραμμα'}
          </span>
          {o.mandatory && <span className="badge-pill warn shrink-0">Υποχρεωτικό</span>}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
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

      {/* Επόμενο βήμα — τι κάνει ο χρήστης ΤΩΡΑ σε αυτή την εκκρεμότητα. */}
      {o.status === 'SUBMITTED' ? (
        <div className="mt-2.5 rounded-xl border border-[color:var(--success)]/40 bg-[color:var(--success)]/8 p-2.5">
          <p className="flex items-start gap-1.5 text-[length:var(--fs-12-5)]">
            <LuEye className="mt-0.5 size-4 shrink-0 text-[color:var(--success)]" aria-hidden />
            <span><b>Υπάρχει έγγραφο — ελέγξτε το και αποδεχτείτε.</b> Ανοίξτε το, και αν είναι το σωστό και σε ισχύ, πατήστε «Αποδοχή».</span>
          </p>
          {o.docs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {o.docs.map(d => (
                <DocumentPreviewButton
                  key={d.id}
                  url={`/programs/${programId}/applications/${applicationId}/documents/${d.id}`}
                  name={d.name}
                  mimeType={d.mimeType}
                  className="!inline-block !w-auto"
                  trigger={<span className="inline-flex max-w-72 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[length:var(--fs-12)] font-semibold hover:border-[color:var(--success)] hover:text-[color:var(--success)]"><LuEye className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{d.name}</span></span>}
                />
              ))}
            </div>
          )}
          {canManage && (rejecting ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Γιατί; π.χ. έχει λήξει, λάθος έγγραφο" className="h-9 min-w-0 flex-1 text-[length:var(--fs-12-5)]" aria-label="Λόγος απόρριψης" />
              <Button type="button" size="sm" variant="destructive" onClick={() => { onReject(reason); setRejecting(false); setReason('') }}>Απόρριψη</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>Άκυρο</Button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={onApprove} className="!bg-[#1F7A4A] !text-white hover:!bg-[#17633B] dark:!bg-[#2E9E63]">
                <LuCircleCheck className="size-4" aria-hidden /> Αποδοχή
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(true)}>
                <LuCircleX className="size-4" aria-hidden /> Απόρριψη
              </Button>
            </div>
          ))}
        </div>
      ) : o.status === 'REJECTED' ? (
        <div className="mt-2.5 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/6 p-2.5">
          <p className="flex items-start gap-1.5 text-[length:var(--fs-12-5)]">
            <LuCircleX className="mt-0.5 size-4 shrink-0 text-[color:var(--danger)]" aria-hidden />
            <span><b>Απορρίφθηκε.</b> {o.notes?.replace(/^Απορρίφθηκε:\s*/, '') || 'Χρειάζεται νέο έγγραφο.'} — ανεβάστε σωστό έγγραφο παρακάτω ή ζητήστε το από τον πελάτη.</span>
          </p>
          {canManage && <MissingActions o={o} applicationId={applicationId} onReload={onReload} onWaive={onWaive} />}
        </div>
      ) : (
        <div className="mt-2.5 rounded-xl border border-[color:var(--warning)]/35 bg-[color:var(--warning)]/6 p-2.5">
          <p className="flex items-start gap-1.5 text-[length:var(--fs-12-5)]">
            {o.status === 'IN_PROGRESS' ? <LuCircleDashed className="mt-0.5 size-4 shrink-0 text-[color:var(--warning)]" aria-hidden /> : <LuUpload className="mt-0.5 size-4 shrink-0 text-[color:var(--warning)]" aria-hidden />}
            <span>
              <b>{o.status === 'IN_PROGRESS' ? 'Μερικώς — λείπουν ακόμη έγγραφα.' : 'Λείπει το έγγραφο.'}</b>{' '}
              {o.notes && o.status === 'IN_PROGRESS' ? `${o.notes} · ` : ''}Ανεβάστε το με «Ανέβασμα εγγράφου» παρακάτω, ζητήστε το από τον πελάτη, ή — αν δεν αφορά αυτή την επιχείρηση — «Δεν απαιτείται».
            </span>
          </p>
          {canManage && <MissingActions o={o} applicationId={applicationId} onReload={onReload} onWaive={onWaive} />}
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="field !mb-0">
          <label htmlFor={`ob-status-${o.id}`}>Κατάσταση</label>
          <Select value={o.status} onValueChange={v => onStatusChange(v as ObligationStatusStr)}>
            <SelectTrigger id={`ob-status-${o.id}`} className="h-8 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
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
            className="h-8 w-full rounded-full border border-border bg-card px-3 text-[length:var(--fs-12-5)] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`ob-assignee-${o.id}`}>Ανάθεση</label>
          <Select value={o.assigneeId ?? NONE_ASSIGNEE} onValueChange={v => onAssigneeChange(v ?? NONE_ASSIGNEE)} disabled={!canManage}>
            <SelectTrigger id={`ob-assignee-${o.id}`} className="h-8 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
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
          className="h-8 text-[length:var(--fs-12-5)]"
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
            <label htmlFor="ob-new-mandatory" className="text-[length:var(--fs-12-5)] font-semibold">Υποχρεωτικό</label>
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

/** «Έλεγχος από τα δικαιολογητικά»: κλείνει εκκρεμότητες που καλύπτονται ήδη από την αποθήκη της εταιρίας (και με ισοδύναμο τύπο). */
function ReconcileButton({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  async function run() {
    setBusy(true)
    try {
      const r = await reconcileObligationsNow(applicationId)
      const n = r.covered.length + r.series
      if (!n && !r.waived) toast.info('Δεν βρέθηκε κάτι νέο στα δικαιολογητικά της εταιρίας.', { description: 'Οι εκκρεμότητες που μένουν χρειάζονται νέο έγγραφο.' })
      else toast.success([n ? `${n} καλύφθηκαν — περιμένουν έγκριση` : null, r.waived ? `${r.waived} δεν απαιτούνται πια` : null].filter(Boolean).join(' · '), {
        description: r.covered.slice(0, 4).map(c => `${c.obligation.slice(0, 50)} ← «${c.doc}»`).join('\n') || undefined,
      })
      onDone()
    } catch { toast.error('Ο έλεγχος απέτυχε.') }
    setBusy(false)
  }
  return (
    <Button type="button" variant="outline" onClick={() => void run()} disabled={busy} title="Ψάχνει στα δικαιολογητικά της εταιρίας έγγραφα που καλύπτουν τις εκκρεμότητες — και με ισοδύναμο τύπο">
      {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuFileCheck className="size-3.5" aria-hidden />}
      Έλεγχος από τα δικαιολογητικά
    </Button>
  )
}

/** Ενέργειες για εκκρεμότητα που λείπει: ζήτηση από πελάτη (με κείμενο) και «Δεν απαιτείται». */
function MissingActions({ o, applicationId, onReload, onWaive }: { o: ObligationItem; applicationId: string; onReload: () => void; onWaive: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <NewDocumentRequestDialog
        applicationId={applicationId}
        obligationId={o.id}
        defaultTitle={o.name}
        onCreated={onReload}
        trigger={(
          <Button type="button" size="sm" variant="outline">
            <LuMailPlus className="size-4" aria-hidden /> Ζήτησε από πελάτη
          </Button>
        )}
      />
      <Button type="button" size="sm" variant="ghost" onClick={onWaive} title="Η εκκρεμότητα δεν αφορά αυτή την επιχείρηση">
        <LuBan className="size-4" aria-hidden /> Δεν απαιτείται
      </Button>
    </div>
  )
}
