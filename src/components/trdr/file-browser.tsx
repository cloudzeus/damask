'use client'

import { useCallback, useEffect, useState, useTransition, type MouseEvent, type ReactNode } from 'react'
import {
  Folder, FileText, Download, Trash2, FolderPlus, ChevronRight, ArrowLeft, LoaderCircle, Upload,
  Pencil, Copy, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FileDropzone, xhrUpload } from '@/components/ui/file-dropzone'
import {
  listTrdrFiles, deleteTrdrFile, createTrdrSubfolder, renameTrdrFile, type TrdrFilesListing, type BrowserFile,
} from '@/lib/trdr/files'
import { toast } from 'sonner'
import { relativeTime } from '@/lib/relative-time'

/**
 * Staff file browser μέσα στην καρτέλα πελάτη — περιηγείται στο πραγματικό
 * δέντρο φακέλων του πελάτη στο Bunny (documents/…, EuPrograms/<code>/…).
 * Λήψη / μεταφόρτωση στον τρέχοντα φάκελο / διαγραφή / δημιουργία υποφακέλου.
 * Όλο το data-fetching γίνεται μέσω των server actions του `lib/trdr/files`.
 */

/** Φιλικές ελληνικές ετικέτες για γνωστά τμήματα διαδρομής· τα υπόλοιπα (ΑΦΜ,
 * κωδικοί προγραμμάτων) μένουν ως έχουν. */
const SEGMENT_LABELS: Record<string, string> = {
  documents: 'Έγγραφα',
  gemi: 'ΓΕΜΗ',
  services: 'Υπηρεσίες',
  EuPrograms: 'Ευρωπαϊκά Προγράμματα',
}

