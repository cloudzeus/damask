'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LuLoaderCircle } from 'react-icons/lu'
import { listApplicationExpenseCategories, type ExpenseCategoryOption } from '@/lib/pm/actions'
import { listApplicationExpenses, type ProgramExpenseItem } from '@/lib/programs/actions'
import { ExpenseList } from '@/components/programs/expense-list'
import { BudgetCompliancePanel } from './budget-compliance-panel'
import { ReplaceExpenseDialog } from './replace-expense-dialog'

function formatEUR(v: number): string {
  return `${v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/**
 * «Δαπάνες & Πλάνο» tab (Task 13, C2a.2 Task 6) — wrapper γύρω από το
 * πραγματικό <ExpenseList> (C3, Task 15, src/components/programs/
 * expense-list.tsx) ΣΥΝ δύο νέα κομμάτια πάνω από αυτό:
 *  1. <BudgetCompliancePanel> — live snapshot δαπανηθέντος vs ορίων ανά
 *     κατηγορία (getBudgetCompliance).
 *  2. Συμπαγής λίστα «Αντικατάσταση δαπανών» — το ExpenseList δεν έχει
 *     αφή αντικατάστασης (δεν το πειράζουμε, C3-owned), οπότε το affordance
 *     ζει εδώ: ACTIVE δαπάνες → κουμπί «Αντικατάσταση» (ReplaceExpenseDialog),
 *     REPLACED δαπάνες → dimmed/strikethrough + pill «Αντικαταστάθηκε», χωρίς
 *     κουμπί.
 * Μετά από επιτυχή αντικατάσταση: bump `refreshKey` (ξαναφορτώνει το
 * compliance panel), ξαναφόρτωμα της τοπικής λίστας αντικατάστασης, KAI
 * remount του <ExpenseList> μέσω key={refreshKey} (ώστε να ξαναφορτώσει τις
 * δικές του δαπάνες) + router.refresh() (mirror obligations-tab.tsx idiom).
 *
 * Χρησιμοποιεί listApplicationExpenseCategories(applicationId) (pm-scoped,
 * @/lib/pm/actions) αντί για getProgramExpenseCategories(programId)
 * (@/lib/programs/actions, κλειδωμένο πίσω από programs.manage) — αλλιώς
 * ένας assigned pm.work χρήστης (MANAGER/EMPLOYEE) βλέπει throw στο tab, ενώ
 * έχει ήδη ορατότητα στην αίτηση μέσω requireVisibleApplication. Το
 * programId prop μένει (το χρησιμοποιεί ο caller/άλλα σημεία) αλλά δεν
 * χρειάζεται πια εδώ.
 */
export function ExpensesTab({ applicationId, programId }: { applicationId: string; programId: string }) {
  void programId
  const router = useRouter()
  const [categories, setCategories] = React.useState<ExpenseCategoryOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    listApplicationExpenseCategories(applicationId)
      .then(setCategories)
      .catch(() => setError('Η φόρτωση των κατηγοριών δαπανών απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  function handleReplaced() {
    setRefreshKey(k => k + 1)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <BudgetCompliancePanel applicationId={applicationId} refreshKey={refreshKey} />

      <ReplaceExpensesSection applicationId={applicationId} refreshKey={refreshKey} onReplaced={handleReplaced} />

      <section className="glass rounded-[22px] p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
          </div>
        ) : error ? (
          <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
        ) : (
          <ExpenseList key={refreshKey} applicationId={applicationId} categories={categories} />
        )}
      </section>
    </div>
  )
}

/** Συμπαγής λίστα δαπανών με αφή αντικατάστασης — βλ. σχόλιο στο ExpensesTab. */
function ReplaceExpensesSection({
  applicationId, refreshKey, onReplaced,
}: {
  applicationId: string
  refreshKey: number
  onReplaced: () => void
}) {
  const [expenses, setExpenses] = React.useState<ProgramExpenseItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    listApplicationExpenses(applicationId)
      .then(setExpenses)
      .catch(() => setError('Η φόρτωση των δαπανών απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId, refreshKey])

  if (loading || error || expenses.length === 0) {
    return null
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αντικατάσταση δαπανών
      </div>
      <div className="flex flex-col gap-1.5">
        {expenses.map(e => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2"
          >
            <div className={e.status === 'REPLACED' ? 'text-muted-foreground line-through' : undefined}>
              <span className="text-[12.5px] font-semibold">{e.description}</span>{' '}
              <span className="text-[11.5px] text-muted-foreground">{formatEUR(e.amount)}</span>
            </div>
            {e.status === 'REPLACED' ? (
              <span className="badge-pill muted shrink-0">Αντικαταστάθηκε</span>
            ) : (
              <ReplaceExpenseDialog
                expense={{
                  id: e.id,
                  description: e.description,
                  amount: e.amount,
                  vatAmount: e.vatAmount,
                  date: e.date,
                  vendor: e.vendor,
                  docNumber: e.docNumber,
                }}
                onReplaced={onReplaced}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
