'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  UploadCloud, X, RotateCcw, Loader2, CheckCircle2, AlertTriangle, FolderUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

export type DropzoneStatus = 'queued' | 'uploading' | 'done' | 'error'

export type DropzoneItem<T> = {
  id: string
  name: string
  size: number
  status: DropzoneStatus
  progress: number
  error: string | null
  /** true όταν το αρχείο απορρίφθηκε στον client (τύπος/μέγεθος/όριο) — δεν επαναλαμβάνεται */
  rejected: boolean
  result: T | null
}

export type FileDropzoneProps<T> = {
  /** Ο καλών ορίζει τη μεταφόρτωση. Το component κρατά μόνο το UX. */
  uploadFn: (file: File, onProgress: (pct: number) => void, signal: AbortSignal) => Promise<T>
  /** Καλείται όταν ολοκληρωθεί μια παρτίδα — μόνο με τα ΝΕΑ επιτυχή αποτελέσματα. */
  onUploaded?: (items: T[]) => void
  onError?: (err: unknown) => void
  /** π.χ. 'image/*,video/mp4,.glb' */
  accept?: string
  maxSizeMB?: number
  maxFiles?: number
  /** default true */
  multiple?: boolean
  /** default 3 */
  maxConcurrent?: number
  disabled?: boolean
  helperText?: ReactNode
  className?: string
  /** Επιλογή/σύρσιμο ΟΛΟΚΛΗΡΩΝ φακέλων (με υποφακέλους) — η διαδρομή κάθε αρχείου: relativeDirOf(file). */
  allowFolders?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true
  const tokens = accept.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  if (tokens.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return tokens.some(token => {
    if (token.startsWith('.')) return name.endsWith(token)
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1))
    return type === token
  })
}

/**
 * Βοηθός XHR μεταφόρτωσης με progress + abort — ώστε οι callers να μην ξαναγράφουν XHR.
 * Επιστρέφει το parsed JSON του response body.
 */
export function xhrUpload<R = unknown>(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: unknown = null
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { /* μη-JSON απάντηση */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as R)
      } else {
        const msg = body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string'
          ? (body as { error: string }).error
          : `Η μεταφόρτωση απέτυχε (${xhr.status}).`
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Αποτυχία σύνδεσης κατά τη μεταφόρτωση.'))
    xhr.onabort = () => reject(new DOMException('Η μεταφόρτωση ακυρώθηκε.', 'AbortError'))
    if (signal) {
      if (signal.aborted) { xhr.abort(); return }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(formData)
  })
}

// ── Φάκελοι: σχετική διαδρομή κάθε αρχείου ─────────────────────────────────
const relPaths = new WeakMap<File, string>()
/** «Φάκελος/Υποφάκελος/αρχείο.pdf» για αρχεία από φάκελο (επιλογή ή σύρσιμο)· αλλιώς ''. */
export function relativePathOf(file: File): string {
  return relPaths.get(file) ?? (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
}
/** Μόνο το τμήμα των φακέλων («Φάκελος/Υποφάκελος») ή ''. */
export function relativeDirOf(file: File): string {
  const p = relativePathOf(file)
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : ''
}
/** Αρχεία συστήματος που δεν ανεβαίνουν ποτέ. */
const JUNK = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.+)$/i

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const f = await new Promise<File>((ok, err) => (entry as FileSystemFileEntry).file(ok, err))
    relPaths.set(f, entry.fullPath.replace(/^\/+/, ''))
    out.push(f)
    return
  }
  if (!entry.isDirectory) return
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // Το readEntries επιστρέφει έως ~100 ανά κλήση — συνεχίζουμε μέχρι να αδειάσει.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((ok, err) => reader.readEntries(ok, err))
    if (!batch.length) break
    for (const e of batch) await walkEntry(e, out)
  }
}

/** Αρχεία από σύρσιμο — με διάσχιση φακέλων/υποφακέλων (σχετική διαδρομή στο relativePathOf).
 * Καλείται ΣΥΓΧΡΟΝΑ μέσα στο drop event (οι entries λαμβάνονται πριν το πρώτο await). */
