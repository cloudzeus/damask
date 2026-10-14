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
import { ExpenseInboxPanel } from './expense-inbox-panel'
import { AssetRegisterPanel } from './asset-register-panel'
import { ImplementationBoard } from './implementation-board'

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
  IMPLEMENTATION: { icon: LuPackageCheck, title: 'Υλοποίηση — παραστατικά & πληρωμές', hint: 'Για κάθε εγκεκριμένη δαπάνη ανεβάστε τα παραστατικά της και το εξτρέ πληρωμής· η βεβαίωση προμηθευτή συντάσσεται και στέλνεται με ένα κλικ. Το σύστημα ελέγχει αν ταιριάζουν.' },
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
export function ExpensesTab({ applicationId, programId, stage, trdrId, approved = false }: { applicationId: string; programId: string; stage: StageStr; trdrId: string; approved?: boolean }) {
  void programId
  const router = useRouter()
  // Εγκεκριμένο έργο (εγκριτικό / «σε εξέλιξη»): οι δαπάνες είναι ήδη σε υλοποίηση, ακόμη κι αν εκκρεμούν δικαιολογητικά.
  const phase = approved ? 'IMPLEMENTATION' : phaseOf(stage)
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
          <div className="text-[length:var(--fs-13)] font-semibold">{banner.title}</div>
          <p className="mt-0.5 text-[length:var(--fs-11-5)] text-muted-foreground">{banner.hint}</p>
        </div>
        {/* «Καταχώριση από OCR» (πραγματικό παραστατικό) — μόνο στη φάση υλοποίησης. */}
        {isImplementation && !loading && !error && (
          <div className="ml-auto shrink-0">
            <ProgramInvoiceDialog applicationId={applicationId} categories={categories} onCreated={refreshExpenses} />
          </div>
        )}
      </div>

      {isImplementation ? (
        <>
          {/* Κύρια οθόνη υλοποίησης: δαπάνες ανά κατηγορία → παραστατικά + εξτρέ + βεβαίωση + διασταύρωση. */}
          <ImplementationBoard key={`b-${refreshKey}`} applicationId={applicationId} />

          {/* Δευτερεύοντα — κλειστά, ανοίγουν όταν χρειαστούν. */}
          <Fold title="Αρχεία από τη μαζική εισαγωγή («Προς καταχώριση»)" hint="Προσφορές/παραστατικά/εγκριτικά που βρέθηκαν στα αρχεία του πελάτη — ήδη διαβασμένα.">
            <ExpenseInboxPanel key={`i-${refreshKey}`} applicationId={applicationId} trdrId={trdrId} onChanged={refreshExpenses} />
          </Fold>
          <Fold title="Μητρώο παγίων" hint="Διασταύρωση δαπανών με το μητρώο παγίων του λογιστή.">
            <AssetRegisterPanel key={`a-${refreshKey}`} applicationId={applicationId} />
          </Fold>
          <Fold title="Εξαγωγές για τον επιτόπιο έλεγχο" hint="Excel/Word για τον ελεγκτή.">
            <InspectionExportPanel applicationId={applicationId} />
          </Fold>
          <Fold title="Σχέδιο δαπανών & αντικατάσταση δαπάνης" hint="Το εγκεκριμένο σχέδιο, όρια κατηγοριών, αντικατάσταση δαπάνης.">
            <BudgetProposalPanel key={refreshKey} applicationId={applicationId} />
            <ReplaceExpensesSection applicationId={applicationId} refreshKey={refreshKey} onReplaced={refreshExpenses} />
          </Fold>
          <Fold title="Έγγραφα αγορών (παλαιός τρόπος — ένα παραστατικό ανά δαπάνη)" hint="Για έργα που καταχωρίστηκαν πριν από τα παραστατικά ανά κατηγορία.">
            <PurchaseDocsPanel key={`p-${refreshKey}`} applicationId={applicationId} />
          </Fold>
        </>
      ) : (
        <>
          {/* Προσφορές/παραστατικά από τη μαζική εισαγωγή αρχείων του πελάτη — ήδη διαβασμένα. */}
          <ExpenseInboxPanel key={`i-${refreshKey}`} applicationId={applicationId} trdrId={trdrId} onChanged={refreshExpenses} />
          {/* Σχέδιο δαπανών — expandable κατηγορίες, δαπάνες μία-μία + όρια + PDF. */}
          <BudgetProposalPanel key={refreshKey} applicationId={applicationId} />
        </>
      )}
    </div>
  )
}

/** Δευτερεύουσα ενότητα που ανοίγει με κλικ (κρατά την κύρια οθόνη καθαρή). */
function Fold({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-[18px] border border-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground transition-transform duration-200 group-open:rotate-90" aria-hidden>›</span>
        <span className="min-w-0">
          <span className="block text-[length:var(--fs-13)] font-semibold">{title}</span>
          <span className="block text-[length:var(--fs-11-5)] text-muted-foreground">{hint}</span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">{children}</div>
    </details>
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
      <div className="dotted-leader mb-3 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αντικατάσταση δαπανών
      </div>
      <div className="flex flex-col gap-1.5">
        {expenses.map(e => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2"
          >
            <div className={e.status === 'REPLACED' ? 'text-muted-foreground line-through' : undefined}>
              <span className="text-[length:var(--fs-12-5)] font-semibold">{e.description}</span>{' '}
              <span className="text-[length:var(--fs-11-5)] text-muted-foreground">{formatEUR(e.amount)}</span>
            </div>
            {e.status === 'REPLACED' ? (
              <span className="badge-pill muted shrink-0">{expenses.some(x => x.replacesExpenseId === e.id) ? 'Αντικαταστάθηκε' : 'Καταργήθηκε'}</span>
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
