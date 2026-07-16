'use client'

import { useEffect, useRef, useState, useTransition, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  X, ChevronLeft, ChevronRight, Download, Copy, Trash2, ExternalLink, Box, File as FileIcon,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { formatMediaBytes, MEDIA_KIND_LABEL, type MediaAssetDTO } from '@/components/media/media-types'
import { deleteAsset } from './actions'

/**
 * Full-resolution viewer (§2 requirement) — μαύρο 85% backdrop, glass header,
 * πλοήγηση ←/→ στα assets του τρέχοντος (φιλτραρισμένου) grid. Το CDN URL
 * (asset.url) είναι πάντα καθαρό χωρίς width params (βλ. api/media/upload) —
 * άρα εδώ δείχνουμε πάντα την πλήρη ανάλυση, σε αντίθεση με τα thumbnails
 * του grid που περνάνε από mediaThumbUrl().
 */
export function MediaLightbox({
  assets,
  index,
  onIndexChange,
  onClose,
  onChanged,
}: {
  assets: MediaAssetDTO[]
  /** null = κλειστό. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
  onChanged: () => void
}) {
  const open = index !== null && index >= 0 && index < assets.length
  const asset = open && index !== null ? assets[index] : null

  const [fit, setFit] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset προβολή ζουμ σε κάθε αλλαγή αρχείου — "adjusting state during
  // render" (React docs) αντί για useEffect: συγκρίνουμε το τρέχον asset.id
  // με το προηγούμενο ΚΑΤΑ το render και προσαρμόζουμε άμεσα, χωρίς
  // ενδιάμεσο ξεχωριστό render/commit κύκλο.
  const [lastAssetId, setLastAssetId] = useState(asset?.id)
  if (asset?.id !== lastAssetId) {
    setLastAssetId(asset?.id)
    setFit(true)
    setZoom(1)
  }

  // scroll lock πίσω από το lightbox + αρχικό focus (για τα πλήκτρα)
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    containerRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  function goTo(delta: number) {
    if (index === null || assets.length === 0) return
    const next = (index + delta + assets.length) % assets.length
    onIndexChange(next)
  }

  // ESC/←/→ — απενεργοποιείται όσο είναι ανοιχτό το AlertDialog διαγραφής,
  // ώστε το πάτημα Enter/βελών εκεί να μην αλλάζει ταυτόχρονα αρχείο.
  useEffect(() => {
    if (!open || deleteOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goTo(-1)
      else if (e.key === 'ArrowRight') goTo(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deleteOpen, index, assets.length])

  function handleCopyUrl() {
    if (!asset) return
    navigator.clipboard.writeText(asset.url)
      .then(() => toast.success('Ο σύνδεσμος αντιγράφηκε.'))
      .catch(() => toast.error('Αποτυχία αντιγραφής.'))
  }

  function handleDelete() {
    if (!asset) return
    startTransition(async () => {
      const res = await deleteAsset(asset.id)
      if (res.ok) {
        toast.success(res.message)
        setDeleteOpen(false)
        onChanged()
        if (assets.length <= 1) onClose()
        else goTo(1)
      } else {
        toast.error(res.message)
      }
    })
  }

  if (!open || !asset || typeof document === 'undefined') return null

  const isPdf = asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf')

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Προβολή «${asset.name}»`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col outline-none"
      style={{ background: 'rgb(0 0 0 / 85%)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="lightbox-header flex shrink-0 items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold" title={asset.name}>{asset.name}</p>
          <p className="truncate text-[12px] opacity-70">
            {MEDIA_KIND_LABEL[asset.type]} · {formatMediaBytes(asset.size)}
            {asset.mimeType ? ` · ${asset.mimeType}` : ''}
          </p>
        </div>
        <a href={asset.url} download={asset.name} className="lightbox-icon-btn" aria-label="Λήψη" title="Λήψη">
          <Download className="size-4" strokeWidth={1.8} />
        </a>
        <button type="button" className="lightbox-icon-btn" onClick={handleCopyUrl} aria-label="Αντιγραφή URL" title="Αντιγραφή URL">
          <Copy className="size-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="lightbox-icon-btn danger"
          onClick={() => setDeleteOpen(true)}
          aria-label="Διαγραφή"
          title="Διαγραφή"
        >
          <Trash2 className="size-4" strokeWidth={1.8} />
        </button>
        <button type="button" className="lightbox-icon-btn" onClick={onClose} aria-label="Κλείσιμο" title="Κλείσιμο (Esc)">
          <X className="size-4" strokeWidth={1.8} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {assets.length > 1 && (
          <>
            <button
              type="button"
              className="lightbox-icon-btn absolute top-1/2 left-3 z-10 -translate-y-1/2"
              onClick={() => goTo(-1)}
              aria-label="Προηγούμενο αρχείο"
            >
              <ChevronLeft className="size-5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="lightbox-icon-btn absolute top-1/2 right-3 z-10 -translate-y-1/2"
              onClick={() => goTo(1)}
              aria-label="Επόμενο αρχείο"
            >
              <ChevronRight className="size-5" strokeWidth={1.8} />
            </button>
          </>
        )}

        <LightboxBody
          asset={asset}
          fit={fit}
          zoom={zoom}
          onToggleFit={() => { setFit(f => !f); setZoom(1) }}
          onZoomChange={setZoom}
          isPdf={isPdf}
        />
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{asset.name}»;</AlertDialogTitle>
            <AlertDialogDescription>Το αρχείο διαγράφεται και από το BunnyCDN. Η ενέργεια δεν αναιρείται.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body,
  )
}

function LightboxBody({
  asset,
  fit,
  zoom,
  onToggleFit,
  onZoomChange,
  isPdf,
}: {
  asset: MediaAssetDTO
  fit: boolean
  zoom: number
  onToggleFit: () => void
  onZoomChange: (zoom: number) => void
  isPdf: boolean
}) {
  function handleWheel(e: WheelEvent) {
    if (asset.type !== 'IMAGE') return
    e.preventDefault()
    const next = Math.min(4, Math.max(1, zoom - e.deltaY * 0.0015))
    onZoomChange(next)
  }

  if (asset.type === 'IMAGE') {
    return (
      <div className="flex size-full items-center justify-center overflow-auto p-4" onWheel={handleWheel}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.alt ?? asset.name}
          onClick={onToggleFit}
          className={fit ? 'max-h-full max-w-full object-contain' : 'max-w-none'}
          style={{
            cursor: fit ? 'zoom-in' : 'zoom-out',
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            transformOrigin: 'center',
          }}
        />
      </div>
    )
  }

  if (asset.type === 'VIDEO') {
    return (
      <div className="flex size-full items-center justify-center p-4">
        <video src={asset.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
      </div>
    )
  }

  // FILE / MODEL_3D — κουμπί «Άνοιγμα αρχείου» πάντα, iframe preview μόνο για pdf
  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-4">
      {isPdf ? (
        <iframe src={asset.url} title={asset.name} className="h-full w-full max-w-4xl rounded-lg bg-white" />
      ) : (
        <div className="flex flex-col items-center gap-3 text-center" style={{ color: '#F2F6F6' }}>
          {asset.type === 'MODEL_3D'
            ? <Box className="size-14 opacity-70" strokeWidth={1.3} />
            : <FileIcon className="size-14 opacity-70" strokeWidth={1.3} />}
          <p className="text-[13px] opacity-70">Δεν υπάρχει προεπισκόπηση για αυτόν τον τύπο αρχείου.</p>
        </div>
      )}
      <a href={asset.url} target="_blank" rel="noopener noreferrer" className="btn-pill btn-navy shrink-0">
        <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden /> Άνοιγμα αρχείου
      </a>
    </div>
  )
}
