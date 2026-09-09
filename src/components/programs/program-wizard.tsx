'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuWandSparkles, LuUpload, LuFile, LuLoaderCircle, LuCheck, LuChevronRight, LuChevronLeft,
  LuCircleCheckBig, LuTriangleAlert, LuFileText, LuPlus,
} from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  createProgram, extractProgram, getProgramBasics, listFormProposals, addFormProposals,
  type ProgramBasics, type FormProposal,
} from '@/lib/programs/actions'
import { createDocumentType } from '@/lib/documents/actions'
import { extractPdfText } from '@/lib/programs/pdf-text'

/**
 * «Οδηγός Αρχικοποίησης Προγράμματος» — καθοδηγούμενη ροή για μη-τεχνικό χρήστη.
 * Αρχές (ui-ux-pro-max): ένα βήμα = μία απόφαση, απλά ελληνικά χωρίς όρους,
 * μπάρα προόδου, το AI κάνει τη δουλειά κι ο χρήστης απλά επιβεβαιώνει/τσεκάρει,
 * πάντα «Πίσω», μηνύματα με παράδειγμα. Επαναχρησιμοποιεί το υπάρχον pipeline
 * (createProgram → extractProgram → listFormProposals → addFormProposals).
 */

type Step = 'upload' | 'basics' | 'docs' | 'done'
const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Ανέβασε' },
  { key: 'basics', label: 'Τα βασικά' },
  { key: 'docs', label: 'Δικαιολογητικά' },
  { key: 'done', label: 'Έτοιμο' },
]

