'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Images, Folder, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { MassUploader, type UploadedAsset } from './mass-uploader'
import {
  buildFolderTree, MEDIA_KIND_LABEL,
  type MediaAssetDTO, type MediaFolderDTO, type MediaFolderNode,
  type MediaKind, type MediaListResponse, type PickedAsset,
} from './media-types'

const SEARCH_DEBOUNCE_MS = 300

export type MediaPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (assets: PickedAsset[]) => void
  /** default false — μονή επιλογή */
  multiple?: boolean
  /** default: όλοι οι τύποι */
  accept?: MediaKind[]
  defaultFolderId?: string | null
}

function acceptAttrFor(kinds?: MediaKind[]): string | undefined {
  if (!kinds || kinds.length === 0) return undefined
  const parts: string[] = []
  for (const kind of kinds) {
    if (kind === 'IMAGE') parts.push('image/*')
    else if (kind === 'VIDEO') parts.push('video/mp4', 'video/webm', 'video/quicktime')
    else if (kind === 'MODEL_3D') parts.push('.glb', '.gltf')
    else parts.push('*/*')
  }
  return parts.join(',')
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  multiple = false,
  accept,
  defaultFolderId = null,
}: MediaPickerProps) {
  const [tab, setTab] = useState<'gallery' | 'upload'>('gallery')
  const [folders, setFolders] = useState<MediaFolderDTO[]>([])
  const [assets, setAssets] = useState<MediaAssetDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(defaultFolderId)
  const [queryInput, setQueryInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected, setSelected] = useState<Map<string, PickedAsset>>(new Map())

  // Σταθερό primitive αντί για το raw array `accept` — ο καλών συνήθως περνάει
  // ένα νέο array literal (π.χ. accept={['IMAGE']}) σε ΚΑΘΕ δικό του render,
  // κι αυτό δεν πρέπει να προκαλεί άσκοπο refetch κάθε φορά.
  const acceptKey = accept?.join(',') ?? ''

  const fetchList = useCallback(async (folderId: string | null, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (folderId) params.set('folderId', folderId)
      if (q) params.set('q', q)
      const res = await fetch(`/api/media/list?${params.toString()}`)
      if (!res.ok) throw new Error(String(res.status))
      const data: MediaListResponse = await res.json()
      setFolders(data.folders)
      setAssets(accept ? data.assets.filter(a => accept.includes(a.type)) : data.assets)
    } catch {
      toast.error('Η φόρτωση των αρχείων απέτυχε.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptKey])

  // lastFetchKeyRef παρακολουθεί για ΠΟΙΟ (folderId, q) έγινε το τελευταίο fetch —
  // καθαρό ref-read guard (αντί για το `open` prop απευθείας) ώστε οι παρακάτω
  // setState κλήσεις να αναγνωρίζονται ως ref-controlled από το compiler lint rule
  // (ίδιο idiom με το isFirstRun ref της media-gallery.tsx) ΚΑΙ ώστε να μη γίνεται
  // διπλό fetch με τις ίδιες τιμές όταν το reset effect παρακάτω αλλάζει state.
  const lastFetchKeyRef = useRef<string | null>(null)
  function fetchKey(folderId: string | null, q: string): string {
    return `${folderId ?? ''}::${q}`
  }

  // Καθαρή κατάσταση + πρώτο fetch σε κάθε άνοιγμα — καμία διαρροή επιλογής/αναζήτησης
  // από προηγούμενη χρήση.
  const needsResetRef = useRef(true)
  useEffect(() => {
    if (!open) { needsResetRef.current = true; lastFetchKeyRef.current = null; return }
    if (!needsResetRef.current) return
    needsResetRef.current = false
    setCurrentFolderId(defaultFolderId)
    setQueryInput('')
    setDebouncedQuery('')
    setSelected(new Map())
    setTab('gallery')
    lastFetchKeyRef.current = fetchKey(defaultFolderId, '')
    fetchList(defaultFolderId, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultFolderId])

  // Debounce αναζήτησης.
  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => setDebouncedQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [queryInput, open])

  // Refetch σε γνήσια αλλαγή φακέλου/αναζήτησης ενώ είναι ήδη ανοιχτό — το
  // lastFetchKeyRef guard παραλείπει το "echo" re-render που προκαλεί το reset
  // effect παραπάνω (ίδιο folderId/q, όχι νέο fetch).
  useEffect(() => {
    if (!open) return
    const key = fetchKey(currentFolderId, debouncedQuery)
    if (lastFetchKeyRef.current === key) return
    lastFetchKeyRef.current = key
    fetchList(currentFolderId, debouncedQuery)
  }, [open, currentFolderId, debouncedQuery, fetchList])

  function toggleSelect(asset: MediaAssetDTO) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(asset.id)) {
        next.delete(asset.id)
      } else {
        if (!multiple) next.clear()
        next.set(asset.id, { id: asset.id, url: asset.url, name: asset.name, type: asset.type })
      }
      return next
    })
  }

  function handleUploaded(uploaded: UploadedAsset[]) {
    if (uploaded.length === 0) return
    setSelected(prev => {
      const next = multiple ? new Map(prev) : new Map<string, PickedAsset>()
      for (const u of uploaded) next.set(u.id, { id: u.id, url: u.url, name: u.name, type: u.type })
      return next
    })
    fetchList(currentFolderId, debouncedQuery)
  }

  function handleConfirm() {
    onSelect(Array.from(selected.values()))
    onOpenChange(false)
  }

  const tree = buildFolderTree(folders)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Επιλογή media</DialogTitle>
          <DialogDescription>Διάλεξε από τη συλλογή ή μεταφόρτωσε νέα αρχεία.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5">
          <button type="button" className={cn('pill', tab === 'gallery' && 'on')} onClick={() => setTab('gallery')}>
            Gallery
          </button>
          <button type="button" className={cn('pill', tab === 'upload' && 'on')} onClick={() => setTab('upload')}>
            Μεταφόρτωση
          </button>
        </div>

        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden" style={{ height: 440 }}>
          {tab === 'gallery' ? (
            <>
              <div className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(null)}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium',
                    currentFolderId === null ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <Images className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">Όλα τα αρχεία</span>
                </button>
                {tree.map(node => (
                  <PickerFolderRow
                    key={node.id}
                    node={node}
                    depth={0}
                    currentFolderId={currentFolderId}
                    onSelect={setCurrentFolderId}
                  />
                ))}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
                <label className="search shrink-0">
                  <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
                  <input
                    value={queryInput}
                    onChange={e => setQueryInput(e.target.value)}
                    placeholder="Αναζήτηση…"
                    aria-label="Αναζήτηση αρχείων"
                  />
                </label>
                <div className="flex-1 overflow-y-auto">
                  {!loading && assets.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
                      <p className="text-[13px]">Δεν βρέθηκαν αρχεία εδώ.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                      {assets.map(asset => (
                        <PickerAssetCell
                          key={asset.id}
                          asset={asset}
                          selected={selected.has(asset.id)}
                          onToggle={() => toggleSelect(asset)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1">
              <MassUploader
                pathPrefix={`media-gallery/${currentFolderId ?? 'root'}`}
                folderId={currentFolderId}
                accept={acceptAttrFor(accept)}
                onUploaded={handleUploaded}
              />
            </div>
          )}
        </div>

        <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <span className="mr-auto text-[12.5px] text-muted-foreground">
            {selected.size > 0 ? `Επιλογή (${selected.size})` : 'Καμία επιλογή'}
          </span>
          <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
          <Button type="button" disabled={selected.size === 0} onClick={handleConfirm}>
            Προσθήκη{selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PickerFolderRow({
  node,
  depth,
  currentFolderId,
  onSelect,
}: {
  node: MediaFolderNode
  depth: number
  currentFolderId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: 10 + depth * 14 }}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-lg py-1.5 pr-2.5 text-left text-[12.5px] font-medium',
          currentFolderId === node.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        )}
      >
        <Folder className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      {node.children.map(child => (
        <PickerFolderRow key={child.id} node={child} depth={depth + 1} currentFolderId={currentFolderId} onSelect={onSelect} />
      ))}
    </>
  )
}

function PickerAssetCell({
  asset,
  selected,
  onToggle,
}: {
  asset: MediaAssetDTO
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-lg bg-muted ring-2 ring-transparent transition-all',
        selected && 'ring-(--info)',
      )}
      aria-pressed={selected}
      aria-label={asset.name}
    >
      {asset.type === 'IMAGE' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt={asset.name} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-full items-center justify-center text-center text-[10.5px] text-muted-foreground">
          {MEDIA_KIND_LABEL[asset.type]}
        </div>
      )}
      {selected && (
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-(--info) text-white">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-[10.5px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {asset.name}
      </span>
    </button>
  )
}
