'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileCheck2, Check, X, Download } from 'lucide-react'
import { listMyPendingReviews, reviewFileRequestItem, type PendingReviewRow } from '@/lib/file-requests/review'
import { relativeTime } from '@/lib/relative-time'

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
                <button
                  type="button"
                  onClick={() => handleReview(r.itemId, 'ACCEPTED')}
                  disabled={rowBusy}
                  className="inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
                >
                  <Check className="size-4" strokeWidth={2} />
                  Έγκριση
                </button>
                <button
                  type="button"
                  onClick={() => handleReview(r.itemId, 'REJECTED')}
                  disabled={rowBusy}
                  className="inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'color-mix(in srgb, var(--destructive) 14%, transparent)', color: 'var(--destructive)' }}
                >
                  <X className="size-4" strokeWidth={2} />
                  Απόρριψη
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
