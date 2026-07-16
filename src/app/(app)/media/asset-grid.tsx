'use client'

import { useRef, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { ImageOff, UploadCloud, X } from 'lucide-react'
import { AssetCard } from './asset-card'
import type { MediaAssetDTO, MediaFolderDTO } from '@/components/media/media-types'

export function AssetGrid({
  assets,
  folders,
  loading,
  hasActiveFilter,
  onClearFilters,
  onUploadClick,
  onChanged,
  thumbSize,
  selectionMode,
  selectedIds,
  onSelectedIdsChange,
  onOpenLightbox,
}: {
  assets: MediaAssetDTO[]
  folders: MediaFolderDTO[]
  loading: boolean
  hasActiveFilter: boolean
  onClearFilters: () => void
  onUploadClick: () => void
  onChanged: () => void
  /** Πλάτος μικρογραφίας (px) — γίνεται CSS var --thumb-size στο grid-template-columns. */
  thumbSize: number
  selectionMode: boolean
  selectedIds: Set<string>
  onSelectedIdsChange: Dispatch<SetStateAction<Set<string>>>
  onOpenLightbox: (index: number) => void
}) {
  // index του τελευταίου (ενεργού) toggle — για shift-click range select.
  const lastIndexRef = useRef<number | null>(null)

  function handleToggleSelect(assetId: string, shiftKey: boolean) {
    const index = assets.findIndex(a => a.id === assetId)
    if (index === -1) return

    if (shiftKey && lastIndexRef.current !== null) {
      const [start, end] = [lastIndexRef.current, index].sort((a, b) => a - b)
      const rangeIds = assets.slice(start, end + 1).map(a => a.id)
      onSelectedIdsChange(prev => {
        const next = new Set(prev)
        rangeIds.forEach(id => next.add(id))
        return next
      })
    } else {
      onSelectedIdsChange(prev => {
        const next = new Set(prev)
        if (next.has(assetId)) next.delete(assetId)
        else next.add(assetId)
        return next
      })
    }
    lastIndexRef.current = index
  }

  if (!loading && assets.length === 0) {
    return (
      <div className="glass flex flex-col items-center gap-3 px-6 py-16 text-center">
        {hasActiveFilter ? (
          <>
            <X className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-[13.5px] font-medium">Δεν βρέθηκαν αρχεία με αυτά τα κριτήρια.</p>
            <button type="button" className="btn-pill btn-glass" onClick={onClearFilters}>
              Καθαρισμός φίλτρων
            </button>
          </>
        ) : (
          <>
            <ImageOff className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-[13.5px] font-medium">Αυτός ο φάκελος είναι άδειος.</p>
            <button type="button" className="btn-pill btn-navy" onClick={onUploadClick}>
              <UploadCloud className="size-3.5" strokeWidth={1.8} aria-hidden /> Μεταφόρτωση αρχείων
            </button>
          </>
        )}
      </div>
    )
  }

  const gridStyle = {
    '--thumb-size': `${thumbSize}px`,
    gridTemplateColumns: 'repeat(auto-fill, minmax(var(--thumb-size), 1fr))',
  } as CSSProperties

  return (
    <div className="stagger grid gap-3" style={gridStyle}>
      {assets.map((asset, index) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          folders={folders}
          thumbSize={thumbSize}
          selectionMode={selectionMode}
          selected={selectedIds.has(asset.id)}
          onToggleSelect={handleToggleSelect}
          onOpenLightbox={() => onOpenLightbox(index)}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}
