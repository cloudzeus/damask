'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  UploadCloud, X, RotateCcw, Loader2, CheckCircle2, AlertTriangle,
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
}: FileDropzoneProps<T>) {
  const [items, setItems] = useState<DropzoneItem<T>[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
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
        pct => updateItem(id, { progress: Math.max(0, Math.min(100, Math.round(pct))) }),
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
    const incoming = Array.from(fileList)
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
        name: file.name,
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
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  const total = items.length
  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const inProgress = items.some(i => i.status === 'queued' || i.status === 'uploading')
  const overallProgress = useMemo(() => {
    if (total === 0) return 0
    const sum = items.reduce((acc, it) => acc + (it.status === 'done' ? 100 : it.status === 'error' ? 0 : it.progress), 0)
    return Math.round(sum / total)
  }, [items, total])

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
        <p className="text-sm font-medium">Σύρε αρχεία εδώ ή πάτησε για επιλογή</p>
        <p className="text-xs text-muted-foreground">
          {helperText ?? 'Μπορείς επίσης να επικολλήσεις (paste) αρχεία.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="mt-1 min-h-11"
          onClick={e => { e.stopPropagation(); openPicker() }}
        >
          Επιλογή αρχείων
        </Button>
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
          <div className="flex items-center gap-3">
            <Progress value={overallProgress} className="flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {doneCount}/{total} ολοκληρώθηκαν{errorCount > 0 ? ` · ${errorCount} σφάλματα` : ''}
            </span>
          </div>

          <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
            {items.map(item => (
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
                    <Progress value={item.progress} className="h-1" />
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
