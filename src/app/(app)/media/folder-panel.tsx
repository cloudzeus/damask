'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Images, Folder, FolderPlus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { buildFolderTree, type MediaFolderDTO, type MediaFolderNode } from '@/components/media/media-types'
import { createFolder, renameFolder, deleteFolder, deleteFolderRecursive, getFolderDeletePreview } from './actions'

const RECURSIVE_DELETE_WORD = 'ΔΙΑΓΡΑΦΗ'

export function FolderPanel({
  folders,
  selectedFolderId,
  onSelect,
  onChanged,
}: {
  folders: MediaFolderDTO[]
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
  onChanged: () => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const tree = buildFolderTree(folders)
  const selectedFolder = folders.find(f => f.id === selectedFolderId) ?? null

  return (
    <div className="glass flex w-64 shrink-0 flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Φάκελοι</span>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Νέος φάκελος" onClick={() => setCreateOpen(true)}>
          <FolderPlus className="size-4" strokeWidth={1.75} />
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors',
            selectedFolderId === null
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-[var(--glass-strong)]',
          )}
        >
          <Images className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">Όλα τα αρχεία</span>
        </button>

        {tree.length === 0 ? (
          <p className="px-2.5 py-3 text-[12px] text-muted-foreground">
            Δεν υπάρχουν φάκελοι ακόμα. Δημιούργησε τον πρώτο με το{' '}
            <FolderPlus className="inline size-3" strokeWidth={2} aria-hidden /> πάνω δεξιά.
          </p>
        ) : (
          tree.map(node => (
            <FolderRow
              key={node.id}
              node={node}
              depth={0}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onChanged={onChanged}
            />
          ))
        )}
      </nav>

      <FolderNameDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={selectedFolder ? selectedFolder.id : null}
        parentLabel={selectedFolder ? selectedFolder.name : null}
        onDone={onChanged}
      />
    </div>
  )
}

function FolderRow({
  node,
  depth,
  selectedFolderId,
  onSelect,
  onChanged,
}: {
  node: MediaFolderNode
  depth: number
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
  onChanged: () => void
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [recursiveDeleteOpen, setRecursiveDeleteOpen] = useState(false)
  const [recursivePreview, setRecursivePreview] = useState<{ assetCount: number; folderCount: number } | null>(null)
  const [recursivePreviewLoading, setRecursivePreviewLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const isEmpty = node.assetCount === 0 && node.childCount === 0

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteFolder(node.id)
      if (res.ok) {
        toast.success(res.message)
        setDeleteOpen(false)
        if (selectedFolderId === node.id) onSelect(null)
        onChanged()
      } else {
        toast.error(res.message)
      }
    })
  }

  /**
   * Το «Διαγραφή» στο dropdown ορίζει open=true ΑΠΕΥΘΕΙΑΣ (setRecursiveDeleteOpen) —
   * δεν περνάει από κανένα onOpenChange του dialog. Το base-ui Dialog σε
   * ΠΛΗΡΩΣ ελεγχόμενη λειτουργία (open+onOpenChange και τα δύο δοσμένα) καλεί
   * το δικό του onOpenChange ΜΟΝΟ όταν ο ΧΡΗΣΤΗΣ κλείνει το dialog από μέσα
   * (Esc/backdrop/Cancel) — ΟΧΙ όταν εμείς αλλάζουμε το open prop απ' έξω. Γι'
   * αυτό η φόρτωση του preview πρέπει να ξεκινά ΕΔΩ, στο ΙΔΙΟ event handler
   * που ανοίγει το dialog — αλλιώς δεν τρέχει ποτέ.
   */
  function handleDeleteClick() {
    if (isEmpty) { setDeleteOpen(true); return }
    setRecursiveDeleteOpen(true)
    setRecursivePreview(null)
    setRecursivePreviewLoading(true)
    getFolderDeletePreview(node.id).then(res => {
      if (res.ok) setRecursivePreview({ assetCount: res.assetCount, folderCount: res.folderCount })
      else toast.error(res.message)
    }).finally(() => setRecursivePreviewLoading(false))
  }

  function handleRecursiveDeleted() {
    if (selectedFolderId === node.id) onSelect(null)
    onChanged()
  }

  return (
    <div>
      <div
        className={cn(
          'group flex min-w-0 items-center gap-1 rounded-lg pr-1 text-[13px] font-medium transition-colors',
          selectedFolderId === node.id ? 'bg-primary text-primary-foreground' : 'hover:bg-[var(--glass-strong)]',
        )}
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        <button type="button" onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
          <Folder className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.assetCount > 0 && (
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0 text-[10.5px] font-bold tabular-nums',
                selectedFolderId === node.id ? 'bg-white/20' : 'bg-muted text-muted-foreground',
              )}
            >
              {node.assetCount}
            </span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  'rowmenu-btn shrink-0 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100',
                  selectedFolderId === node.id && 'text-primary-foreground hover:text-foreground',
                )}
                aria-label={`Ενέργειες για τον φάκελο ${node.name}`}
              >
                <MoreVertical className="size-3.5" strokeWidth={1.8} />
              </button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              <Pencil className="size-3.5" strokeWidth={1.75} /> Μετονομασία
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleDeleteClick}>
              <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {node.children.map(child => (
        <FolderRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
          onChanged={onChanged}
        />
      ))}

      <FolderNameDialog
        mode="rename"
        open={renameOpen}
        onOpenChange={setRenameOpen}
        folderId={node.id}
        initialName={node.name}
        onDone={onChanged}
      />

      {/* isEmpty — απλή, άμεση επιβεβαίωση (χωρίς πληκτρολόγηση). Το μη-άδειο
          μονοπάτι πάει στο FolderRecursiveDeleteDialog παρακάτω. */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή φακέλου «{node.name}»;</AlertDialogTitle>
            <AlertDialogDescription>Ο φάκελος είναι άδειος. Η διαγραφή δεν αναιρείται.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FolderRecursiveDeleteDialog
        open={recursiveDeleteOpen}
        onOpenChange={setRecursiveDeleteOpen}
        folderId={node.id}
        folderName={node.name}
        preview={recursivePreview}
        loadingPreview={recursivePreviewLoading}
        onDeleted={handleRecursiveDeleted}
      />
    </div>
  )
}

