'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuPlus, LuTrash2, LuLoaderCircle, LuWallet, LuChevronDown, LuChevronUp, LuLock } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listPaymentRequests, createPaymentRequest, deletePaymentRequest, setPaymentRequestStatus,
  listPaymentEligibleExpenses, addExpenseToRequest, removeExpenseFromRequest,
  type PaymentRequestItem, type PaymentEligibleExpenseItem,
} from '@/lib/pm/actions'
import { paymentStatusLabel, nextPaymentStatuses, type PaymentStatusStr } from '@/lib/pm/payment'

function formatEUR(v: number): string {
  return `${v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/** Ενέργεια-ρήμα ανά μετάβαση κατάστασης (διαφορετικό από paymentStatusLabel,
 * που περιγράφει το ΑΠΟΤΕΛΕΣΜΑ π.χ. «Υποβλήθηκε» — εδώ θέλουμε την ΕΝΕΡΓΕΙΑ
 * του κουμπιού π.χ. «Υποβολή»). */
const TRANSITION_ACTION_LABEL: Record<PaymentStatusStr, string> = {
  DRAFT: 'Επαναφορά',
  SUBMITTED: 'Υποβολή',
  APPROVED: 'Έγκριση',
  PAID: 'Πληρωμή',
  REJECTED: 'Απόρριψη',
}

/**
 * «Αποπληρωμές» tab (C2f) — δόσεις πληρωμής (PaymentRequest) της αίτησης:
 * λίστα/δημιουργία δόσεων, μετάβαση κατάστασης DRAFT→SUBMITTED→APPROVED→
 * PAID/REJECTED, και (μόνο σε DRAFT) διαχείριση ποιες πιστοποιημένες δαπάνες
 * διεκδικεί κάθε δόση (listPaymentEligibleExpenses/addExpenseToRequest/
 * removeExpenseFromRequest). Self-fetching client component, mirror του
 * idiom certification-tab.tsx / expenses-tab.tsx.
 */
export function PaymentsTab({ applicationId }: { applicationId: string }) {
  const router = useRouter()
  const [requests, setRequests] = React.useState<PaymentRequestItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    listPaymentRequests(applicationId)
      .then(setRequests)
      .catch(() => setError('Η φόρτωση των δόσεων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  React.useEffect(() => { load() }, [load])

  function handleMutated() {
    load()
    router.refresh()
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Αποπληρωμές ({requests.length})
        </div>
        <NewPaymentRequestDialog applicationId={applicationId} onCreated={handleMutated} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuWallet className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">Δεν υπάρχουν δόσεις.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map(r => (
            <PaymentRequestCard key={r.id} request={r} applicationId={applicationId} onMutated={handleMutated} />
          ))}
        </div>
      )}
    </section>
  )
}

/* ── Status badge — DRAFT muted, SUBMITTED info, APPROVED/PAID ok (πράσινο),
 * REJECTED coral inline-style (mirror VerdictBadge INELIGIBLE στο
 * application-hub.tsx). ── */
function StatusBadge({ status }: { status: PaymentStatusStr }) {
  if (status === 'DRAFT') return <span className="badge-pill muted shrink-0">{paymentStatusLabel(status)}</span>
  if (status === 'SUBMITTED') return <span className="badge-pill info shrink-0">{paymentStatusLabel(status)}</span>
  if (status === 'APPROVED' || status === 'PAID') return <span className="badge-pill ok shrink-0">{paymentStatusLabel(status)}</span>
  return (
    <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
      {paymentStatusLabel(status)}
    </span>
  )
}

function PaymentRequestCard({
  request: r, applicationId, onMutated,
}: {
  request: PaymentRequestItem
  applicationId: string
  onMutated: () => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [transitioning, setTransitioning] = React.useState<PaymentStatusStr | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const overTarget = r.targetAmount != null && r.total > r.targetAmount

  async function handleTransition(to: PaymentStatusStr) {
    if (transitioning) return
    let paidAmount: number | undefined
    if (to === 'PAID') {
      const input = window.prompt('Ποσό πληρωμής (€):', r.total.toFixed(2))
      if (input === null) return
      const parsed = Number(input.replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error('Μη έγκυρο ποσό πληρωμής.')
        return
      }
      paidAmount = parsed
    }
    setTransitioning(to)
    try {
      await setPaymentRequestStatus(r.id, to, to === 'PAID' ? { paidAmount } : undefined)
      toast.success('Η κατάσταση της δόσης ενημερώθηκε.')
      onMutated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η μετάβαση κατάστασης απέτυχε.')
    } finally {
      setTransitioning(null)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Διαγραφή της ${r.ordinal}ης δόσης;`)) return
    setDeleting(true)
    try {
      await deletePaymentRequest(r.id)
      toast.success('Η δόση διαγράφηκε.')
      onMutated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η διαγραφή απέτυχε.')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[13px] font-semibold">{r.ordinal}η δόση</span>
          {r.title && <span className="text-[12.5px] text-muted-foreground"> — {r.title}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={r.status} />
          {r.status === 'DRAFT' && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Διαγραφή — ${r.ordinal}η δόση`}
              title="Διαγραφή"
            >
              <LuTrash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        <span>
          Σύνολο: <span className={cn('font-semibold', overTarget && 'text-coral')}>{formatEUR(r.total)}</span>
        </span>
        <span className="text-muted-foreground">{r.expenseCount} δαπάνες</span>
        {r.targetAmount != null && (
          <span className={cn('text-muted-foreground', overTarget && 'font-semibold text-coral')}>
            στόχος: {formatEUR(r.targetAmount)}
          </span>
        )}
        {r.status === 'PAID' && r.paidAmount != null && (
          <span className="text-muted-foreground">πληρώθηκε: {formatEUR(r.paidAmount)}</span>
        )}
      </div>

      {nextPaymentStatuses(r.status).length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {nextPaymentStatuses(r.status).map(to => (
            <Button
              key={to}
              type="button"
              size="sm"
              variant={to === 'REJECTED' ? 'destructive' : to === 'DRAFT' ? 'outline' : 'default'}
              onClick={() => handleTransition(to)}
              disabled={transitioning !== null}
            >
              {transitioning === to ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
              {TRANSITION_ACTION_LABEL[to]}
            </Button>
          ))}
        </div>
      )}

      {r.status === 'DRAFT' ? (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={expanded}
          >
            {expanded ? <LuChevronUp className="size-3.5" aria-hidden /> : <LuChevronDown className="size-3.5" aria-hidden />}
            Διαχείριση δαπανών
          </button>
          {expanded && (
            <div className="mt-2.5">
              <ExpensePicker applicationId={applicationId} requestId={r.id} onChanged={onMutated} />
            </div>
          )}
        </div>
      ) : (
        <div
          className="mt-2.5 flex items-center gap-1.5 pt-2.5 text-[11.5px] text-muted-foreground"
          style={{ borderTop: '1px dotted var(--dotted)' }}
        >
          <LuLock className="size-3" aria-hidden /> Κλειδωμένη — οι δαπάνες δεν επεξεργάζονται σε αυτή την κατάσταση.
        </div>
      )}
    </div>
  )
}

/** Picker επιλέξιμων δαπανών για μία DRAFT δόση — listPaymentEligibleExpenses
 * ξεχωρίζει: ήδη-σε-αυτή-τη-δόση (Αφαίρεση), επιλέξιμες-διαθέσιμες
 * (Προσθήκη), μη επιλέξιμες (dimmed + λόγος). Μετά από κάθε mutation
 * ξαναφορτώνει τοπικά ΚΑΙ ειδοποιεί τον γονέα (onChanged) ώστε να
 * ανανεωθούν τα σύνολα/expenseCount στην κάρτα της δόσης. */
function ExpensePicker({
  applicationId, requestId, onChanged,
}: {
  applicationId: string
  requestId: string
  onChanged: () => void
}) {
  const [items, setItems] = React.useState<PaymentEligibleExpenseItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    listPaymentEligibleExpenses(applicationId, requestId)
      .then(setItems)
      .catch(() => setError('Η φόρτωση των δαπανών απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId, requestId])

  React.useEffect(() => { load() }, [load])

  async function handleAdd(expenseId: string) {
    setPending(expenseId)
    try {
      await addExpenseToRequest(requestId, expenseId)
      load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η προσθήκη δαπάνης απέτυχε.')
    } finally {
      setPending(null)
    }
  }

  async function handleRemove(expenseId: string) {
    setPending(expenseId)
    try {
      await removeExpenseFromRequest(expenseId)
      load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αφαίρεση δαπάνης απέτυχε.')
    } finally {
      setPending(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted-foreground">
        <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Φόρτωση…
      </div>
    )
  }
  if (error) return <p className="py-2 text-center text-[12px] text-coral">{error}</p>
  if (items.length === 0) return <p className="py-2 text-center text-[12px] text-muted-foreground">Δεν υπάρχουν ενεργές δαπάνες.</p>

  const included = items.filter(i => i.inThisRequest)
  const available = items.filter(i => !i.inThisRequest && i.eligible)
  const ineligible = items.filter(i => !i.inThisRequest && !i.eligible)

  return (
    <div className="flex flex-col gap-2.5">
      {included.length > 0 && (
        <div>
          <div className="mb-1 text-[10.5px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            Σε αυτή τη δόση ({included.length})
          </div>
          <div className="flex flex-col gap-1">
            {included.map(i => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
                <span className="min-w-0 truncate text-[12px]">
                  {i.description} <span className="text-muted-foreground">{formatEUR(i.amount)}</span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => handleRemove(i.id)} disabled={pending === i.id}>
                  Αφαίρεση
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {available.length > 0 && (
        <div>
          <div className="mb-1 text-[10.5px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            Διαθέσιμες ({available.length})
          </div>
          <div className="flex flex-col gap-1">
            {available.map(i => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
                <span className="min-w-0 truncate text-[12px]">
                  {i.description} <span className="text-muted-foreground">{formatEUR(i.amount)}</span>
                </span>
                <Button type="button" size="sm" onClick={() => handleAdd(i.id)} disabled={pending === i.id}>
                  Προσθήκη
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {ineligible.length > 0 && (
        <div>
          <div className="mb-1 text-[10.5px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            Μη επιλέξιμες ({ineligible.length})
          </div>
          <div className="flex flex-col gap-1">
            {ineligible.map(i => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 opacity-60">
                <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                  {i.description} {formatEUR(i.amount)}
                </span>
                <span className="badge-pill muted shrink-0">{i.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NewPaymentRequestDialog({ applicationId, onCreated }: { applicationId: string; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [targetAmount, setTargetAmount] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (!next) { setTitle(''); setTargetAmount('') }
    setOpen(next)
  }

  async function handleCreate() {
    const trimmedTarget = targetAmount.trim()
    let parsedTarget: number | null = null
    if (trimmedTarget) {
      parsedTarget = Number(trimmedTarget.replace(',', '.'))
      if (!Number.isFinite(parsedTarget) || parsedTarget < 0) {
        toast.error('Μη έγκυρος στόχος ποσού.')
        return
      }
    }
    setSaving(true)
    try {
      await createPaymentRequest(applicationId, { title: title.trim() || null, targetAmount: parsedTarget })
      toast.success('Η δόση δημιουργήθηκε.')
      onCreated()
      handleOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η δημιουργία της δόσης απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <LuPlus className="size-3.5" aria-hidden /> Νέα δόση
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Νέα δόση</DialogTitle>
            <DialogDescription>Πρόσθεσε μια νέα δόση αποπληρωμής για αυτή την αίτηση.</DialogDescription>
          </DialogHeader>

          <div className="field !mb-0">
            <label htmlFor="pr-new-title">Τίτλος (προαιρετικό)</label>
            <Input
              id="pr-new-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="π.χ. Α΄ δόση"
              autoFocus
              autoComplete="off"
              disabled={saving}
            />
          </div>

          <div className="field !mb-0">
            <label htmlFor="pr-new-target">Στόχος ποσού € (προαιρετικό)</label>
            <Input
              id="pr-new-target"
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)}
              placeholder="π.χ. 5000"
              inputMode="decimal"
              disabled={saving}
            />
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving ? 'Δημιουργία…' : (<><LuPlus className="size-3.5" aria-hidden /> Δημιουργία</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
