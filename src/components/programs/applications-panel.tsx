'use client'

import { useCallback, useEffect, useState } from 'react'
import { LuChevronDown, LuLoaderCircle, LuBuilding2 } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import {
  listApplications, getProgramExpenseCategories,
  type ProgramApplicationItem, type ExpenseCategoryOption,
} from '@/lib/programs/actions'
import { LinkApplicationDialog } from './link-application-dialog'
import { ExpenseList } from './expense-list'

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ενεργή', APPROVED: 'Εγκεκριμένη', REJECTED: 'Απορρίφθηκε', COMPLETED: 'Ολοκληρώθηκε',
}

/**
 * «Εφαρμογές & Δαπάνες» (Task 15 — payoff του C3): λίστα εταιρειών
 * συνδεδεμένων στο πρόγραμμα (ProgramApplication) με «Σύνδεση εταιρείας»
 * dialog, κάθε γραμμή expand→<ExpenseList> για τις δαπάνες της. Self-
 * fetching client component (mirror FinancialsTab, src/components/tax/
 * financials-tab.tsx) — rendered ως section στο programs/[id]/page.tsx,
 * ΟΧΙ μέσα στο ήδη μεγάλο program-editor.tsx (καθαρότερο διαχωρισμό:
 * ProgramEditor = επεξεργασία των αποδελτιωμένων στοιχείων· αυτό εδώ =
 * λειτουργική ροή C3 πάνω στο πρόγραμμα).
 */
export function ApplicationsPanel({ programId }: { programId: string }) {
  const [applications, setApplications] = useState<ProgramApplicationItem[]>([])
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listApplications(programId), getProgramExpenseCategories(programId)])
      .then(([apps, cats]) => { setApplications(apps); setCategories(cats) })
      .catch(() => setError('Η φόρτωση των εφαρμογών απέτυχε.'))
      .finally(() => setLoading(false))
  }, [programId])

  useEffect(() => { load() }, [load])

  function handleCreated(applicationId: string) {
    load()
    setExpandedId(applicationId)
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Εφαρμογές &amp; Δαπάνες ({applications.length})
        </div>
        <LinkApplicationDialog programId={programId} onCreated={handleCreated} />
      </div>

      {categories.length === 0 && !loading && (
        <p className="mb-3 text-[11.5px] text-muted-foreground">
          Το πρόγραμμα δεν έχει (ακόμη) εξαγμένες κατηγορίες δαπανών — οι προτάσεις κατηγοριοποίησης δεν θα λειτουργήσουν μέχρι να τρέξει η αποδελτίωση.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : applications.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted-foreground">
          Καμία εταιρεία δεν είναι ακόμη συνδεδεμένη με αυτό το πρόγραμμα — σύνδεσε μία για να καταχωρίσεις δαπάνες.
        </p>
      ) : (
        <div className="flex flex-col">
          {applications.map(app => {
            const expanded = expandedId === app.id
            return (
              <div key={app.id} className="dotted-row-bottom py-2.5">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : app.id)}
                  className="flex w-full items-center gap-2.5 text-left"
                  aria-expanded={expanded}
                >
                  <span className="avatar-ring size-8 shrink-0 text-[11px]">
                    <LuBuilding2 className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="text-[13px]">{app.trdrName}</b>
                      <span className="badge-pill info">{STATUS_LABELS[app.status] ?? app.status}</span>
                      <span className="badge-pill muted">
                        {app.expenseCount} δαπάνες{app.expenseCount > 0 ? ` — ${app.confirmedCount} επιβεβαιωμένες` : ''}
                      </span>
                    </div>
                  </div>
                  <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden />
                </button>

                {expanded && (
                  <div className="mt-2.5 pl-[42px]">
                    <ExpenseList applicationId={app.id} categories={categories} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