function segmentLabel(name: string): string {
  return SEGMENT_LABELS[name] ?? name
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileBrowser({ trdrId, canEdit }: { trdrId: string; canEdit: boolean }) {
  const [subPath, setSubPath] = useState('')
  const [listing, setListing] = useState<TrdrFilesListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; file: BrowserFile } | null>(null)
  const [renameTarget, setRenameTarget] = useState<BrowserFile | null>(null)
  const [renameName, setRenameName] = useState('')
  const [pending, startTransition] = useTransition()

  // Κλείσιμο context menu σε click/scroll/Escape (χωρίς setState στο σώμα του effect).
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // Manual reload — καλείται ΜΟΝΟ από event handlers, όπου το synchronous
  // setState επιτρέπεται (react-hooks/set-state-in-effect).
  const reload = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setListing(await listTrdrFiles(trdrId, subPath))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [trdrId, subPath])

  // Φόρτωση σε mount + σε κάθε αλλαγή subPath. Τα setState μπαίνουν ΜΕΤΑ από
  // await (όχι synchronously στο σώμα του effect) ώστε να μη σκάει το
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      setError(false)
      setActionError(null)
      try {
        const data = await listTrdrFiles(trdrId, subPath)
        if (!cancelled) setListing(data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [trdrId, subPath])

  const uploadFn = useCallback(
    (file: File, onProgress: (pct: number) => void, signal: AbortSignal) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('subPath', subPath)
      return xhrUpload(`/api/partners/${trdrId}/files/upload`, fd, onProgress, signal)
    },
    [trdrId, subPath],
  )

  function handleDelete(file: BrowserFile) {
    if (!window.confirm(`Διαγραφή του αρχείου «${file.name}»; Η ενέργεια δεν αναιρείται.`)) return
    setActionError(null)
    startTransition(async () => {
      const res = await deleteTrdrFile(trdrId, file.key)
      if (!res.ok) { setActionError(res.error ?? 'Η διαγραφή απέτυχε.'); return }
      await reload()
    })
  }

  function handleCreateFolder() {
    const name = folderName.trim()
    if (!name) return
    setActionError(null)
    startTransition(async () => {
      const res = await createTrdrSubfolder(trdrId, subPath, name)
      if (!res.ok) { setActionError(res.error ?? 'Η δημιουργία φακέλου απέτυχε.'); return }
      setFolderOpen(false)
      setFolderName('')
      await reload()
    })
  }

  function openMenu(e: MouseEvent, file: BrowserFile) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, file })
  }

  function copyLink(file: BrowserFile) {
    const url = `${window.location.origin}${file.downloadUrl}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Ο σύνδεσμος αντιγράφηκε.'),
      () => toast.error('Αδυναμία αντιγραφής.'),
    )
  }

  function openRename(file: BrowserFile) {
    setRenameTarget(file)
    setRenameName(file.name)
  }

  function handleRename() {
    const target = renameTarget
    const name = renameName.trim()
    if (!target || !name || name === target.name) { setRenameTarget(null); return }
    setActionError(null)
    startTransition(async () => {
      const res = await renameTrdrFile(trdrId, target.key, name)
      if (!res.ok) { setActionError(res.error ?? 'Η μετονομασία απέτυχε.'); return }
      setRenameTarget(null)
      await reload()
    })
  }

  // Breadcrumb από τον normalized subPath του listing (με trailing slash).
  const currentPath = listing?.subPath ?? ''
  const segments = currentPath.split('/').filter(Boolean)
  const parentPath = segments.slice(0, -1).join('/')
  const atRoot = segments.length === 0

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.9375rem] font-bold">
          <Folder className="size-4 text-muted-foreground" aria-hidden /> Αρχεία
        </h3>
        {canEdit && (
          <Button type="button" variant="outline" onClick={() => { setFolderName(''); setFolderOpen(true) }}>
            <FolderPlus className="size-4" aria-hidden /> Νέος φάκελος
          </Button>
        )}
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Διαδρομή φακέλων" className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setSubPath('')}
          className="inline-flex min-h-9 items-center rounded-md px-2 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-100"
          disabled={atRoot}
        >
          Αρχεία
        </button>
        {segments.map((seg, i) => {
          const path = segments.slice(0, i + 1).join('/')
          const last = i === segments.length - 1
          return (
            <span key={path} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
              <button
                type="button"
                onClick={() => setSubPath(path)}
                aria-current={last ? 'page' : undefined}
                className={
                  last
                    ? 'inline-flex min-h-9 items-center rounded-md px-2 font-semibold text-foreground'
                    : 'inline-flex min-h-9 items-center rounded-md px-2 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                }
              >
                {segmentLabel(seg)}
              </button>
            </span>
          )
        })}
      </nav>

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {loading ? (
        <FileBrowserSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Αδυναμία φόρτωσης των αρχείων.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!atRoot && (
            <button
              type="button"
              onClick={() => setSubPath(parentPath)}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors hover:bg-muted"
            >
              <ArrowLeft className="size-4" aria-hidden /> Πίσω
            </button>
          )}

          {listing && (listing.folders.length > 0 || listing.files.length > 0) ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <ul className="divide-y divide-border">
                {listing.folders.map(folder => (
                  <li key={folder.path}>
                    <button
                      type="button"
                      onClick={() => setSubPath(folder.path)}
                      className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <Folder className="size-5 shrink-0 text-(--brass)" strokeWidth={1.75} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{segmentLabel(folder.name)}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}

                {listing.files.map(file => (
                  <li
                    key={file.key}
                    className="flex min-h-11 items-center gap-3 px-3.5 py-2.5"
                    onContextMenu={e => openMenu(e, file)}
                  >
                    <FileText className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{file.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatSize(file.size)}</span>
                        <span aria-hidden>·</span>
                        <span>{relativeTime(file.lastChanged)}</span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={file.downloadUrl}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Λήψη ${file.name}`}
                        title="Λήψη"
                      >
                        <Download className="size-4" aria-hidden />
                      </a>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
                          aria-label={`Διαγραφή ${file.name}`}
                          title="Διαγραφή"
                          disabled={pending}
                          onClick={() => handleDelete(file)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
              <Folder className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <p className="text-sm font-medium">Άδειος φάκελος</p>
              {canEdit && <p className="text-xs text-muted-foreground">Μεταφόρτωσε αρχεία ή δημιούργησε έναν υποφάκελο.</p>}
            </div>
          )}

          {canEdit && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Upload className="size-3.5" aria-hidden /> Μεταφόρτωση στον τρέχοντα φάκελο
              </p>
              <FileDropzone
                key={currentPath}
                uploadFn={uploadFn}
                onUploaded={() => { void reload() }}
              />
            </div>
          )}
        </div>
      )}

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Νέος φάκελος</DialogTitle>
            <DialogDescription>
              Δημιουργία υποφακέλου στον τρέχοντα φάκελο. Επιτρέπονται γράμματα, αριθμοί και . _ -
            </DialogDescription>
          </DialogHeader>
          <Input
            value={folderName}
            onChange={e => setFolderName(e.target.value)}
            placeholder="Όνομα φακέλου"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateFolder() } }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFolderOpen(false)} disabled={pending}>
              Άκυρο
            </Button>
            <Button type="button" onClick={handleCreateFolder} disabled={pending || !folderName.trim()}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FolderPlus className="size-4" aria-hidden />}
              Δημιουργία
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Δεξί-click context menu σε αρχείο */}
      {menu && (
        <div
          role="menu"
          className="fixed z-[100] min-w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
          style={{ top: menu.y, left: menu.x }}
          onContextMenu={e => e.preventDefault()}
        >
          <ContextItem icon={<Download className="size-4" aria-hidden />} onClick={() => { window.location.href = menu.file.downloadUrl }}>
            Λήψη
          </ContextItem>
          <ContextItem icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(menu.file.downloadUrl, '_blank', 'noopener')}>
            Άνοιγμα σε νέα καρτέλα
          </ContextItem>
          <ContextItem icon={<Copy className="size-4" aria-hidden />} onClick={() => copyLink(menu.file)}>
            Αντιγραφή συνδέσμου
          </ContextItem>
          {canEdit && (
            <>
              <ContextItem icon={<Pencil className="size-4" aria-hidden />} onClick={() => openRename(menu.file)}>
                Μετονομασία
              </ContextItem>
              <div className="my-1 h-px bg-border" />
              <ContextItem icon={<Trash2 className="size-4" aria-hidden />} danger onClick={() => handleDelete(menu.file)}>
                Διαγραφή
              </ContextItem>
            </>
          )}
        </div>
      )}

      {/* Μετονομασία */}
      <Dialog open={!!renameTarget} onOpenChange={open => { if (!open) setRenameTarget(null) }}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Μετονομασία αρχείου</DialogTitle>
            <DialogDescription>Δώσε νέο όνομα (μαζί με την κατάληξη, π.χ. .pdf).</DialogDescription>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRename() } }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)} disabled={pending}>Άκυρο</Button>
            <Button type="button" onClick={handleRename} disabled={pending || !renameName.trim()}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
              Μετονομασία
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ContextItem({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors hover:bg-muted ${danger ? 'text-destructive' : 'text-foreground'}`}
    >
      {icon}
      {children}
    </button>
  )
}

function FileBrowserSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden>
      <ul className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex min-h-11 items-center gap-3 px-3.5 py-2.5">
            <div className="size-5 shrink-0 animate-pulse rounded bg-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/5 animate-pulse rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
