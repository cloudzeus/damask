'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LuPencilRuler, LuSend, LuPackageCheck } from 'react-icons/lu'
import { listApplicationExpenseCategories, type ExpenseCategoryOption } from '@/lib/pm/actions'
import { listApplicationExpenses, type ProgramExpenseItem } from '@/lib/programs/actions'
import { STAGE_ORDER, type StageStr } from '@/lib/pm/types'
import { ProgramInvoiceDialog } from '@/components/invoices/program-invoice-dialog'
import { BudgetProposalPanel } from '@/components/programs/budget-proposal'
import { PurchaseDocsPanel } from '@/components/programs/purchase-docs-panel'
import { InspectionExportPanel } from '@/components/programs/inspection-export-panel'
import { ReplaceExpenseDialog } from './replace-expense-dialog'

function formatEUR(v: number): string {
  return `${v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/** Οι 3 φάσεις του workflow, αντιστοιχισμένες στα στάδια (StageStr):
 *  - PLANNING (ASSESSMENT…EXPENSES_DELIVERABLES): προδιαγράφουμε το σχέδιο.
 *  - SUBMISSION (OPSKE_SUBMISSION): υποβολή & αναμονή έγκρισης.
 *  - IMPLEMENTATION (INSPECTION, MONITORING): αγορές & αποπληρωμή. */
type Phase = 'PLANNING' | 'SUBMISSION' | 'IMPLEMENTATION'
function phaseOf(stage: StageStr): Phase {
  const i = STAGE_ORDER.indexOf(stage)
  if (i >= STAGE_ORDER.indexOf('INSPECTION')) return 'IMPLEMENTATION'
  if (i === STAGE_ORDER.indexOf('OPSKE_SUBMISSION')) return 'SUBMISSION'
  return 'PLANNING'
}
const PHASE_BANNER: Record<Phase, { icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; title: string; hint: string }> = {
  PLANNING: { icon: LuPencilRuler, title: 'Στάδιο μελέτης — Σχέδιο δαπανών', hint: 'Προδιαγράφεις τις δαπάνες/προσφορές ανά κατηγορία. Όταν το σχέδιο και τα δικαιολογητικά είναι έτοιμα, προχωράς στην υποβολή (tab «ΟΠΣΚΕ»).' },
  SUBMISSION: { icon: LuSend, title: 'Υποβολή & έγκριση', hint: 'Το σχέδιο δαπανών κλειδώνει για υποβολή. Η υποβολή/έγκριση γίνεται από το tab «ΟΠΣΚΕ». Μετά την έγκριση ξεκινούν οι αγορές.' },
  IMPLEMENTATION: { icon: LuPackageCheck, title: 'Υλοποίηση — αγορές & αποπληρωμή', hint: 'Καταχωρείς τις πραγματικές αγορές (παραστατικό/extrait/serial/βεβαίωση) και υποβάλλεις αίτημα αποπληρωμής (tab «Αποπληρωμές»). Τροποποιήσεις εγκεκριμένων δαπανών γίνονται εδώ.' },
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
 *
 * Header (W4 T2): <ProgramInvoiceDialog> — «Καταχώριση από OCR» (upload
 * τιμολογίου → processProgramInvoice, src/lib/invoice-flows/program.ts) ίδιο
 * refreshKey pattern με το replace flow παρακάτω.
 */
export function ExpensesTab({ applicationId, programId, stage }: { applicationId: string; programId: string; stage: StageStr }) {
  void programId
  const router = useRouter()
  const phase = phaseOf(stage)
  const isImplementation = phase === 'IMPLEMENTATION'
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

  function refreshExpenses() {
    setRefreshKey(k => k + 1)
    router.refresh()
  }

  const banner = PHASE_BANNER[phase]
  const BannerIcon = banner.icon

  return (
    <div className="flex flex-col gap-4">
      {/* Phase banner — δείχνει τι ισχύει στο τρέχον στάδιο, ώστε ο χρήστης
          να μη μπερδεύεται με affordances άλλης φάσης. */}
      <div className="flex items-start gap-3 rounded-[18px] border border-border bg-muted/40 px-4 py-3">
        <BannerIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <div className="text-[0.8125rem] font-semibold">{banner.title}</div>
          <p className="mt-0.5 text-[0.71875rem] text-muted-foreground">{banner.hint}</p>
        </div>
        {/* «Καταχώριση από OCR» (πραγματικό παραστατικό) — μόνο στη φάση υλοποίησης. */}
        {isImplementation && !loading && !error && (
          <div className="ml-auto shrink-0">
            <ProgramInvoiceDialog applicationId={applicationId} categories={categories} onCreated={refreshExpenses} />
          </div>
        )}
      </div>

      {/* Σχέδιο δαπανών — expandable κατηγορίες, δαπάνες μία-μία + όρια + PDF. */}
      <BudgetProposalPanel key={refreshKey} applicationId={applicationId} />

      {/* Στοιχεία αγορών & τεκμηρίωση — μόνο post-approval (φάση υλοποίησης). */}
      {isImplementation && <PurchaseDocsPanel key={`p-${refreshKey}`} applicationId={applicationId} />}

      {/* Επιτόπιος έλεγχος — εξαγωγές Excel/Word για τον ελεγκτή. */}
      {isImplementation && <InspectionExportPanel applicationId={applicationId} />}

      {/* Αντικατάσταση δαπανών — μόνο post-approval (φάση υλοποίησης). */}
      {isImplementation && (
        <ReplaceExpensesSection applicationId={applicationId} refreshKey={refreshKey} onReplaced={refreshExpenses} />
      )}
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
      <div className="dotted-leader mb-3 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αντικατάσταση δαπανών
      </div>
      <div className="flex flex-col gap-1.5">
        {expenses.map(e => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2"
          >
            <div className={e.status === 'REPLACED' ? 'text-muted-foreground line-through' : undefined}>
              <span className="text-[0.78125rem] font-semibold">{e.description}</span>{' '}
              <span className="text-[0.71875rem] text-muted-foreground">{formatEUR(e.amount)}</span>
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