const EUR = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const DATE = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function ProgramWizard() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <LuWandSparkles className="size-3.5" aria-hidden /> Νέο πρόγραμμα
      </Button>
      {open && <WizardDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function WizardDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>('upload')
  const [programId, setProgramId] = React.useState<string | null>(null)
  const stepIdx = STEPS.findIndex(s => s.key === step)

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="glass sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LuWandSparkles className="size-4 text-primary" aria-hidden /> Οδηγός νέου προγράμματος</DialogTitle>
          <DialogDescription>Θα σε καθοδηγήσω βήμα-βήμα. Το AI κάνει τη δουλειά — εσύ απλά επιβεβαιώνεις.</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex items-center gap-1.5" aria-label="Πρόοδος">
          {STEPS.map((s, i) => {
            const state = i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'todo'
            return (
              <li key={s.key} className="flex flex-1 items-center gap-1.5">
                <span className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold',
                  state === 'done' && 'bg-primary text-primary-foreground',
                  state === 'active' && 'bg-primary/15 text-primary ring-2 ring-primary',
                  state === 'todo' && 'bg-muted text-muted-foreground',
                )}>
                  {state === 'done' ? <LuCheck className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn('text-[0.71875rem] font-semibold', state === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>{s.label}</span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
              </li>
            )
          })}
        </ol>

        <div className="mt-1">
          {step === 'upload' && <StepUpload onDone={id => { setProgramId(id); setStep('basics') }} />}
          {step === 'basics' && programId && <StepBasics programId={programId} onBack={() => setStep('upload')} onNext={() => setStep('docs')} />}
          {step === 'docs' && programId && <StepDocs programId={programId} onBack={() => setStep('basics')} onNext={() => setStep('done')} />}
          {step === 'done' && programId && <StepDone programId={programId} onOpen={() => { onClose(); router.push(`/programs/${programId}`) }} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Βήμα 1: Ανέβασε ─────────────────────────────────────────────────────── */
function StepUpload({ onDone }: { onDone: (programId: string) => void }) {
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [label, setLabel] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!busy || progress < 30) return
    const t = setInterval(() => setProgress(p => (p < 92 ? p + 1 : p)), 2500)
    return () => clearInterval(t)
  }, [busy, progress])

  async function start() {
    setError(null)
    if (!title.trim()) { setError('Γράψε έναν τίτλο για το πρόγραμμα.'); return }
    if (!file) { setError('Διάλεξε το αρχείο PDF της προκήρυξης.'); return }
    setBusy(true)
    try {
      setLabel('Διαβάζω το κείμενο του PDF…'); setProgress(8)
      const text = await extractPdfText(file)
      if (!text.trim()) { setError('Αυτό το PDF δεν έχει κείμενο (μάλλον είναι σαρωμένη εικόνα). Δοκίμασε ένα PDF με κείμενο.'); setBusy(false); return }
      setLabel('Αποθηκεύω το αρχείο…'); setProgress(18)
      const pdfBase64 = arrayBufferToBase64(await file.arrayBuffer())
      const { id } = await createProgram({ title: title.trim(), sourceFileName: file.name, pdfBase64, mimeType: file.type || 'application/pdf' })
      setLabel('Το AI διαβάζει το πρόγραμμα και βρίσκει τα δικαιολογητικά… (ίσως πάρει λίγο)'); setProgress(30)
      const r = await extractProgram(id, text)
      if (!r.ok) { setError(r.error ?? 'Η ανάγνωση απέτυχε — δοκίμασε ξανά.'); setBusy(false); return }
      setProgress(100)
      onDone(id)
    } catch {
      setError('Κάτι πήγε στραβά. Δοκίμασε ξανά.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem] text-muted-foreground">Ανέβασε την <strong>προκήρυξη σε PDF</strong>. Θα τη διαβάσω και θα βρω τα βασικά στοιχεία και τα δικαιολογητικά για σένα.</p>
      <div className="field !mb-0">
        <label htmlFor="wz-title">Πώς θα λέγεται το πρόγραμμα;</label>
        <Input id="wz-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Ψηφιακός Μετασχηματισμός ΜμΕ" disabled={busy} autoFocus />
      </div>
      <div className="field !mb-0">
        <label>Το αρχείο PDF της προκήρυξης</label>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-5 text-left transition-colors hover:border-primary hover:bg-muted disabled:opacity-50">
          {file ? <LuFile className="size-5 shrink-0 text-primary" aria-hidden /> : <LuUpload className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="truncate text-[0.8125rem] font-semibold">{file ? file.name : 'Πάτησε εδώ για να διαλέξεις το PDF…'}</span>
        </button>
      </div>
      {busy && (
        <div className="flex flex-col gap-1.5 pt-1">
          <Progress value={progress} />
          <p className="text-center text-[0.71875rem] text-muted-foreground">{label}</p>
        </div>
      )}
      {error && <p className="flex items-start gap-1.5 text-[0.78125rem] text-coral"><LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}</p>}
      <div className="flex justify-end pt-1">
        <Button type="button" onClick={start} disabled={busy}>
          {busy ? <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Δουλεύω…</> : <>Ξεκίνα <LuChevronRight className="size-3.5" aria-hidden /></>}
        </Button>
      </div>
    </div>
  )
}

/* ── Βήμα 2: Τα βασικά ───────────────────────────────────────────────────── */
function StepBasics({ programId, onBack, onNext }: { programId: string; onBack: () => void; onNext: () => void }) {
  const [data, setData] = React.useState<ProgramBasics | null>(null)
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let cancelled = false
    getProgramBasics(programId).then(d => { if (!cancelled) { setData(d); setLoading(false) } }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [programId])

  const cards = data ? [
    { label: 'Τίτλος', value: data.title },
    { label: 'Προϋπολογισμός', value: data.totalBudget != null ? `${EUR.format(data.totalBudget)} €` : '—' },
    { label: 'Ποσοστό επιδότησης', value: data.fundingRate != null ? `έως ${data.fundingRate}%` : '—' },
    { label: 'Προθεσμία υποβολής', value: data.submissionEnd ? DATE.format(new Date(data.submissionEnd)) : '—' },
  ] : []

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem] text-muted-foreground">Αυτά βρήκα από την προκήρυξη. <strong>Ρίξε μια ματιά</strong> — αν κάτι δεν είναι σωστό, θα το διορθώσεις εύκολα αργότερα μέσα στο πρόγραμμα.</p>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {cards.map(c => (
            <div key={c.label} className="rounded-xl border border-border bg-card/60 p-3">
              <div className="text-[0.65625rem] font-semibold text-muted-foreground uppercase">{c.label}</div>
              <div className="mt-0.5 text-[0.875rem] font-bold">{c.value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="outline" onClick={onBack}><LuChevronLeft className="size-3.5" aria-hidden /> Πίσω</Button>
        <Button type="button" onClick={onNext}>Σωστά, συνέχισε <LuChevronRight className="size-3.5" aria-hidden /></Button>
      </div>
    </div>
  )
}

