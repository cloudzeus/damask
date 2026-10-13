'use client'

import { Combobox } from '@/components/ui/combobox'
import { DocumentPreviewDialog } from '@/components/ui/document-preview'
import { ValueCaptureDialog } from './value-capture-dialog'
import { isSeriesKind, periodLabel, type SeriesKind } from '@/lib/documents/series'
import * as React from 'react'
import { toast } from 'sonner'
import {
  LuUpload, LuLoaderCircle, LuX, LuSparkles, LuBrain, LuCircleCheck, LuTriangleAlert, LuFileText, LuCloudUpload, LuCopy, LuInfo, LuFolderKanban,
  LuFolderOpen, LuFolder, LuReceipt, LuFileBadge, LuHardDrive, LuStamp, LuEye, LuScanText,
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
import { chunkedUpload, filesFromDrop, filesFromPicker, relativeDirOf, relativePathOf } from '@/components/ui/file-dropzone'
import { stageInboxDoc, listTrdrApplicationsForInbox } from '@/lib/pm/expense-inbox'
import {
  uploadTrdrDossierDoc, checkDossierDuplicates, listProgramNeedsForTypes, listDocumentTypes,
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
/** Πού πάει το αρχείο: δικαιολογητικό πελάτη · προσφορά/παραστατικό → «Προς καταχώριση» του έργου · αρχεία πελάτη (με τη δομή φακέλων). */
type Dest = 'dossier' | 'approval' | 'quote' | 'invoice' | 'files'
type AppOption = { id: string; programId: string; title: string }

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
  /** Περίοδος για τύπους-σειρές (π.χ. Φ2 «2025-03») — από την αναγνώριση, διορθώσιμη. */
  period: string
  /** Διαδρομή μέσα στον φάκελο που επιλέχθηκε (π.χ. «Προσφορές/x.pdf») ή ''. */
  relPath: string
  dest: Dest
  /** Έργο-προορισμός για προσφορές/παραστατικά. */
  appId: string
  /** Μετά την αποθήκευση: πού μπήκε. */
  savedNote: string | null
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
const CONCURRENCY = 3
/** Όριο αιτήματος server action — μεγαλύτερα δικαιολογητικά/προσφορές πάνε στα αρχεία πελάτη (τμηματικά, χωρίς όριο). */
const INLINE_MAX = 11 * 1024 * 1024
/** Αρχεία που δεν είναι έγγραφα (βίντεο/ήχος/αρχειοθήκες) → κατευθείαν στα αρχεία πελάτη, χωρίς αναγνώριση. */
const NOT_A_DOC = /\.(mp4|mov|avi|mkv|webm|mp3|wav|m4a|zip|rar|7z|gz|tar|dmg|exe|iso|psd|ai|indd)$/i
const DEST_META: Record<Dest, { label: string; short: string }> = {
  dossier: { label: 'Δικαιολογητικό', short: 'δικαιολογητικά' },
  approval: { label: 'Εγκριτική', short: 'εγκριτικά' },
  quote: { label: 'Προσφορά', short: 'προσφορές' },
  invoice: { label: 'Παραστατικό', short: 'παραστατικά' },
  files: { label: 'Αρχεία πελάτη', short: 'στα αρχεία' },
}

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
  const [apps, setApps] = React.useState<AppOption[]>([])
  const programs = React.useMemo(() => apps.map(a => ({ id: a.programId, title: a.title })), [apps])
  const appsRef = React.useRef<AppOption[]>([])
  const [scanning, setScanning] = React.useState(false)
  const dirRef = React.useRef<HTMLInputElement>(null)
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
      if (NOT_A_DOC.test(file.name)) { patch(id, { phase: 'ready', dest: 'files' }); return }
      const hash = file.size < 200 * 1024 * 1024 ? await sha256(file).catch(() => '') : ''
      patch(id, { hash })
      const text = await extractText(file).catch(() => '')
      patch(id, { phase: 'classifying', snippet: text })
      // Η διαδρομή φακέλου βοηθά την αναγνώριση (π.χ. «Προσφορές/…», «Τιμολόγια/…»).
      const res = await classifyDocumentSmart({ trdrId, fileName: relativePathOf(file) || file.name, text })
      if (!res.ok) {
        patch(id, { phase: 'ready', error: res.message, dest: 'files' })
        return
      }
      const s = res.result
      if (s.commercial) {
        const list = appsRef.current
        const app = list.find(a => a.programId === s.programId) ?? (list.length === 1 ? list[0] : null)
        patch(id, {
          phase: 'ready', suggestion: s,
          dest: list.length ? (s.commercial === 'QUOTE' ? 'quote' : s.commercial === 'APPROVAL' ? 'approval' : 'invoice') : 'files',
          appId: app?.id ?? '',
          error: list.length ? null : 'Ο πελάτης δεν είναι ενταγμένος σε έργο — θα μπει στα αρχεία του.',
        })
        return
      }
      const t = typesRef.current.find(x => x.id === s.typeId)
      const [[dup], needs] = await Promise.all([
        checkDossierDuplicates(trdrId, [{ key: id, hash, typeId: s.typeId, period: s.period }]).catch(() => [null]),
        s.typeId ? listProgramNeedsForTypes(trdrId, [s.typeId]).catch(() => ({} as Record<string, ProgramNeed[]>)) : Promise.resolve({} as Record<string, ProgramNeed[]>),
      ])
      // Έγγραφο άλλης επιχείρησης (άλλο ΑΦΜ) → απορρίπτεται από προεπιλογή.
      const foreign = s.company?.status === 'MISMATCH'
      patch(id, {
        dup: dup ?? null,
        needs: s.typeId ? (needs[s.typeId] ?? []) : null,
        decision: foreign ? 'skip' : defaultDecision(dup ?? null, !!t?.expires),
        phase: 'ready',
        suggestion: s,
        dest: s.typeId ? 'dossier' : 'files',
        typeId: s.typeId ?? '',
        programId: s.programId ?? fallbackProgram,
        reusable: s.reusable,
        hasExpiry: !!(t?.expires || s.expiresAt),
        expiresAt: s.expiresAt ?? '',
        expiryNote: s.expiryNote ?? null,
        period: s.period ?? '',
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
        typeId: '', programId: fallbackProgram, reusable: true, hasExpiry: false, expiresAt: '', expiryNote: null, period: '',
        hash: '', dup: null, decision: 'keep', needs: null, covered: [],
        relPath: relativePathOf(file), dest: 'dossier', appId: '', savedNote: null,
      }
    })
    setRows(prev => [...prev, ...newRows])
    queue.current.push(...newRows.map(r => r.id))
    pump()
  }

  function openDialog() {
    setOpen(true)
    if (!typesProp) listDocumentTypes().then(setLoadedTypes).catch(() => setLoadedTypes([]))
    listTrdrApplicationsForInbox(trdrId).then(a => { appsRef.current = a; setApps(a) }).catch(() => setApps([]))
  }

  function onDropFiles(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    setScanning(true)
    void filesFromDrop(e.dataTransfer).then(addFiles).finally(() => setScanning(false))
  }

  const busy = rows.some(r => r.phase === 'reading' || r.phase === 'classifying' || r.phase === 'saving')
  const pending = rows.filter(r => r.phase !== 'saved' && r.decision !== 'skip')
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
    if (!next) { setRows([]); queue.current = []; files.current.clear() }
    setOpen(next)
  }

  async function saveAll() {
    let saved = 0
    let coveredTotal = 0
    let staged = 0
    let filed = 0
    for (const r of rows) {
      if (r.phase !== 'ready' || r.decision === 'skip' || batchDupOf.has(r.id)) continue
      // Προσφορές/παραστατικά → «Προς καταχώριση» του έργου· άλλα/μεγάλα → αρχεία πελάτη.
      const tooBig = r.file.size > INLINE_MAX
      if (r.dest === 'files' || (tooBig && r.dest !== 'dossier') || (tooBig && r.dest === 'dossier')) {
        patch(r.id, { phase: 'saving' })
        try {
          await chunkedUpload(`/api/partners/${trdrId}/files/upload-chunk`, r.file, { subPath: '', relDir: relativeDirOf(r.file) }, () => {})
          const dir = relativeDirOf(r.file)
          patch(r.id, { phase: 'saved', savedNote: `${tooBig && r.dest !== 'files' ? 'Μεγάλο αρχείο — ' : ''}στα αρχεία πελάτη${dir ? ` › ${dir}` : ''}` })
          filed += 1
        } catch (err) {
          patch(r.id, { phase: 'error', error: err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.' })
        }
        continue
      }
      if (r.dest === 'quote' || r.dest === 'invoice' || r.dest === 'approval') {
        if (!r.appId) continue
        patch(r.id, { phase: 'saving' })
        try {
          const { base64, ext } = await readFileBase64(r.file)
          const res = await stageInboxDoc({
            applicationId: r.appId, kind: r.dest === 'quote' ? 'QUOTE' : r.dest === 'approval' ? 'APPROVAL' : 'INVOICE',
            name: r.file.name, base64, mimeType: r.file.type || 'application/octet-stream', ext, relPath: r.relPath || null,
          })
          if (!res.ok) { patch(r.id, { phase: 'error', error: res.message }); continue }
          patch(r.id, { phase: 'saved', savedNote: `«Προς καταχώριση» στο έργο ${res.programTitle}${res.read ? '' : ' (χωρίς ανάγνωση)'}` })
          staged += 1
        } catch {
          patch(r.id, { phase: 'error', error: 'Η αποθήκευση απέτυχε.' })
        }
        continue
      }
      if (!r.typeId) continue
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
          period: r.period || null,
        })
        patch(r.id, { phase: 'saved', covered: res.coveredPrograms, savedNote: 'στα δικαιολογητικά' })
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
        if (res.template && (res.template.found.length || res.template.afmMismatch)) {
          const t = res.template
          toast.success(`${t.template} ${t.year}: βρέθηκαν ${t.found.length} από ${t.found.length + t.missing.length} πεδία`, {
            description: t.afmMismatch
              ? '⚠ Το ΑΦΜ του εγγράφου ανήκει σε άλλη εταιρία — δεν καταχωρίστηκαν στοιχεία.'
              : [t.appliedTo.length ? `Ενημερώθηκαν: ${t.appliedTo.join(', ')}.` : null, t.missing.length ? `Δεν βρέθηκαν: ${t.missing.join(', ')}.` : null].filter(Boolean).join(' '),
          })
        }
        coveredTotal += res.covered
        saved += 1
      } catch {
        patch(r.id, { phase: 'error', error: 'Η αποθήκευση απέτυχε.' })
      }
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

  const allSaved = rows.length > 0 && rows.every(r => r.phase === 'saved' || r.decision === 'skip' || batchDupOf.has(r.id))
  const toSave = pending.filter(r => r.phase === 'ready' && !batchDupOf.has(r.id)).length
  const counts = rows.reduce((acc, r) => {
    if (r.phase === 'reading' || r.phase === 'classifying') acc.working += 1
    else if (r.decision !== 'skip' && !batchDupOf.has(r.id)) acc[r.dest] += 1
    return acc
  }, { working: 0, dossier: 0, approval: 0, quote: 0, invoice: 0, files: 0 } as Record<Dest | 'working', number>)

  return (
    <>
      <Button type="button" variant={variant} onClick={openDialog}>
        <LuSparkles className="size-3.5" aria-hidden /> {label}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LuSparkles className="size-4 text-primary" aria-hidden /> Έξυπνη καταχώριση δικαιολογητικών</DialogTitle>
            <DialogDescription>
              Ανέβασε αρχεία ή ολόκληρους φακέλους (με υποφακέλους) — κάθε αρχείο αναγνωρίζεται και τακτοποιείται: δικαιολογητικά με τύπο/πρόγραμμα/λήξη, προσφορές και παραστατικά στο έργο του πελάτη («Προς καταχώριση»), τα υπόλοιπα στα αρχεία του με τη δομή φακέλων. Έλεγξε και αποθήκευσε.
            </DialogDescription>
          </DialogHeader>

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
            <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(filesFromPicker(e.target.files)); e.target.value = '' }} />
            <input
              ref={el => { dirRef.current = el; el?.setAttribute('webkitdirectory', ''); el?.setAttribute('directory', '') }}
              type="file" multiple className="hidden"
              onChange={e => { if (e.target.files) addFiles(filesFromPicker(e.target.files)); e.target.value = '' }}
            />
          </div>

          {rows.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-11-5)]" aria-live="polite">
              <span className="font-semibold">{rows.length} αρχεία:</span>
              {counts.working > 0 && <span className="badge-pill muted"><LuLoaderCircle className="size-3 animate-spin" aria-hidden /> {counts.working} σε αναγνώριση</span>}
              {(['dossier', 'approval', 'quote', 'invoice', 'files'] as Dest[]).filter(d => counts[d] > 0).map(d => (
                <span key={d} className={cn('badge-pill', d === 'files' ? 'muted' : d === 'dossier' ? 'ok' : 'info')} style={{ textTransform: 'none' }}>{counts[d]} {DEST_META[d].short}</span>
              ))}
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
                  onRemove={() => { setRows(prev => prev.filter(x => x.id !== r.id)); files.current.delete(r.id) }}
                  onTypeCreated={t => setExtraTypes(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]))}
                />
              ))}
            </ul>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              {allSaved ? 'Κλείσιμο' : 'Άκυρο'}
            </Button>
            {!allSaved && (
              <Button type="button" onClick={saveAll} disabled={busy || toSave === 0 || missingType || missingApp}>
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
  row, types, programs, apps, batchDupOf, onChange, onTypeChange, onRemove, onTypeCreated,
}: {
  row: Row
  types: DocumentTypeOption[]
  programs: { id: string; title: string }[]
  apps: AppOption[]
  batchDupOf: Row | null
  onChange: (p: Partial<Row>) => void
  onTypeChange: (typeId: string, period?: string) => void
  onRemove: () => void
  onTypeCreated: (t: DocumentTypeOption) => void
}) {
  const [captureOpen, setCaptureOpen] = React.useState(false)
  const scannable = row.file.type === 'application/pdf' || row.file.type.startsWith('image/')
  const curType = types.find(t => t.id === row.typeId) ?? null
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
            <span className="text-[length:var(--fs-11)] text-muted-foreground tabular-nums">{sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`}</span>
            {row.relPath.includes('/') && (
              <span className="inline-flex min-w-0 items-center gap-1 text-[length:var(--fs-11)] text-muted-foreground" title={row.relPath}>
                <LuFolder className="size-3 shrink-0" aria-hidden /><span className="truncate">{row.relPath.slice(0, row.relPath.lastIndexOf('/'))}</span>
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground" aria-live="polite">
            {row.phase === 'reading' && 'Ανάγνωση εγγράφου…'}
            {row.phase === 'classifying' && 'Αναγνώριση τύπου…'}
            {row.phase === 'saving' && 'Αποθήκευση…'}
            {row.phase === 'saved' && <span className="font-semibold text-[color:var(--success)]">Αποθηκεύτηκε{row.savedNote ? ` — ${row.savedNote}` : ''}</span>}
            {(row.phase === 'ready' || row.phase === 'error') && row.dest === 'dossier' && <ConfidenceChip s={row.suggestion} />}
            {row.phase === 'ready' && row.suggestion?.reason && <span className="min-w-0">{row.suggestion.reason}</span>}
            {row.error && <span className="text-destructive">{row.error}</span>}
          </div>
        </div>
        {scannable && !working && (row.dest === 'dossier' || row.dest === 'files') && (
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            title={curType ? `Σάρωση τιμών — ποιες τιμές κρατάμε από «${curType.name}»` : 'Σάρωση τιμών — νέος τύπος με τις τιμές που θέλουμε να κρατάμε'}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/60 px-2.5 text-[length:var(--fs-11-5)] font-semibold text-primary hover:bg-primary/5"
          >
            <LuScanText className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Σάρωση τιμών</span>
          </button>
        )}
        <LocalPreview file={row.file} />
        {!locked && (
          <button type="button" onClick={onRemove} aria-label={`Αφαίρεση ${row.file.name}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <LuX className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {!working && row.phase !== 'saved' && !skipped && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Πού πάει το ${row.file.name}`}>
          {(['dossier', 'approval', 'quote', 'invoice', 'files'] as Dest[]).map(d => {
            const Icon = d === 'dossier' ? LuFileBadge : d === 'approval' ? LuStamp : d === 'quote' ? LuFileText : d === 'invoice' ? LuReceipt : LuHardDrive
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

      {!working && row.phase !== 'saved' && !skipped && row.dest === 'files' && (
        <p className="mt-2 flex items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground">
          <LuHardDrive className="size-3.5" aria-hidden /> Θα μπει στα αρχεία του πελάτη{relativeDirOf(row.file) ? ` › ${relativeDirOf(row.file)}` : ''}.
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

      {!working && row.phase !== 'saved' && row.dest === 'dossier' && !(row.suggestion?.company?.status === 'MISMATCH' && row.decision === 'skip') && (
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
      {captureOpen && (
        <ValueCaptureDialog
          file={row.file}
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
function LocalPreview({ file }: { file: File }) {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <>
      <button
        type="button"
        onClick={() => setUrl(URL.createObjectURL(file))}
        aria-label={`Προβολή ${file.name}`}
        title="Προβολή αρχείου"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary"
      >
        <LuEye className="size-4" aria-hidden />
      </button>
      {url && <DocumentPreviewDialog url={url} name={file.name} mimeType={file.type} open onOpenChange={o => { if (!o) setUrl(null) }} />}
    </>
  )
}
