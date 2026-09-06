'use client'

import * as React from 'react'
import Link from 'next/link'
import { LuLoaderCircle, LuBriefcase } from 'react-icons/lu'
import { listTrdrApplications, type TrdrApplicationItem } from '@/lib/pm/actions'
import { stageLabel, verdictLabel } from '@/lib/pm/types'

/**
 * «Έργα» panel στην καρτέλα συναλλασσόμενου (Task 13) — οι αιτήσεις
 * προγραμμάτων στις οποίες συμμετέχει ο πελάτης, ΟΡΑΤΕΣ στον τρέχοντα
 * χρήστη (visibleApplicationWhere μέσα στο listTrdrApplications). Self-
 * fetching client component, mirror του idiom στο financials-tab.tsx.
 *
 * ΣΗΜΕΙΩΣΗ: η σελίδα /partners/[id] δεν υπολογίζει pm.* δικαιώματα — αυτό
 * το panel γίνεται render ΑΝΕΞΑΡΤΗΤΑ, και η ίδια η ενέργεια ξαναελέγχει με
 * requirePmAccess. Αν ο τρέχων χρήστης δεν έχει καθόλου πρόσβαση PM (π.χ.
 * βλέπει την καρτέλα πελάτη μόνο με customer.view), η κλήση αποτυγχάνει· σε
 * αυτή την περίπτωση το panel κρύβεται σιωπηλά αντί να δείχνει ανησυχητικό
 * μήνυμα σφάλματος σε χρήστες που δεν έχουν καμία σχέση με το PM module.
 */
export function TrdrApplicationsTab({ trdrId }: { trdrId: string }) {
  const [applications, setApplications] = React.useState<TrdrApplicationItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [hidden, setHidden] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    listTrdrApplications(trdrId)
      .then(rows => { if (!cancelled) setApplications(rows) })
      .catch(() => { if (!cancelled) setHidden(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trdrId])

  if (hidden) return null

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Έργα ({applications.length})
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : applications.length === 0 ? (
        <p className="py-6 text-center text-[0.78125rem] text-muted-foreground">Ο πελάτης δεν συμμετέχει σε έργα.</p>
      ) : (
        <div className="flex flex-col">
          {applications.map(app => (
            <Link
              key={app.id}
              href={`/programs/${app.programId}/applications/${app.id}`}
              className="dotted-row-bottom flex flex-wrap items-center gap-2.5 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="avatar-ring size-8 shrink-0 text-[0.6875rem]">
                <LuBriefcase className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <b className="text-[0.8125rem]">{app.programTitle}</b>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="badge-pill info">{stageLabel(app.stage)}</span>
                  <span className="badge-pill muted">{verdictLabel(app.assessmentVerdict)}</span>
                  {app.managerName && (
                    <span className="text-[0.71875rem] text-muted-foreground">Διαχειριστής: {app.managerName}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
