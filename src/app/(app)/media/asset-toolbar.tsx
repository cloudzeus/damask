'use client'

import { Search, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MEDIA_KIND_LABEL, type MediaKind } from '@/components/media/media-types'

const TYPE_CHIPS: MediaKind[] = ['IMAGE', 'VIDEO', 'MODEL_3D', 'FILE']

export function AssetToolbar({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  onUploadClick,
}: {
  query: string
  onQueryChange: (q: string) => void
  typeFilter: MediaKind | null
  onTypeFilterChange: (type: MediaKind | null) => void
  onUploadClick: () => void
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

      <button type="button" className="btn-pill btn-navy" onClick={onUploadClick}>
        <UploadCloud className="size-3.5" strokeWidth={1.8} aria-hidden /> Μεταφόρτωση
      </button>
    </div>
  )
}
