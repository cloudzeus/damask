'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  LuPlus, LuEuro, LuFileText, LuUser, LuMail, LuCopy, LuCreditCard, LuLandmark, LuCircleCheck,
} from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createPayment, type CreatePaymentResult } from './actions'

type CustomerOption = { id: string; name: string; email: string | null }

const FREE_TEXT_CUSTOMER = '__free__'

/**
 * Parse ελεύθερης μορφής ποσού → λεπτά (int). Δέχεται ελληνική μορφή
 * (1.234,56 — τελεία=χιλιάδες, κόμμα=δεκαδικό) ΚΑΙ απλή μορφή με τελεία ως
 * δεκαδικό (1234.56) όταν δεν υπάρχει κόμμα καθόλου — δεν προσπαθεί να
 * υποστηρίξει τις δύο συμβάσεις ταυτόχρονα στο ίδιο string (ασαφές).
 */
function parseEuroToCents(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const hasComma = trimmed.includes(',')
  const normalized = hasComma ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function copyText(text: string, okMessage: string) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success(okMessage))
    .catch(() => toast.error('Αποτυχία αντιγραφής.'))
}

export function NewPaymentButton({ customers, bankInstructions }: { customers: CustomerOption[]; bankInstructions: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <LuPlus className="size-3.5" aria-hidden /> Νέα πληρωμή
      </Button>
      <NewPaymentDialog open={open} onOpenChange={setOpen} customers={customers} bankInstructions={bankInstructions} />
    </>
  )
}

function NewPaymentDialog({
  open, onOpenChange, customers, bankInstructions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: CustomerOption[]
  bankInstructions: string
}) {
  const [amountInput, setAmountInput] = useState('')
  const [description, setDescription] = useState('')
  const [customerId, setCustomerId] = useState<string>(FREE_TEXT_CUSTOMER)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Extract<CreatePaymentResult, { ok: true }> | null>(null)
  const [pending, startTransition] = useTransition()

  function resetForm() {
    setAmountInput('')
    setDescription('')
    setCustomerId(FREE_TEXT_CUSTOMER)
    setCustomerName('')
    setCustomerEmail('')
    setAmountError(null)
    setFieldErrors({})
    setResult(null)
  }

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) resetForm()
    onOpenChange(next)
  }

  function handleSelectCustomer(id: string) {
    setCustomerId(id)
    const match = customers.find(c => c.id === id)
    setCustomerName(match?.name ?? '')
    setCustomerEmail(match?.email ?? '')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuroToCents(amountInput)
    if (cents === null) {
      setAmountError('Το ποσό δεν είναι έγκυρο (π.χ. 49,90).')
      return
    }
    setAmountError(null)

    startTransition(async () => {
      const res = await createPayment({
        amountCents: cents,
        description,
        customerId: customerId === FREE_TEXT_CUSTOMER ? undefined : customerId,
        customerName: customerName || undefined,
        customerEmail: customerEmail || undefined,
      })
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      setFieldErrors({})
      setResult(res)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[520px]">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Νέα πληρωμή</DialogTitle>
              <DialogDescription>
                Δημιουργεί μοναδικό κωδικό πληρωμής Viva — ο πελάτης μπορεί να πληρώσει με κάρτα (link) ή με τραπεζική κατάθεση (κωδικός ως αιτιολογία).
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                <div className="field">
                  <label htmlFor="np-amount">Ποσό (€)*</label>
                  <div className="inwrap">
                    <LuEuro aria-hidden />
                    <input
                      id="np-amount" inputMode="decimal" value={amountInput}
                      onChange={e => { setAmountInput(e.target.value); setAmountError(null) }}
                      placeholder="49,90" required disabled={pending} autoFocus
                    />
                  </div>
                  {amountError && <div className="error">{amountError}</div>}
                  {fieldErrors.amountCents && !amountError && <div className="error">{fieldErrors.amountCents}</div>}
                </div>
                <div className="field">
                  <label htmlFor="np-description">Περιγραφή*</label>
                  <div className="inwrap">
                    <LuFileText aria-hidden />
                    <input
                      id="np-description" value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="π.χ. Προκαταβολή παραγγελίας #142" required disabled={pending}
                    />
                  </div>
                  {fieldErrors.description && <div className="error">{fieldErrors.description}</div>}
                </div>
              </div>

              <div className="field">
                <label htmlFor="np-customer">Πελάτης</label>
                <Select value={customerId} onValueChange={v => handleSelectCustomer(v as string)} disabled={pending}>
                  <SelectTrigger id="np-customer" aria-label="Πελάτης" className="h-11 w-full rounded-full border-border bg-card px-4">
                    <SelectValue>
                      {(v: string) => (v === FREE_TEXT_CUSTOMER ? 'Ελεύθερο κείμενο (χωρίς καταχωρημένο πελάτη)' : (customers.find(c => c.id === v)?.name ?? 'Επίλεξε…'))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FREE_TEXT_CUSTOMER}>Ελεύθερο κείμενο (χωρίς καταχωρημένο πελάτη)</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {customerId === FREE_TEXT_CUSTOMER && (
                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                  <div className="field">
                    <label htmlFor="np-customer-name">Όνομα πελάτη</label>
                    <div className="inwrap">
                      <LuUser aria-hidden />
                      <input id="np-customer-name" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="π.χ. Ανδρέας Παπαδόπουλος" disabled={pending} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="np-customer-email">Email πελάτη</label>
                    <div className="inwrap">
                      <LuMail aria-hidden />
                      <input id="np-customer-email" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="pelatis@example.gr" disabled={pending} />
                    </div>
                    {fieldErrors.customerEmail && <div className="error">{fieldErrors.customerEmail}</div>}
                  </div>
                </div>
              )}

              <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
                <DialogClose render={<Button type="button" variant="outline" disabled={pending}>Άκυρο</Button>} />
                <Button type="submit" disabled={pending}>
                  {pending ? 'Δημιουργία…' : (<><LuPlus className="size-3.5" aria-hidden /> Δημιουργία πληρωμής</>)}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LuCircleCheck className="size-4" style={{ color: 'var(--success)' }} aria-hidden /> Η πληρωμή δημιουργήθηκε
              </DialogTitle>
              <DialogDescription>Μοιράσου τον κωδικό ή το link με τον πελάτη.</DialogDescription>
            </DialogHeader>

            <div
              className="rounded-2xl border p-4 text-center"
              style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
            >
              <div className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Μοναδικός κωδικός πληρωμής</div>
              <div className="mb-2.5 font-mono text-[26px] leading-none font-bold tracking-wide tabular-nums">{result.orderCode}</div>
              <Button type="button" variant="outline" size="sm" onClick={() => copyText(result.orderCode, 'Ο κωδικός πληρωμής αντιγράφηκε.')}>
                <LuCopy className="size-3.5" aria-hidden /> Αντιγραφή κωδικού
              </Button>
            </div>

            <Button type="button" className="w-full" render={<a href={result.checkoutUrl} target="_blank" rel="noopener noreferrer" />}>
              <LuCreditCard className="size-4" aria-hidden /> Άνοιγμα πληρωμής με κάρτα
            </Button>

            <div className="notice">
              <LuLandmark aria-hidden />
              <div>
                <b>Για τραπεζική κατάθεση:</b> χρησιμοποιήστε τον παραπάνω κωδικό ως αιτιολογία κατάθεσης.
                {bankInstructions.trim() && <p className="mt-1">{bankInstructions}</p>}
              </div>
            </div>

            <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
              <DialogClose render={<Button type="button" variant="outline" onClick={resetForm}>Κλείσιμο</Button>} />
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
