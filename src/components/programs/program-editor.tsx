'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuTag, LuEuro, LuPercent, LuCalendar, LuHash, LuUsers, LuClock, LuBuilding2,
  LuUpload, LuRefreshCw, LuClipboardList, LuGift, LuTarget, LuFlag, LuMapPin, LuScale,
  LuInfo, LuCircleCheck, LuCircleX, LuClock3, LuLoaderCircle,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { updateProgramMeta, extractProgram } from '@/lib/programs/actions'
import { extractPdfText } from '@/lib/programs/pdf-text'

/**
 * Detail/editor του αποδελτιωμένου Προγράμματος (Task 14) — mirror του
 * TemplateEditor (src/components/tax/template-editor.tsx): «Στοιχεία» card
 * επεξεργάσιμο (core scalars → updateProgramMeta) + read-only cards για τις
 * σχέσεις που γεμίζει η AI αποδελτίωση (κατηγορίες δαπανών, παραδοτέα,
 * φάσεις, ΚΑΔ, bonuses, κριτήρια, προθεσμίες, περιφέρειες, νομικές μορφές).
 * Per-row editing των λιστών είναι follow-up εργασία — v1 δείχνει την
 * εξαγωγή για ανασκόπηση/διόρθωση των βασικών στοιχείων.
 */

export type ProgramExpenseCatData = {
  id: string
  name: string
  minPercentage: number | null
  maxPercentage: number | null
  minAmount: number | null
  maxAmount: number | null
  mandatory: boolean
  notes: string | null
}

export type ProgramDeliverableData = {
  id: string
  name: string
  description: string | null
  mandatory: boolean
  phaseName: string | null
}

export type ProgramData = {
  id: string
  title: string
  summary: string | null
  referenceCode: string | null
  totalBudget: number | null
  fundingRate: number | null
  durationMonths: number | null
  publicationDate: string | null
  submissionStart: string | null
  submissionEnd: string | null
  minEmployeesFte: number | null
  minOperationalYears: number | null
  eligibilityNote: string | null
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED'
  extractStatus: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'
  errorMessage: string | null
  notes: string | null
  kadRule: string | null
  expenseCats: ProgramExpenseCatData[]
  deliverables: ProgramDeliverableData[]
  phases: { id: string; name: string }[]
  kads: { id: string; code: string; description: string | null }[]
  bonuses: { id: string; kind: string; name: string; condition: string | null; bonusRate: number | null; bonusAmount: number | null }[]
  criteria: { id: string; name: string; weight: number | null; notes: string | null }[]
  deadlines: { id: string; name: string; date: string | null; notes: string | null }[]
  regions: { id: string; name: string; notes: string | null }[]
  legalForms: { id: string; name: string }[]
}

const STATUS_LABELS: Record<ProgramData['status'], string> = { DRAFT: 'Πρόχειρο', ACTIVE: 'Ενεργό', CLOSED: 'Κλειστό' }

const EXTRACT_META: Record<string, { label: string; badgeClass: string; style?: React.CSSProperties; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { label: 'Εκκρεμεί αποδελτίωση', badgeClass: 'badge-pill warn', icon: LuClock3 },
  RUNNING: { label: 'Αποδελτίωση σε εξέλιξη', badgeClass: 'badge-pill info', icon: LuLoaderCircle },
  DONE: { label: 'Αποδελτιώθηκε', badgeClass: 'badge-pill ok', icon: LuCircleCheck },
  FAILED: {
    label: 'Η αποδελτίωση απέτυχε', badgeClass: 'badge-pill',
    style: { color: 'var(--destructive)', background: 'color-mix(in srgb, var(--destructive) 12%, transparent)' },
    icon: LuCircleX,
  },
}

const KAD_RULE_LABELS: Record<string, string> = {
  ALL_EXCEPT_LISTED: 'Επιλέξιμοι όλοι οι ΚΑΔ ΕΚΤΟΣ των παρακάτω',
  ONLY_LISTED: 'Επιλέξιμοι ΜΟΝΟ οι παρακάτω ΚΑΔ',
  MIXED: 'Μικτός κανόνας (δες σημειώσεις ανά ΚΑΔ)',
  UNSPECIFIED: 'Δεν προσδιορίζεται στην προκήρυξη',
}