export function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .map(i => i.webkitGetAsEntry?.() ?? null)
    .filter((x): x is FileSystemEntry => !!x)
  if (!entries.some(en => en.isDirectory)) return Promise.resolve(Array.from(dt.files ?? []).filter(f => !JUNK.test(f.name)))
  const out: File[] = []
  return Promise.all(entries.map(en => walkEntry(en, out))).then(() => out.filter(f => !JUNK.test(f.name)))
}
/** Αρχεία από <input webkitdirectory> (χωρίς αρχεία συστήματος). */
export function filesFromPicker(list: FileList): File[] {
  return Array.from(list).filter(f => !JUNK.test(f.name))
}

// ── Τμηματικό ανέβασμα (χωρίς όριο μεγέθους) ───────────────────────────────
const CHUNK_SIZE = 8 * 1024 * 1024

function xhrSend(url: string, fd: FormData, onLoaded: (bytes: number) => void, signal?: AbortSignal): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = e => onLoaded(e.loaded)
    xhr.onload = () => {
      let body: Record<string, unknown> | null = null
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { /* μη-JSON */ }
      resolve({ status: xhr.status, body })
    }
    xhr.onerror = () => reject(new Error('Αποτυχία σύνδεσης.'))
    xhr.onabort = () => reject(new DOMException('Η μεταφόρτωση ακυρώθηκε.', 'AbortError'))
    if (signal) {
      if (signal.aborted) { xhr.abort(); return }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(fd)
  })
}

/**
 * Ανέβασμα σε κομμάτια των 8MB (κάτω από το όριο αιτήματος του Cloudflare) — αρχεία ΟΠΟΙΟΥΔΗΠΟΤΕ μεγέθους.
 * Ο server ενώνει τα κομμάτια και στο τελευταίο επιστρέφει το αποτέλεσμα. Επανάληψη έως 4 φορές ανά κομμάτι
 * (δίκτυο/5xx)· σε «εκτός σειράς» (409) συνεχίζει από το σημείο που λέει ο server.
 */
export async function chunkedUpload<R = unknown>(
  url: string,
  file: File,
  fields: Record<string, string>,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<R> {
  const uploadId = crypto.randomUUID()
  const size = file.size
  let offset = 0
  let attempt = 0
  for (;;) {
    const end = Math.min(size, offset + CHUNK_SIZE)
    const fd = new FormData()
    fd.append('uploadId', uploadId)
    fd.append('offset', String(offset))
    fd.append('size', String(size))
    fd.append('name', file.name)
    fd.append('type', file.type)
    for (const [k, v] of Object.entries(fields)) fd.append(k, v)
    fd.append('chunk', file.slice(offset, end))
    let res: { status: number; body: Record<string, unknown> | null }
    try {
      res = await xhrSend(url, fd, loaded => onProgress(size ? ((offset + Math.min(loaded, end - offset)) / size) * 100 : 50), signal)
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err
      if (++attempt > 4) throw new Error('Η σύνδεση διακόπηκε επανειλημμένα — δοκίμασε ξανά.')
      await new Promise(r => setTimeout(r, 800 * attempt))
      continue
    }
    if (res.status === 409 && typeof res.body?.expectedOffset === 'number') {
      offset = res.body.expectedOffset
      if (++attempt > 4) throw new Error('Το ανέβασμα δεν συγχρονίστηκε — δοκίμασε ξανά.')
      continue
    }
    if (res.status >= 500 && ++attempt <= 4) { await new Promise(r => setTimeout(r, 800 * attempt)); continue }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(typeof res.body?.error === 'string' ? res.body.error : `Η μεταφόρτωση απέτυχε (${res.status}).`)
    }
    attempt = 0
    offset = end
    onProgress(size ? (offset / size) * 100 : 100)
    if (offset >= size) return res.body as R
  }
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  if (sec < 60) return `~${Math.ceil(sec)}″`
  const m = Math.floor(sec / 60)
  if (m < 60) return `~${m}′ ${Math.round(sec % 60)}″`
  return `~${Math.floor(m / 60)} ώρ. ${m % 60}′`
}

