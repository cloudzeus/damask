'use client'

import { Combobox } from '@/components/ui/combobox'
import { DocumentPreviewDialog } from '@/components/ui/document-preview'
import { ValueCaptureDialog } from './value-capture-dialog'
import { isSeriesKind, periodLabel, type SeriesKind } from '@/lib/documents/series'
import * as React from 'react'
import { toast } from 'sonner'
import {
  LuUpload, LuLoaderCircle, LuX, LuSparkles, LuBrain, LuCircleCheck, LuTriangleAlert, LuFileText, LuCloudUpload, LuCopy, LuInfo, LuFolderKanban,
  LuFolderOpen, LuFolder, LuReceipt, LuFileBadge, LuHardDrive, LuStamp, LuEye, LuScanText, LuTrash2, LuClock, LuRefreshCw,
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
import { chunkedUpload, filesFromDrop, filesFromPicker, relativePathOf } from '@/components/ui/file-dropzone'
import { listTrdrApplicationsForInbox } from '@/lib/pm/expense-inbox'
import { getActiveImportBatch, getImportItems, registerImportFiles, saveImportItem, skipImportItem, retryImportItems, finishImportBatch, undoAutoSavedItem, type ImportItemView } from '@/lib/import/actions'
import type { EmeApplied } from '@/lib/documents/dossier-core'
import type { E3Applied } from '@/lib/tax/e3'
import type { MmeApplied } from '@/lib/tax/mme'
import type { TemplateApplied } from '@/lib/tax/template-auto'
import {
  checkDossierDuplicates, listProgramNeedsForTypes, listDocumentTypes,
  type DocumentTypeOption, type DossierDuplicateCheck, type ProgramNeed,
} from '@/lib/documents/actions'
import type { SmartClassifyResult } from '@/lib/documents/smart-classify'

/**
 * Έξυπνη μεταφόρτωση δικαιολογητικών: πολλά αρχεία μαζί → για το καθένα ανάγνωση
 * κειμένου + αναγνώριση (μνήμη ή AI) → ο χρήστης επιβεβαιώνει/διορθώνει τύπο,
 * πρόγραμμα, επαναχρησιμοποίηση και λήξη → «Αποθήκευση όλων». Κάθε αποθήκευση
 * γίνεται παράδειγμα εκμάθησης, ώστε οι επόμενες αναγνωρίσεις να είναι καλύτερες.
 */

type Phase = 'hashing' | 'uploading' | 'interrupted' | 'reading' | 'classifying' | 'waiting' | 'ready' | 'saving' | 'saved' | 'skipped' | 'error'
/** Πού πάει το αρχείο: δικαιολογητικό πελάτη · προσφορά/παραστατικό → «Προς καταχώριση» του έργου · αρχεία πελάτη (με τη δομή φακέλων). */
type Dest = 'dossier' | 'approval' | 'quote' | 'invoice' | 'files' | 'junk'
type AppOption = { id: string; programId: string; title: string }

type Row = {
  id: string
  /** Το αρχείο της παρτίδας στον server (ImportItem). */
  itemId: string | null
  /** Το αρχείο του browser — μόνο όσο είναι ανοιχτό το παράθυρο που το διάλεξε (μετά: από τον server). */
  file: File | null
  name: string
  size: number
  mime: string
  /** Πρόοδος ανεβάσματος (%) ή null. */
  uploadPct: number | null
  /** Αποθηκεύτηκε αυτόματα στο παρασκήνιο (βέβαιο δικαιολογητικό). */
  autoSaved: boolean
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
  /** Περίοδος για τύπους-σειρές (π.χ. Φ2 «2025-03») — από την αναγνώριση, διορθώσιμη. */
  period: string
  /** Διαδρομή μέσα στον φάκελο που επιλέχθηκε (π.χ. «Προσφορές/x.pdf») ή ''. */
  relPath: string
  dest: Dest
  /** Έργο-προορισμός για προσφορές/παραστατικά. */
  appId: string
  /** Μετά την αποθήκευση: πού μπήκε. */
  savedNote: string | null
  /** Γιατί προτείνεται ως άχρηστο (προσωρινό/κενό/συντόμευση…). */
  junkReason: string | null
  /** Αναμονή λόγω ορίου AI/διακοπής: πότε ξαναδοκιμάζει και γιατί. */
  retryAt: number | null
  waitReason: string | null
  /** Η αναγνώριση απέτυχε προσωρινά (όριο/δίκτυο) — μπαίνει στο «Ξανά τα αποτυχημένα». */
  retryable: boolean
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
/** Παράλληλα ανεβάσματα (τα bytes ανεβαίνουν πρώτα· η αναγνώριση τρέχει στον server). */
const UPLOAD_CONCURRENCY = 2
const POLL_MS = 3000

const DEST_META: Record<Dest, { label: string; short: string }> = {
  dossier: { label: 'Δικαιολογητικό', short: 'δικαιολογητικά' },
  approval: { label: 'Εγκριτική', short: 'εγκριτικά' },
  quote: { label: 'Προσφορά', short: 'προσφορές' },
  invoice: { label: 'Παραστατικό', short: 'παραστατικά' },
  files: { label: 'Αρχεία πελάτη', short: 'στα αρχεία' },
  junk: { label: 'Άχρηστο', short: 'άχρηστα' },
}

const blankRow = (id: string, p: Partial<Row> & Pick<Row, 'name' | 'size' | 'mime'>, fallbackProgram: string): Row => ({
  id, itemId: null, file: null, relPath: '', phase: 'uploading', uploadPct: 0, error: null, snippet: '', suggestion: null,
  typeId: '', programId: fallbackProgram, reusable: true, hasExpiry: false, expiresAt: '', expiryNote: null, period: '',
  hash: '', dup: null, decision: 'keep', needs: null, covered: [], dest: 'dossier', appId: '', savedNote: null, junkReason: null,
  retryAt: null, waitReason: null, retryable: false, autoSaved: false, ...p,
})

/** Φάση της κάρτας από την κατάσταση του αρχείου στον server. */
function phaseOf(item: ImportItemView): Phase {
  switch (item.phase) {
    case 'UPLOADING': return 'uploading'
    case 'QUEUED': return 'reading'
    case 'RECOGNIZING': return 'classifying'
    case 'WAITING': return 'waiting'
    case 'SAVING': return 'saving'
    case 'SAVED': return 'saved'
    case 'SKIPPED': return item.dest === 'junk' ? 'ready' : 'skipped'
    default: return 'ready' // REVIEW / FAILED
  }
}

export function DossierSmartUpload({
  trdrId, types: typesProp, onDone, defaultProgramId, label = 'Δικαιολογητικά', variant = 'outline',
}: {
  trdrId: string
  /** Αν λείπει, φορτώνονται στο άνοιγμα (για χρήση εκτός καρτέλας Δικαιολογητικά). */
  types?: DocumentTypeOption[]
  onDone: () => void
  /** Προεπιλεγμένο πρόγραμμα (π.χ. από το έργο) όταν η AI δεν βρίσκει ρητή αναφορά. */
  defaultProgramId?: string | null
  label?: string
  variant?: 'outline' | 'default'
}) {
  const [loadedTypes, setLoadedTypes] = React.useState<DocumentTypeOption[]>([])
  const [extraTypes, setExtraTypes] = React.useState<DocumentTypeOption[]>([])
  const baseTypes = typesProp ?? loadedTypes
  const types = React.useMemo(() => [...baseTypes, ...extraTypes.filter(t => !baseTypes.some(b => b.id === t.id))], [baseTypes, extraTypes])
  const fallbackProgram = defaultProgramId ?? GENERAL
  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<Row[]>([])
  const [batchId, setBatchId] = React.useState<string | null>(null)
  const [resumed, setResumed] = React.useState(false)
  const [apps, setApps] = React.useState<AppOption[]>([])
  const programs = React.useMemo(() => apps.map(a => ({ id: a.programId, title: a.title })), [apps])
  const appsRef = React.useRef<AppOption[]>([])
  const [scanning, setScanning] = React.useState(false)
  const dirRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const typesRef = React.useRef(types)
  React.useEffect(() => { typesRef.current = types }, [types])
  const rowsRef = React.useRef<Row[]>([])
  React.useEffect(() => { rowsRef.current = rows }, [rows])
  const uploadQueue = React.useRef<{ rowId: string; itemId: string; file: File }[]>([])
  const uploading = React.useRef(0)
  const abort = React.useRef<AbortController | null>(null)

  const patch = (id: string, p: Partial<Row>) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)))

  /** Αρχείο του server → κάρτα. Για «Για έλεγχο» συμπληρώνονται διπλοεγγραφές/ανάγκες προγραμμάτων. */
  async function applyItem(rowId: string, item: ImportItemView) {
    const phase = phaseOf(item)
    const s = item.suggestion
    const common: Partial<Row> = {
      itemId: item.id, hash: item.hash ?? '', phase, junkReason: item.junkReason,
      waitReason: item.waitReason, retryAt: item.nextAttemptAt ? Date.parse(item.nextAttemptAt) : null,
      retryable: item.phase === 'FAILED' || item.phase === 'WAITING', autoSaved: item.autoSaved,
      savedNote: item.resultNote, error: item.phase === 'FAILED' ? item.error : item.phase === 'REVIEW' ? item.error : null,
      ...(item.dest ? { dest: item.dest as Dest } : {}), ...(item.appId ? { appId: item.appId } : {}),
    }
    if (item.phase !== 'REVIEW' || !s) { patch(rowId, { ...common, ...(s ? { suggestion: s } : {}) }); return }
    if (s.commercial || !s.typeId) {
      patch(rowId, { ...common, suggestion: s, error: s.commercial && !appsRef.current.length ? 'Ο πελάτης δεν είναι ενταγμένος σε έργο — θα μπει στα αρχεία του.' : common.error })
      return
    }
    const t = typesRef.current.find(x => x.id === s.typeId)
    const [[dup], needs] = await Promise.all([
      checkDossierDuplicates(trdrId, [{ key: rowId, hash: item.hash ?? '', typeId: s.typeId, period: s.period }]).catch(() => [null]),
      listProgramNeedsForTypes(trdrId, [s.typeId]).catch(() => ({} as Record<string, ProgramNeed[]>)),
    ])
    patch(rowId, {
      ...common, suggestion: s, dup: dup ?? null, needs: needs[s.typeId] ?? [],
      // Έγγραφο άλλης επιχείρησης (άλλο ΑΦΜ) → απορρίπτεται από προεπιλογή.
      decision: s.company?.status === 'MISMATCH' ? 'skip' : defaultDecision(dup ?? null, !!t?.expires),
      typeId: s.typeId, programId: s.programId ?? fallbackProgram, reusable: s.reusable,
      hasExpiry: !!(t?.expires || s.expiresAt), expiresAt: s.expiresAt ?? '', expiryNote: s.expiryNote ?? null, period: s.period ?? '',
    })
  }

  // Ενημερώσεις από τον server όσο κάτι ανεβαίνει/αναγνωρίζεται/περιμένει.
  React.useEffect(() => {
    if (!open || !batchId) return
    const t = setInterval(() => {
      const live = rowsRef.current.filter(r => r.itemId && ['reading', 'classifying', 'waiting', 'saving'].includes(r.phase))
      if (!live.length) return
      getImportItems(batchId, live.map(r => r.itemId!)).then(items => {
        for (const it of items) {
          const row = rowsRef.current.find(r => r.itemId === it.id)
          if (row && phaseOf(it) !== row.phase || (row && it.phase === 'WAITING' && Date.parse(it.nextAttemptAt ?? '') !== row.retryAt)) void applyItem(row!.id, it)
        }
      }).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId])

  function pumpUploads() {
    while (uploading.current < UPLOAD_CONCURRENCY && uploadQueue.current.length) {
      const job = uploadQueue.current.shift()!
      uploading.current += 1
      const ac = abort.current ?? (abort.current = new AbortController())
      chunkedUpload(`/api/partners/${trdrId}/files/upload-chunk`, job.file, { importItemId: job.itemId }, pct => patch(job.rowId, { uploadPct: Math.round(pct) }), ac.signal)
        .then(() => patch(job.rowId, { phase: 'reading', uploadPct: null }))
        .catch(err => { if (!ac.signal.aborted) patch(job.rowId, { phase: 'ready', dest: 'files', retryable: false, error: err instanceof Error ? `Το ανέβασμα απέτυχε: ${err.message}` : 'Το ανέβασμα απέτυχε.' }) })
        .finally(() => { uploading.current -= 1; pumpUploads() })
    }
  }

  async function addFiles(list: FileList | File[]) {
    const arr = Array.from(list)
    if (arr.length === 0) return
    const fresh = arr.map(file => ({ rowId: crypto.randomUUID(), file }))
    setRows(prev => [...prev, ...fresh.map(f => blankRow(f.rowId, { file: f.file, name: f.file.name, size: f.file.size, mime: f.file.type || 'application/octet-stream', relPath: relativePathOf(f.file), phase: 'hashing' }, fallbackProgram))])
    // hash στον browser → ο server αναγνωρίζει ό,τι έχει ήδη (καμία επανάληψη ανεβάσματος/OCR).
    const hashes = await Promise.all(fresh.map(f => (f.file.size < 200 * 1024 * 1024 ? sha256(f.file).catch(() => '') : Promise.resolve(''))))
    let reg: Awaited<ReturnType<typeof registerImportFiles>>
    try {
      reg = await registerImportFiles(trdrId, fresh.map((f, i) => ({ clientId: f.rowId, name: f.file.name, relPath: relativePathOf(f.file) || null, size: f.file.size, mimeType: f.file.type || 'application/octet-stream', hash: hashes[i] || null })))
    } catch {
      toast.error('Η καταχώριση των αρχείων απέτυχε — δοκιμάστε ξανά.')
      setRows(prev => prev.filter(r => !fresh.some(f => f.rowId === r.id)))
      return
    }
    setBatchId(reg.batchId)
    const known = new Set(rowsRef.current.filter(r => r.itemId).map(r => r.itemId))
    const dropped: string[] = []
    reg.items.forEach((m, i) => {
      const f = fresh.find(x => x.rowId === m.clientId)!
      if (known.has(m.itemId)) {
        // Ίδιο αρχείο ήδη στη λίστα· αν «δεν πρόλαβε να ανέβει», η υπάρχουσα κάρτα συνεχίζει με αυτό το αρχείο.
        dropped.push(f.rowId)
        const existing = rowsRef.current.find(r => r.itemId === m.itemId)
        if (existing && m.needsUpload) {
          patch(existing.id, { file: f.file, phase: 'uploading', uploadPct: 0 })
          uploadQueue.current.push({ rowId: existing.id, itemId: m.itemId, file: f.file })
        }
        return
      }
      known.add(m.itemId)
      patch(f.rowId, { itemId: m.itemId, hash: hashes[i] ?? '', phase: m.needsUpload ? 'uploading' : 'reading', uploadPct: m.needsUpload ? 0 : null })
      if (m.needsUpload) uploadQueue.current.push({ rowId: f.rowId, itemId: m.itemId, file: f.file })
    })
    if (dropped.length) setRows(prev => prev.filter(r => !dropped.includes(r.id)))
    // Άχρηστα / ήδη ανεβασμένα: η κατάστασή τους από τον server.
    const ready = reg.items.filter(m => !m.needsUpload && !dropped.includes(m.clientId))
    if (ready.length) {
      const items = await getImportItems(reg.batchId, ready.map(m => m.itemId)).catch(() => [])
      for (const it of items) { const m = ready.find(x => x.itemId === it.id); if (m) void applyItem(m.clientId, it) }
    }
    pumpUploads()
  }

  async function openDialog() {
    setOpen(true)
    if (!typesProp) listDocumentTypes().then(setLoadedTypes).catch(() => setLoadedTypes([]))
    const [a, batch] = await Promise.all([
      listTrdrApplicationsForInbox(trdrId).catch(() => [] as AppOption[]),
      getActiveImportBatch(trdrId).catch(() => null),
    ])
    appsRef.current = a
    setApps(a)
    if (!batch) return
    // Συνέχεια παρτίδας: ό,τι δεν έχει τελειώσει (τα αποθηκευμένα/παραλειμμένα μένουν στη σύνοψη).
    setBatchId(batch.id)
    const visible = batch.items.filter(it => !(it.phase === 'SKIPPED' && it.dest !== 'junk' && !it.resultNote?.startsWith('Υπάρχει')))
    if (!visible.length) return
    setResumed(true)
    const restored = visible.map(it => blankRow(`srv-${it.id}`, {
      itemId: it.id, name: it.fileName, size: it.size, mime: it.mimeType, relPath: it.relPath ?? '', hash: it.hash ?? '',
      phase: it.phase === 'UPLOADING' ? 'interrupted' : phaseOf(it), uploadPct: null,
    }, fallbackProgram))
    setRows(restored)
    for (const it of visible) if (it.phase !== 'UPLOADING') void applyItem(`srv-${it.id}`, it)
  }

  function onDropFiles(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    setScanning(true)
    void filesFromDrop(e.dataTransfer).then(addFiles).finally(() => setScanning(false))
  }

  // Κλείσιμο: μόνο όσο ανεβαίνουν αρχεία ή γίνεται αποθήκευση χρειάζεται ο browser — η αναγνώριση συνεχίζει στον server.
  const busy = rows.some(r => r.phase === 'hashing' || r.phase === 'uploading' || r.phase === 'saving')
  const pending = rows.filter(r => r.phase !== 'saved' && r.phase !== 'skipped' && r.decision !== 'skip' && r.dest !== 'junk')
  const missingType = pending.some(r => r.phase === 'ready' && r.dest === 'dossier' && !r.typeId)
  const missingApp = pending.some(r => r.phase === 'ready' && (r.dest === 'quote' || r.dest === 'invoice' || r.dest === 'approval') && !r.appId)

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
  async function recheck(row: Row, typeId: string, period: string = row.period) {
    const t = types.find(x => x.id === typeId)
    const [[dup], needs] = await Promise.all([
      checkDossierDuplicates(trdrId, [{ key: row.id, hash: row.hash, typeId, period: period || null }]).catch(() => [null]),
      listProgramNeedsForTypes(trdrId, [typeId]).catch(() => ({} as Record<string, ProgramNeed[]>)),
    ])
    patch(row.id, { dup: dup ?? null, decision: defaultDecision(dup ?? null, !!t?.expires), needs: needs[typeId] ?? [] })
  }

  function handleOpenChange(next: boolean) {
    if (!next && busy) return
    if (!next) {
      abort.current?.abort(); abort.current = null; uploadQueue.current = []
      // Τίποτα για έλεγχο → η παρτίδα κλείνει (τα προσωρινά καθαρίζονται)· αλλιώς μένει για «συνέχεια».
      const open = rowsRef.current.some(r => !['saved', 'skipped'].includes(r.phase) && r.dest !== 'junk' && r.decision !== 'skip')
      if (batchId && !open) void finishImportBatch(batchId).catch(() => {})
      setRows([]); setBatchId(null); setResumed(false)
    }
    setOpen(next)
  }

  async function retry(ids: string[]) {
    const itemIds = rows.filter(r => ids.includes(r.id) && r.itemId).map(r => r.itemId!)
    setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, phase: 'reading', retryAt: null, waitReason: null, error: null, retryable: false } : r)))
    await retryImportItems(itemIds).catch(() => toast.error('Η νέα προσπάθεια απέτυχε.'))
  }

  async function removeRow(r: Row) {
    setRows(prev => prev.filter(x => x.id !== r.id))
    uploadQueue.current = uploadQueue.current.filter(q => q.rowId !== r.id)
    if (r.itemId) await skipImportItem(r.itemId).catch(() => {})
  }

  async function saveAll() {
    let saved = 0
    let coveredTotal = 0
    let staged = 0
    let filed = 0
    for (const r of rowsRef.current) {
      if (r.phase !== 'ready' || !r.itemId || r.decision === 'skip' || r.dest === 'junk' || batchDupOf.has(r.id)) continue
      if (r.dest === 'dossier' && !r.typeId) continue
      if ((r.dest === 'quote' || r.dest === 'invoice' || r.dest === 'approval') && !r.appId) continue
      patch(r.id, { phase: 'saving' })
      const res = await saveImportItem(r.itemId, {
        dest: r.dest, typeId: r.typeId || null, period: r.period || null,
        programId: r.programId === GENERAL ? null : r.programId, reusable: r.programId === GENERAL ? true : r.reusable,
        issuedAt: r.suggestion?.issuedAt ?? null, expiresAt: r.hasExpiry && r.expiresAt ? r.expiresAt : null,
        appId: r.appId || null, replaceDocId: r.decision === 'replace' ? (r.dup?.sameType[0]?.id ?? null) : null,
      }).catch(err => ({ ok: false as const, message: err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.' }))
      if (!res.ok) { patch(r.id, { phase: 'ready', error: res.message }); continue }
      patch(r.id, { phase: 'saved', covered: res.coveredPrograms, savedNote: res.note })
      if (r.dest === 'dossier') { saved += 1; coveredTotal += res.covered; announce(res.extra as Extra | undefined) }
      else if (r.dest === 'files') filed += 1
      else staged += 1
    }
    if (saved + staged + filed > 0) {
      const parts = [
        saved ? `${saved} δικαιολογητικά` : null,
        staged ? `${staged} προσφορές/παραστατικά προς καταχώριση στα έργα` : null,
        filed ? `${filed} στα αρχεία πελάτη` : null,
      ].filter(Boolean)
      toast.success(`Ολοκληρώθηκε: ${parts.join(' · ')}.`, {
        description: [
          coveredTotal ? `Καλύφθηκαν ${coveredTotal} εκκρεμότητες σε προγράμματα — μένει έλεγχος & έγκριση.` : null,
          staged ? 'Θα τα βρεις στο έργο › Δαπάνες & Πλάνο › «Προς καταχώριση».' : null,
        ].filter(Boolean).join(' ') || undefined,
      })
      onDone()
    }
  }

  const allSaved = rows.length > 0 && rows.every(r => r.phase === 'saved' || r.phase === 'skipped' || r.decision === 'skip' || r.dest === 'junk' || batchDupOf.has(r.id))
  const toSave = pending.filter(r => r.phase === 'ready' && !batchDupOf.has(r.id)).length
  const counts = rows.reduce((acc, r) => {
    if (r.phase === 'hashing' || r.phase === 'uploading') acc.uploading += 1
    else if (r.phase === 'reading' || r.phase === 'classifying') acc.working += 1
    else if (r.phase === 'waiting') acc.waiting += 1
    else if (r.phase === 'interrupted') acc.interrupted += 1
    else if (r.phase === 'saved') { acc.done += 1; if (r.autoSaved) acc.auto += 1 }
    else if (r.phase === 'skipped' || r.decision === 'skip' || batchDupOf.has(r.id)) acc.junk += 1
    else acc[r.dest] += 1
    return acc
  }, { uploading: 0, working: 0, waiting: 0, interrupted: 0, done: 0, auto: 0, dossier: 0, approval: 0, quote: 0, invoice: 0, files: 0, junk: 0 } as Record<Dest | 'uploading' | 'working' | 'waiting' | 'interrupted' | 'done' | 'auto', number>)
  const retryIds = rows.filter(r => r.phase === 'waiting' || (r.retryable && r.phase === 'ready')).map(r => r.id)

  return (
    <>
      <Button type="button" variant={variant} onClick={() => void openDialog()}>
        <LuSparkles className="size-3.5" aria-hidden /> {label}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LuSparkles className="size-4 text-primary" aria-hidden /> Έξυπνη καταχώριση δικαιολογητικών</DialogTitle>
            <DialogDescription>
              Ανέβασε αρχεία ή ολόκληρους φακέλους (με υποφακέλους) — η αναγνώριση τρέχει στον server: μπορείς να κλείσεις το παράθυρο και να συνεχίσεις αργότερα. Τα βέβαια δικαιολογητικά αποθηκεύονται αυτόματα· τα υπόλοιπα περιμένουν εδώ για έλεγχο.
            </DialogDescription>
          </DialogHeader>

          {resumed && (
            <p className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[length:var(--fs-12)]">
              <LuRefreshCw className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span><b>Συνέχεια προηγούμενης εισαγωγής.</b> Ό,τι είχε αναγνωριστεί είναι εδώ· αν κάποια αρχεία δεν πρόλαβαν να ανέβουν, ξαναδιαλέξτε τον ίδιο φάκελο — ανεβαίνουν μόνο όσα λείπουν.</span>
            </p>
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDropFiles}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 text-center transition-colors',
              rows.length ? 'py-4' : 'py-9',
              dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50',
            )}
          >
            {scanning ? <LuLoaderCircle className="size-7 animate-spin text-primary" aria-hidden /> : <LuCloudUpload className="size-7 text-primary" aria-hidden />}
            <p className="text-[length:var(--fs-13-5)] font-semibold">{scanning ? 'Ανάγνωση φακέλων…' : 'Σύρε αρχεία ή φακέλους εδώ ή πάτησε για επιλογή αρχείων'}</p>
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">PDF, εικόνες, Word, Excel · πολλά αρχεία ή ολόκληροι φάκελοι μαζί</p>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); dirRef.current?.click() }}
              className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[length:var(--fs-12)] font-semibold hover:border-primary hover:text-primary"
            >
              <LuFolderOpen className="size-3.5" aria-hidden /> Επιλογή φακέλου
            </button>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) void addFiles(filesFromPicker(e.target.files)); e.target.value = '' }} />
            <input
              ref={el => { dirRef.current = el; el?.setAttribute('webkitdirectory', ''); el?.setAttribute('directory', '') }}
              type="file" multiple className="hidden"
              onChange={e => { if (e.target.files) void addFiles(filesFromPicker(e.target.files)); e.target.value = '' }}
            />
          </div>

          {(rows.length > 1 || retryIds.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-11-5)]" aria-live="polite">
              <span className="font-semibold">{rows.length} αρχεία:</span>
              {counts.uploading > 0 && <span className="badge-pill muted"><LuLoaderCircle className="size-3 animate-spin" aria-hidden /> {counts.uploading} ανεβαίνουν</span>}
              {counts.working > 0 && <span className="badge-pill muted"><LuLoaderCircle className="size-3 animate-spin" aria-hidden /> {counts.working} σε αναγνώριση</span>}
              {counts.waiting > 0 && <span className="badge-pill warn" style={{ textTransform: 'none' }} title="Το AI έφτασε το όριό του ή διακόπηκε η σύνδεση — ξαναδοκιμάζονται αυτόματα στον server"><LuClock className="size-3" aria-hidden /> {counts.waiting} σε αναμονή</span>}
              {counts.interrupted > 0 && <span className="badge-pill warn" style={{ textTransform: 'none' }} title="Ξαναδιαλέξτε τον ίδιο φάκελο — ανεβαίνουν μόνο όσα λείπουν">{counts.interrupted} δεν πρόλαβαν να ανέβουν</span>}
              {retryIds.length > 0 && (
                <button type="button" onClick={() => void retry(retryIds)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  <LuRefreshCw className="size-3" aria-hidden /> Ξανά τα αποτυχημένα ({retryIds.length})
                </button>
              )}
              {(['dossier', 'approval', 'quote', 'invoice', 'files'] as Dest[]).filter(d => counts[d] > 0).map(d => (
                <span key={d} className={cn('badge-pill', d === 'files' ? 'muted' : d === 'dossier' ? 'ok' : 'info')} style={{ textTransform: 'none' }}>{counts[d]} {DEST_META[d].short}</span>
              ))}
              {counts.done > 0 && <span className="badge-pill ok" style={{ textTransform: 'none' }}>{counts.done} αποθηκεύτηκαν{counts.auto ? ` (${counts.auto} αυτόματα)` : ''}</span>}
              {counts.junk > 0 && (
                <>
                  <span className="badge-pill warn" style={{ textTransform: 'none' }} title="Προσωρινά, κενά, συντομεύσεις, διπλά, ήδη καταχωρισμένα ή άλλης επιχείρησης — δεν ανεβαίνουν">{counts.junk} άχρηστα / υπάρχουν ήδη — δεν ανεβαίνουν</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRows(prev => prev.filter(r => !(r.phase !== 'saved' && (r.phase === 'skipped' || r.dest === 'junk' || r.decision === 'skip' || batchDupOf.has(r.id)))))}
                    className="font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    Καθάρισμα λίστας
                  </button>
                </>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {rows.map(r => (
                <RowCard
                  key={r.id}
                  row={r}
                  types={types}
                  programs={programs}
                  apps={apps}
                  batchDupOf={batchDupOf.get(r.id) ?? null}
                  onChange={p => patch(r.id, p)}
                  onTypeChange={(typeId, period) => void recheck(r, typeId, period)}
                  onRemove={() => void removeRow(r)}
                  onRetry={() => void retry([r.id])}
                  onUndo={async () => {
                    const res = await undoAutoSavedItem(r.itemId!).catch(() => ({ ok: false, message: 'Η αναίρεση απέτυχε.' }))
                    if (!res.ok) { toast.error(res.message ?? 'Η αναίρεση απέτυχε.'); return }
                    toast.success('Αναιρέθηκε — το αρχείο επέστρεψε για έλεγχο.')
                    const [it] = await getImportItems(batchId!, [r.itemId!]).catch(() => [])
                    if (it) void applyItem(r.id, it)
                    onDone()
                  }}
                  onTypeCreated={t => setExtraTypes(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]))}
                />
              ))}
            </ul>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy} title={busy ? 'Περιμένετε να ολοκληρωθεί το ανέβασμα' : 'Η αναγνώριση συνεχίζει στον server — ανοίξτε ξανά για να συνεχίσετε'}>
              {allSaved ? 'Κλείσιμο' : 'Κλείσιμο (συνεχίζει)'}
            </Button>
            {!allSaved && (
              <Button type="button" onClick={() => void saveAll()} disabled={busy || toSave === 0 || missingType || missingApp}>
                {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuUpload className="size-3.5" aria-hidden />}
                {missingType ? 'Επίλεξε τύπο σε όλα' : missingApp ? 'Επίλεξε έργο σε όλα' : `Αποθήκευση όλων (${toSave})`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type Extra = { eme: EmeApplied | null; e3: E3Applied | null; mme: MmeApplied | null; template: TemplateApplied | null }
/** Ειδοποιήσεις για αυτόματες αναγνώσεις (ΕΜΕ/Ε3/Δήλωση ΜΜΕ/Οδηγός) μετά την αποθήκευση. */
function announce(x: Extra | undefined) {
  if (!x) return
  const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
  if (x.mme) {
    toast.success(`Δήλωση ΜΜΕ ${x.mme.year}: ${x.mme.category ?? '—'} επιχείρηση`, {
      description: x.mme.afmMismatch
        ? '⚠ Το ΑΦΜ της δήλωσης ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.'
        : [`ΕΜΕ ${x.mme.eme ?? '—'} · κύκλος εργασιών ${x.mme.turnover != null ? eur.format(x.mme.turnover) : '—'}.`, x.mme.official ? 'Επίσημο έγγραφο (gov.gr) — υπερισχύει Ε3/μισθοδοσίας για το έτος.' : null, x.mme.updatedCompany ? 'Ενημερώθηκε η καρτέλα της εταιρίας.' : null].filter(Boolean).join(' '),
    })
  }
  if (x.e3) {
    toast.success(`Ε3 ${x.e3.year}: κύκλος εργασιών ${x.e3.turnover != null ? eur.format(x.e3.turnover) : '—'}`, {
      description: [
        x.e3.afmMismatch ? null : x.e3.updatedCompany ? 'Ενημερώθηκε ο κύκλος εργασιών στην καρτέλα της εταιρίας.' : 'Η καρτέλα έχει ήδη νεότερο έτος — καταχωρίστηκαν μόνο τα στοιχεία του έτους.',
        x.e3.years.length > 1 ? `Στοιχεία για τα έτη ${x.e3.years.join(', ')}.` : null,
        x.e3.afmMismatch ? '⚠ Το ΑΦΜ του εντύπου ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.' : null,
      ].filter(Boolean).join(' '),
    })
  }
  if (x.eme) {
    const nf = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 })
    toast.success(`ΕΜΕ χρήσης ${x.eme.year}: ${x.eme.eme != null ? nf.format(x.eme.eme) : '—'} (${x.eme.employees} εργαζόμενοι)`, {
      description: [x.eme.afmMismatch ? null : x.eme.updatedCompany ? 'Ενημερώθηκαν οι εργαζόμενοι στην καρτέλα της εταιρίας.' : 'Η καρτέλα έχει ήδη νεότερη χρήση — δεν άλλαξε.', x.eme.afmMismatch ? '⚠ Το ΑΦΜ του εγγράφου ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.' : null].filter(Boolean).join(' '),
    })
  }
  if (x.template && (x.template.found.length || x.template.afmMismatch)) {
    const t = x.template
    toast.success(`${t.template} ${t.year}: βρέθηκαν ${t.found.length} από ${t.found.length + t.missing.length} πεδία`, {
      description: t.afmMismatch ? '⚠ Το ΑΦΜ του εγγράφου ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.' : [t.appliedTo.length ? `Ενημερώθηκαν: ${t.appliedTo.join(', ')}.` : null, t.missing.length ? `Δεν βρέθηκαν: ${t.missing.join(', ')}.` : null].filter(Boolean).join(' '),
    })
  }
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
  row, types, programs, apps, batchDupOf, onChange, onTypeChange, onRemove, onRetry, onUndo, onTypeCreated,
}: {
  row: Row
  types: DocumentTypeOption[]
  programs: { id: string; title: string }[]
  apps: AppOption[]
  batchDupOf: Row | null
  onChange: (p: Partial<Row>) => void
  onTypeChange: (typeId: string, period?: string) => void
  onRemove: () => void
  onRetry: () => void
  onUndo: () => void
  onTypeCreated: (t: DocumentTypeOption) => void
}) {
  const [captureOpen, setCaptureOpen] = React.useState(false)
  const scannable = row.mime === 'application/pdf' || row.mime.startsWith('image/') || /\.(docx|xlsx|xlsm|xls|csv|ods|txt|md|json|xml)$/i.test(row.name)
  const dir = row.relPath.includes('/') ? row.relPath.slice(0, row.relPath.lastIndexOf('/')) : ''
  const [captureFile, setCaptureFile] = React.useState<File | null>(null)
  async function openCapture() {
    // Μετά από επανάνοιγμα δεν υπάρχει το αρχείο του browser — φέρνουμε το αντίγραφο από τον server.
    const f = row.file ?? (row.itemId ? new File([await (await fetch(`/api/imports/${row.itemId}`)).blob()], row.name, { type: row.mime }) : null)
    if (f) { setCaptureFile(f); setCaptureOpen(true) }
  }
  const curType = types.find(t => t.id === row.typeId) ?? null
  const skipped = row.decision === 'skip' || !!batchDupOf || row.phase === 'skipped'
  // Σε αναμονή (όριο AI): χωρίς επιλογές ακόμη — αλλά μπορεί να αφαιρεθεί από τη λίστα.
  // Σε εξέλιξη (ανέβασμα/αναγνώριση/αναμονή): χωρίς επιλογές ακόμη — αλλά μπορεί να αφαιρεθεί από τη λίστα.
  const working = ['hashing', 'uploading', 'reading', 'classifying', 'waiting', 'interrupted'].includes(row.phase)
  const locked = ['hashing', 'uploading', 'reading', 'classifying'].includes(row.phase) || row.phase === 'saving' || row.phase === 'saved' || row.phase === 'skipped'
  const sizeKb = Math.max(1, Math.round(row.size / 1024))
  return (
    <li className={cn('rounded-2xl border bg-card p-3', row.phase === 'saved' ? 'border-[color:var(--success)]/40' : 'border-border', skipped && row.phase !== 'saved' && 'opacity-70')}>
      <div className="flex items-start gap-2.5">
        <span className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {row.phase === 'waiting'
            ? <LuClock className="size-4.5 text-[color:var(--warning)]" aria-hidden />
            : row.phase === 'interrupted'
            ? <LuTriangleAlert className="size-4.5 text-[color:var(--warning)]" aria-hidden />
            : working || row.phase === 'saving'
            ? <LuLoaderCircle className="size-4.5 animate-spin text-primary" aria-hidden />
            : row.phase === 'saved'
              ? <LuCircleCheck className="size-4.5 text-[color:var(--success)]" aria-hidden />
              : <LuFileText className="size-4.5 text-muted-foreground" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[length:var(--fs-13)] font-semibold">{row.name}</span>
            <span className="text-[length:var(--fs-11)] text-muted-foreground tabular-nums">{sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`}</span>
            {row.relPath.includes('/') && (
              <span className="inline-flex min-w-0 items-center gap-1 text-[length:var(--fs-11)] text-muted-foreground" title={row.relPath}>
                <LuFolder className="size-3 shrink-0" aria-hidden /><span className="truncate">{row.relPath.slice(0, row.relPath.lastIndexOf('/'))}</span>
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground" aria-live="polite">
            {row.phase === 'hashing' && 'Προετοιμασία…'}
            {row.phase === 'uploading' && `Ανεβαίνει… ${row.uploadPct ?? 0}%`}
            {row.phase === 'interrupted' && <span className="text-[color:var(--warning)]">Δεν πρόλαβε να ανέβει — ξαναδιαλέξτε τον φάκελο/αρχείο.</span>}
            {row.phase === 'reading' && 'Σε σειρά για αναγνώριση (στον server)…'}
            {row.phase === 'skipped' && <span>{row.savedNote ?? 'Δεν χρειάζεται να ανέβει.'}</span>}
            {row.phase === 'classifying' && 'Αναγνώριση τύπου…'}
            {row.phase === 'waiting' && (
              <span className="inline-flex items-center gap-1 text-[color:var(--warning)]">
                <LuClock className="size-3.5" aria-hidden /> Σε αναμονή — {row.waitReason}· νέα προσπάθεια στις {row.retryAt ? new Date(row.retryAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}
              </span>
            )}
            {row.phase === 'saving' && 'Αποθήκευση…'}
            {row.phase === 'saved' && <span className="font-semibold text-[color:var(--success)]">{row.autoSaved ? '' : 'Αποθηκεύτηκε'}{row.savedNote ? `${row.autoSaved ? '' : ' — '}${row.savedNote}` : ''}</span>}
            {row.phase === 'saved' && row.autoSaved && (
              <button type="button" onClick={onUndo} className="font-semibold text-primary hover:underline" title="Αφαίρεση από τα δικαιολογητικά — το αρχείο επιστρέφει για έλεγχο">Αναίρεση</button>
            )}
            {(row.phase === 'ready' || row.phase === 'error') && row.dest === 'dossier' && <ConfidenceChip s={row.suggestion} />}
            {row.phase === 'ready' && row.suggestion?.reason && <span className="min-w-0">{row.suggestion.reason}</span>}
            {row.error && <span className="text-destructive">{row.error}</span>}
          </div>
        </div>
        {scannable && !working && row.phase !== 'skipped' && row.phase !== 'saved' && (row.dest === 'dossier' || row.dest === 'files') && (
          <button
            type="button"
            onClick={() => void openCapture()}
            title={curType ? `Σάρωση τιμών — ποιες τιμές κρατάμε από «${curType.name}»` : 'Σάρωση τιμών — νέος τύπος με τις τιμές που θέλουμε να κρατάμε'}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/60 px-2.5 text-[length:var(--fs-11-5)] font-semibold text-primary hover:bg-primary/5"
          >
            <LuScanText className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Σάρωση τιμών</span>
          </button>
        )}
        {row.itemId && row.phase === 'ready' && row.dest !== 'junk' && (
          <button type="button" onClick={onRetry} title="Νέα αναγνώριση (π.χ. μετά από νέο τύπο ή πρότυπο)" aria-label={`Νέα αναγνώριση ${row.name}`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary">
            <LuRefreshCw className="size-4" aria-hidden />
          </button>
        )}
        <LocalPreview file={row.file} itemId={row.itemId} name={row.name} mime={row.mime} />
        {!locked && (
          <button type="button" onClick={onRemove} aria-label={`Αφαίρεση ${row.name}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <LuX className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {!working && row.phase !== 'saved' && !skipped && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Πού πάει το ${row.name}`}>
          {(['dossier', 'approval', 'quote', 'invoice', 'files', 'junk'] as Dest[]).map(d => {
            const Icon = d === 'junk' ? LuTrash2 : d === 'dossier' ? LuFileBadge : d === 'approval' ? LuStamp : d === 'quote' ? LuFileText : d === 'invoice' ? LuReceipt : LuHardDrive
            const off = (d === 'quote' || d === 'invoice' || d === 'approval') && apps.length === 0
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={row.dest === d}
                disabled={locked || off}
                title={off ? 'Ο πελάτης δεν είναι ενταγμένος σε έργο' : undefined}
                onClick={() => onChange({ dest: d, appId: row.appId || (apps.length === 1 ? apps[0].id : '') })}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[length:var(--fs-11-5)] font-semibold transition-colors disabled:opacity-50',
                  row.dest === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
                )}
              >
                <Icon className="size-3.5" aria-hidden /> {DEST_META[d].label}
              </button>
            )
          })}

        </div>
      )}

      {!working && row.phase !== 'saved' && !skipped && (row.dest === 'quote' || row.dest === 'invoice' || row.dest === 'approval') && (
        <div className="mt-2.5 field !mb-0">
          <label>Έργο στο οποίο αφορά <span className="font-normal text-muted-foreground">— μπαίνει στο έργο (Δαπάνες & Πλάνο) ως «Προς καταχώριση», ήδη διαβασμένο</span></label>
          <Select value={row.appId || undefined} onValueChange={v => onChange({ appId: v ?? '' })} disabled={locked}>
            <SelectTrigger aria-label="Έργο" className={cn('h-9 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]', !row.appId && 'border-[color:var(--warning)]')}>
              <SelectValue placeholder="Επίλεξε έργο…">{(v: string) => apps.find(a => a.id === v)?.title ?? ''}</SelectValue>
            </SelectTrigger>
            <SelectContent>{apps.map(a => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {!working && row.phase !== 'saved' && row.dest === 'junk' && (
        <p className="mt-2 flex items-center gap-1.5 text-[length:var(--fs-11-5)] text-[color:var(--warning)]">
          <LuTrash2 className="size-3.5" aria-hidden /> Δεν θα ανέβει{row.junkReason ? ` — ${row.junkReason}` : '.'}
        </p>
      )}

      {!working && row.phase !== 'saved' && !skipped && row.dest === 'files' && (
        <p className="mt-2 flex items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground">
          <LuHardDrive className="size-3.5" aria-hidden /> Θα μπει στα αρχεία του πελάτη{dir ? ` › ${dir}` : ''}.
        </p>
      )}

      {!working && row.phase !== 'saved' && row.dest === 'dossier' && row.suggestion?.company?.status === 'MISMATCH' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[length:var(--fs-12)]" style={{ borderColor: 'var(--danger)', background: 'color-mix(in oklab, var(--danger) 8%, transparent)' }}>
          <LuTriangleAlert className="size-4 shrink-0" style={{ color: 'var(--danger)' }} aria-hidden />
          <span className="min-w-0 flex-1">
            <b>{row.decision === 'skip' ? 'Απορρίφθηκε — αφορά άλλη επιχείρηση.' : 'Αφορά άλλη επιχείρηση — θα αποθηκευτεί παρ’ όλα αυτά.'}</b>{' '}
            {row.suggestion.company.note}
          </span>
          <button
            type="button"
            className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[length:var(--fs-11-5)] font-semibold hover:bg-muted"
            onClick={() => onChange({ decision: row.decision === 'skip' ? 'keep' : 'skip' })}
            disabled={locked}
          >
            {row.decision === 'skip' ? 'Αφορά αυτή την επιχείρηση — κράτα το' : 'Απόρριψη'}
          </button>
        </div>
      )}

      {!working && row.phase !== 'saved' && row.phase !== 'skipped' && row.dest === 'dossier' && !(row.suggestion?.company?.status === 'MISMATCH' && row.decision === 'skip') && (
        <DuplicateNotice row={row} batchDupOf={batchDupOf} onDecision={d => onChange({ decision: d })} />
      )}

      {!working && !skipped && row.dest === 'dossier' && (row.needs?.length || row.covered.length) ? (
        <ProgramNeeds needs={row.needs ?? []} covered={row.covered} saved={row.phase === 'saved'} />
      ) : null}

      {!working && row.phase !== 'saved' && !skipped && row.dest === 'dossier' && (
        <div className="mt-3 grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
          <div className="field !mb-0">
            <label>Τύπος δικαιολογητικού</label>
            <Combobox
              ariaLabel="Τύπος δικαιολογητικού"
              options={types.map(t => ({ value: t.id, label: t.name, hint: t.seriesKind ? 'σειρά' : t.expires ? 'λήγει' : undefined }))}
              value={row.typeId || null}
              placeholder="Αναζήτηση τύπου…"
              className={cn('h-9 w-full', !row.typeId && 'border-[color:var(--warning)]')}
              onChange={v => {
                if (locked) return
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
            />
          </div>

          {(() => {
            const kind = types.find(x => x.id === row.typeId)?.seriesKind
            if (!isSeriesKind(kind) || kind === 'LIST') return null
            return (
              <div className="field !mb-0 sm:col-span-2">
                <label>Περίοδος αναφοράς <span className="font-normal text-muted-foreground">— {kind === 'MONTHLY' ? 'μήνας' : kind === 'QUARTERLY' ? 'τρίμηνο' : 'έτος'} που αφορά το έγγραφο</span></label>
                <PeriodInput kind={kind} value={row.period} disabled={locked} onChange={v => { onChange({ period: v }); onTypeChange(row.typeId, v) }} />
              </div>
            )
          })()}

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
      {captureOpen && captureFile && (
        <ValueCaptureDialog
          file={captureFile}
          type={curType ? { id: curType.id, name: curType.name } : null}
          open={captureOpen}
          onOpenChange={setCaptureOpen}
          onSaved={(t, period) => {
            onTypeCreated({ id: t.id, name: t.name, expires: t.expires, seriesKind: t.seriesKind })
            const p = period ?? row.period
            onChange({ typeId: t.id, dest: 'dossier', period: p, error: null })
            onTypeChange(t.id, p)
          }}
        />
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
        <span>Το ίδιο αρχείο υπάρχει ήδη σε αυτή τη μεταφόρτωση («{batchDupOf.name}») — <strong>δεν θα αποθηκευτεί δεύτερη φορά</strong>.</span>
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

/** Επιλογή περιόδου ανά τύπο σειράς: μήνας (input month) · τρίμηνο / έτος (λίστα των τελευταίων ετών). */
export function PeriodInput({ kind, value, disabled, onChange }: { kind: SeriesKind; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const y = new Date().getFullYear()
  const years = Array.from({ length: 12 }, (_, i) => y - i)
  if (kind === 'MONTHLY') {
    return (
      <Input type="month" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} aria-label="Μήνας αναφοράς"
        className={cn('h-9 w-auto rounded-full text-[length:var(--fs-12-5)]', !value && 'border-[color:var(--warning)]')} />
    )
  }
  const options = kind === 'QUARTERLY'
    ? years.flatMap(yy => [4, 3, 2, 1].map(q => `${yy}-Q${q}`))
    : years.map(String)
  return (
    <Select value={value || undefined} onValueChange={v => onChange(v ?? '')} disabled={disabled}>
      <SelectTrigger aria-label="Περίοδος αναφοράς" className={cn('h-9 w-auto min-w-44 rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]', !value && 'border-[color:var(--warning)]')}>
        <SelectValue placeholder="Επίλεξε…">{(v: string) => periodLabel(v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{periodLabel(o)}</SelectItem>)}</SelectContent>
    </Select>
  )
}

/** Προβολή του τοπικού αρχείου (πριν ανέβει) — για όσα δεν θυμόμαστε τι είναι πριν τα κατατάξουμε. */
function LocalPreview({ file, itemId, name, mime }: { file: File | null; itemId: string | null; name: string; mime: string }) {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => () => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url) }, [url])
  if (!file && !itemId) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setUrl(file ? URL.createObjectURL(file) : `/api/imports/${itemId}`)}
        aria-label={`Προβολή ${name}`}
        title="Προβολή αρχείου"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary"
      >
        <LuEye className="size-4" aria-hidden />
      </button>
      {url && <DocumentPreviewDialog url={url} name={name} mimeType={mime} open onOpenChange={o => { if (!o) setUrl(null) }} />}
    </>
  )
}