const BONUS_KIND_LABELS: Record<string, string> = {
  SPEED: 'Ταχύτητα υλοποίησης',
  INNOVATION: 'Καινοτομία',
  GREEN: 'Πράσινη μετάβαση',
  EMPLOYMENT: 'Απασχόληση',
  OTHER: 'Άλλο',
}

function formatEUR(v: number | null): string {
  return v == null ? '—' : `${v.toLocaleString('el-GR')} €`
}

function formatPct(v: number | null): string {
  return v == null ? '—' : `${v.toLocaleString('el-GR')}%`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('el-GR')
}

/** ISO datetime (ή null) → τιμή κατάλληλη για `<input type="date">`. */
function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function toNumberOrNull(v: string): number | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number(trimmed.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function validateRequired(v: string): string | null {
  return v.trim() ? null : 'Το πεδίο είναι υποχρεωτικό.'
}

function validateNonNegativeNumber(v: string, label: string): string | null {
  if (!v.trim()) return null
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? null : `${label} πρέπει να είναι μη αρνητικός αριθμός.`
}

function validatePercent(v: string): string | null {
  if (!v.trim()) return null
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? null : 'Το ποσοστό πρέπει να είναι από 0 έως 100.'
}

function validateNonNegativeInteger(v: string, label: string): string | null {
  if (!v.trim()) return null
  const n = Number(v.trim())
  return Number.isInteger(n) && n >= 0 ? null : `${label} πρέπει να είναι μη αρνητικός ακέραιος.`
}

export function ProgramEditor({ program }: { program: ProgramData }) {
  const router = useRouter()

  // ── «Στοιχεία» — επεξεργάσιμα core scalars ────────────────────────────
  const [title, setTitle] = React.useState(program.title)
  const [summary, setSummary] = React.useState(program.summary ?? '')
  const [referenceCode, setReferenceCode] = React.useState(program.referenceCode ?? '')
  const [totalBudget, setTotalBudget] = React.useState(program.totalBudget != null ? String(program.totalBudget) : '')
  const [fundingRate, setFundingRate] = React.useState(program.fundingRate != null ? String(program.fundingRate) : '')
  const [durationMonths, setDurationMonths] = React.useState(program.durationMonths != null ? String(program.durationMonths) : '')
  const [publicationDate, setPublicationDate] = React.useState(isoToDateInput(program.publicationDate))
  const [submissionStart, setSubmissionStart] = React.useState(isoToDateInput(program.submissionStart))
  const [submissionEnd, setSubmissionEnd] = React.useState(isoToDateInput(program.submissionEnd))
  const [minEmployeesFte, setMinEmployeesFte] = React.useState(program.minEmployeesFte != null ? String(program.minEmployeesFte) : '')
  const [minOperationalYears, setMinOperationalYears] = React.useState(program.minOperationalYears != null ? String(program.minOperationalYears) : '')
  const [eligibilityNote, setEligibilityNote] = React.useState(program.eligibilityNote ?? '')
  const [status, setStatus] = React.useState<ProgramData['status']>(program.status)
  const [notes, setNotes] = React.useState(program.notes ?? '')
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [savingMeta, startSaveMeta] = React.useTransition()

  function setFieldError(key: string, message: string | null) {
    setErrors(prev => {
      if (!message) {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: message }
    })
  }

  function validateDateOrder(): string | null {
    if (submissionStart && submissionEnd && submissionStart > submissionEnd) {
      return 'Η λήξη υποβολής πρέπει να είναι μετά την έναρξη.'
    }
    return null
  }

  function validateAll(): Record<string, string> {
    const next: Record<string, string> = {}
    const set = (key: string, message: string | null) => { if (message) next[key] = message }
    set('title', validateRequired(title))
    set('totalBudget', validateNonNegativeNumber(totalBudget, 'Ο συνολικός προϋπολογισμός'))
    set('fundingRate', validatePercent(fundingRate))
    set('durationMonths', validateNonNegativeInteger(durationMonths, 'Η διάρκεια'))
    set('minEmployeesFte', validateNonNegativeNumber(minEmployeesFte, 'Οι ελάχιστες ΕΜΕ'))
    set('minOperationalYears', validateNonNegativeNumber(minOperationalYears, 'Τα ελάχιστα έτη λειτουργίας'))
    set('submissionEnd', validateDateOrder())
    return next
  }

  function handleSaveMeta() {
    const nextErrors = validateAll()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      toast.error('Διόρθωσε τα πεδία με σφάλμα πριν την αποθήκευση.')
      return
    }
    startSaveMeta(async () => {
      try {
        await updateProgramMeta(program.id, {
          title: title.trim(),
          summary: summary.trim() ? summary.trim() : null,
          referenceCode: referenceCode.trim() ? referenceCode.trim() : null,
          totalBudget: toNumberOrNull(totalBudget),
          fundingRate: toNumberOrNull(fundingRate),
          durationMonths: durationMonths.trim() ? Math.round(Number(durationMonths)) : null,
          submissionStart: submissionStart || null,
          submissionEnd: submissionEnd || null,
          publicationDate: publicationDate || null,
          minEmployeesFte: toNumberOrNull(minEmployeesFte),
          minOperationalYears: toNumberOrNull(minOperationalYears),
          eligibilityNote: eligibilityNote.trim() ? eligibilityNote.trim() : null,
          status,
          notes: notes.trim() ? notes.trim() : null,
        })
        toast.success('Τα στοιχεία αποθηκεύτηκαν.')
        router.refresh()
      } catch {
        toast.error('Η αποθήκευση απέτυχε.')
      }
    })
  }

  // ── «Επαναποδελτίωση» — ξανά-ανέβασμα PDF + extractProgram ────────────
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [reExtractFile, setReExtractFile] = React.useState<File | null>(null)
  const [reExtracting, setReExtracting] = React.useState(false)
  const [reExtractProgress, setReExtractProgress] = React.useState(0)
  const [reExtractLabel, setReExtractLabel] = React.useState('')

  React.useEffect(() => {
    if (!reExtracting || reExtractProgress < 30) return
    const t = setInterval(() => setReExtractProgress(p => (p < 92 ? p + 1 : p)), 2500)
    return () => clearInterval(t)
  }, [reExtracting, reExtractProgress])

  function handleReextractFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (f) setReExtractFile(f)
  }

  async function handleRunReextract() {
    if (!reExtractFile) {
      toast.error('Επίλεξε πρώτα το PDF της προκήρυξης.')
      return
    }
    setReExtracting(true)
    setReExtractLabel('Ανάγνωση κειμένου PDF…')
    setReExtractProgress(5)
    try {
      const text = await extractPdfText(reExtractFile)
      if (!text.trim()) {
        toast.error('Το PDF δεν περιέχει επιλέξιμο κείμενο (π.χ. είναι σαρωμένη εικόνα).')
        return
      }
      setReExtractLabel('Αποδελτίωση με DeepSeek… (μπορεί να πάρει λεπτά)')
      setReExtractProgress(30)
      const r = await extractProgram(program.id, text)
      if (r.ok) {
        setReExtractProgress(100)
        toast.success('Η επαναποδελτίωση ολοκληρώθηκε — τα εξαγμένα στοιχεία αντικαταστάθηκαν.')
        setReExtractFile(null)
        router.refresh()
      } else {
        toast.error(r.error ?? 'Η αποδελτίωση απέτυχε.')
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Κάτι πήγε στραβά.')
    } finally {
      setReExtracting(false)
    }
  }

  const extract = EXTRACT_META[program.extractStatus] ?? EXTRACT_META.PENDING
  const ExtractIcon = extract.icon

  return (
    <div className="flex flex-col gap-4">
      {/* Κατάσταση αποδελτίωσης + επαναποδελτίωση */}
      <div className="glass rounded-[22px] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn(extract.badgeClass)} style={extract.style}>
            <ExtractIcon className={cn('size-3', program.extractStatus === 'RUNNING' && 'animate-spin')} aria-hidden /> {extract.label}
          </span>
          {program.extractStatus === 'FAILED' && program.errorMessage && (
            <span className="text-[12px] text-muted-foreground">{program.errorMessage}</span>
          )}
          <div className="flex-1" />
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleReextractFileChange} />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={reExtracting}>
            <LuUpload className="size-3.5" aria-hidden /> {reExtractFile ? reExtractFile.name : 'Επιλογή PDF'}
          </Button>
          <Button type="button" onClick={handleRunReextract} disabled={reExtracting || !reExtractFile}>
            <LuRefreshCw className={cn('size-3.5', reExtracting && 'animate-spin')} aria-hidden /> {reExtracting ? 'Επεξεργασία…' : 'Επαναποδελτίωση'}
          </Button>
        </div>
        {reExtracting && (
          <div className="mt-3 flex flex-col gap-1.5">
            <Progress value={reExtractProgress} />
            <p className="text-center text-[11.5px] text-muted-foreground">{reExtractLabel}</p>
          </div>
        )}
        <p className="mt-2.5 text-[11.5px] text-muted-foreground" style={{ borderTop: '1px dotted var(--dotted)', paddingTop: 10 }}>
          Ανέβασε ξανά την προκήρυξη (π.χ. ενημερωμένη έκδοση) για να ξανατρέξει η AI αποδελτίωση — αντικαθιστά όλα τα εξαγμένα στοιχεία (κατηγορίες δαπανών, παραδοτέα, φάσεις, ΚΑΔ κ.λπ.), όχι τα «Στοιχεία» παρακάτω αν τα έχεις αποθηκεύσει ξανά μετά.
        </p>
      </div>

      {/* Στοιχεία */}
      <section className="glass rounded-[22px] p-4">
        <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">Στοιχεία</div>

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="field">
            <label htmlFor="pm-title">Τίτλος</label>
            <div className="inwrap">
              <LuTag aria-hidden />
              <input
                id="pm-title" value={title} onChange={e => setTitle(e.target.value)}
                onBlur={() => setFieldError('title', validateRequired(title))} disabled={savingMeta}
              />
            </div>
            {errors.title && <div className="error">{errors.title}</div>}
          </div>

          <div className="field">
            <label htmlFor="pm-ref">Κωδικός αναφοράς</label>
            <div className="inwrap">
              <LuHash aria-hidden />
              <input id="pm-ref" value={referenceCode} onChange={e => setReferenceCode(e.target.value)} disabled={savingMeta} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="pm-status">Κατάσταση</label>
            <Select value={status} onValueChange={v => setStatus(v as ProgramData['status'])}>
              <SelectTrigger id="pm-status" aria-label="Κατάσταση" className="h-11 w-full rounded-full border-border bg-card px-4" disabled={savingMeta}>
                <SelectValue>{(v: string) => STATUS_LABELS[v as ProgramData['status']]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Πρόχειρο</SelectItem>
                <SelectItem value="ACTIVE">Ενεργό</SelectItem>
                <SelectItem value="CLOSED">Κλειστό</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="field">
            <label htmlFor="pm-budget">Συνολικός Π/Υ (€)</label>
            <div className="inwrap">
              <LuEuro aria-hidden />
              <input
                id="pm-budget" inputMode="decimal" value={totalBudget} onChange={e => setTotalBudget(e.target.value)}
                onBlur={() => setFieldError('totalBudget', validateNonNegativeNumber(totalBudget, 'Ο συνολικός προϋπολογισμός'))}
                disabled={savingMeta}
              />
            </div>
            {errors.totalBudget && <div className="error">{errors.totalBudget}</div>}
          </div>

          <div className="field">
            <label htmlFor="pm-rate">Ποσοστό επιχορήγησης (%)</label>
            <div className="inwrap">
              <LuPercent aria-hidden />
              <input
                id="pm-rate" inputMode="decimal" value={fundingRate} onChange={e => setFundingRate(e.target.value)}
                onBlur={() => setFieldError('fundingRate', validatePercent(fundingRate))} disabled={savingMeta}
              />
            </div>
            {errors.fundingRate && <div className="error">{errors.fundingRate}</div>}
          </div>

          <div className="field">
            <label htmlFor="pm-duration">Διάρκεια (μήνες)</label>
            <div className="inwrap">
              <LuClock aria-hidden />
              <input
                id="pm-duration" inputMode="numeric" value={durationMonths} onChange={e => setDurationMonths(e.target.value)}
                onBlur={() => setFieldError('durationMonths', validateNonNegativeInteger(durationMonths, 'Η διάρκεια'))}
                disabled={savingMeta}
              />
            </div>
            {errors.durationMonths && <div className="error">{errors.durationMonths}</div>}
          </div>

          <div className="field">
            <label htmlFor="pm-pubdate">Ημερομηνία δημοσίευσης</label>
            <div className="inwrap">
              <LuCalendar aria-hidden />
              <input id="pm-pubdate" type="date" value={publicationDate} onChange={e => setPublicationDate(e.target.value)} disabled={savingMeta} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="pm-substart">Έναρξη υποβολών</label>
            <div className="inwrap">
              <LuCalendar aria-hidden />
              <input id="pm-substart" type="date" value={submissionStart} onChange={e => setSubmissionStart(e.target.value)} disabled={savingMeta} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="pm-subend">Λήξη υποβολών</label>
            <div className="inwrap">
              <LuCalendar aria-hidden />
              <input
                id="pm-subend" type="date" value={submissionEnd} onChange={e => setSubmissionEnd(e.target.value)}
                onBlur={() => setFieldError('submissionEnd', validateDateOrder())} disabled={savingMeta}
              />
            </div>
            {errors.submissionEnd && <div className="error">{errors.submissionEnd}</div>}
          </div>

          <div className="field">
            <label htmlFor="pm-fte">Ελάχιστες ΕΜΕ</label>
            <div className="inwrap">
              <LuUsers aria-hidden />
              <input
                id="pm-fte" inputMode="decimal" value={minEmployeesFte} onChange={e => setMinEmployeesFte(e.target.value)}
                onBlur={() => setFieldError('minEmployeesFte', validateNonNegativeNumber(minEmployeesFte, 'Οι ελάχιστες ΕΜΕ'))}
                disabled={savingMeta}
              />
            </div>
            {errors.minEmployeesFte && <div className="error">{errors.minEmployeesFte}</div>}
          </div>

          <div className="field">
            <label htmlFor="pm-years">Ελάχιστα έτη λειτουργίας</label>
            <div className="inwrap">
              <LuBuilding2 aria-hidden />
              <input
                id="pm-years" inputMode="decimal" value={minOperationalYears} onChange={e => setMinOperationalYears(e.target.value)}
                onBlur={() => setFieldError('minOperationalYears', validateNonNegativeNumber(minOperationalYears, 'Τα ελάχιστα έτη λειτουργίας'))}
                disabled={savingMeta}
              />
            </div>
            {errors.minOperationalYears && <div className="error">{errors.minOperationalYears}</div>}
          </div>

          <div className="field sm:col-span-2 lg:col-span-3">
            <label htmlFor="pm-summary">Περίληψη</label>
            <textarea id="pm-summary" className="cms-textarea" rows={3} value={summary} onChange={e => setSummary(e.target.value)} disabled={savingMeta} />
          </div>

          <div className="field sm:col-span-2 lg:col-span-3">
            <label htmlFor="pm-eligibility">Σημείωση επιλεξιμότητας</label>
            <textarea id="pm-eligibility" className="cms-textarea" rows={2} value={eligibilityNote} onChange={e => setEligibilityNote(e.target.value)} disabled={savingMeta} />
          </div>

          <div className="field sm:col-span-2 lg:col-span-3">
            <label htmlFor="pm-notes">Σημειώσεις</label>
            <textarea id="pm-notes" className="cms-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={savingMeta} />
          </div>
        </div>

        <div className="mt-1 flex justify-end">
          <Button type="button" onClick={handleSaveMeta} disabled={savingMeta}>
            {savingMeta ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Button>
        </div>
      </section>

      {/* Κατηγορίες δαπανών — αυτές που χρησιμοποιεί το C3 για προτάσεις κατηγοριοποίησης δαπανών */}
      <ExpenseCategoriesSection categories={program.expenseCats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DeliverablesSection deliverables={program.deliverables} />
        <PhasesSection phases={program.phases} />
      </div>

      <KadsSection kads={program.kads} kadRule={program.kadRule} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BonusesSection bonuses={program.bonuses} />
        <CriteriaSection criteria={program.criteria} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DeadlinesSection deadlines={program.deadlines} />
        <RegionsSection regions={program.regions} />
        <LegalFormsSection legalForms={program.legalForms} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
 * Read-only sections — γεμίζουν από την AI αποδελτίωση (extractProgram).
 * Per-row επεξεργασία είναι follow-up εργασία, εκτός εμβέλειας του v1.
 * ═══════════════════════════════════════════════════════════════════════ */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
      {children}
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-[12.5px] text-muted-foreground">{children}</p>
}

function ExpenseCategoriesSection({ categories }: { categories: ProgramExpenseCatData[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Κατηγορίες δαπανών ({categories.length})</SectionHeader>
      {categories.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί κατηγορίες δαπανών ακόμη — τρέξε (επανα)αποδελτίωση για να τις γεμίσεις.</EmptyNote>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Κατηγορία</th>
                <th className="num">Ελάχ. %</th>
                <th className="num">Μέγ. %</th>
                <th className="num">Ελάχ. €</th>
                <th className="num">Μέγ. €</th>
                <th>Υποχρεωτική</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} className="dotted-row-bottom">
                  <td style={{ height: 'auto', whiteSpace: 'normal', padding: '10px' }}>
                    <b>{c.name}</b>
                    {c.notes && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{c.notes}</div>}
                  </td>
                  <td className="num">{formatPct(c.minPercentage)}</td>
                  <td className="num">{formatPct(c.maxPercentage)}</td>
                  <td className="num">{formatEUR(c.minAmount)}</td>
                  <td className="num">{formatEUR(c.maxAmount)}</td>
                  <td>{c.mandatory ? <span className="badge-pill ok">Υποχρεωτική</span> : <span className="badge-pill muted">Προαιρετική</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DeliverablesSection({ deliverables }: { deliverables: ProgramDeliverableData[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Παραδοτέα ({deliverables.length})</SectionHeader>
      {deliverables.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί παραδοτέα ακόμη.</EmptyNote>
      ) : (
        <div className="flex flex-col">
          {deliverables.map(d => (
            <div key={d.id} className="dotted-row-bottom flex flex-wrap items-start gap-2 py-2.5">
              <LuClipboardList className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="text-[13px]">{d.name}</b>
                  {d.phaseName && <span className="badge-pill info">{d.phaseName}</span>}
                  {d.mandatory ? <span className="badge-pill ok">Υποχρεωτικό</span> : <span className="badge-pill muted">Προαιρετικό</span>}
                </div>
                {d.description && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{d.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PhasesSection({ phases }: { phases: { id: string; name: string }[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Φάσεις ({phases.length})</SectionHeader>
      {phases.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί φάσεις ακόμη.</EmptyNote>
      ) : (
        <ol className="flex flex-col">
          {phases.map((p, i) => (
            <li key={p.id} className="dotted-row-bottom flex items-center gap-2.5 py-2.5">
              <span className="avatar-ring size-6 shrink-0 text-[11px]">{i + 1}</span>
              <span className="text-[13px]">{p.name}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function KadsSection({ kads, kadRule }: { kads: { id: string; code: string; description: string | null }[]; kadRule: string | null }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>ΚΑΔ ({kads.length})</SectionHeader>
      <div className="mb-3 flex items-start gap-2 text-[12.5px]">
        <LuInfo className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span>Κανόνας επιλεξιμότητας: <b>{kadRule ? (KAD_RULE_LABELS[kadRule] ?? kadRule) : 'Δεν προσδιορίζεται'}</b></span>
      </div>
      {kads.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί ΚΑΔ ακόμη.</EmptyNote>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {kads.map(k => (
            <span key={k.id} className="badge-pill info" title={k.description ?? undefined}>
              <span className="font-mono">{k.code}</span>{k.description ? ` — ${k.description}` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function BonusesSection({ bonuses }: { bonuses: { id: string; kind: string; name: string; condition: string | null; bonusRate: number | null; bonusAmount: number | null }[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Bonuses ({bonuses.length})</SectionHeader>
      {bonuses.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί bonuses ακόμη.</EmptyNote>
      ) : (
        <div className="flex flex-col">
          {bonuses.map(b => (
            <div key={b.id} className="dotted-row-bottom flex flex-wrap items-start gap-2 py-2.5">
              <LuGift className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="text-[13px]">{b.name}</b>
                  <span className="badge-pill info">{BONUS_KIND_LABELS[b.kind] ?? b.kind}</span>
                  {b.bonusRate != null && <span className="badge-pill ok">+{formatPct(b.bonusRate)}</span>}
                  {b.bonusAmount != null && <span className="badge-pill ok">+{formatEUR(b.bonusAmount)}</span>}
                </div>
                {b.condition && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{b.condition}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function CriteriaSection({ criteria }: { criteria: { id: string; name: string; weight: number | null; notes: string | null }[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Κριτήρια ({criteria.length})</SectionHeader>
      {criteria.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί κριτήρια αξιολόγησης ακόμη.</EmptyNote>
      ) : (
        <div className="flex flex-col">
          {criteria.map(c => (
            <div key={c.id} className="dotted-row-bottom flex flex-wrap items-start gap-2 py-2.5">
              <LuTarget className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="text-[13px]">{c.name}</b>
                  {c.weight != null && <span className="badge-pill info">Βαρύτητα {formatPct(c.weight)}</span>}
                </div>
                {c.notes && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{c.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function DeadlinesSection({ deadlines }: { deadlines: { id: string; name: string; date: string | null; notes: string | null }[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Προθεσμίες ({deadlines.length})</SectionHeader>
      {deadlines.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί προθεσμίες ακόμη.</EmptyNote>
      ) : (
        <div className="flex flex-col">
          {deadlines.map(d => (
            <div key={d.id} className="dotted-row-bottom flex flex-wrap items-start gap-2 py-2.5">
              <LuFlag className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="text-[13px]">{d.name}</b>
                  <span className="text-[11.5px] text-muted-foreground">{formatDate(d.date)}</span>
                </div>
                {d.notes && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{d.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function RegionsSection({ regions }: { regions: { id: string; name: string; notes: string | null }[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Περιφέρειες ({regions.length})</SectionHeader>
      {regions.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί περιορισμοί περιφέρειας — ισχύει πανελλαδικά.</EmptyNote>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {regions.map(r => (
            <span key={r.id} className="badge-pill muted" title={r.notes ?? undefined}>
              <LuMapPin className="size-3" aria-hidden /> {r.name}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function LegalFormsSection({ legalForms }: { legalForms: { id: string; name: string }[] }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <SectionHeader>Νομικές μορφές ({legalForms.length})</SectionHeader>
      {legalForms.length === 0 ? (
        <EmptyNote>Δεν έχουν εξαχθεί περιορισμοί νομικής μορφής.</EmptyNote>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {legalForms.map(f => (
            <span key={f.id} className="badge-pill muted">
              <LuScale className="size-3" aria-hidden /> {f.name}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
