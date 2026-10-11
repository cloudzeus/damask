'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  GraduationCap, Brain, Users, Target, MoreVertical, Stethoscope, Files, Upload, Trash2,
  CheckCircle2, XCircle, LoaderCircle, ExternalLink, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { isPdfFile, rasterizePdf } from '@/lib/ocr/rasterize'
import { FIELD_TARGETS, TARGET_BY_KEY, HISTORY_ONLY_LABEL } from '@/lib/tax/field-targets'
import {
  addTrainingSample, listTypeSamples, deleteTrainingSample, diagnoseType, applyDiagnosis,
  type TrainingTypeRow, type TrainingSampleRow, type TypeDiagnosis, type ProposedField,
} from '@/lib/documents/training'

type Overview = { rows: TrainingTypeRow[]; totals: { samples: number; customers: number; accuracy: number | null } }
type UploadOutcome = { name: string; typeName: string; duplicate: boolean; predicted: string | null; correct: boolean; source: string; readByAi: boolean }

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`)
const VT_LABEL: Record<string, string> = { CURRENCY: 'Ποσό (€)', NUMBER: 'Αριθμός', PERCENT: 'Ποσοστό', INTEGER: 'Ακέραιος', DATE: 'Ημερομηνία', BOOLEAN: 'Ναι/Όχι', TEXT: 'Κείμενο' }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Ψηφιακό κείμενο των 2 πρώτων σελίδων (σαρωμένα/εικόνες: τα διαβάζει ο server με AI). */
async function readText(file: File): Promise<string> {
  if (!isPdfFile(file)) return ''
  const { text } = await rasterizePdf(file, { maxPages: 2 }).catch(() => ({ text: '' }))
  return (text ?? '').slice(0, 20_000)
}

function AccuracyBadge({ row }: { row: TrainingTypeRow }) {
  const total = row.training + row.uploads
  if (total < 3) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[length:var(--fs-11)] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Χρειάζεται δείγματα</span>
  const a = row.memoryAccuracy ?? 0
  const tone = a >= 0.8 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : a >= 0.5 ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
  return <span className={cn('rounded-full px-2 py-0.5 text-[length:var(--fs-11)] font-semibold tabular-nums', tone)}>{pct(row.memoryAccuracy)} χωρίς AI</span>
}

export function TrainingClient({ overview, canDiagnose }: { overview: Overview; canDiagnose: boolean }) {
  const router = useRouter()
  const [typeId, setTypeId] = React.useState<string | null>(null)
  const [outcomes, setOutcomes] = React.useState<UploadOutcome[]>([])
  const [samplesFor, setSamplesFor] = React.useState<TrainingTypeRow | null>(null)
  const [diagnoseFor, setDiagnoseFor] = React.useState<TrainingTypeRow | null>(null)
  const uploadRef = React.useRef<HTMLDivElement>(null)
  const typeName = overview.rows.find(r => r.id === typeId)?.name ?? ''

  async function upload(file: File): Promise<UploadOutcome> {
    if (!typeId) throw new Error('Διαλέξτε πρώτα τύπο.')
    const [base64, text] = await Promise.all([fileToBase64(file), readText(file)])
    const r = await addTrainingSample({ documentTypeId: typeId, fileName: file.name, base64, mimeType: file.type || 'application/pdf', text })
    if (!r.ok) throw new Error(r.message)
    const out = { name: file.name, typeName, duplicate: r.duplicate, predicted: r.predicted.typeName, correct: r.predicted.correct, source: r.predicted.source, readByAi: r.readByAi }
    setOutcomes(prev => [out, ...prev].slice(0, 30))
    return out
  }

  function startUpload(row: TrainingTypeRow) {
    setTypeId(row.id)
    uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const columns: DataTableColumn<TrainingTypeRow>[] = [
    { id: 'name', header: 'Τύπος', width: 280, enableHide: false, sortValue: r => r.name, cell: r => <b>{r.name}</b> },
    {
      id: 'samples', header: 'Δείγματα', width: 150, align: 'right', sortValue: r => r.training + r.uploads,
      cell: r => (
        <span className="tabular-nums" title={`${r.training} εκπαίδευσης · ${r.uploads} από καταχωρίσεις σε πελάτες`}>
          <b>{r.training + r.uploads}</b> <span className="text-muted-foreground">({r.training} εκπ. · {r.uploads} πελ.)</span>
        </span>
      ),
    },
    { id: 'customers', header: 'Πελάτες', width: 90, align: 'right', sortValue: r => r.customers, cell: r => <span className="tabular-nums">{r.customers}</span> },
    { id: 'accuracy', header: 'Αναγνώριση', width: 170, sortValue: r => (r.training + r.uploads < 3 ? -1 : r.memoryAccuracy ?? 0), cell: r => <AccuracyBadge row={r} /> },
    {
      id: 'signature', header: 'Χαρακτηριστικές λέξεις', width: 300, searchValue: r => r.signature.join(' '),
      cell: r => r.signature.length
        ? <span className="flex flex-wrap gap-1">{r.signature.slice(0, 6).map(t => <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[length:var(--fs-11)]">{t}</span>)}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'template', header: 'Πεδία Οδηγού', width: 130, sortValue: r => r.templateFields,
      cell: r => r.templateId
        ? <Link href={`/tax-templates/${r.templateId}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{r.templateFields} πεδία <ExternalLink className="size-3" aria-hidden /></Link>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'actions', header: '', width: 56, enableHide: false, enableResize: false, align: 'right',
      cell: r => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Ενέργειες για ${r.name}`} />}>
            <MoreVertical className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => startUpload(r)}><Upload className="size-4" aria-hidden /> Ανέβασμα δειγμάτων</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSamplesFor(r)} disabled={r.training + r.uploads === 0}><Files className="size-4" aria-hidden /> Δείγματα</DropdownMenuItem>
            {canDiagnose && (
              <DropdownMenuItem onClick={() => setDiagnoseFor(r)} disabled={r.training + r.uploads === 0}><Stethoscope className="size-4" aria-hidden /> Διάγνωση & πεδία</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const needs = overview.rows.filter(r => r.training + r.uploads < 3).length

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={Brain} label="Δείγματα στη μνήμη" value={overview.totals.samples.toLocaleString('el-GR')} hint={`${overview.rows.length} τύποι · ${needs} χρειάζονται δείγματα`} />
        <Kpi icon={Users} label="Πελάτες με δείγματα" value={overview.totals.customers.toLocaleString('el-GR')} hint="Ίδιος τύπος από πολλούς πελάτες = καλύτερη διάγνωση" />
        <Kpi icon={Target} label="Αναγνώριση χωρίς AI" value={pct(overview.totals.accuracy)} hint="Δοκιμή σε κάθε δείγμα σαν να ήταν καινούργιο" />
      </div>

      <section ref={uploadRef} className="glass scroll-mt-4 rounded-[18px] p-4">
        <div className="mb-3 flex items-center gap-2">
          <GraduationCap className="size-5 text-primary" aria-hidden />
          <h2 className="text-[length:var(--fs-15)] font-bold">Ανέβασμα δειγμάτων</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="training-type" className="text-[length:var(--fs-12)] font-semibold">1. Τι έγγραφα ανεβάζετε;</label>
            <Combobox
              id="training-type"
              ariaLabel="Τύπος εγγράφου"
              options={overview.rows.map(r => ({ value: r.id, label: r.name, hint: `${r.training + r.uploads} δείγματα` }))}
              value={typeId}
              onChange={setTypeId}
              placeholder="Αναζήτηση τύπου…"
              className="w-full"
            />
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">
              Όλα τα αρχεία της παρτίδας καταχωρίζονται σε αυτόν τον τύπο. Τα δείγματα δεν μπαίνουν σε κανέναν πελάτη — χρησιμοποιούνται μόνο για εκπαίδευση.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[length:var(--fs-12)] font-semibold">2. Σύρετε τα αρχεία {typeName && <>για «{typeName}»</>}</span>
            <FileDropzone<UploadOutcome>
              key={typeId ?? 'none'}
              uploadFn={file => upload(file)}
              onUploaded={() => router.refresh()}
              accept=".pdf,image/*"
              maxSizeMB={15}
              maxConcurrent={2}
              disabled={!typeId}
              helperText={typeId ? 'PDF ή εικόνες, έως 15MB. Τα σαρωμένα διαβάζονται αυτόματα.' : 'Διαλέξτε πρώτα τύπο εγγράφου.'}
            />
          </div>
        </div>

        {outcomes.length > 0 && (
          <ul className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border" aria-live="polite">
            {outcomes.map((o, i) => (
              <li key={`${o.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[length:var(--fs-12-5)]">
                {o.duplicate || o.correct
                  ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                  : <Sparkles className="size-4 shrink-0 text-amber-600" aria-hidden />}
                <span className="min-w-0 flex-1 truncate font-medium" title={o.name}>{o.name}</span>
                <span className="text-muted-foreground">
                  {o.duplicate
                    ? 'Υπάρχει ήδη ως δείγμα.'
                    : o.correct
                      ? `Το αναγνώριζε ήδη (${o.source === 'memory' ? 'από μνήμη, χωρίς AI' : 'με AI'}).`
                      : o.predicted
                        ? `Θα το έβρισκε ως «${o.predicted}» — τώρα έμαθε ότι είναι «${o.typeName}».`
                        : `Δεν το αναγνώριζε — τώρα έμαθε ότι είναι «${o.typeName}».`}
                  {o.readByAi && ' (σαρωμένο: διαβάστηκε με AI)'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DataTable
        tableId="document-training"
        columns={columns}
        rows={overview.rows}
        rowKey={r => r.id}
        initialSort={{ columnId: 'samples', dir: 'asc' }}
        emptyMessage="Δεν υπάρχουν ενεργοί τύποι εγγράφων."
        footer={<span>{overview.rows.length} τύποι</span>}
      />

      <SamplesDialog row={samplesFor} onClose={() => setSamplesFor(null)} onChanged={() => router.refresh()} />
      {canDiagnose && <DiagnosisDialog row={diagnoseFor} onClose={() => setDiagnoseFor(null)} onApplied={() => router.refresh()} />}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string }) {
  return (
    <div className="glass flex items-start gap-3 rounded-[18px] p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <div className="min-w-0">
        <div className="text-[length:var(--fs-12)] font-semibold text-muted-foreground">{label}</div>
        <div className="text-[length:var(--fs-24)] font-bold tabular-nums leading-tight">{value}</div>
        <div className="text-[length:var(--fs-11-5)] text-muted-foreground">{hint}</div>
      </div>
    </div>
  )
}

