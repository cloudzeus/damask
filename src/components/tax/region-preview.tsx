'use client'

import * as React from 'react'
import { LuChevronLeft, LuChevronRight, LuZoomIn, LuZoomOut, LuImageOff } from 'react-icons/lu'
import type { Bbox } from '@/lib/tax/template'
import type { RasterizedPage } from '@/lib/ocr/rasterize'
import { cn } from '@/lib/utils'

/**
 * Read-only προβολή δείγματος/εντύπου με τα marks των περιοχών να ΠΑΡΑΜΕΝΟΥΝ
 * πάνω στην εικόνα/PDF (χωρίς drag-to-draw — distilled από το RegionEditor).
 * Χρησιμοποιείται στο αποτέλεσμα σάρωσης & στην καρτέλα πελάτη ώστε να φαίνεται
 * ΠΟΥ βρέθηκε κάθε τιμή. Κάθε region προαιρετικά φέρει την εξαγόμενη τιμή.
 */

const ZOOM_MIN = 1
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.25
const BASE_WIDTH_PX = 720

export type PreviewRegion = { page: number; bbox: Bbox; label: string; value?: string | null }

export function RegionPreview({
  pages, regions, selectedKey, onSelect,
}: {
  pages: RasterizedPage[]
  regions: PreviewRegion[]
  /** index (σε string) του highlighted region — coral· αλλιώς όλα navy. */
  selectedKey?: string | null
  onSelect?: (key: string) => void
}) {
  const [page, setPage] = React.useState(0)
  const [zoom, setZoom] = React.useState(1)

  const pageCount = pages.length
  const currentPageIndex = pageCount > 0 ? Math.min(page, pageCount - 1) : 0
  const currentPage = pageCount > 0 ? pages[currentPageIndex] : null

  const overlays = React.useMemo(
    () => regions.map((r, i) => ({ r, key: String(i) })).filter(({ r }) => r.page === currentPageIndex),
    [regions, currentPageIndex],
  )

  if (pageCount === 0 || !currentPage) {
    return (
      <div className="glass flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-[22px] p-8 text-center">
        <LuImageOff className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-[0.8125rem] font-medium text-foreground">Δεν υπάρχει διαθέσιμο δείγμα για προεπισκόπηση.</p>
      </div>
    )
  }

  return (
    <div className="glass overflow-hidden rounded-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button type="button" disabled={currentPageIndex <= 0} onClick={() => setPage(p => Math.max(0, p - 1))} aria-label="Προηγούμενη σελίδα" className="icon-pill size-8 disabled:opacity-30">
            <LuChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="min-w-[104px] text-center text-[0.75rem] font-medium tabular-nums text-foreground">Σελίδα {currentPageIndex + 1} / {pageCount}</span>
          <button type="button" disabled={currentPageIndex >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} aria-label="Επόμενη σελίδα" className="icon-pill size-8 disabled:opacity-30">
            <LuChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))} aria-label="Σμίκρυνση" className="icon-pill size-8 disabled:opacity-30">
            <LuZoomOut className="size-4" aria-hidden />
          </button>
          <span className="w-11 text-center text-[0.6875rem] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button type="button" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))} aria-label="Μεγέθυνση" className="icon-pill size-8 disabled:opacity-30">
            <LuZoomIn className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="max-h-[560px] min-h-[300px] overflow-auto p-4" style={{ background: 'var(--muted)' }}>
        <div className="mx-auto" style={{ width: `${BASE_WIDTH_PX * zoom}px`, maxWidth: '100%' }}>
          <div className="relative w-full select-none rounded-md bg-white shadow-sm ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:${currentPage.mimeType};base64,${currentPage.base64}`} alt={`Σελίδα ${currentPageIndex + 1}`} className="block w-full select-none" draggable={false} />

            {overlays.map(({ r, key }) => {
              const isActive = key === selectedKey
              return (
                <button
                  key={key}
                  type="button"
                  title={r.value != null ? `${r.label}: ${r.value}` : r.label}
                  onClick={() => onSelect?.(key)}
                  className={cn(
                    'absolute cursor-pointer border-2 transition-colors',
                    isActive ? 'border-coral bg-[color:var(--coral-soft)]' : 'border-navy bg-[color:rgb(22_50_63/8%)] hover:bg-[color:rgb(22_50_63/16%)]',
                  )}
                  style={{ left: `${r.bbox[0] * 100}%`, top: `${r.bbox[1] * 100}%`, width: `${r.bbox[2] * 100}%`, height: `${r.bbox[3] * 100}%` }}
                >
                  <span className={cn(
                    'absolute -top-[1.15rem] left-0 max-w-[220px] truncate rounded px-1 text-[0.625rem] font-semibold text-white',
                    isActive ? 'bg-coral' : 'bg-navy',
                  )}>
                    {r.label}{r.value != null && r.value !== '' ? `: ${r.value}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
