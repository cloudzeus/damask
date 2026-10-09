'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { MassUploader, type UploadedAsset, type UploaderSummary } from '@/components/media/mass-uploader'

/**
 * Αιωρούμενο panel προόδου (κάτω δεξιά) για αρχεία που αφέθηκαν με full-screen drop.
 * Δείχνει κάθε αρχείο με preloader (δακτύλιος + %) και συνολική πρόοδο· η σελίδα
 * μένει ελεύθερη για χρήση. Νέα drops προστίθενται στην ίδια λίστα.
 * Portal στο body ώστε το fixed να μην «παγιδεύεται» από transform προγόνου.
 */
export function UploadTray({
  incoming, folderId, folderLabel, onUploaded, onClose,
}: {
  incoming: { id: number; files: File[] } | null
  folderId: string | null
  folderLabel: string
  onUploaded: () => void
  onClose: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [summary, setSummary] = useState<UploaderSummary>({ total: 0, done: 0, errors: 0, inProgress: true, progress: 0 })

  const title = summary.inProgress
    ? `Μεταφόρτωση ${summary.done}/${summary.total} · ${summary.progress}%`
    : summary.errors > 0
      ? `Ολοκληρώθηκαν ${summary.done}/${summary.total} · ${summary.errors} σφάλματα`
      : `Ολοκληρώθηκαν ${summary.done} αρχεία`

  return createPortal(
    <section
      aria-label="Πρόοδος μεταφόρτωσης"
      className="fixed right-4 bottom-4 z-[85] flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl"
    >
      <header className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        {summary.inProgress ? (
          <UploadCloud className="size-4.5 shrink-0 animate-pulse text-primary" strokeWidth={1.8} aria-hidden />
        ) : summary.errors > 0 ? (
          <AlertTriangle className="size-4.5 shrink-0 text-(--warning)" strokeWidth={1.8} aria-hidden />
        ) : (
          <CheckCircle2 className="size-4.5 shrink-0 text-(--success)" strokeWidth={1.8} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--fs-13)] font-bold tabular-nums" aria-live="polite">{title}</p>
          <p className="truncate text-[length:var(--fs-11)] text-muted-foreground">Προορισμός: «{folderLabel}»</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Ανάπτυξη λίστας' : 'Σύμπτυξη λίστας'}
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className={cn('size-4 transition-transform', collapsed && 'rotate-180')} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={summary.inProgress}
          title={summary.inProgress ? 'Περίμενε να ολοκληρωθεί η μεταφόρτωση' : 'Κλείσιμο'}
          aria-label="Κλείσιμο"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <Progress value={summary.progress} className="h-1 rounded-none" />
      <div className={cn('max-h-[50vh] overflow-y-auto p-2.5', collapsed && 'hidden')}>
        <MassUploader
          hideDropzone
          incoming={incoming}
          pathPrefix={`media-gallery/${folderId ?? 'root'}`}
          folderId={folderId}
          keepAspect={/elements/i.test(folderLabel)}
          onStateChange={setSummary}
          onUploaded={(assets: UploadedAsset[]) => { if (assets.length > 0) onUploaded() }}
        />
      </div>
    </section>,
    document.body,
  )
}
