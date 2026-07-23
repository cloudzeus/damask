'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuUpload, LuDownload, LuTrash2, LuLoaderCircle, LuRefreshCw, LuChevronDown, LuChevronUp,
  LuX, LuFolderOpen, LuMailPlus,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  listApplicationDeliverables, uploadDeliverableTaskFile, removeDeliverableTaskFile,
  setDeliverableTaskStatus, addTaskDependency, removeTaskDependency, generateExpenseDeliverables,
  listCertifications, upsertCertification,
  type DeliverableMatrixItem, type CertificationItem,
} from '@/lib/pm/actions'
import { NewDocumentRequestDialog } from '@/components/pm/new-document-request-dialog'
import {
  DELIVERABLE_PHASE_ORDER, deliverablePhaseLabel, deliverableStatusLabel,
  type DeliverablePhaseStr, type DeliverableStatusStr,
} from '@/lib/pm/deliverable-phases'

type MatrixTask = DeliverableMatrixItem['tasks'][number]
type FlatTask = MatrixTask & { groupName: string }

function formatEUR(v: number): string {
  return `${v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Μετατρέπει ArrayBuffer → base64 σε chunks (32KB) — mirror του idiom στο
 * certification-tab.tsx/application-documents.tsx (spread ενός μεγάλου
 * Uint8Array μπορεί να ξεπεράσει το όριο ορισμάτων της μηχανής JS).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

/**
 * Λείπουσες πλευρές του scalar μέρους της πιστοποίησης (C2g V2 predicate —
 * βλ. certificationScalarsComplete στο src/lib/pm/cert-prep.ts). Τα παλιά
 * photo/bankStatement/newUnusedCert file-key πεδία ΔΕΝ εμφανίζονται πια εδώ —
 * τα αρχεία πιστοποίησης ζουν πλέον στα PHASE_A_CERTIFICATION/
 * FULL_CERTIFICATION tasks του ίδιου matrix (ορατά στην ίδια expanded γραμμή).
 */
function missingScalarPieces(item: CertificationItem): string[] {
  const missing: string[] = []
  if (!item.serialNumber && !item.location) missing.push('ταυτοποίηση (serial ή τοποθεσία)')
  if (!item.assetRegistryRef) missing.push('μητρώο παγίων')
  if (!item.paid) missing.push('πληρωμή')
  return missing
}

/**
 * «Φάκελος & Πιστοποίηση» tab (Task 8, C2g amended two-level model) — matrix
 * ομάδων παραδοτέων (ανά δαπάνη + επιπέδου έργου) × 9 φάσεις, με per-task
 * multi-file upload, accept/reject/waive/reset, blocked tooltips μέσω του
 * server-computed DAG (deliverable-phases.ts), και embedded τα scalar πεδία
 * πιστοποίησης (C2a.2) ανά ομάδα δαπάνης. Self-fetching client component,
 * mirror του idiom certification-tab.tsx/obligations-tab.tsx.
 *
 * Σκόπιμα ΔΕΝ χρησιμοποιεί listApplicationExpenses (@/lib/programs/actions) —
 * είναι κλειδωμένο πίσω από `programs.manage` (βλ. σχόλιο
 * listApplicationExpenseCategories στο pm/actions.ts) και θα έσπαγε το tab
 * για assigned pm.work χρήστες που δεν έχουν αυτό το δικαίωμα.
 * listCertifications (pm-scoped) ήδη επιστρέφει expenseDescription/amount
 * ΚΑΙ τα scalar πεδία πιστοποίησης σε μία κλήση — καλύπτει και τα δύο.
 */
export function DeliverablesMatrixTab({ applicationId, programId }: { applicationId: string; programId: string }) {
  const router = useRouter()
  const [matrix, setMatrix] = React.useState<DeliverableMatrixItem[]>([])
  const [certs, setCerts] = React.useState<CertificationItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [generating, setGenerating] = React.useState(false)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listApplicationDeliverables(applicationId), listCertifications(applicationId)])
      .then(([m, c]) => { setMatrix(m); setCerts(c) })
      .catch(() => setError('Η φόρτωση των παραδοτέων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  React.useEffect(() => { load() }, [load])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { addedDeliverables, addedTasks } = await generateExpenseDeliverables(applicationId)
      if (addedDeliverables === 0 && addedTasks === 0) {
        toast.success('Δεν υπάρχουν νέα παραδοτέα.')
      } else {
        toast.success(`Προστέθηκαν ${addedDeliverables} ομάδες και ${addedTasks} εργασίες.`)
      }
      router.refresh()
      load()
    } catch {
      toast.error('Η ανανέωση παραδοτέων απέτυχε.')
    } finally {
      setGenerating(false)
    }
  }

  function patchCertLocal(expenseId: string, patch: Partial<CertificationItem>) {
    setCerts(prev => prev.map(c => (c.expenseId === expenseId ? { ...c, ...patch } : c)))
  }

  async function persistCert(expenseId: string, patch: Parameters<typeof upsertCertification>[1]) {
    try {
      await upsertCertification(expenseId, patch)
      router.refresh()
    } catch {
      toast.error('Η ενημέρωση της πιστοποίησης απέτυχε.')
    } finally {
      listCertifications(applicationId).then(setCerts).catch(() => {})
    }
  }

  const certByExpenseId = React.useMemo(
    () => new Map(certs.map(c => [c.expenseId, c])),
    [certs],
  )

  const usedPhases = React.useMemo(
    () => DELIVERABLE_PHASE_ORDER.filter(p => matrix.some(g => g.tasks.some(t => t.phase === p))),
    [matrix],
  )

  // Flatten every task in the application — feeds the dependency Select and name lookups.
  const allTasks = React.useMemo<FlatTask[]>(
    () => matrix.flatMap(g => g.tasks.map(t => ({ ...t, groupName: g.name }))),
    [matrix],
  )

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Φάκελος &amp; Πιστοποίηση ({matrix.length})
        </div>
        <Button type="button" variant="outline" onClick={handleGenerate} disabled={generating}>
          {generating ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuRefreshCw className="size-3.5" aria-hidden />}
          Ανανέωση παραδοτέων
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : matrix.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuFolderOpen className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">
            Δεν υπάρχουν παραδοτέα ακόμα — πάτησε «Ανανέωση παραδοτέων» για να τα δημιουργήσεις από το πρόγραμμα.
          </p>
        </div>
      ) : (
        <div className="rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ομάδα</TableHead>
                {usedPhases.map(p => (
                  <TableHead key={p} className="text-center">{deliverablePhaseLabel(p)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map(g => {
                const expanded = expandedIds.has(g.id)
                const cert = g.expenseId != null ? certByExpenseId.get(g.expenseId) : undefined
                return (
                  <React.Fragment key={g.id}>
                    <TableRow
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => toggleExpand(g.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(g.id) }
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-normal">
                        <div className="flex items-start gap-1.5">
                          {expanded ? <LuChevronUp className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <LuChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold">{g.name}</div>
                            {g.expenseId == null ? (
                              <span className="badge-pill muted mt-0.5">Έργο</span>
                            ) : cert ? (
                              <div className="text-[11.5px] text-muted-foreground">{cert.expenseDescription} · {formatEUR(cert.amount)}</div>
                            ) : (
                              <div className="text-[11.5px] text-muted-foreground">—</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      {usedPhases.map(p => (
                        <TableCell key={p} className="text-center">
                          <DeliverableCell group={g} phase={p} />
                        </TableCell>
                      ))}
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={usedPhases.length + 1} className="whitespace-normal bg-muted/20 p-0">
                          <ExpandedGroup
                            group={g}
                            cert={cert}
                            applicationId={applicationId}
                            programId={programId}
                            allTasks={allTasks}
                            onReload={load}
                            onCertPatch={cert ? patch => patchCertLocal(cert.expenseId, patch) : undefined}
                            onCertPersist={cert ? patch => persistCert(cert.expenseId, patch) : undefined}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

/**
 * Progress chip «x/y» ενός group·φάσης — accepted-or-waived / mandatory (αν
 * υπάρχει τουλάχιστον μία υποχρεωτική εργασία, αλλιώς πάνω στο σύνολο των
 * εργασιών αυτής της φάσης, ώστε ένα κελί με μόνο προαιρετικές εργασίες να
 * μην μένει κενό). coral όταν υπάρχει REJECTED ή blocked εργασία σε αυτό το
 * κελί (independent από το αν το group έχει ήδη «κλείσει»).
 */
function DeliverableCell({ group, phase }: { group: DeliverableMatrixItem; phase: DeliverablePhaseStr }) {
  const tasksInPhase = group.tasks.filter(t => t.phase === phase)
  if (tasksInPhase.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const mandatory = tasksInPhase.filter(t => t.mandatory)
  const relevant = mandatory.length > 0 ? mandatory : tasksInPhase
  const total = relevant.length
  const done = relevant.filter(t => t.status === 'ACCEPTED' || t.status === 'WAIVED').length
  const hasAlert = tasksInPhase.some(t => t.status === 'REJECTED' || t.blocked)
  const anyStarted = tasksInPhase.some(t => t.status !== 'PENDING')

  let toneClass: string | undefined
  let style: React.CSSProperties | undefined
  if (hasAlert) {
    style = { color: 'var(--coral)', background: 'var(--coral-soft)' }
  } else if (total > 0 && done === total) {
    toneClass = 'ok'
  } else if (anyStarted) {
    toneClass = 'info'
  } else {
    toneClass = 'muted'
  }

  return (
    <span className={cn('badge-pill shrink-0', toneClass)} style={style}>
      {done}/{total}
    </span>
  )
}

function ExpandedGroup({
  group, cert, applicationId, programId, allTasks, onReload, onCertPatch, onCertPersist,
}: {
  group: DeliverableMatrixItem
  cert: CertificationItem | undefined
  applicationId: string
  programId: string
  allTasks: FlatTask[]
  onReload: () => void
  onCertPatch?: (patch: Partial<CertificationItem>) => void
  onCertPersist?: (patch: Parameters<typeof upsertCertification>[1]) => void
}) {
  const phasesInGroup = DELIVERABLE_PHASE_ORDER.filter(p => group.tasks.some(t => t.phase === p))

  return (
    <div className="flex flex-col gap-3 p-3">
      {group.expenseId != null && cert && onCertPatch && onCertPersist && (
        <CertScalarsMiniForm item={cert} onPatch={onCertPatch} onPersist={onCertPersist} />
      )}

      {phasesInGroup.map(phase => (
        <div key={phase}>
          <div className="dotted-leader mb-1.5 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
            {deliverablePhaseLabel(phase)}
          </div>
          <div className="flex flex-col gap-2">
            {group.tasks.filter(t => t.phase === phase).map(t => (
              <TaskRow
                key={t.id}
                task={t}
                applicationId={applicationId}
                programId={programId}
                allTasks={allTasks}
                onReload={onReload}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }: { status: DeliverableStatusStr }) {
  if (status === 'REJECTED') {
    return (
      <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
        {deliverableStatusLabel(status)}
      </span>
    )
  }
  const toneClass = status === 'ACCEPTED' || status === 'WAIVED' ? 'ok' : status === 'UPLOADED' ? 'info' : 'muted'
  return <span className={cn('badge-pill shrink-0', toneClass)}>{deliverableStatusLabel(status)}</span>
}

function TaskRow({
  task, applicationId, programId, allTasks, onReload,
}: {
  task: MatrixTask
  applicationId: string
  programId: string
  allTasks: FlatTask[]
  onReload: () => void
}) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [pendingPrereqId, setPendingPrereqId] = React.useState<string | undefined>(undefined)

  async function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setUploading(true)
    let failures = 0
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer()
        const base64 = arrayBufferToBase64(buffer)
        await uploadDeliverableTaskFile(task.id, {
          filename: file.name,
          base64,
          mimeType: file.type || 'application/octet-stream',
        })
      } catch (err) {
        failures += 1
        toast.error(err instanceof Error ? err.message : `Το ανέβασμα του «${file.name}» απέτυχε.`)
      }
    }
    setUploading(false)
    if (files.length - failures > 0) toast.success(`Ανέβηκαν ${files.length - failures} αρχεία.`)
    onReload()
    router.refresh()
  }

  async function handleRemoveFile(fileId: string, name: string) {
    if (!window.confirm(`Διαγραφή του αρχείου «${name}»;`)) return
    try {
      await removeDeliverableTaskFile(fileId)
      toast.success('Το αρχείο διαγράφηκε.')
      onReload()
      router.refresh()
    } catch {
      toast.error('Η διαγραφή απέτυχε.')
    }
  }

  async function handleStatus(status: DeliverableStatusStr, note?: string) {
    setBusy(true)
    try {
      await setDeliverableTaskStatus(task.id, status, note)
      toast.success('Η κατάσταση ενημερώθηκε.')
      onReload()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η ενημέρωση απέτυχε.')
    } finally {
      setBusy(false)
    }
  }

  function handleReject() {
    const note = window.prompt('Σημείωση απόρριψης (υποχρεωτικό):')
    if (note == null) return
    if (!note.trim()) {
      toast.error('Απαιτείται σημείωση απόρριψης.')
      return
    }
    void handleStatus('REJECTED', note)
  }

  async function handleAddDependency(prerequisiteId: string) {
    try {
      await addTaskDependency(task.id, prerequisiteId)
      toast.success('Η εξάρτηση προστέθηκε.')
      onReload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η προσθήκη εξάρτησης απέτυχε.')
    } finally {
      setPendingPrereqId(undefined)
    }
  }

  async function handleRemoveDependency(id: string) {
    try {
      await removeTaskDependency(id)
      toast.success('Η εξάρτηση αφαιρέθηκε.')
      onReload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αφαίρεση απέτυχε.')
    }
  }

  const acceptDisabledReason = task.blocked
    ? `Περιμένει: ${task.blockingNames.join(', ')}`
    : !task.canClose
      ? `Απαιτούνται τουλάχιστον ${task.minFiles} αρχεία (έχει ${task.files.length}).`
      : null

  const depOptions = allTasks.filter(
    t => t.id !== task.id && !task.dependencies.some(d => d.prerequisiteId === t.id),
  )

  return (
    <div className={cn('rounded-2xl border border-border bg-card/60 p-3 transition-opacity', task.blocked && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold">{task.name}</span>
          {task.mandatory && <span className="badge-pill warn shrink-0">Υποχρεωτικό</span>}
          {task.onSiteVerification && <span className="badge-pill info shrink-0">Επιτόπια επαλήθευση</span>}
          {task.minFiles > 0 && <span className="badge-pill muted shrink-0">{task.minFiles} αρχεία</span>}
          <StatusPill status={task.status} />
          {task.blocked && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="badge-pill shrink-0 cursor-default" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
                    Μπλοκαρισμένο
                  </span>
                }
              />
              <TooltipContent>Περιμένει: {task.blockingNames.join(', ')}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <NewDocumentRequestDialog
            applicationId={applicationId}
            deliverableTaskId={task.id}
            defaultTitle={task.name}
            onCreated={onReload}
            trigger={(
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Ζήτησε από πελάτη — ${task.name}`}
                title="Ζήτησε από πελάτη"
              >
                <LuMailPlus className="size-3.5" aria-hidden />
              </button>
            )}
          />
          {task.status !== 'PENDING' && (
            <Button type="button" size="sm" variant="outline" onClick={() => void handleStatus('PENDING')} disabled={busy}>
              Επαναφορά
            </Button>
          )}
          {task.status !== 'WAIVED' && (
            <Button type="button" size="sm" variant="outline" onClick={() => void handleStatus('WAIVED')} disabled={busy}>
              Απαλλαγή
            </Button>
          )}
          {task.status !== 'REJECTED' && (
            <Button type="button" size="sm" variant="outline" onClick={handleReject} disabled={busy}>
              Απόρριψη
            </Button>
          )}
          {task.status !== 'ACCEPTED' && (
            acceptDisabledReason ? (
              <Tooltip>
                <TooltipTrigger render={<span><Button type="button" size="sm" disabled>Αποδοχή</Button></span>} />
                <TooltipContent>{acceptDisabledReason}</TooltipContent>
              </Tooltip>
            ) : (
              <Button type="button" size="sm" onClick={() => void handleStatus('ACCEPTED')} disabled={busy}>
                Αποδοχή
              </Button>
            )
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuUpload className="size-3" aria-hidden />}
          {uploading ? 'Ανέβασμα…' : 'Ανέβασμα αρχείων'}
        </button>
      </div>

      {task.files.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {task.files.map(f => (
            <li key={f.id} className="flex min-w-0 items-center gap-1.5 text-[12px]">
              <span className="min-w-0 truncate font-semibold" title={f.name}>{f.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatSize(f.size)}</span>
              <a
                href={`/programs/${programId}/applications/${applicationId}/deliverables/${f.id}`}
                className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Λήψη — ${f.name}`}
                title="Λήψη"
              >
                <LuDownload className="size-3" aria-hidden />
              </a>
              <button
                type="button"
                onClick={() => handleRemoveFile(f.id, f.name)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Διαγραφή — ${f.name}`}
                title="Διαγραφή"
              >
                <LuTrash2 className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {task.notes && (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">Σημείωση: {task.notes}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-2" style={{ borderTop: '1px dotted var(--dotted)' }}>
        {task.dependencies.map(d => (
          <span
            key={d.id}
            className={cn('badge-pill shrink-0', d.auto ? 'muted' : 'info')}
            style={d.auto ? { border: '1px dashed var(--dotted)' } : undefined}
            title={d.auto ? 'Αυτόματη εξάρτηση' : 'Χειροκίνητη εξάρτηση'}
          >
            {d.prerequisiteName}
            {!d.auto && (
              <button
                type="button"
                onClick={() => handleRemoveDependency(d.id)}
                aria-label={`Αφαίρεση εξάρτησης — ${d.prerequisiteName}`}
                className="ml-0.5 inline-flex items-center"
              >
                <LuX className="size-2.5" aria-hidden />
              </button>
            )}
          </span>
        ))}
        {depOptions.length > 0 && (
          <Select
            value={pendingPrereqId}
            onValueChange={v => { setPendingPrereqId(v ?? undefined); if (v) void handleAddDependency(v) }}
          >
            <SelectTrigger size="sm" className="h-6 w-fit rounded-full border-dashed bg-transparent px-2 text-[11px]">
              <SelectValue placeholder="+ εξάρτηση" />
            </SelectTrigger>
            <SelectContent>
              {depOptions.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.groupName} · {t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}

/**
 * Trimmed scalar mini-form πιστοποίησης (C2a.2) ενσωματωμένη σε κάθε ομάδα
 * παραδοτέων επιπέδου δαπάνης — ίδιο persist idiom με CertificationCard
 * (certification-tab.tsx), ΧΩΡΙΣ τα τρία legacy file slots (photo/
 * bankStatement/newUnusedCert) — αυτά τα αρχεία ζουν πλέον στα
 * PHASE_A_CERTIFICATION/FULL_CERTIFICATION tasks του ίδιου matrix, ορατά
 * ακριβώς από κάτω στην ίδια expanded γραμμή.
 */
function CertScalarsMiniForm({
  item, onPatch, onPersist,
}: {
  item: CertificationItem
  onPatch: (patch: Partial<CertificationItem>) => void
  onPersist: (patch: Parameters<typeof upsertCertification>[1]) => void
}) {
  const missing = missingScalarPieces(item)

  function handleTextBlur(field: 'serialNumber' | 'location' | 'assetRegistryRef', value: string) {
    const next = value.trim() ? value.trim() : null
    if (next === item[field]) return
    onPatch({ [field]: next } as Partial<CertificationItem>)
    onPersist({ [field]: next })
  }

  function handleDateBlur(value: string) {
    const next = value ? value : null
    const prevValue = item.assetRegistryDate ? item.assetRegistryDate.slice(0, 10) : null
    if (next === prevValue) return
    onPatch({ assetRegistryDate: next ? new Date(next).toISOString() : null })
    onPersist({ assetRegistryDate: next })
  }

  function handlePaidChange(paid: boolean) {
    onPatch({ paid })
    onPersist({ paid })
  }

  function handleVerifiedChange(verified: boolean) {
    if (verified && !item.complete) return
    onPatch({ verified })
    onPersist({ verified })
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">Πιστοποίηση φυσικού αντικειμένου</span>
        {item.complete ? (
          <span className="badge-pill ok">Πιστοποιήσιμο</span>
        ) : (
          <span className="badge-pill muted">Εκκρεμεί: {missing.length > 0 ? missing.join(', ') : 'έλεγχος αρχείων'}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="field !mb-0">
          <label htmlFor={`dm-cert-serial-${item.expenseId}`}>Serial number</label>
          <Input
            id={`dm-cert-serial-${item.expenseId}`}
            defaultValue={item.serialNumber ?? ''}
            placeholder="—"
            onBlur={e => handleTextBlur('serialNumber', e.target.value)}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`dm-cert-location-${item.expenseId}`}>Τοποθεσία</label>
          <Input
            id={`dm-cert-location-${item.expenseId}`}
            defaultValue={item.location ?? ''}
            placeholder="—"
            onBlur={e => handleTextBlur('location', e.target.value)}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`dm-cert-registry-ref-${item.expenseId}`}>Μητρώο παγίων (αρ.)</label>
          <Input
            id={`dm-cert-registry-ref-${item.expenseId}`}
            defaultValue={item.assetRegistryRef ?? ''}
            placeholder="—"
            onBlur={e => handleTextBlur('assetRegistryRef', e.target.value)}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`dm-cert-registry-date-${item.expenseId}`}>Μητρώο παγίων (ημ/νία)</label>
          <input
            id={`dm-cert-registry-date-${item.expenseId}`}
            type="date"
            defaultValue={item.assetRegistryDate ? item.assetRegistryDate.slice(0, 10) : ''}
            onBlur={e => handleDateBlur(e.target.value)}
            className="h-8 w-full rounded-full border border-border bg-card px-3 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch checked={item.paid} onCheckedChange={handlePaidChange} id={`dm-cert-paid-${item.expenseId}`} />
          <label htmlFor={`dm-cert-paid-${item.expenseId}`} className="text-[12.5px] font-semibold">Πληρώθηκε</label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={item.verified}
            onCheckedChange={handleVerifiedChange}
            disabled={!item.complete && !item.verified}
            id={`dm-cert-verified-${item.expenseId}`}
          />
          <label htmlFor={`dm-cert-verified-${item.expenseId}`} className="text-[12.5px] font-semibold">Επαληθεύτηκε</label>
        </div>
        {!item.complete && (
          <span className="text-[11px] text-muted-foreground">Λείπουν: {missing.length > 0 ? missing.join(', ') : 'δικαιολογητικά φακέλου (βλ. εργασίες πιστοποίησης παρακάτω)'}</span>
        )}
      </div>
    </div>
  )
}
