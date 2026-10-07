'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuUpload, LuLoaderCircle, LuX, LuSparkles, LuBrain, LuCircleCheck, LuTriangleAlert, LuFileText, LuCloudUpload, LuCopy, LuInfo, LuFolderKanban,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { resolveExpiry } from '@/lib/documents/expiry-rule'
import {
  uploadTrdrDossierDoc, listTrdrProgramsForDossier, checkDossierDuplicates, listProgramNeedsForTypes,
  type DocumentTypeOption, type DossierDuplicateCheck, type ProgramNeed,
} from '@/lib/documents/actions'
import { classifyDocumentSmart, type SmartClassifyResult } from '@/lib/documents/smart-classify'
import { isPdfFile, rasterizePdf, imageFileToPage, normalizeImageMimeType } from '@/lib/ocr/rasterize'
import { runOcrExtraction } from '@/lib/ocr/actions'

/**
 * Έξυπνη μεταφόρτωση δικαιολογητικών: πολλά αρχεία μαζί → για το καθένα ανάγνωση
 * κειμένου + αναγνώριση (μνήμη ή AI) → ο χρήστης επιβεβαιώνει/διορθώνει τύπο,
 * πρόγραμμα, επαναχρησιμοποίηση και λήξη → «Αποθήκευση όλων». Κάθε αποθήκευση
 * γίνεται παράδειγμα εκμάθησης, ώστε οι επόμενες αναγνωρίσεις να είναι καλύτερες.
 */

type Phase = 'reading' | 'classifying' | 'ready' | 'saving' | 'saved' | 'error'

type Row = {
  id: string
  file: File
  phase: Phase
  error: string | null
  snippet: string
  suggestion: SmartClassifyResult | null
  typeId: string
  programId: string
  reusable: boolean
  hasExpiry: boolean
  expiresAt: string
  /** Από πού προέκυψε η λήξη (έγγραφο ή κανόνας τύπου) — null όταν ορίστηκε χειροκίνητα. */
  expiryNote: string | null
  /** SHA-256 περιεχομένου (εντοπισμός ίδιου αρχείου). */
  hash: string
  /** Διπλοεγγραφές στον πελάτη (ίδιο αρχείο / ίδιος τύπος). */
  dup: DossierDuplicateCheck | null
  /** skip = να μην αποθηκευτεί· keep = αποθήκευση κανονικά· replace = αντικατάσταση του παλιού ίδιου τύπου. */
  decision: 'skip' | 'keep' | 'replace'
  /** Ευρωπαϊκά προγράμματα που χρειάζονται αυτόν τον τύπο (του πελάτη + ενεργά). */
  needs: ProgramNeed[] | null
  /** Μετά την αποθήκευση: προγράμματα όπου καλύφθηκε εκκρεμότητα. */
  covered: string[]
}

const GENERAL = '__general__'
const DATE_FMT = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmt = (iso: string | null) => (iso ? DATE_FMT.format(new Date(iso)) : '')

