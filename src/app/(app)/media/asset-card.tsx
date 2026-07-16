'use client'

import { useState, useTransition, type FormEvent, type MouseEvent } from 'react'
import { toast } from 'sonner'
import { Video, Box, File as FileIcon, MoreVertical, Pencil, FolderInput, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  buildFolderTree, formatMediaBytes, mediaThumbUrl, MEDIA_KIND_LABEL,
  type MediaAssetDTO, type MediaFolderDTO, type MediaFolderNode,
} from '@/components/media/media-types'
import { renameAsset, moveAsset, deleteAsset } from './actions'

const ROOT_VALUE = '__root__'

function flattenFolders(nodes: MediaFolderNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap(node => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flattenFolders(node.children, depth + 1),
  ])
}

export function AssetCard({
  asset,
  folders,
  thumbSize,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onOpenLightbox,
  onChanged,
}: {
  asset: MediaAssetDTO
  folders: MediaFolderDTO[]
  /** Τρέχον μέγεθος μικρογραφίας (px) — καθορίζει το πλάτος του Bunny Optimizer param. */
  thumbSize: number
  /** true όταν ο χρήστης έχει ενεργοποιήσει «Επιλογή» στο toolbar — δείχνει checkbox αντί για ⋮. */
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: (assetId: string, shiftKey: boolean) => void
  onOpenLightbox?: () => void
  onChanged: () => void
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleCopyUrl() {
    navigator.clipboard.writeText(asset.url)
      .then(() => toast.success('Ο σύνδεσμος αντιγράφηκε.'))
      .catch(() => toast.error('Αποτυχία αντιγραφής.'))
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteAsset(asset.id)
      if (res.ok) {
        toast.success(res.message)
        setDeleteOpen(false)
        onChanged()
      } else {
        toast.error(res.message)
      }
    })
  }

  function handleThumbActivate(shiftKey: boolean) {
    if (selectionMode) onToggleSelect?.(asset.id, shiftKey)
    else onOpenLightbox?.()
  }

  function handleCheckboxClick(e: MouseEvent<HTMLInputElement>) {
    e.preventDefault()
    e.stopPropagation()
    onToggleSelect?.(asset.id, e.shiftKey)
  }

  return (
    <div className="lift group/card flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div
        className="relative aspect-square w-full cursor-pointer overflow-hidden bg-muted"
        onClick={e => handleThumbActivate(e.shiftKey)}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleThumbActivate(false) }
        }}
        aria-label={selectionMode ? `Επιλογή ${asset.name}` : `Προβολή ${asset.name} σε πλήρη ανάλυση`}
      >
        {asset.type === 'IMAGE' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaThumbUrl(asset, thumbSize)} alt={asset.alt ?? asset.name} className="size-full object-cover" loading="lazy" />
        ) : asset.type === 'VIDEO' ? (
          <div className="relative flex size-full items-center justify-center bg-muted">
            {/* preload="metadata" — φθηνό, δείχνει το πρώτο frame σαν thumbnail χωρίς να κατεβάζει όλο το βίντεο */}
            <video src={asset.url} preload="metadata" muted playsInline className="size-full object-cover" />
            <Video className="pointer-events-none absolute size-7 text-white drop-shadow-[0_1px_4px_rgb(0_0_0_/_60%)]" strokeWidth={1.6} />
          </div>
        ) : (
          <div className="flex size-full items-center justify-center">
            {asset.type === 'MODEL_3D' && <Box className="size-8 text-muted-foreground" strokeWidth={1.5} />}
            {asset.type === 'FILE' && <FileIcon className="size-8 text-muted-foreground" strokeWidth={1.5} />}
          </div>
        )}
        <span className="badge-pill info absolute top-2 left-2 backdrop-blur-sm">
          {MEDIA_KIND_LABEL[asset.type]}
        </span>
        {selectionMode ? (
          <span
            className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-card/90 backdrop-blur-sm"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              readOnly
              onClick={handleCheckboxClick}
              className="select-check"
              aria-label={`Επιλογή ${asset.name}`}
            />
          </span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="rowmenu-btn absolute top-2 right-2 bg-card/90 opacity-0 backdrop-blur-sm group-hover/card:opacity-100 data-[popup-open]:opacity-100"
                  aria-label={`Ενέργειες για ${asset.name}`}
                  onClick={(e: MouseEvent) => e.stopPropagation()}
                >
                  <MoreVertical className="size-3.5" strokeWidth={1.8} />
                </button>
              }
            />
            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                <Pencil className="size-3.5" strokeWidth={1.75} /> Μετονομασία
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMoveOpen(true)}>
                <FolderInput className="size-3.5" strokeWidth={1.75} /> Μετακίνηση σε φάκελο
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyUrl}>
                <Copy className="size-3.5" strokeWidth={1.75} /> Αντιγραφή URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2.5">
        <span className="truncate text-[12.5px] font-medium" title={asset.name}>{asset.name}</span>
        <span className="text-[11px] text-muted-foreground">{formatMediaBytes(asset.size)}</span>
      </div>

      <RenameAssetDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        assetId={asset.id}
        initialName={asset.name}
        onDone={onChanged}
      />
      <MoveAssetDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        assetId={asset.id}
        currentFolderId={asset.folderId}
        folders={folders}
        onDone={onChanged}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{asset.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Το αρχείο διαγράφεται και από το BunnyCDN. Η ενέργεια δεν αναιρείται.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RenameAssetDialog({
  open,
  onOpenChange,
  assetId,
  initialName,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetId: string
  initialName: string
  onDone: () => void
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await renameAsset(assetId, name)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
        onDone()
      } else {
        setError(res.fieldErrors?.name ?? res.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { onOpenChange(next); if (next) { setName(initialName); setError(null) } }}>
      <DialogContent className="glass sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Μετονομασία αρχείου</DialogTitle>
          <DialogDescription>Το όνομα εμφανίζεται στη συλλογή — δεν αλλάζει το URL του CDN.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="asset-name-input">Όνομα αρχείου*</label>
            <div className="inwrap">
              <input
                id="asset-name-input"
                value={name}
                onChange={e => { setName(e.target.value); setError(null) }}
                autoFocus
                required
                style={{ paddingLeft: 16 }}
              />
            </div>
            {error && <div className="error">{error}</div>}
          </div>
          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending || name.trim() === ''}>
              {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MoveAssetDialog({
  open,
  onOpenChange,
  assetId,
  currentFolderId,
  folders,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetId: string
  currentFolderId: string | null
  folders: MediaFolderDTO[]
  onDone: () => void
}) {
  const [target, setTarget] = useState<string>(currentFolderId ?? ROOT_VALUE)
  const [pending, startTransition] = useTransition()
  const options = flattenFolders(buildFolderTree(folders))

  function handleMove() {
    startTransition(async () => {
      const res = await moveAsset(assetId, target === ROOT_VALUE ? null : target)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
        onDone()
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { onOpenChange(next); if (next) setTarget(currentFolderId ?? ROOT_VALUE) }}>
      <DialogContent className="glass sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Μετακίνηση σε φάκελο</DialogTitle>
          <DialogDescription>Επίλεξε τον φάκελο προορισμού.</DialogDescription>
        </DialogHeader>
        <Select value={target} onValueChange={value => setTarget(value as string)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: string) => value === ROOT_VALUE ? 'Όλα τα αρχεία (χωρίς φάκελο)' : options.find(o => o.id === value)?.label ?? value}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROOT_VALUE}>Όλα τα αρχεία (χωρίς φάκελο)</SelectItem>
            {options.map(o => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
          <Button onClick={handleMove} disabled={pending || target === (currentFolderId ?? ROOT_VALUE)}>
            {pending ? 'Μετακίνηση…' : 'Μετακίνηση'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
