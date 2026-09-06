'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileCheck2, Check, X, Download, Eye, UserCheck, LoaderCircle, MoreVertical } from 'lucide-react'
import { FileViewerModal, type ViewerFile } from '@/components/ui/file-viewer-modal'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { relativeTime } from '@/lib/relative-time'
import {
  listApplicationFileRequests, reviewFileRequestItem, type FileRequestGroup, type ReviewItem,
} from '@/lib/file-requests/review'

/** Inline variant του gated download URL — προβολή χωρίς λήψη. */
const inlineUrl = (u: string) => `${u}${u.includes('?') ? '&' : '?'}disp=inline`

/**
 * «Δικαιολογητικά» tab του έργου (ProgramApplication hub) — λίστα των αιτημάτων
 * δικαιολογητικών που στάλθηκαν στον πελάτη + τα ανεβασμένα του αρχεία, με
 * δυνατότητα Έγκρισης/Απόρριψης κάθε στοιχείου (καταγράφεται ΠΟΙΟΣ επιβεβαίωσε
 * — μπορεί να είναι διαφορετικοί χρήστες ανά στοιχείο). Self-fetching client
 * component, mirror του idiom application-contacts-tab.tsx: αρχική φόρτωση μέσα
 * σε effect με setState ΜΕΤΑ το await (react-hooks/set-state-in-effect). Το
 * δικαίωμα επιβεβαίωσης επιβάλλεται server-side στο reviewFileRequestItem.
 */
