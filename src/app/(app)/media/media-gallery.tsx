'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Wand2 } from 'lucide-react'
import { FolderPanel } from './folder-panel'
import { AssetToolbar } from './asset-toolbar'
import { AssetGrid } from './asset-grid'
import { UploadDialog } from './upload-dialog'
import { BulkActionBar } from './bulk-action-bar'
import { MediaLightbox } from './media-lightbox'
import { MediaPicker } from '@/components/media/media-picker'
import { ProductImageCollection, type CollectionImage } from '@/components/media/product-image-collection'
import {
  THUMB_SIZE_MAX, THUMB_SIZE_MIN,
  type MediaAssetDTO, type MediaFolderDTO, type MediaKind, type MediaListResponse, type PickedAsset,
} from '@/components/media/media-types'

const SEARCH_DEBOUNCE_MS = 300
const THUMB_SIZE_DEFAULT = 160
const THUMB_SIZE_STORAGE_KEY = 'damask:media-thumb-size'

export function MediaGallery({
  initialFolders,
  initialAssets,
}: {
  initialFolders: MediaFolderDTO[]
  initialAssets: MediaAssetDTO[]
}) {
  const [folders, setFolders] = useState(initialFolders)
  const [assets, setAssets] = useState(initialAssets)
  const [loading, setLoading] = useState(false)

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<MediaKind | null>(null)
  const [queryInput, setQueryInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const [uploadOpen, setUploadOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedImages, setPickedImages] = useState<CollectionImage[]>([])

  const [thumbSize, setThumbSize] = useState(THUMB_SIZE_DEFAULT)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const isFirstRun = useRef(true)

  // Προτίμηση μεγέθους μικρογραφίας — φορτώνεται μία φορά από localStorage
  // στο mount (client-only), μετά αποθηκεύεται σε κάθε αλλαγή. Το localStorage
  // δεν είναι διαθέσιμο στο SSR pass, γι' αυτό ΔΕΝ μπαίνει στο useState lazy
  // initializer (θα προκαλούσε hydration mismatch) — παραμένει σε effect,
  // που είναι η επίσημα προτεινόμενη χρήση Effect για sync με εξωτερικό
  // σύστημα (browser storage) εκτός React.
  useEffect(() => {
    const saved = Number(localStorage.getItem(THUMB_SIZE_STORAGE_KEY))
    if (Number.isFinite(saved) && saved >= THUMB_SIZE_MIN && saved <= THUMB_SIZE_MAX) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThumbSize(saved)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(THUMB_SIZE_STORAGE_KEY, String(thumbSize))
  }, [thumbSize])

  const fetchList = useCallback(async (filters: { folderId: string | null; type: MediaKind | null; q: string }) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.folderId) params.set('folderId', filters.folderId)
      if (filters.type) params.set('type', filters.type)
      if (filters.q) params.set('q', filters.q)
      const res = await fetch(`/api/media/list?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: MediaListResponse = await res.json()
      setFolders(data.folders)
      setAssets(data.assets)
    } catch {
      toast.error('Η φόρτωση των αρχείων απέτυχε.')
    } finally {
      setLoading(false)
    }
  }, [])

  // debounce το πληκτρολόγημα αναζήτησης
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [queryInput])

  // refetch σε κάθε αλλαγή φίλτρου — παραλείπεται στο πρώτο render γιατί ο
  // server ήδη έδωσε τα αρχικά folders/assets που ταιριάζουν στα default φίλτρα.
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    fetchList({ folderId: selectedFolderId, type: typeFilter, q: debouncedQuery })
  }, [selectedFolderId, typeFilter, debouncedQuery, fetchList])

  function refresh() {
    fetchList({ folderId: selectedFolderId, type: typeFilter, q: debouncedQuery })
  }

  function clearFilters() {
    setTypeFilter(null)
    setQueryInput('')
    setDebouncedQuery('')
    setSelectedIds(new Set())
  }

  function toggleSelectionMode() {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  // Καθαρή επιλογή σε κάθε αλλαγή φακέλου/φίλτρου — δεν έχει νόημα να μείνει
  // "επιλεγμένο" ένα asset που δεν είναι πια ορατό στη λίστα. Καθαρίζεται
  // ΜΕΣΑ στους ίδιους τους handlers (όχι σε useEffect keyed στα φίλτρα) —
  // ίδιο idiom με τα υπόλοιπα reset-on-change σημεία της οθόνης.
  function handleSelectFolder(folderId: string | null) {
    setSelectedFolderId(folderId)
    setSelectedIds(new Set())
  }

  function handleTypeFilterChange(type: MediaKind | null) {
    setTypeFilter(type)
    setSelectedIds(new Set())
  }

  function handleQueryChange(q: string) {
    setQueryInput(q)
    setSelectedIds(new Set())
  }

  const selectedFolder = folders.find(f => f.id === selectedFolderId) ?? null
  const hasActiveFilter = typeFilter !== null || debouncedQuery !== ''

  function handlePicked(picked: PickedAsset[]) {
    setPickedImages(prev => {
      const existing = new Set(prev.map(img => img.id))
      const additions = picked.filter(p => !existing.has(p.id)).map(p => ({ id: p.id, url: p.url, alt: p.name }))
      return [...prev, ...additions]
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <button type="button" className="btn-pill btn-glass" onClick={() => setPickerOpen(true)}>
          <Wand2 className="size-3.5" strokeWidth={1.8} aria-hidden /> Δοκιμή Picker
        </button>
      </div>

      <div className="flex items-start gap-4">
        <FolderPanel
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelect={handleSelectFolder}
          onChanged={refresh}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <AssetToolbar
            query={queryInput}
            onQueryChange={handleQueryChange}
            typeFilter={typeFilter}
            onTypeFilterChange={handleTypeFilterChange}
            onUploadClick={() => setUploadOpen(true)}
            thumbSize={thumbSize}
            onThumbSizeChange={setThumbSize}
            selectionMode={selectionMode}
            onToggleSelectionMode={toggleSelectionMode}
          />

          <div className="mt-3">
            <AssetGrid
              assets={assets}
              folders={folders}
              loading={loading}
              hasActiveFilter={hasActiveFilter}
              onClearFilters={clearFilters}
              onUploadClick={() => setUploadOpen(true)}
              onChanged={refresh}
              thumbSize={thumbSize}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              onOpenLightbox={setLightboxIndex}
            />
          </div>
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        folderId={selectedFolderId}
        folderLabel={selectedFolder?.name ?? 'Όλα τα αρχεία'}
        onUploaded={refresh}
      />

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handlePicked}
        multiple
        accept={['IMAGE']}
      />

      <MediaLightbox
        assets={assets}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChanged={refresh}
      />

      <BulkActionBar
        selectedIds={Array.from(selectedIds)}
        onClear={() => setSelectedIds(new Set())}
        onDeleted={() => { setSelectedIds(new Set()); refresh() }}
      />

      {pickedImages.length > 0 && (
        <div className="glass p-4">
          <h2 className="mb-3 text-[14px] font-semibold">Επιλεγμένα από το MediaPicker ({pickedImages.length})</h2>
          <ProductImageCollection images={pickedImages} onReorder={setPickedImages} size={56} />
        </div>
      )}
    </div>
  )
}
