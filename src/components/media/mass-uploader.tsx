'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import {
  UploadCloud, Image as ImageIcon, Video, Box, File as FileIcon,
  CheckCircle2, AlertTriangle, RotateCcw, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { isConvertibleImage, processImageToWebp } from '@/lib/image-processing'

export type UploadedAsset = {
  url: string
  path: string
  name: string
  type: 'IMAGE' | 'VIDEO' | 'MODEL_3D' | 'FILE'
  size: number
}

export type MassUploaderProps = {
  /** π.χ. 'products/demo' */
  pathPrefix: string
  onUploaded?: (assets: UploadedAsset[]) => void
  /** default: εικόνες + video + .glb/.gltf */
  accept?: string
  /** default 3 */
  maxConcurrent?: number
}

type UploadStatus = 'queued' | 'converting' | 'uploading' | 'done' | 'error'

type QueueItem = {
  id: string
  name: string
  mimeType: string
  previewUrl: string | null
  status: UploadStatus
  progress: number
  error: string | null
  originalSize: number
  convertedSize: number | null
  asset: UploadedAsset | null
}

const DEFAULT_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime,.glb,.gltf'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function detectAssetType(name: string, mimeType: string): UploadedAsset['type'] {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  const lower = name.toLowerCase()
  if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return 'MODEL_3D'
  return 'FILE'
}

function greekUploadError(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  if (status === 401 || status === 403) return 'Δεν έχεις δικαίωμα μεταφόρτωσης.'
  if (status === 502) return 'Το BunnyCDN δεν αποκρίθηκε σωστά.'
  return 'Η μεταφόρτωση απέτυχε.'
}

