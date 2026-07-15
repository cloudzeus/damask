'use client'

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
}: {
  assets: MediaAssetDTO[]
  folders: MediaFolderDTO[]
  loading: boolean
  hasActiveFilter: boolean
  onClearFilters: () => void
  onUploadClick: () => void
  onChanged: () => void
}) {
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

  return (
    <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {assets.map(asset => (
        <AssetCard key={asset.id} asset={asset} folders={folders} onChanged={onChanged} />
      ))}
    </div>
  )
}