/**
 * Διαγραφή φακέλου ΜΕ περιεχόμενα — δείχνει πόσα αρχεία/υποφάκελοι θα χαθούν
 * και απαιτεί πληκτρολόγηση «ΔΙΑΓΡΑΦΗ» πριν ενεργοποιηθεί το κουμπί.
 *
 * Καθαρά παρουσιαστικό ως προς το preview — το FolderRow (γονιός) ξεκινάει
 * το fetch ΤΗΝ ΩΡΑ που ανοίγει το dialog (στο ΙΔΙΟ click handler), όχι εδώ:
 * το open=true φτάνει εδώ ΑΠΕΥΘΕΙΑΣ ως prop, όχι μέσω onOpenChange, οπότε ένα
 * "φόρτωσε στο άνοιγμα" idiom μέσα σε αυτό το component δεν θα έτρεχε ποτέ.
 */
function FolderRecursiveDeleteDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
  preview,
  loadingPreview,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId: string
  folderName: string
  preview: { assetCount: number; folderCount: number } | null
  loadingPreview: boolean
  onDeleted: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [pending, startTransition] = useTransition()

  // Reset του πεδίου επιβεβαίωσης όταν ο χρήστης κλείνει το dialog (Esc /
  // backdrop / Cancel) — αυτό ΕΙΝΑΙ μονοπάτι που περνάει από το onOpenChange
  // του base-ui primitive, σε αντίθεση με το άνοιγμα (βλ. σχόλιο πάνω).
  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) setConfirmText('')
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteFolderRecursive(folderId)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
        onDeleted()
      } else {
        toast.error(res.message)
      }
    })
  }

  const subfolderCount = preview ? preview.folderCount - 1 : 0
  const ready = !loadingPreview && preview !== null

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Διαγραφή φακέλου «{folderName}» ΜΕ όλα τα περιεχόμενά του;</AlertDialogTitle>
          <AlertDialogDescription>
            {!ready ? (
              'Υπολογισμός περιεχομένων…'
            ) : (
              <>
                Θα διαγραφούν οριστικά <b>{preview.assetCount}</b> {preview.assetCount === 1 ? 'αρχείο' : 'αρχεία'}
                {subfolderCount > 0 && <> και <b>{subfolderCount}</b> {subfolderCount === 1 ? 'υποφάκελος' : 'υποφάκελοι'}</>}
                {' '}— από το BunnyCDN ΚΑΙ τη βάση. Η ενέργεια δεν αναιρείται.
                <br />
                Πληκτρολόγησε <b>{RECURSIVE_DELETE_WORD}</b> για να ενεργοποιηθεί το κουμπί.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="field">
          <label htmlFor="folder-recursive-delete-confirm">Επιβεβαίωση</label>
          <Input
            id="folder-recursive-delete-confirm"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={RECURSIVE_DELETE_WORD}
            autoComplete="off"
            disabled={!ready}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Άκυρο</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!ready || confirmText !== RECURSIVE_DELETE_WORD || pending}
            onClick={handleDelete}
          >
            {pending ? 'Διαγραφή…' : 'Διαγραφή'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function FolderNameDialog({
  mode,
  open,
  onOpenChange,
  folderId,
  initialName = '',
  parentId = null,
  parentLabel = null,
  onDone,
}: {
  mode: 'create' | 'rename'
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId?: string
  initialName?: string
  parentId?: string | null
  parentLabel?: string | null
  onDone: () => void
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = mode === 'create'
        ? await createFolder({ name, parentId })
        : await renameFolder(folderId!, name)

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
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (next) { setName(initialName); setError(null) }
      }}
    >
      <DialogContent className="glass sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Νέος φάκελος' : 'Μετονομασία φακέλου'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? parentLabel
                ? `Δημιουργείται μέσα στον φάκελο «${parentLabel}».`
                : 'Δημιουργείται στη ρίζα («Όλα τα αρχεία»).'
              : 'Άλλαξε το όνομα του φακέλου.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="folder-name-input">Όνομα φακέλου*</label>
            <div className="inwrap">
              <input
                id="folder-name-input"
                value={name}
                onChange={e => { setName(e.target.value); setError(null) }}
                placeholder="π.χ. Καθιστικό 2026"
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