async function sha256(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

/** Προεπιλογή: ίδιο αρχείο → παράλειψη· ίδιος τύπος που λήγει και υπάρχει → αντικατάσταση
 * (π.χ. νέα ενημερότητα αντικαθιστά την παλιά)· αλλιώς κανονική αποθήκευση. */
function defaultDecision(dup: DossierDuplicateCheck | null, typeExpires: boolean): Row['decision'] {
  if (dup?.exact.length) return 'skip'
  if (dup?.sameType.length && typeExpires) return 'replace'
  return 'keep'
}
const CONCURRENCY = 2

function readFileBase64(file: File): Promise<{ base64: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result)
      resolve({ base64: res.includes(',') ? res.split(',')[1] : res, ext: file.name.includes('.') ? file.name.split('.').pop()! : 'bin' })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Κείμενο εγγράφου: ψηφιακό κείμενο PDF αν υπάρχει, αλλιώς OCR (σκαναρισμένα/εικόνες). */
async function extractText(file: File): Promise<string> {
  if (isPdfFile(file)) {
    const { pages, text } = await rasterizePdf(file, { maxPages: 2 })
    if ((text ?? '').trim().length >= 80) return text!.slice(0, 60_000)
    const ocr = await runOcrExtraction({ images: pages.map(p => ({ base64: p.base64, mimeType: p.mimeType })), text: text || undefined, docType: 'auto' })
    return ocr.ok ? JSON.stringify(ocr.data).slice(0, 3000) : (text ?? '')
  }
  if (normalizeImageMimeType(file)) {
    const page = await imageFileToPage(file)
    const ocr = await runOcrExtraction({ images: [{ base64: page.base64, mimeType: page.mimeType }], docType: 'auto' })
    return ocr.ok ? JSON.stringify(ocr.data).slice(0, 3000) : ''
  }
  return '' // docx/xlsx κ.λπ.: αναγνώριση μόνο από το όνομα αρχείου
}

export function DossierSmartUpload({
  trdrId, types, onDone,
}: {
  trdrId: string
  types: DocumentTypeOption[]
  onDone: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<Row[]>([])
  const [programs, setPrograms] = React.useState<{ id: string; title: string }[]>([])
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const queue = React.useRef<string[]>([])
  const active = React.useRef(0)
  const files = React.useRef(new Map<string, File>())
  const typesRef = React.useRef(types)
  React.useEffect(() => { typesRef.current = types }, [types])

  const patch = (id: string, p: Partial<Row>) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)))

  async function process(id: string) {
    const file = files.current.get(id)
    if (!file) return
    try {
      const hash = await sha256(file).catch(() => '')
      patch(id, { hash })
      const text = await extractText(file).catch(() => '')
      patch(id, { phase: 'classifying', snippet: text })
      const res = await classifyDocumentSmart({ trdrId, fileName: file.name, text })
      if (!res.ok) {
        const [dup] = await checkDossierDuplicates(trdrId, [{ key: id, hash, typeId: null }]).catch(() => [null])
        patch(id, { phase: 'ready', error: res.message, dup: dup ?? null, decision: defaultDecision(dup ?? null, false) })
        return
      }
      const s = res.result
      const t = typesRef.current.find(x => x.id === s.typeId)
      const [[dup], needs] = await Promise.all([
        checkDossierDuplicates(trdrId, [{ key: id, hash, typeId: s.typeId }]).catch(() => [null]),
        s.typeId ? listProgramNeedsForTypes(trdrId, [s.typeId]).catch(() => ({} as Record<string, ProgramNeed[]>)) : Promise.resolve({} as Record<string, ProgramNeed[]>),
      ])
      patch(id, {
        dup: dup ?? null,
        needs: s.typeId ? (needs[s.typeId] ?? []) : null,
        decision: defaultDecision(dup ?? null, !!t?.expires),
        phase: 'ready',
        suggestion: s,
        typeId: s.typeId ?? '',
        programId: s.programId ?? GENERAL,
        reusable: s.reusable,
        hasExpiry: !!(t?.expires || s.expiresAt),
        expiresAt: s.expiresAt ?? '',
        expiryNote: s.expiryNote ?? null,
      })
    } catch (err) {
      patch(id, { phase: 'ready', error: err instanceof Error ? err.message : 'Η αναγνώριση απέτυχε.' })
    }
  }

  function pump() {
    while (active.current < CONCURRENCY && queue.current.length > 0) {
      const id = queue.current.shift()!
      active.current += 1
      void process(id).finally(() => { active.current -= 1; pump() })
    }
  }

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list)
    if (arr.length === 0) return
    const newRows: Row[] = arr.map(file => {
      const id = crypto.randomUUID()
      files.current.set(id, file)
      return {
        id, file, phase: 'reading', error: null, snippet: '', suggestion: null,
        typeId: '', programId: GENERAL, reusable: true, hasExpiry: false, expiresAt: '', expiryNote: null,
        hash: '', dup: null, decision: 'keep', needs: null, covered: [],
      }
    })
    setRows(prev => [...prev, ...newRows])
    queue.current.push(...newRows.map(r => r.id))
    pump()
  }

  function openDialog() {
    setOpen(true)
    listTrdrProgramsForDossier(trdrId).then(setPrograms).catch(() => setPrograms([]))
  }

  const busy = rows.some(r => r.phase === 'reading' || r.phase === 'classifying' || r.phase === 'saving')
  const pending = rows.filter(r => r.phase !== 'saved' && r.decision !== 'skip')
  const missingType = pending.some(r => r.phase === 'ready' && !r.typeId)

  // Ίδιο αρχείο δύο φορές στην ίδια παρτίδα: το δεύτερο δείχνει στο πρώτο.
  const batchDupOf = React.useMemo(() => {
    const first = new Map<string, Row>()
    const out = new Map<string, Row>()
    for (const r of rows) {
      if (!r.hash) continue
      const f = first.get(r.hash)
      if (f) out.set(r.id, f)
      else first.set(r.hash, r)
    }
    return out
  }, [rows])

  /** Αλλαγή τύπου → ξαναέλεγχος «ίδιου τύπου» για αυτό το αρχείο. */
  async function recheck(row: Row, typeId: string) {
    const t = types.find(x => x.id === typeId)
    const [[dup], needs] = await Promise.all([
      checkDossierDuplicates(trdrId, [{ key: row.id, hash: row.hash, typeId }]).catch(() => [null]),
      listProgramNeedsForTypes(trdrId, [typeId]).catch(() => ({} as Record<string, ProgramNeed[]>)),
    ])
    patch(row.id, { dup: dup ?? null, decision: defaultDecision(dup ?? null, !!t?.expires), needs: needs[typeId] ?? [] })
  }

  function handleOpenChange(next: boolean) {
    if (!next && busy) return
    if (!next) { setRows([]); queue.current = []; files.current.clear() }
    setOpen(next)
  }

  async function saveAll() {
    let saved = 0
    let coveredTotal = 0
    for (const r of rows) {
      if (r.phase !== 'ready' || !r.typeId || r.decision === 'skip' || batchDupOf.has(r.id)) continue
      const replaceDocId = r.decision === 'replace' ? (r.dup?.sameType[0]?.id ?? null) : null
      patch(r.id, { phase: 'saving' })
      try {
        const { base64, ext } = await readFileBase64(r.file)
        const res = await uploadTrdrDossierDoc(trdrId, {
          documentTypeId: r.typeId,
          name: r.file.name.replace(/\.[^.]+$/, ''),
          base64,
          mimeType: r.file.type || 'application/octet-stream',
          ext,
          issuedAt: r.suggestion?.issuedAt ?? null,
          expiresAt: r.hasExpiry && r.expiresAt ? r.expiresAt : null,
          programId: r.programId === GENERAL ? null : r.programId,
          reusable: r.programId === GENERAL ? true : r.reusable,
          learn: { predictedTypeId: r.suggestion?.typeId ?? null, snippet: r.snippet, fileName: r.file.name },
          replaceDocId,
          fullText: r.snippet || null,
        })
        patch(r.id, { phase: 'saved', covered: res.coveredPrograms })
        if (res.mme) {
          const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
          toast.success(`Δήλωση ΜΜΕ ${res.mme.year}: ${res.mme.category ?? '—'} επιχείρηση`, {
            description: res.mme.afmMismatch
              ? '⚠ Το ΑΦΜ της δήλωσης ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.'
              : [
                  `ΕΜΕ ${res.mme.eme ?? '—'} · κύκλος εργασιών ${res.mme.turnover != null ? eur.format(res.mme.turnover) : '—'}.`,
                  res.mme.official ? 'Επίσημο έγγραφο (gov.gr) — υπερισχύει Ε3/μισθοδοσίας για το έτος.' : null,
                  res.mme.updatedCompany ? 'Ενημερώθηκε η καρτέλα της εταιρίας.' : null,
                ].filter(Boolean).join(' '),
          })
        }
        if (res.e3) {
          const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
          toast.success(`Ε3 ${res.e3.year}: κύκλος εργασιών ${res.e3.turnover != null ? eur.format(res.e3.turnover) : '—'}`, {
            description: [
              res.e3.afmMismatch ? null : res.e3.updatedCompany ? 'Ενημερώθηκε ο κύκλος εργασιών στην καρτέλα της εταιρίας.' : 'Η καρτέλα έχει ήδη νεότερο έτος — καταχωρίστηκαν μόνο τα στοιχεία του έτους.',
              res.e3.years.length > 1 ? `Στοιχεία για τα έτη ${res.e3.years.join(', ')}.` : null,
              res.e3.afmMismatch ? '⚠ Το ΑΦΜ του εντύπου ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.' : null,
            ].filter(Boolean).join(' '),
          })
        }
        if (res.eme) {
          const nf = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 })
          toast.success(`ΕΜΕ χρήσης ${res.eme.year}: ${res.eme.eme != null ? nf.format(res.eme.eme) : '—'} (${res.eme.employees} εργαζόμενοι)`, {
            description: [
              res.eme.afmMismatch ? null : res.eme.updatedCompany ? 'Ενημερώθηκαν οι εργαζόμενοι στην καρτέλα της εταιρίας.' : 'Η καρτέλα έχει ήδη νεότερη χρήση — δεν άλλαξε.',
              res.eme.afmMismatch ? '⚠ Το ΑΦΜ του εγγράφου ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.' : null,
            ].filter(Boolean).join(' '),
          })
        }
        coveredTotal += res.covered
        saved += 1
      } catch {
        patch(r.id, { phase: 'error', error: 'Η αποθήκευση απέτυχε.' })
      }
    }
    if (saved > 0) {
      toast.success(saved === 1 ? 'Αποθηκεύτηκε 1 δικαιολογητικό.' : `Αποθηκεύτηκαν ${saved} δικαιολογητικά.`, {
        description: coveredTotal ? `Καλύφθηκαν ${coveredTotal} εκκρεμότητες σε προγράμματα — μένει έλεγχος & έγκριση.` : undefined,
      })
      onDone()
    }
  }

  const allSaved = rows.length > 0 && rows.every(r => r.phase === 'saved' || r.decision === 'skip' || batchDupOf.has(r.id))
  const toSave = pending.filter(r => r.phase === 'ready' && !batchDupOf.has(r.id)).length

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        <LuSparkles className="size-3.5" aria-hidden /> Δικαιολογητικά
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LuSparkles className="size-4 text-primary" aria-hidden /> Έξυπνη καταχώριση δικαιολογητικών</DialogTitle>
            <DialogDescription>
              Ανέβασε ένα ή περισσότερα αρχεία — αναγνωρίζεται αυτόματα ο τύπος, το πρόγραμμα και η λήξη. Έλεγξε, διόρθωσε αν χρειάζεται και αποθήκευσε. Κάθε διόρθωσή σου κάνει την αναγνώριση πιο έξυπνη.
            </DialogDescription>
          </DialogHeader>

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 text-center transition-colors',
              rows.length ? 'py-4' : 'py-9',
              dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50',
            )}
          >
            <LuCloudUpload className="size-7 text-primary" aria-hidden />
            <p className="text-[length:var(--fs-13-5)] font-semibold">Σύρε δικαιολογητικά εδώ ή πάτησε για επιλογή</p>
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">PDF, εικόνες, Word, Excel · πολλά αρχεία μαζί</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
          </div>

          {rows.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {rows.map(r => (
                <RowCard
                  key={r.id}
                  row={r}
                  types={types}
                  programs={programs}
                  batchDupOf={batchDupOf.get(r.id) ?? null}
                  onChange={p => patch(r.id, p)}
                  onTypeChange={typeId => void recheck(r, typeId)}
                  onRemove={() => { setRows(prev => prev.filter(x => x.id !== r.id)); files.current.delete(r.id) }}
                />
              ))}
            </ul>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              {allSaved ? 'Κλείσιμο' : 'Άκυρο'}
            </Button>
            {!allSaved && (
              <Button type="button" onClick={saveAll} disabled={busy || toSave === 0 || missingType}>
                {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuUpload className="size-3.5" aria-hidden />}
                {missingType ? 'Επίλεξε τύπο σε όλα' : `Αποθήκευση όλων (${toSave})`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ConfidenceChip({ s }: { s: SmartClassifyResult | null }) {
  if (!s || s.source === 'none' || !s.typeId) {
    return <span className="badge-pill warn"><LuTriangleAlert className="size-3" aria-hidden /> Δεν αναγνωρίστηκε — επίλεξε τύπο</span>
  }
  const pct = Math.round(s.confidence * 100)
  const low = s.confidence < 0.6
  return (
    <span className={cn('badge-pill', low ? 'warn' : s.source === 'memory' ? 'ok' : 'info')} title={s.reason ?? undefined}>
      {s.source === 'memory' ? <LuBrain className="size-3" aria-hidden /> : <LuSparkles className="size-3" aria-hidden />}
      {s.source === 'memory' ? 'Από μνήμη' : 'AI'} {pct}%{low ? ' · έλεγξε' : ''}
    </span>
  )
}

function RowCard({
  row, types, programs, batchDupOf, onChange, onTypeChange, onRemove,
}: {
  row: Row
  types: DocumentTypeOption[]
  programs: { id: string; title: string }[]
  batchDupOf: Row | null
  onChange: (p: Partial<Row>) => void
  onTypeChange: (typeId: string) => void
  onRemove: () => void
}) {
  const skipped = row.decision === 'skip' || !!batchDupOf
  const working = row.phase === 'reading' || row.phase === 'classifying'
  const locked = working || row.phase === 'saving' || row.phase === 'saved'
  const sizeKb = Math.max(1, Math.round(row.file.size / 1024))
  return (
    <li className={cn('rounded-2xl border bg-card p-3', row.phase === 'saved' ? 'border-[color:var(--success)]/40' : 'border-border', skipped && row.phase !== 'saved' && 'opacity-70')}>
      <div className="flex items-start gap-2.5">
        <span className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {working || row.phase === 'saving'
            ? <LuLoaderCircle className="size-4.5 animate-spin text-primary" aria-hidden />
            : row.phase === 'saved'
              ? <LuCircleCheck className="size-4.5 text-[color:var(--success)]" aria-hidden />
              : <LuFileText className="size-4.5 text-muted-foreground" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[length:var(--fs-13)] font-semibold">{row.file.name}</span>
            <span className="text-[length:var(--fs-11)] text-muted-foreground tabular-nums">{sizeKb} KB</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground" aria-live="polite">
            {row.phase === 'reading' && 'Ανάγνωση εγγράφου…'}
            {row.phase === 'classifying' && 'Αναγνώριση τύπου…'}
            {row.phase === 'saving' && 'Αποθήκευση…'}
            {row.phase === 'saved' && <span className="font-semibold text-[color:var(--success)]">Αποθηκεύτηκε</span>}
            {(row.phase === 'ready' || row.phase === 'error') && <ConfidenceChip s={row.suggestion} />}
            {row.phase === 'ready' && row.suggestion?.reason && <span className="min-w-0">{row.suggestion.reason}</span>}
            {row.error && <span className="text-destructive">{row.error}</span>}
          </div>
        </div>
        {!locked && (
          <button type="button" onClick={onRemove} aria-label={`Αφαίρεση ${row.file.name}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <LuX className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {!working && row.phase !== 'saved' && (
        <DuplicateNotice row={row} batchDupOf={batchDupOf} onDecision={d => onChange({ decision: d })} />
      )}

      {!working && !skipped && (row.needs?.length || row.covered.length) ? (
        <ProgramNeeds needs={row.needs ?? []} covered={row.covered} saved={row.phase === 'saved'} />
      ) : null}

      {!working && row.phase !== 'saved' && !skipped && (
        <div className="mt-3 grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
          <div className="field !mb-0">
            <label>Τύπος δικαιολογητικού</label>
            <Select
              value={row.typeId}
              onValueChange={v => {
                const t = types.find(x => x.id === v)
                // Λήξη από κανόνα τύπου (π.χ. ΓΕΜΗ: έκδοση + 90 ημ.) — αν δεν την όρισε ο χρήστης με το χέρι.
                const auto = !row.expiresAt || row.expiryNote != null
                const sg = row.suggestion
                const rule = auto && sg ? resolveExpiry(t, { issuedAt: sg.issuedAt, expiresAt: sg.statedExpiresAt, expiryBasis: sg.expiryBasis }) : null
                onChange({
                  typeId: v ?? '',
                  hasExpiry: t?.expires ? true : row.hasExpiry,
                  ...(rule?.expiresAt ? { expiresAt: rule.expiresAt, expiryNote: rule.expiryNote } : {}),
                })
                if (v) onTypeChange(v)
              }}
              disabled={locked}
            >
              <SelectTrigger className={cn('h-9 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]', !row.typeId && 'border-[color:var(--warning)]')}>
                <SelectValue placeholder="Επίλεξε τύπο…" />
              </SelectTrigger>
              <SelectContent>
                {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="field !mb-0">
            <label>Πρόγραμμα στο οποίο αναφέρεται</label>
            <Select value={row.programId} onValueChange={v => onChange({ programId: v ?? GENERAL, reusable: v === GENERAL ? true : row.reusable })} disabled={locked}>
              <SelectTrigger className="h-9 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GENERAL}>Γενικό (εταιρικό) — όχι συγκεκριμένο πρόγραμμα</SelectItem>
                {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <label className={cn('flex items-center gap-2.5 rounded-xl border border-border px-3 py-2', row.programId === GENERAL && 'opacity-60')}>
            <Switch
              checked={row.programId === GENERAL ? true : row.reusable}
              onCheckedChange={v => onChange({ reusable: v })}
              disabled={locked || row.programId === GENERAL}
            />
            <span className="text-[length:var(--fs-12)] font-semibold">Χρησιμοποιείται και σε άλλα προγράμματα</span>
          </label>

          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border px-3 py-2">
            <label className="flex items-center gap-2.5">
              <Switch checked={row.hasExpiry} onCheckedChange={v => onChange({ hasExpiry: v })} disabled={locked} />
              <span className="text-[length:var(--fs-12)] font-semibold">Έχει ημ. λήξης</span>
            </label>
            {row.hasExpiry && (
              <Input
                type="date"
                value={row.expiresAt}
                onChange={e => onChange({ expiresAt: e.target.value, expiryNote: null })}
                disabled={locked}
                aria-label="Ημερομηνία λήξης"
                className={cn('h-8 w-auto flex-1 rounded-full text-[length:var(--fs-12)]', !row.expiresAt && 'border-[color:var(--warning)]')}
              />
            )}
            {row.hasExpiry && row.expiresAt && row.expiryNote && (
              <span className="inline-flex w-full items-center gap-1 text-[length:var(--fs-11)] text-muted-foreground" title="Πώς υπολογίστηκε η λήξη — άλλαξέ την αν χρειάζεται">
                <LuSparkles className="size-3 text-primary" aria-hidden /> {row.expiryNote}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

/** Προειδοποίηση διπλοεγγραφής με επιλογή χειρισμού (C3). */
function DuplicateNotice({
  row, batchDupOf, onDecision,
}: {
  row: Row
  batchDupOf: Row | null
  onDecision: (d: Row['decision']) => void
}) {
  if (batchDupOf) {
    return (
      <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/8 px-3 py-2 text-[length:var(--fs-12)]">
        <LuCopy className="mt-0.5 size-3.5 shrink-0 text-[color:var(--warning)]" aria-hidden />
        <span>Το ίδιο αρχείο υπάρχει ήδη σε αυτή τη μεταφόρτωση («{batchDupOf.file.name}») — <strong>δεν θα αποθηκευτεί δεύτερη φορά</strong>.</span>
      </div>
    )
  }
  const exact = row.dup?.exact[0]
  const same = row.dup?.sameType[0]
  if (!exact && !same) return null

  const choice = (value: Row['decision'], label: string) => (
    <button
      type="button"
      onClick={() => onDecision(value)}
      aria-pressed={row.decision === value}
      className={cn(
        'h-7 rounded-full border px-3 text-[length:var(--fs-11-5)] font-semibold transition-colors',
        row.decision === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
      )}
    >
      {label}
    </button>
  )

  if (exact) {
    return (
      <div className="mt-2.5 flex flex-col gap-2 rounded-xl border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/8 px-3 py-2.5 text-[length:var(--fs-12)]">
        <p className="flex items-start gap-2">
          <LuCopy className="mt-0.5 size-3.5 shrink-0 text-[color:var(--warning)]" aria-hidden />
          <span>
            <strong>Διπλοεγγραφή:</strong> αυτό ακριβώς το αρχείο υπάρχει ήδη ως «{exact.name}» ({exact.typeName}, καταχωρίστηκε {fmt(exact.createdAt)}).
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5 pl-5.5">
          {choice('skip', 'Παράλειψη')}
          {choice('keep', 'Αποθήκευση ξανά')}
        </div>
      </div>
    )
  }
  return (
    <div className="mt-2.5 flex flex-col gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-[length:var(--fs-12)]">
      <p className="flex items-start gap-2">
        <LuInfo className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          Υπάρχει ήδη <strong>{same!.typeName}</strong>: «{same!.name}»
          {same!.expiresAt ? (same!.valid ? ` — σε ισχύ έως ${fmt(same!.expiresAt)}` : ` — έληξε ${fmt(same!.expiresAt)}`) : ` — καταχωρίστηκε ${fmt(same!.createdAt)}`}.
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5 pl-5.5">
        {choice('replace', 'Αντικατάσταση του παλιού')}
        {choice('keep', 'Κράτα και τα δύο')}
        {choice('skip', 'Παράλειψη')}
      </div>
    </div>
  )
}

const NEED_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'εκκρεμεί — θα καλυφθεί', cls: 'warn' },
  IN_PROGRESS: { label: 'σε εξέλιξη — θα καλυφθεί', cls: 'warn' },
  REJECTED: { label: 'απορρίφθηκε — θα καλυφθεί', cls: 'warn' },
  SUBMITTED: { label: 'υποβλήθηκε', cls: 'info' },
  APPROVED: { label: 'εγκρίθηκε', cls: 'ok' },
  WAIVED: { label: 'δεν απαιτείται', cls: 'muted' },
}

/** «Χρειάζεται σε»: προγράμματα του πελάτη που ζητούν τον τύπο (+ ενεργά που τον ζητούν). */
function ProgramNeeds({ needs, covered, saved }: { needs: ProgramNeed[]; covered: string[]; saved: boolean }) {
  const mine = needs.filter(n => n.joined)
  const others = needs.filter(n => !n.joined)
  const [showAll, setShowAll] = React.useState(false)
  const shownOthers = showAll ? others : others.slice(0, 3)
  if (saved) {
    if (!covered.length) return null
    return (
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground">
        <LuFolderKanban className="size-3.5 text-[color:var(--success)]" aria-hidden />
        Καλύφθηκε εκκρεμότητα σε: {covered.map(t => <span key={t} className="badge-pill ok max-w-[16rem] truncate" style={{ textTransform: 'none' }} title={t}>{t}</span>)}
      </p>
    )
  }
  return (
    <div className="mt-2.5 flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[length:var(--fs-11-5)]">
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 font-bold text-foreground"><LuFolderKanban className="size-3.5 text-primary" aria-hidden /> Χρειάζεται στα προγράμματά του:</span>
          {mine.map(n => {
            const st = n.status ? NEED_STATUS[n.status] : null
            return (
              <span key={n.programId} className={cn('badge-pill max-w-[20rem]', st?.cls ?? 'muted')} style={{ textTransform: 'none' }} title={`${n.title} — ${n.formName}`}>
                <span className="truncate">{n.title}</span>{st && <span className="opacity-80"> · {st.label}</span>}
              </span>
            )
          })}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">{mine.length ? 'Το ζητούν και:' : 'Το ζητούν τα ενεργά προγράμματα:'}</span>
          {shownOthers.map(n => (
            <span key={n.programId} className="badge-pill muted max-w-[18rem]" style={{ textTransform: 'none' }} title={`${n.title} — ${n.formName}`}>
              <span className="truncate">{n.title}</span>
            </span>
          ))}
          {others.length > 3 && (
            <button type="button" onClick={() => setShowAll(v => !v)} className="font-semibold text-primary hover:underline">
              {showAll ? 'λιγότερα' : `+${others.length - 3} ακόμη`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