export function MassUploader({ pathPrefix, onUploaded, accept = DEFAULT_ACCEPT, maxConcurrent = 3 }: MassUploaderProps) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<Map<string, File>>(new Map())
  const activeCountRef = useRef(0)
  const pendingQueueRef = useRef<string[]>([])
  const notifiedRef = useRef(true)

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }

  function pump() {
    while (activeCountRef.current < maxConcurrent && pendingQueueRef.current.length > 0) {
      const id = pendingQueueRef.current.shift()!
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
    try {
      let uploadBlob: Blob = file
      let uploadName = file.name
      let uploadType = file.type

      if (isConvertibleImage(file)) {
        updateItem(id, { status: 'converting' })
        const webp = await processImageToWebp(file)
        uploadBlob = webp
        uploadName = `${file.name.replace(/\.[a-z0-9]+$/i, '')}.webp`
        uploadType = 'image/webp'
        setItems(prev => prev.map(it => {
          if (it.id !== id) return it
          if (it.previewUrl) URL.revokeObjectURL(it.previewUrl)
          return { ...it, convertedSize: webp.size, previewUrl: URL.createObjectURL(webp) }
        }))
      }

      updateItem(id, { status: 'uploading', progress: 0, error: null })

      const asset = await uploadWithProgress({
        blob: uploadBlob,
        name: uploadName,
        mimeType: uploadType,
        pathPrefix,
        originalName: file.name,
        onProgress: pct => updateItem(id, { progress: pct }),
      })

      updateItem(id, { status: 'done', progress: 100, asset })
    } catch (err) {
      updateItem(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Η μεταφόρτωση απέτυχε.',
      })
    }
  }

  function uploadWithProgress(opts: {
    blob: Blob
    name: string
    mimeType: string
    pathPrefix: string
    originalName: string
    onProgress: (pct: number) => void
  }): Promise<UploadedAsset> {
    return new Promise((resolve, reject) => {
      const uploadFile = new File([opts.blob], opts.name, { type: opts.mimeType })
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('path', opts.pathPrefix)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/media/upload')
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) opts.onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        let body: unknown = null
        try { body = JSON.parse(xhr.responseText) } catch { /* μη-JSON απάντηση */ }
        if (xhr.status >= 200 && xhr.status < 300 && body && typeof body === 'object' && 'url' in body) {
          const b = body as { url: string; path: string; size: number }
          resolve({
            url: b.url,
            path: b.path,
            name: opts.originalName,
            type: detectAssetType(opts.originalName, opts.mimeType),
            size: b.size,
          })
        } else {
          reject(new Error(greekUploadError(xhr.status, body)))
        }
      }
      xhr.onerror = () => reject(new Error('Αποτυχία σύνδεσης κατά τη μεταφόρτωση.'))
      xhr.send(formData)
    })
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    notifiedRef.current = false
    const newItems: QueueItem[] = files.map(file => {
      const id = crypto.randomUUID()
      filesRef.current.set(id, file)
      return {
        id,
        name: file.name,
        mimeType: file.type,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        status: 'queued',
        progress: 0,
        error: null,
        originalSize: file.size,
        convertedSize: null,
        asset: null,
      }
    })
    setItems(prev => [...prev, ...newItems])
    pendingQueueRef.current.push(...newItems.map(it => it.id))
    pump()
  }

  function retry(id: string) {
    notifiedRef.current = false
    updateItem(id, { status: 'queued', progress: 0, error: null })
    pendingQueueRef.current.push(id)
    pump()
  }

  const total = items.length
  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const inProgress = items.some(i => i.status === 'queued' || i.status === 'converting' || i.status === 'uploading')
  const overallProgress = useMemo(() => {
    if (total === 0) return 0
    const sum = items.reduce((acc, it) => acc + (it.status === 'done' ? 100 : it.status === 'error' ? 0 : it.progress), 0)
    return Math.round(sum / total)
  }, [items, total])

  useEffect(() => {
    if (total === 0 || inProgress || notifiedRef.current) return
    notifiedRef.current = true
    if (doneCount > 0) {
      toast.success(`Μεταφορτώθηκαν ${doneCount} αρχεία ✓`)
      onUploaded?.(items.filter(i => i.status === 'done').map(i => i.asset!))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgress, total, doneCount])

  useEffect(() => () => {
    items.forEach(it => { if (it.previewUrl) URL.revokeObjectURL(it.previewUrl) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragOver ? 'border-(--brass) bg-(--brass)/5' : 'border-border bg-muted/30 hover:bg-muted/50',
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-[14px] font-medium">Σύρε αρχεία εδώ ή πάτησε για επιλογή</p>
        <p className="text-[12.5px] text-muted-foreground">Οι εικόνες μετατρέπονται αυτόματα σε WebP 1920×1920</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
        >
          Επιλογή αρχείων
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Progress value={overallProgress} className="flex-1" />
            <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
              {doneCount}/{total} ολοκληρώθηκαν{errorCount > 0 ? ` · ${errorCount} σφάλματα` : ''}
            </span>
          </div>

          <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
            {items.map(item => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="size-full object-cover" />
                  ) : item.mimeType.startsWith('video/') ? (
                    <Video className="size-5 text-muted-foreground" strokeWidth={1.75} />
                  ) : item.name.toLowerCase().endsWith('.glb') || item.name.toLowerCase().endsWith('.gltf') ? (
                    <Box className="size-5 text-muted-foreground" strokeWidth={1.75} />
                  ) : (
                    <FileIcon className="size-5 text-muted-foreground" strokeWidth={1.75} />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{item.name}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                    <span>
                      {formatBytes(item.originalSize)}
                      {item.convertedSize != null && <> → {formatBytes(item.convertedSize)}</>}
                    </span>
                    {item.status === 'error' && item.error && (
                      <span className="text-(--destructive)">{item.error}</span>
                    )}
                  </div>
                  {(item.status === 'uploading' || item.status === 'converting') && (
                    <Progress value={item.status === 'converting' ? null : item.progress} className="h-1" />
                  )}
                </div>

                {item.status === 'error' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => retry(item.id)}>
                    <RotateCcw className="size-3.5" strokeWidth={1.75} />
                    Δοκίμασε ξανά
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: UploadStatus }) {
  switch (status) {
    case 'converting':
      return (
        <Badge variant="outline" className="gap-1 text-(--info)">
          <Loader2 className="size-3 animate-spin" strokeWidth={2} />
          Μετατροπή
        </Badge>
      )
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