export function FileRequestsReviewTab({ applicationId }: { applicationId: string }) {
  const [groups, setGroups] = React.useState<FileRequestGroup[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Καθαρή ανάκτηση — δεν αγγίζει state, ώστε να καλείται και μέσα σε effect
  // (μετά το await) και από event handlers.
  const fetchGroups = React.useCallback(() => listApplicationFileRequests(applicationId), [applicationId])

  // Manual reload — καλείται ΜΟΝΟ από event handlers (μετά την επιβεβαίωση),
  // όπου το synchronous setState επιτρέπεται.
  const reload = React.useCallback(async () => {
    setError(null)
    try {
      setGroups(await fetchGroups())
    } catch {
      setError('Η φόρτωση των αιτημάτων δικαιολογητικών απέτυχε.')
    }
  }, [fetchGroups])

  // Αρχική φόρτωση — setState ΜΕΤΑ το await.
  React.useEffect(() => {
    let cancelled = false
    fetchGroups()
      .then(rows => { if (!cancelled) setGroups(rows) })
      .catch(() => { if (!cancelled) setError('Η φόρτωση των αιτημάτων δικαιολογητικών απέτυχε.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchGroups])

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Δικαιολογητικά ({totalItems})
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[0.78125rem] text-coral">{error}</p>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <FileCheck2 className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[0.78125rem] text-muted-foreground">Δεν υπάρχουν αιτήματα δικαιολογητικών για αυτό το έργο.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(group => (
            <FileRequestGroupCard key={group.id} group={group} onReload={reload} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Κατάσταση ολόκληρου του αιτήματος (fileRequest.status). */
function groupStatusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return <span className="badge-pill muted shrink-0">Εκκρεμεί</span>
    case 'UPLOADED':
      return <span className="badge-pill warn shrink-0">Ανέβηκε</span>
    case 'FULFILLED':
    case 'COMPLETED':
      return <span className="badge-pill ok shrink-0">Ολοκληρώθηκε</span>
    case 'CANCELLED':
      return <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>Ακυρώθηκε</span>
    case 'EXPIRED':
      return <span className="badge-pill muted shrink-0">Έληξε</span>
    default:
      return <span className="badge-pill muted shrink-0">{status}</span>
  }
}

/** Κατάσταση ενός στοιχείου δικαιολογητικού (fileRequestItem.status). */
function itemStatusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return <span className="badge-pill muted shrink-0">Εκκρεμεί</span>
    case 'UPLOADED':
      return <span className="badge-pill warn shrink-0">Ανέβηκε – προς έλεγχο</span>
    case 'ACCEPTED':
      return <span className="badge-pill ok shrink-0"><Check className="size-3" aria-hidden /> Εγκρίθηκε</span>
    case 'REJECTED':
      return <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}><X className="size-3" aria-hidden /> Απορρίφθηκε</span>
    default:
      return <span className="badge-pill muted shrink-0">{status}</span>
  }
}

function FileRequestGroupCard({ group, onReload }: { group: FileRequestGroup; onReload: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[0.8125rem] font-semibold">{group.title}</span>
          {groupStatusBadge(group.status)}
        </div>
        <span className="shrink-0 text-[0.71875rem] text-muted-foreground">
          Λήξη: {new Date(group.expiresAt).toLocaleDateString('el-GR')}
        </span>
      </div>

      {group.items.length === 0 ? (
        <p className="mt-2 text-[0.71875rem] text-muted-foreground">Χωρίς στοιχεία.</p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2 pt-2.5" style={{ borderTop: '1px dotted var(--dotted)' }}>
          {group.items.map(item => (
            <FileRequestItemRow key={item.id} item={item} onReload={onReload} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FileRequestItemRow({ item, onReload }: { item: ReviewItem; onReload: () => void }) {
  const [pending, startTransition] = React.useTransition()
  const [viewer, setViewer] = React.useState<ViewerFile | null>(null)

  function handleReview(decision: 'ACCEPTED' | 'REJECTED') {
    startTransition(async () => {
      try {
        const res = await reviewFileRequestItem(item.id, decision)
        if (!res.ok) throw new Error(res.error)
        toast.success(decision === 'ACCEPTED' ? 'Το δικαιολογητικό εγκρίθηκε.' : 'Το δικαιολογητικό απορρίφθηκε.')
        await onReload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η επιβεβαίωση απέτυχε.')
      }
    })
  }

  // Κουμπιά επιβεβαίωσης: για UPLOADED (προς έλεγχο) ή για REJECTED (επιτρέπεται
  // εκ νέου έγκριση). Το τελικό δικαίωμα ελέγχεται server-side.
  const canReview = item.status === 'UPLOADED' || item.status === 'REJECTED'

  return (
    <li className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.8125rem] font-medium">{item.label}</span>
          {item.required
            ? <span className="badge-pill warn shrink-0">Υποχρεωτικό</span>
            : <span className="badge-pill muted shrink-0">Προαιρετικό</span>}
          {itemStatusBadge(item.status)}
        </div>

        {item.fileName && (
          <div className="mt-1 text-[0.71875rem] text-muted-foreground">
            <span className="truncate">{item.fileName}</span>
          </div>
        )}

        {item.reviewedByName && (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-[0.6875rem] text-muted-foreground">
            <UserCheck className="size-3" aria-hidden />
            Επιβεβαίωση: {item.reviewedByName}
            {item.reviewedAt && <> · {relativeTime(item.reviewedAt)}</>}
            {item.reviewNote && <> · «{item.reviewNote}»</>}
          </p>
        )}
      </div>

      {(item.downloadUrl || canReview) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Ενέργειες"
                disabled={pending}
                className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-max min-w-48">
            {item.downloadUrl && (
              <>
                <DropdownMenuItem onClick={() => setViewer({ name: item.fileName ?? 'αρχείο', url: inlineUrl(item.downloadUrl!) })}>
                  <Eye className="size-3.5" aria-hidden /> Προβολή
                </DropdownMenuItem>
                <DropdownMenuItem render={<a href={item.downloadUrl} />}>
                  <Download className="size-3.5" aria-hidden /> Λήψη
                </DropdownMenuItem>
              </>
            )}
            {canReview && (
              <>
                {item.downloadUrl && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => handleReview('ACCEPTED')} disabled={item.status === 'ACCEPTED'}>
                  <Check className="size-3.5" aria-hidden /> Έγκριση
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleReview('REJECTED')} disabled={item.status === 'REJECTED'} style={{ color: 'var(--destructive)' }}>
                  <X className="size-3.5" aria-hidden /> Απόρριψη
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <FileViewerModal open={!!viewer} onOpenChange={o => { if (!o) setViewer(null) }} file={viewer} />
    </li>
  )
}
