'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileCheck2, Check, X, Download, Eye, MoreVertical, LoaderCircle } from 'lucide-react'
import { listMyPendingReviews, reviewFileRequestItem, rejectAndResendFileRequestItem, type PendingReviewRow } from '@/lib/file-requests/review'
import { FileViewerModal, type ViewerFile } from '@/components/ui/file-viewer-modal'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { relativeTime } from '@/lib/relative-time'

/** Προεπιλεγμένη λήξη επανυποβολής: +14 ημέρες (YYYY-MM-DD). */
function defaultReuploadExpiry(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

const inlineUrl = (u: string) => `${u}${u.includes('?') ? '&' : '?'}disp=inline`

/**
 * «Δικαιολογητικά προς επιβεβαίωση»: εκκρεμή αρχεία που ανέβασε ο πελάτης και
 * περιμένουν έγκριση/απόρριψη από τον χρήστη (μόνο για έργα που του έχουν
 * ανατεθεί — το scoping γίνεται server-side). Client component που φορτώνει μόνο
 * του στο mount. Αν δεν υπάρχει τίποτα → render null (να μη «γεμίζει» το dashboard).
 * Προσοχή react-hooks/set-state-in-effect: setState μόνο μέσα σε nested async.
 */
export function PendingReviews() {
  const [rows, setRows] = React.useState<PendingReviewRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [viewer, setViewer] = React.useState<ViewerFile | null>(null)
  const [rejecting, setRejecting] = React.useState<PendingReviewRow | null>(null)
  const [pending, startTransition] = React.useTransition()

  // await-first: κανένα setState δεν τρέχει σύγχρονα στο σώμα του effect.
  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await listMyPendingReviews()
        if (active) setRows(data)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const handleReview = React.useCallback((itemId: string, decision: 'ACCEPTED' | 'REJECTED') => {
    setBusyId(itemId)
    startTransition(async () => {
      const res = await reviewFileRequestItem(itemId, decision)
      if (res.ok) {
        setRows(prev => prev.filter(r => r.itemId !== itemId))
        toast.success(decision === 'ACCEPTED' ? 'Το δικαιολογητικό εγκρίθηκε.' : 'Το δικαιολογητικό απορρίφθηκε.')
      } else {
        toast.error(res.error ?? 'Η ενέργεια απέτυχε.')
      }
      setBusyId(null)
    })
  }, [])

  // Κενή κατάσταση ή φόρτωση → τίποτα (μόνο όταν υπάρχουν items εμφανίζεται).
  if (loading || rows.length === 0) return null

  return (
    <section className="glass mt-3 px-4 pt-3.5 pb-3">
      <header className="mb-2.5 flex items-center gap-2">
        <span
          className="flex size-[1.75rem] items-center justify-center rounded-[0.6875rem]"
          style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
        >
          <FileCheck2 className="size-[0.9375rem]" strokeWidth={1.8} />
        </span>
        <h2 className="text-[0.8125rem] font-bold text-foreground">
          Δικαιολογητικά προς επιβεβαίωση ({rows.length})
        </h2>
      </header>

      <ul className="divide-y divide-border">
        {rows.map(r => {
          const rowBusy = pending && busyId === r.itemId
          return (
            <li
              key={r.itemId}
              className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate text-[0.8125rem] font-bold text-foreground">{r.label}</span>
                  {r.uploadedAt && (
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
                      {relativeTime(r.uploadedAt)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.75rem] text-muted-foreground">
                  <span className="truncate">{r.trdrName}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{r.programTitle}</span>
                </div>
                {r.fileName && (
                  <div className="mt-0.5">
                    {r.downloadUrl ? (
                      <a
                        href={r.downloadUrl}
                        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        <Download className="size-3.5" strokeWidth={1.8} />
                        <span className="truncate">{r.fileName}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[0.75rem] text-muted-foreground">
                        <Download className="size-3.5" strokeWidth={1.8} />
                        <span className="truncate">{r.fileName}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Ενέργειες"
                        disabled={rowBusy}
                        className="inline-flex size-11 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <MoreVertical className="size-4" strokeWidth={1.9} />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-max min-w-48">
                    {r.downloadUrl && (
                      <>
                        <DropdownMenuItem onClick={() => setViewer({ name: r.fileName ?? r.label, url: inlineUrl(r.downloadUrl!) })}>
                          <Eye className="size-3.5" aria-hidden /> Προβολή
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<a href={r.downloadUrl} />}>
                          <Download className="size-3.5" aria-hidden /> Λήψη
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={() => handleReview(r.itemId, 'ACCEPTED')}>
                      <Check className="size-3.5" aria-hidden /> Έγκριση
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRejecting(r)} style={{ color: 'var(--destructive)' }}>
                      <X className="size-3.5" aria-hidden /> Απόρριψη…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          )
        })}
      </ul>

      <FileViewerModal open={!!viewer} onOpenChange={o => { if (!o) setViewer(null) }} file={viewer} />
      <RejectReasonDialog
        row={rejecting}
        open={!!rejecting}
        onOpenChange={next => { if (!next) setRejecting(null) }}
        onDone={itemId => setRows(prev => prev.filter(r => r.itemId !== itemId))}
      />
    </section>
  )
}

/** Modal απόρριψης (dashboard): αιτιολογία + προαιρετική επαναποστολή upload στον πελάτη. */
function RejectReasonDialog({
  row, open, onOpenChange, onDone,
}: {
  row: PendingReviewRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (itemId: string) => void
}) {
  const [note, setNote] = React.useState('')
  const [resend, setResend] = React.useState(true)
  const [expires, setExpires] = React.useState(defaultReuploadExpiry())
  const [saving, startSaving] = React.useTransition()

  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setNote(''); setResend(true); setExpires(defaultReuploadExpiry()) }
  }

  function handleSubmit() {
    if (!row) return
    if (!note.trim()) { toast.error('Γράψε τον λόγο απόρριψης.'); return }
    const itemId = row.itemId
    startSaving(async () => {
      try {
        const res = await rejectAndResendFileRequestItem(itemId, { note: note.trim(), resend, expiresAt: resend ? expires : undefined })
        if (!res.ok) throw new Error(res.error)
        toast.success(res.resent ? 'Απορρίφθηκε — στάλθηκε νέο αίτημα upload στον πελάτη.' : 'Το δικαιολογητικό απορρίφθηκε.')
        onOpenChange(false)
        onDone(itemId)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η απόρριψη απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] bg-popover sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Απόρριψη δικαιολογητικού</DialogTitle>
          <DialogDescription>«{row?.label}» — εξήγησε γιατί δεν έγινε δεκτό. Η αιτιολογία καταγράφεται και (αν επιλεγεί) στέλνεται στον πελάτη με νέο αίτημα upload.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="field !mb-0">
            <label htmlFor="pr-rej-note">Λόγος απόρριψης*</label>
            <textarea
              id="pr-rej-note"
              className="cms-textarea"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="π.χ. Το αρχείο δεν είναι ευανάγνωστο / λάθος έγγραφο / λείπει σελίδα…"
              autoFocus
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] font-semibold">
            <input type="checkbox" checked={resend} onChange={e => setResend(e.target.checked)} className="size-4" />
            Επαναποστολή αιτήματος upload στον πελάτη
          </label>
          {resend && (
            <div className="field !mb-0">
              <label htmlFor="pr-rej-expires">Ημ/νία λήξης νέου αιτήματος</label>
              <Input id="pr-rej-expires" type="date" value={expires} onChange={e => setExpires(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={saving || !note.trim()}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
            {resend ? 'Απόρριψη & αποστολή' : 'Απόρριψη'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
