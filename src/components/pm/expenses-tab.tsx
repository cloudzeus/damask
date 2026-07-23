'use client'

import * as React from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { getProgramExpenseCategories, type ExpenseCategoryOption } from '@/lib/programs/actions'
import { ExpenseList } from '@/components/programs/expense-list'

/**
 * «Δαπάνες» tab (Task 13) — λεπτό wrapper γύρω από το πραγματικό
 * <ExpenseList> (C3, Task 15, src/components/programs/expense-list.tsx).
 * Το ExpenseList ήδη αυτο-φορτώνει τις δαπάνες της αίτησης μέσω
 * listApplicationExpenses(applicationId) — το μόνο που λείπει από εδώ είναι
 * οι κατηγορίες δαπανών του ΠΡΟΓΡΑΜΜΑΤΟΣ (getProgramExpenseCategories
 * (programId), mirror του idiom στο applications-panel.tsx).
 */
export function ExpensesTab({ applicationId, programId }: { applicationId: string; programId: string }) {
  const [categories, setCategories] = React.useState<ExpenseCategoryOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    getProgramExpenseCategories(programId)
      .then(setCategories)
      .catch(() => setError('Η φόρτωση των κατηγοριών δαπανών απέτυχε.'))
      .finally(() => setLoading(false))
  }, [programId])

  return (
    <section className="glass rounded-[22px] p-4">
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : (
        <ExpenseList applicationId={applicationId} categories={categories} />
      )}
    </section>
  )
}