/* ── Βήμα 3: Δικαιολογητικά ──────────────────────────────────────────────── */
function StepDocs({ programId, onBack, onNext }: { programId: string; onBack: () => void; onNext: () => void }) {
  const [proposals, setProposals] = React.useState<FormProposal[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [creating, setCreating] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    listFormProposals(programId).then(p => { setProposals(p); setSelected(new Set(p.map(x => x.name))) }).catch(() => {}).finally(() => setLoading(false))
  }, [programId])
  React.useEffect(() => { reload() }, [reload])

  function toggle(name: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n })
  }

  async function createTypeFor(p: FormProposal) {
    setCreating(p.name)
    try { await createDocumentType(p.name, false); toast.success(`Τύπος «${p.name}» δημιουργήθηκε.`); reload() }
    catch { toast.error('Η δημιουργία τύπου απέτυχε.') } finally { setCreating(null) }
  }

  async function addAndNext() {
    const items = proposals.filter(p => selected.has(p.name)).map(p => ({ name: p.name, mandatory: p.mandatory, notes: p.notes, documentTypeId: p.suggestedDocumentTypeId }))
    setSaving(true)
    try {
      if (items.length) await addFormProposals(programId, items)
      onNext()
    } catch { toast.error('Κάτι πήγε στραβά.'); setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem] text-muted-foreground">Αυτά τα <strong>δικαιολογητικά</strong> εντόπισα. Ξε-τσέκαρε όποιο δεν χρειάζεται. (Μπορείς να προσθέσεις κι άλλα αργότερα.)</p>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <LuFileText className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[0.78125rem] text-muted-foreground">Δεν βρέθηκαν προτεινόμενα δικαιολογητικά — μπορείς να τα προσθέσεις χειροκίνητα μέσα στο πρόγραμμα.</p>
        </div>
      ) : (
        <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-border">
          {proposals.map(p => (
            <div key={p.name} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-0">
              <input type="checkbox" checked={selected.has(p.name)} onChange={() => toggle(p.name)} className="size-4 shrink-0 accent-[color:var(--primary)]" aria-label={p.name} />
              <span className="flex-1 text-[0.8125rem] font-semibold">{p.name}</span>
              {p.mandatory && <span className="badge-pill warn shrink-0">Υποχρεωτικό</span>}
              {p.suggestedDocumentTypeName
                ? <span className={cn('badge-pill shrink-0', p.suggestionFuzzy ? 'warn' : 'ok')}>{p.suggestionFuzzy ? 'τύπος (πρόταση): ' : 'τύπος: '}{p.suggestedDocumentTypeName}</span>
                : <button type="button" onClick={() => createTypeFor(p)} disabled={creating === p.name}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.65625rem] font-semibold hover:border-primary hover:text-primary">
                    {creating === p.name ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuPlus className="size-3" aria-hidden />} φτιάξε τύπο
                  </button>}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="outline" onClick={onBack} disabled={saving}><LuChevronLeft className="size-3.5" aria-hidden /> Πίσω</Button>
        <Button type="button" onClick={addAndNext} disabled={saving}>
          {saving ? <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> …</> : <>Πρόσθεσε &amp; συνέχισε ({selected.size}) <LuChevronRight className="size-3.5" aria-hidden /></>}
        </Button>
      </div>
    </div>
  )
}

/* ── Βήμα 4: Έτοιμο ──────────────────────────────────────────────────────── */
function StepDone({ onOpen }: { programId: string; onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[color:var(--success-soft)]">
        <LuCircleCheckBig className="size-7 text-[color:var(--success)]" aria-hidden />
      </div>
      <h3 className="text-[1rem] font-bold">Έτοιμο! Το πρόγραμμα στήθηκε.</h3>
      <p className="max-w-md text-[0.8125rem] text-muted-foreground">
        Πρόσθεσα τα δικαιολογητικά που διάλεξες. Θες να διαβάζω αυτόματα <strong>τιμές από έντυπα</strong> (π.χ. ΕΜΕ, ισολογισμό); Μέσα στο πρόγραμμα, στα «Έντυπα», σύνδεσε έναν «Οδηγό τιμών».
      </p>
      <Button type="button" onClick={onOpen}>Άνοιγμα προγράμματος <LuChevronRight className="size-3.5" aria-hidden /></Button>
    </div>
  )
}