function SamplesDialog({ row, onClose, onChanged }: { row: TrainingTypeRow | null; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = React.useState<TrainingSampleRow[] | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!row) return
    let alive = true
    listTypeSamples(row.id).then(r => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
    return () => { alive = false; setItems(null) }
  }, [row])

  async function remove(s: TrainingSampleRow) {
    if (!window.confirm(`Αφαίρεση του δείγματος «${s.fileName}» από τη μνήμη;`)) return
    setBusy(s.id)
    try {
      await deleteTrainingSample(s.id)
      setItems(prev => prev?.filter(x => x.id !== s.id) ?? null)
      onChanged()
    } catch { toast.error('Η αφαίρεση απέτυχε.') } finally { setBusy(null) }
  }

  return (
    <Dialog open={!!row} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Δείγματα: {row?.name}</DialogTitle>
          <DialogDescription>Ό,τι έχει μάθει η αναγνώριση για αυτόν τον τύπο. Αφαιρέστε όσα ανέβηκαν κατά λάθος εδώ.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {!items ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
          ) : items.length === 0 ? (
            <p className="p-4 text-muted-foreground">Κανένα δείγμα.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {items.map(s => (
                <li key={s.id} className="flex items-start gap-3 py-2.5">
                  {s.wasCorrect ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Το αναγνώριζε σωστά" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Διόρθωση" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold" title={s.fileName}>{s.fileName}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[length:var(--fs-11)]">{s.origin === 'TRAINING' ? 'Εκπαίδευση' : s.customer ?? 'Πελάτης'}</span>
                    </div>
                    <p className="line-clamp-2 text-[length:var(--fs-11-5)] text-muted-foreground">{s.snippet || '(χωρίς κείμενο — μόνο όνομα αρχείου)'}</p>
                    {!s.wasCorrect && s.predicted && <p className="text-[length:var(--fs-11-5)] text-amber-700 dark:text-amber-400">Είχε προταθεί: {s.predicted}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Αφαίρεση ${s.fileName}`} disabled={busy === s.id} onClick={() => remove(s)}>
                    {busy === s.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type EditableField = ProposedField & { pick: boolean }

function DiagnosisDialog({ row, onClose, onApplied }: { row: TrainingTypeRow | null; onClose: () => void; onApplied: () => void }) {
  const [diag, setDiag] = React.useState<TypeDiagnosis | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<EditableField[]>([])
  const [useNotes, setUseNotes] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!row) return
    let alive = true
    diagnoseType(row.id)
      .then(d => {
        if (!alive) return
        setDiag(d)
        setFields(d.fields.map(f => ({ ...f, pick: !f.exists })))
        setUseNotes(!d.currentNotes && !!d.notes)
      })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Η διάγνωση απέτυχε.') })
    return () => { alive = false; setDiag(null); setError(null); setFields([]) }
  }, [row])

  const patch = (i: number, p: Partial<EditableField>) => setFields(prev => prev.map((f, j) => (j === i ? { ...f, ...p } : f)))

  async function apply() {
    if (!row || !diag) return
    setSaving(true)
    try {
      const r = await applyDiagnosis(row.id, {
        notes: useNotes ? diag.notes : null,
        fields: fields.filter(f => f.pick && !f.exists).map(f => ({ label: f.label, valueType: f.valueType, aiHint: f.aiHint, target: f.target })),
      })
      toast.success(r.added ? `Προστέθηκαν ${r.added} πεδία στον Οδηγό του τύπου.` : 'Αποθηκεύτηκε.', {
        description: r.added ? 'Από εδώ και πέρα, κάθε νέο έγγραφο αυτού του τύπου διαβάζεται αυτόματα.' : undefined,
        action: r.templateId ? { label: 'Άνοιγμα Οδηγού', onClick: () => window.open(`/tax-templates/${r.templateId}`, '_self') } : undefined,
      })
      onApplied()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.')
    } finally { setSaving(false) }
  }

  const picked = fields.filter(f => f.pick && !f.exists).length

  return (
    <Dialog open={!!row} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Διάγνωση: {row?.name}</DialogTitle>
          <DialogDescription>
            {diag ? `Από ${diag.samples} δείγματα${diag.customers ? ` ${diag.customers} πελατών` : ''}: πώς αναγνωρίζεται και τι αξίζει να διαβάζεται αυτόματα.` : 'Ανάλυση όλων των δειγμάτων του τύπου…'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-xl bg-rose-50 p-3 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
          ) : !diag ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Διαβάζω τα δείγματα…</div>
          ) : (
            <div className="flex flex-col gap-4">
              {diag.summary && <p className="text-[length:var(--fs-13)]">{diag.summary}</p>}
              {diag.signature.length > 0 && (
                <div>
                  <div className="mb-1 text-[length:var(--fs-12)] font-semibold">Χαρακτηριστικές λέξεις (αναγνώριση χωρίς AI)</div>
                  <div className="flex flex-wrap gap-1">{diag.signature.map(t => <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[length:var(--fs-11-5)]">{t}</span>)}</div>
                </div>
              )}
              {diag.notes && (
                <label className="flex items-start gap-2 rounded-xl border border-border p-3">
                  <input type="checkbox" className="mt-1" checked={useNotes} onChange={e => setUseNotes(e.target.checked)} />
                  <span className="min-w-0">
                    <span className="block text-[length:var(--fs-12)] font-semibold">Σημείωση τύπου (βοηθά την AI να τον ξεχωρίζει)</span>
                    <span className="block text-[length:var(--fs-12-5)]">{diag.notes}</span>
                    {diag.currentNotes && <span className="block text-[length:var(--fs-11-5)] text-muted-foreground">Τρέχουσα: {diag.currentNotes}</span>}
                  </span>
                </label>
              )}
              <div>
                <div className="mb-1.5 text-[length:var(--fs-12)] font-semibold">Προτεινόμενα πεδία προς αυτόματη ανάγνωση</div>
                {fields.length === 0 ? (
                  <p className="text-muted-foreground">Δεν βρέθηκαν σταθερά πεδία σε αυτά τα δείγματα.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {fields.map((f, i) => (
                      <li key={`${f.label}-${i}`} className={cn('rounded-xl border border-border p-3', f.exists && 'opacity-60')}>
                        <label className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1" checked={f.pick && !f.exists} disabled={f.exists} onChange={e => patch(i, { pick: e.target.checked })} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <b>{f.label}</b>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[length:var(--fs-11)]">{VT_LABEL[f.valueType] ?? f.valueType}</span>
                              {f.exists && <span className="text-[length:var(--fs-11)] text-muted-foreground">υπάρχει ήδη στον Οδηγό</span>}
                            </span>
                            {f.aiHint && <span className="block text-[length:var(--fs-12)] text-muted-foreground">Τι να βρει: {f.aiHint}</span>}
                          </span>
                        </label>
                        {!f.exists && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                            <span className="text-[length:var(--fs-11-5)] font-semibold text-muted-foreground">Πού καταχωρείται:</span>
                            <Select
                              value={f.target ?? '__history'}
                              onValueChange={v => {
                                const t = !v || v === '__history' ? null : TARGET_BY_KEY.get(v) ?? null
                                patch(i, t ? { target: t.key, valueType: t.valueType } : { target: null })
                              }}
                            >
                              <SelectTrigger aria-label={`Πού καταχωρείται: ${f.label}`} className="h-8 min-w-[240px] text-[length:var(--fs-12)]">
                                <SelectValue>{(v: string) => (v === '__history' ? HISTORY_ONLY_LABEL : `${TARGET_BY_KEY.get(v)?.group}: ${TARGET_BY_KEY.get(v)?.label}`)}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__history">{HISTORY_ONLY_LABEL}</SelectItem>
                                {FIELD_TARGETS.map(t => <SelectItem key={t.key} value={t.key}>{t.group}: {t.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Κλείσιμο</Button>
          <Button type="button" onClick={apply} disabled={!diag || saving || (picked === 0 && !useNotes)}>
            {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {picked ? `Προσθήκη ${picked} πεδίων στον Οδηγό` : 'Αποθήκευση σημείωσης'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
