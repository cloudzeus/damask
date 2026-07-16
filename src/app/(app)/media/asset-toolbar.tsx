'use client'

import { CheckSquare, Search, UploadCloud, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MEDIA_KIND_LABEL, THUMB_SIZE_MAX, THUMB_SIZE_MIN, type MediaKind } from '@/components/media/media-types'

const TYPE_CHIPS: MediaKind[] = ['IMAGE', 'VIDEO', 'MODEL_3D', 'FILE']

export function AssetToolbar({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  onUploadClick,
  thumbSize,
  onThumbSizeChange,
  selectionMode,
  onToggleSelectionMode,
}: {
  query: string
  onQueryChange: (q: string) => void
  typeFilter: MediaKind | null
  onTypeFilterChange: (type: MediaKind | null) => void
  onUploadClick: () => void
  thumbSize: number
  onThumbSizeChange: (size: number) => void
  selectionMode: boolean
  onToggleSelectionMode: () => void
}) {
  return (
    <div className="table-toolbar">
      <label className="search">
        <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Αναζήτηση αρχείων…"
          aria-label="Αναζήτηση αρχείων"
        />
      </label>

      <button
        type="button"
        className={cn('pill', typeFilter === null && 'on')}
        onClick={() => onTypeFilterChange(null)}
      >
        Όλα
      </button>
      {TYPE_CHIPS.map(kind => (
        <button
          key={kind}
          type="button"
          className={cn('pill', typeFilter === kind && 'on')}
          onClick={() => onTypeFilterChange(typeFilter === kind ? null : kind)}
        >
          {MEDIA_KIND_LABEL[kind]}
        </button>
      ))}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 px-1" title="Μέγεθος μικρογραφιών">
        <ZoomOut className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        <input
          type="range"
          min={THUMB_SIZE_MIN}
          max={THUMB_SIZE_MAX}
          step={10}
          value={thumbSize}
          onChange={e => onThumbSizeChange(Number(e.target.value))}
          className="thumb-size-slider"
          aria-label="Μέγεθος μικρογραφιών"
        />
        <ZoomIn className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      </div>

      <button
        type="button"
        className={cn('pill', selectionMode && 'on')}
        onClick={onToggleSelectionMode}
        aria-pressed={selectionMode}
      >
        <CheckSquare className="size-3.5" strokeWidth={1.8} aria-hidden /> Επιλογή
      </button>

      <button type="button" className="btn-pill btn-navy" onClick={onUploadClick}>
        <UploadCloud className="size-3.5" strokeWidth={1.8} aria-hidden /> Μεταφόρτωση
      </button>
    </div>
  )
}
