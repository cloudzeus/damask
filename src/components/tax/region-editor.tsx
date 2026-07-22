'use client'

import * as React from 'react'
import { LuChevronLeft, LuChevronRight, LuZoomIn, LuZoomOut, LuImageOff } from 'react-icons/lu'
import type { TemplateField, Bbox } from '@/lib/tax/template'
import { regionKeyOf } from '@/lib/tax/template'
import type { RasterizedPage } from '@/lib/ocr/rasterize'
import { cn } from '@/lib/utils'

/**
 * Καμβάς χαρτογράφησης εντύπου — port του drag-to-select interaction από
 * `<scratchpad>/pb-ref/components/admin/tax-template-region-editor.tsx`
 * (μέσω του use-marquee hook εκεί), υλοποιημένο εδώ με plain Pointer Events
 * (χωρίς νέο dependency): pointerdown ξεκινάει το ορθογώνιο, pointermove το
 * ενημερώνει, pointerup το κανονικοποιεί σε 0-1 (διαιρώντας με το
 * clientWidth/clientHeight του rendered στοιχείου — άξονας x/y πάνω-αριστερά)
 * και καλεί `onDrawRegion`. Οι ήδη αποθηκευμένες περιοχές (fields με
 * regionHint) επικαλύπτονται πάνω στη σελίδα τους· κλικ πάνω σε μία επιλέγει
 * το πεδίο (νέα συμπεριφορά έναντι του reference, όπου η επιλογή γινόταν μόνο
 * από τη λίστα πεδίων).
 */

const ZOOM_MIN = 1
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.25
const BASE_WIDTH_PX = 720
/** Ελάχιστο μέγεθος drag (σε κλάσμα 0-1) ώστε ένα τυχαίο κλικ να μην παράγει μηδενική περιοχή. */
const MIN_DRAG = 0.006

type DragBox = { x: number; y: number; w: number; h: number }

