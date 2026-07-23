'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { LuFileText, LuEuro, LuPercent, LuCalendar, LuBuilding2, LuHash, LuRefreshCw, LuTriangleAlert } from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { replaceExpense } from '@/lib/pm/actions'

export type ReplaceableExpense = {
  id: string
  description: string
  amount: number
  vatAmount: number | null
  date: string | null
  vendor: string | null
  docNumber: string | null
}

type FormValues = {
  description: string
  amount: string
  vatAmount: string
  date: string
  vendor: string
  docNumber: string
}

function formValuesFrom(e: ReplaceableExpense): FormValues {
  return {
    description: e.description,
    amount: String(e.amount),
    vatAmount: e.vatAmount != null ? String(e.vatAmount) : '',
    date: e.date ? e.date.slice(0, 10) : '',
    vendor: e.vendor ?? '',
    docNumber: e.docNumber ?? '',
  }
}

/**
 * C2a.2 (Task 5) — αντικατάσταση δαπάνης: φόρμα προσυμπληρωμένη με τα
 * στοιχεία της παλιάς δαπάνης, mirror του πεδίου/validation idiom του C3
 * new-expense-dialog.tsx. Καλεί replaceExpense(expense.id, input)
 * (@/lib/pm/actions) — η παλιά δαπάνη μαρκάρεται REPLACED, η νέα ACTIVE με
 * replacesExpenseId→παλιά. Self-contained trigger + Dialog (mirror
 * AddObligationDialog idiom στο obligations-tab.tsx) ώστε να τοποθετείται
 * απευθείας ανά γραμμή δαπάνης στο expenses-tab.tsx.
 */
export function ReplaceExpenseDialog({ expense, onReplaced }: { expense: ReplaceableExpense; onReplaced: () => void }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<FormValues>(() => formValuesFrom(expense))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function set<K extends keyof FormValues>(key: K, value: string) {
    setValues(v => ({ ...v, [key]: value }))
  }

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (next) {
      setValues(formValuesFrom(expense))
      setErrors({})
    }
    setOpen(next)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!values.description.trim()) nextErrors.description = 'Η περιγραφή είναι υποχρεωτική.'
    const amountNum = Number(values.amount.trim().replace(',', '.'))
    if (!values.amount.trim() || !Number.isFinite(amountNum) || amountNum < 0) {
      nextErrors.amount = 'Συμπλήρωσε έγκυρο ποσό.'
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const vatNum = values.vatAmount.trim() ? Number(values.vatAmount.trim().replace(',', '.')) : null
      await replaceExpense(expense.id, {
        description: values.description.trim(),
        amount: amountNum,
        vatAmount: vatNum != null && Number.isFinite(vatNum) ? vatNum : null,
        date: values.date || null,
        vendor: values.vendor.trim() || null,
        docNumber: values.docNumber.trim() || null,
      })
      toast.success('Η δαπάνη αντικαταστάθηκε.')
      onReplaced()
      handleOpenChange(false)
    } catch {
      toast.error('Η αντικατάσταση απέτυχε.')
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <LuRefreshCw className="size-3.5" aria-hidden /> Αντικατάσταση
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Αντικατάσταση δαπάνης</DialogTitle>
            <DialogDescription>
              Η νέα δαπάνη θα αντικαταστήσει την υπάρχουσα. Η παλιά δαπάνη θα παραμείνει στο ιστορικό,
              μαρκαρισμένη ως αντικατασταθείσα.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-1 flex items-start gap-1.5 rounded-lg p-2.5 text-[11.5px]" style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}>
            <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Η τρέχουσα δαπάνη «{expense.description}» θα μαρκαριστεί ως αντικατασταθείσα και δεν θα προσμετράται πλέον στο πλάνο δαπανών.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field !mb-0">
              <label htmlFor="re-desc">Περιγραφή*</label>
              <div className="inwrap">
                <LuFileText aria-hidden />
                <input id="re-desc" value={values.description} onChange={e => set('description', e.target.value)} disabled={saving} autoFocus />
              </div>
              {errors.description && <div className="error">{errors.description}</div>}
            </div>

            <div className="grid grid-cols-2 gap-x-3">
              <div className="field !mb-0">
                <label htmlFor="re-amount">Ποσό (€)*</label>
                <div className="inwrap">
                  <LuEuro aria-hidden />
                  <input id="re-amount" inputMode="decimal" value={values.amount} onChange={e => set('amount', e.target.value)} disabled={saving} />
                </div>
                {errors.amount && <div className="error">{errors.amount}</div>}
              </div>

              <div className="field !mb-0">
                <label htmlFor="re-vat">ΦΠΑ (€)</label>
                <div className="inwrap">
                  <LuPercent aria-hidden />
                  <input id="re-vat" inputMode="decimal" value={values.vatAmount} onChange={e => set('vatAmount', e.target.value)} disabled={saving} />
                </div>
              </div>
            </div>

            <div className="field !mb-0">
              <label htmlFor="re-date">Ημερομηνία</label>
              <div className="inwrap">
                <LuCalendar aria-hidden />
                <input id="re-date" type="date" value={values.date} onChange={e => set('date', e.target.value)} disabled={saving} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3">
              <div className="field !mb-0">
                <label htmlFor="re-vendor">Προμηθευτής</label>
                <div className="inwrap">
                  <LuBuilding2 aria-hidden />
                  <input id="re-vendor" value={values.vendor} onChange={e => set('vendor', e.target.value)} disabled={saving} />
                </div>
              </div>

              <div className="field !mb-0">
                <label htmlFor="re-doc">Αρ. παραστατικού</label>
                <div className="inwrap">
                  <LuHash aria-hidden />
                  <input id="re-doc" value={values.docNumber} onChange={e => set('docNumber', e.target.value)} disabled={saving} />
                </div>
              </div>
            </div>

            <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
              <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
              <Button type="submit" disabled={saving}>
                {saving ? 'Αντικατάσταση…' : (<><LuRefreshCw className="size-3.5" aria-hidden /> Αντικατάσταση</>)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