export function FileDropzone<T>({
  uploadFn,
  onUploaded,
  onError,
  accept,
  maxSizeMB,
  maxFiles,
  multiple = true,
  maxConcurrent = 3,
  disabled = false,
  helperText,
  className,
  allowFolders = false,
}: FileDropzoneProps<T>) {
  const [items, setItems] = useState<DropzoneItem<T>[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [speed, setSpeed] = useState(0) // bytes/sec (κινητός μέσος όρος)

  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<Map<string, File>>(new Map())
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  const activeCountRef = useRef(0)
  const pendingRef = useRef<string[]>([])
  const notifiedRef = useRef(true)
  const deliveredRef = useRef<Set<string>>(new Set())

  function updateItem(id: string, patch: Partial<DropzoneItem<T>>) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }

  function pump() {
    while (activeCountRef.current < maxConcurrent && pendingRef.current.length > 0) {
      const id = pendingRef.current.shift()!
      activeCountRef.current += 1
      runItem(id).finally(() => {
        activeCountRef.current -= 1
        pump()
      })
    }
  }

  async function runItem(id: string) {
    const file = filesRef.current.get(id)
    if (!file) return
    const controller = new AbortController()
    controllersRef.current.set(id, controller)
    updateItem(id, { status: 'uploading', progress: 0, error: null })
    try {
      const result = await uploadFn(
        file,
        pct => updateItem(id, { progress: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)) }),
        controller.signal,
      )
      updateItem(id, { status: 'done', progress: 100, result })
    } catch (err) {
      if (controller.signal.aborted) return
      updateItem(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Η μεταφόρτωση απέτυχε.',
      })
      onError?.(err)
    } finally {
      controllersRef.current.delete(id)
    }
  }

  function addFiles(fileList: FileList | File[]) {
    if (disabled) return
    const incoming = Array.from(fileList).filter(f => !JUNK.test(f.name))
    if (incoming.length === 0) return
    const selected = multiple ? incoming : incoming.slice(0, 1)

    notifiedRef.current = false
    const newItems: DropzoneItem<T>[] = []
    const toQueue: string[] = []

    for (const file of selected) {
      const id = crypto.randomUUID()
      let error: string | null = null
      if (maxFiles != null && filesRef.current.size >= maxFiles) {
        error = `Υπέρβαση ορίου αρχείων (μέγιστο ${maxFiles}).`
      } else if (!matchesAccept(file, accept)) {
        error = 'Μη αποδεκτός τύπος αρχείου.'
      } else if (maxSizeMB != null && file.size > maxSizeMB * 1024 * 1024) {
        error = `Το αρχείο ξεπερνά το όριο μεγέθους (${maxSizeMB} MB).`
      }
      if (!error) {
        filesRef.current.set(id, file)
        toQueue.push(id)
      }
      newItems.push({
        id,
        name: relativePathOf(file) || file.name,
        size: file.size,
        status: error ? 'error' : 'queued',
        progress: 0,
        error,
        rejected: error != null,
        result: null,
      })
    }

    setItems(prev => [...prev, ...newItems])
    pendingRef.current.push(...toQueue)
    pump()
  }

  function removeItem(id: string) {
    controllersRef.current.get(id)?.abort()
    controllersRef.current.delete(id)
    filesRef.current.delete(id)
    deliveredRef.current.delete(id)
    pendingRef.current = pendingRef.current.filter(p => p !== id)
    setItems(prev => prev.filter(it => it.id !== id))
  }

  function retryItem(id: string) {
    if (!filesRef.current.has(id)) return
    notifiedRef.current = false
    updateItem(id, { status: 'queued', progress: 0, error: null })
    pendingRef.current.push(id)
    pump()
  }

  function openPicker() {
    if (disabled) return
    inputRef.current?.click()
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return
    if (allowFolders && e.dataTransfer.items?.length) {
      // Οι entries πρέπει να ληφθούν ΣΥΓΧΡΟΝΑ μέσα στο event· η διάσχιση των φακέλων γίνεται μετά.
      const entries = Array.from(e.dataTransfer.items)
        .map(i => i.webkitGetAsEntry())
        .filter((x): x is FileSystemEntry => !!x)
      if (entries.some(en => en.isDirectory)) {
        setScanning(true)
        const out: File[] = []
        void Promise.all(entries.map(en => walkEntry(en, out)))
          .then(() => addFiles(out))
          .finally(() => setScanning(false))
        return
      }
    }
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  function retryAllErrors() {
    items.filter(i => i.status === 'error' && !i.rejected).forEach(i => retryItem(i.id))
  }

  const total = items.length
  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const inProgress = items.some(i => i.status === 'queued' || i.status === 'uploading')
  const valid = items.filter(i => !i.rejected)
  const totalBytes = valid.reduce((a, i) => a + i.size, 0)
  const doneBytes = valid.reduce((a, i) => a + (i.status === 'done' ? i.size : i.status === 'uploading' ? (i.size * i.progress) / 100 : 0), 0)
  const overallProgress = useMemo(() => {
    if (total === 0) return 0
    if (totalBytes > 0) return Math.round((doneBytes / totalBytes) * 100)
    const sum = items.reduce((acc, it) => acc + (it.status === 'done' ? 100 : it.status === 'error' ? 0 : it.progress), 0)
    return Math.round(sum / total)
  }, [items, total, totalBytes, doneBytes])
  const uploadingNow = items.filter(i => i.status === 'uploading')
  const etaSec = speed > 0 ? (totalBytes - doneBytes) / speed : 0

  // Ταχύτητα: δείγμα ανά δευτερόλεπτο όσο ανεβαίνουν αρχεία (κινητός μέσος όρος).
  const bytesRef = useRef(0)
  useEffect(() => { bytesRef.current = doneBytes })
  useEffect(() => {
    if (!inProgress) return
    let last = bytesRef.current
    const t = setInterval(() => {
      const now = bytesRef.current
      const delta = Math.max(0, now - last)
      last = now
      setSpeed(s => (s === 0 ? delta : s * 0.7 + delta * 0.3))
    }, 1000)
    return () => clearInterval(t)
  }, [inProgress])

  // Latest-ref pattern ώστε ο paste listener να μη χρειάζεται re-subscribe σε κάθε render.
  const addFilesRef = useRef(addFiles)
  useEffect(() => {
    addFilesRef.current = addFiles
  })

  // Paste: αρχεία από το clipboard.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (disabled) return
      const files = e.clipboardData?.files
      if (files && files.length > 0) addFilesRef.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [disabled])

  // Ενημέρωση καταναλωτή όταν ηρεμήσει η παρτίδα — μόνο νέα, μη-παραδομένα αποτελέσματα.
  useEffect(() => {
    if (total === 0 || inProgress || notifiedRef.current) return
    notifiedRef.current = true
    const newlyDone = items.filter(i => i.status === 'done' && i.result != null && !deliveredRef.current.has(i.id))
    if (newlyDone.length > 0) {
      newlyDone.forEach(i => deliveredRef.current.add(i.id))
      onUploaded?.(newlyDone.map(i => i.result as T))
    }
  }, [items, total, inProgress, onUploaded])

  // Ακύρωση όσων εκκρεμούν στο unmount.
  useEffect(() => {
    const controllers = controllersRef.current
    return () => { controllers.forEach(c => c.abort()) }
  }, [])

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Ζώνη μεταφόρτωσης αρχείων — σύρε αρχεία εδώ ή πάτησε για επιλογή"
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={e => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() }
        }}
        onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          disabled
            ? 'cursor-not-allowed border-border bg-muted/20 opacity-60'
            : isDragOver
              ? 'cursor-pointer border-(--brass) bg-(--brass)/5'
              : 'cursor-pointer border-border bg-muted/30 hover:bg-muted/50',
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-sm font-medium">{allowFolders ? 'Σύρε αρχεία ή ολόκληρους φακέλους εδώ' : 'Σύρε αρχεία εδώ ή πάτησε για επιλογή'}</p>
        {scanning && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Διαβάζω τους φακέλους…</p>}
        <p className="text-xs text-muted-foreground">
          {helperText ?? 'Μπορείς επίσης να επικολλήσεις (paste) αρχεία.'}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="min-h-11"
          onClick={e => { e.stopPropagation(); openPicker() }}
        >
          Επιλογή αρχείων
        </Button>
        {allowFolders && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="min-h-11"
            onClick={e => { e.stopPropagation(); folderInputRef.current?.click() }}
          >
            <FolderUp className="size-4" aria-hidden /> Επιλογή φακέλου
          </Button>
        )}
        </div>
        {allowFolders && (
          <input
            ref={folderInputRef}
            type="file"
            multiple
            disabled={disabled}
            className="hidden"
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          disabled={disabled}
          className="hidden"
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border bg-card p-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {inProgress
                ? <Loader2 className="size-4 animate-spin text-(--info)" aria-hidden />
                : errorCount > 0
                  ? <AlertTriangle className="size-4 text-(--destructive)" aria-hidden />
                  : <CheckCircle2 className="size-4 text-(--success)" aria-hidden />}
              <span className="text-sm font-semibold">
                {inProgress
                  ? `Ανεβαίνουν ${Math.min(total, doneCount + uploadingNow.length)} από ${total - items.filter(i => i.rejected).length} αρχεία`
                  : errorCount > 0
                    ? `Ολοκληρώθηκαν ${doneCount} — ${errorCount} με σφάλμα`
                    : `Ολοκληρώθηκαν ${doneCount} ${doneCount === 1 ? 'αρχείο' : 'αρχεία'}`}
              </span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {formatBytes(doneBytes)} / {formatBytes(totalBytes)}
                {inProgress && speed > 0 ? ` · ${formatBytes(speed)}/s` : ''}
                {inProgress && etaSec > 0 ? ` · ${formatDuration(etaSec)}` : ''}
              </span>
            </div>
            <Progress value={overallProgress} className="mt-2 h-2" />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">
                {uploadingNow.length > 0 ? `Τώρα: ${uploadingNow[0].name} (${Math.round(uploadingNow[0].progress)}%)${uploadingNow.length > 1 ? ` +${uploadingNow.length - 1}` : ''}` : `${overallProgress}%`}
              </span>
              {errorCount > 1 && !inProgress && (
                <button type="button" onClick={retryAllErrors} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 font-semibold text-(--info) hover:bg-muted">
                  <RotateCcw className="size-3.5" aria-hidden /> Επανάληψη όλων
                </button>
              )}
            </div>
          </div>

          <ul className="flex max-h-[420px] flex-col divide-y divide-border overflow-y-auto rounded-lg border bg-card">
            {(showAll || items.length <= 8
              ? items
              : [...items.filter(i => i.status !== 'done'), ...items.filter(i => i.status === 'done').slice(-3)].slice(0, 12)
            ).map(item => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatBytes(item.size)}</span>
                    {item.status === 'error' && item.error && (
                      <span className="truncate text-(--destructive)">{item.error}</span>
                    )}
                  </div>
                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-2">
                      <Progress value={item.progress} className="h-1 flex-1" />
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round(item.progress)}%</span>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {item.status === 'error' && !item.rejected && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Επανάληψη"
                      className="min-h-11 min-w-11"
                      onClick={() => retryItem(item.id)}
                    >
                      <RotateCcw className="size-4" strokeWidth={1.75} />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Αφαίρεση"
                    className="min-h-11 min-w-11"
                    onClick={() => removeItem(item.id)}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {items.length > 8 && (
            <button type="button" onClick={() => setShowAll(v => !v)} className="self-start text-xs font-semibold text-(--info) hover:underline">
              {showAll ? 'Λιγότερα' : `Εμφάνιση όλων (${items.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: DropzoneStatus }) {
  switch (status) {
    case 'uploading':
      return (
        <Badge variant="outline" className="gap-1 text-(--info)">
          <Loader2 className="size-3 animate-spin" strokeWidth={2} />
          Μεταφόρτωση
        </Badge>
      )
    case 'done':
      return (
        <Badge variant="outline" className="gap-1 text-(--success)">
          <CheckCircle2 className="size-3" strokeWidth={2} />
          Ολοκληρώθηκε
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="outline" className="gap-1 text-(--destructive)">
          <AlertTriangle className="size-3" strokeWidth={2} />
          Σφάλμα
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          Σε αναμονή
        </Badge>
      )
  }
}