interface RegionEditorProps {
  /** Rasterized σελίδες του δείγματος (client-only render output — src/lib/ocr/rasterize.ts). */
  pages: RasterizedPage[]
  /** Αποθηκευμένα πεδία — μόνο όσα έχουν regionHint επικαλύπτονται στον καμβά. */
  fields: TemplateField[]
  /** Κλειδί (id ή fieldKey — βλ. regionKeyOf) του πεδίου που δέχεται την επόμενη σχεδιαζόμενη περιοχή. */
  activeFieldLocalId: string | null
  onDrawRegion: (page: number, bbox: Bbox) => void
  /** Κλειδί περιοχής προς highlight (coral) — αν παραλειφθεί, χρησιμοποιείται το activeFieldLocalId. */
  selectedRegionKey?: string | null
  onSelectRegion?: (key: string) => void
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function RegionEditor({
  pages, fields, activeFieldLocalId, onDrawRegion, selectedRegionKey, onSelectRegion,
}: RegionEditorProps) {
  const [page, setPage] = React.useState(0)
  const [zoom, setZoom] = React.useState(1)
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const dragStart = React.useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = React.useState<DragBox | null>(null)
  const [dragging, setDragging] = React.useState(false)

  const pageCount = pages.length
  // Κλάμπαρε στη σελίδα ώστε αν το δείγμα αλλάξει (λιγότερες σελίδες) η
  // τρέχουσα επιλογή να παραμείνει έγκυρη — παράγωγη τιμή, όχι state, ώστε να
  // μη χρειάζεται effect+setState (cascading render).
  const currentPageIndex = pageCount > 0 ? Math.min(page, pageCount - 1) : 0
  const currentPage = pageCount > 0 ? pages[currentPageIndex] : null

  const activeKey = selectedRegionKey ?? activeFieldLocalId

  const overlays = React.useMemo(() => {
    return fields
      .map((field, index) => ({ field, key: regionKeyOf(field, index) }))
      .filter(({ field }) => field.regionHint && field.regionHint.page === currentPageIndex)
  }, [fields, currentPageIndex])

  function relPoint(e: React.PointerEvent): { x: number; y: number } {
    const el = surfaceRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    return { x, y }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!surfaceRef.current || !currentPage) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = relPoint(e)
    dragStart.current = p
    setDragging(true)
    setDrag({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStart.current) return
    const p = relPoint(e)
    const start = dragStart.current
    setDrag({
      x: Math.min(p.x, start.x),
      y: Math.min(p.y, start.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    })
  }

  function handlePointerUp() {
    setDragging(false)
    dragStart.current = null
    const box = drag
    setDrag(null)
    if (!box || box.w < MIN_DRAG || box.h < MIN_DRAG) return
    const bbox: Bbox = [round3(box.x), round3(box.y), round3(box.w), round3(box.h)]
    onDrawRegion(currentPageIndex, bbox)
  }

  function handlePointerCancel() {
    setDragging(false)
    dragStart.current = null
    setDrag(null)
  }

  function selectOverlay(e: React.SyntheticEvent, key: string) {
    e.stopPropagation()
    onSelectRegion?.(key)
  }

  if (pageCount === 0 || !currentPage) {
    return (
      <div className="glass flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-[22px] p-10 text-center">
        <LuImageOff className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-[13px] font-medium text-foreground">
          Ανέβασε δείγμα εντύπου για να ξεκινήσεις τη χαρτογράφηση.
        </p>
      </div>
    )
  }

  return (
    <div className="glass overflow-hidden rounded-[22px]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPageIndex <= 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            aria-label="Προηγούμενη σελίδα"
            className="icon-pill size-8 disabled:opacity-30"
          >
            <LuChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="min-w-[104px] text-center text-[12px] font-medium tabular-nums text-foreground">
            Σελίδα {currentPageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPageIndex >= pageCount - 1}
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            aria-label="Επόμενη σελίδα"
            className="icon-pill size-8 disabled:opacity-30"
          >
            <LuChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
            aria-label="Σμίκρυνση"
            className="icon-pill size-8 disabled:opacity-30"
          >
            <LuZoomOut className="size-4" aria-hidden />
          </button>
          <span className="w-11 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
            aria-label="Μεγέθυνση"
            className="icon-pill size-8 disabled:opacity-30"
          >
            <LuZoomIn className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Καμβάς */}
      <div className="max-h-[640px] min-h-[360px] overflow-auto p-4" style={{ background: 'var(--muted)' }}>
        <div className="mx-auto" style={{ width: `${BASE_WIDTH_PX * zoom}px`, maxWidth: '100%' }}>
          <div
            ref={surfaceRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className="relative w-full touch-none select-none rounded-md bg-white shadow-sm ring-1 ring-border"
            style={{ cursor: 'crosshair' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${currentPage.mimeType};base64,${currentPage.base64}`}
              alt={`Σελίδα ${currentPageIndex + 1}`}
              className="block w-full select-none"
              draggable={false}
            />

            {/* Ζωντανό ορθογώνιο κατά το drag */}
            {drag && (
              <div
                className="pointer-events-none absolute border-2 border-coral bg-[color:var(--coral-soft)]"
                style={{
                  left: `${drag.x * 100}%`,
                  top: `${drag.y * 100}%`,
                  width: `${drag.w * 100}%`,
                  height: `${drag.h * 100}%`,
                }}
              />
            )}

            {/* Αποθηκευμένες περιοχές αυτής της σελίδας */}
            {!dragging && overlays.map(({ field, key }) => {
              const bbox = field.regionHint!.bbox
              const isActive = key === activeKey
              return (
                <button
                  key={key}
                  type="button"
                  title={field.label || 'Χωρίς ετικέτα'}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => selectOverlay(e, key)}
                  className={cn(
                    'absolute cursor-pointer border-2 transition-colors',
                    isActive ? 'border-coral bg-[color:var(--coral-soft)]' : 'border-navy bg-[color:rgb(22_50_63/8%)] hover:bg-[color:rgb(22_50_63/14%)]',
                  )}
                  style={{
                    left: `${bbox[0] * 100}%`,
                    top: `${bbox[1] * 100}%`,
                    width: `${bbox[2] * 100}%`,
                    height: `${bbox[3] * 100}%`,
                  }}
                >
                  <span className="sr-only">Επιλογή περιοχής «{field.label || 'χωρίς ετικέτα'}»</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
