'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { LuFileText, LuEuro, LuPercent, LuCalendar, LuBuilding2, LuHash, LuPlus } from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createExpense } from '@/lib/programs/actions'

type FormValues = {
  description: string
  amount: string
  vatAmount: string
  date: string
  vendor: string
  vendorAfm: string
  docNumber: string
}

function emptyForm(): FormValues {
  return { description: '', amount: '', vatAmount: '', date: '', vendor: '', vendorAfm: '', docNumber: '' }
}

/**
 * Φόρμα νέας δαπάνης (Task 15) — createExpense(applicationId, {...}), μετά
 * το onCreated(expenseId) ενημερώνει το ExpenseList ώστε να τρέξει αυτόματα
 * suggestExpenseCategory στη νέα δαπάνη (βλ. expense-list.tsx) — το AI
 * suggestion ΔΕΝ γίνεται εδώ, μόνο δημιουργία.
 */
export function NewExpenseDialog({
  applicationId, open, onOpenChange, onCreated,
}: {
  applicationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (expenseId: string) => void
}) {
  const [values, setValues] = useState<FormValues>(emptyForm())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function set<K extends keyof FormValues>(key: K, value: string) {
    setValues(v => ({ ...v, [key]: value }))
  }

  function reset() {
    setValues(emptyForm())
    setErrors({})
    setSaving(false)
  }

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (!next) reset()
    onOpenChange(next)
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
      const { id } = await createExpense(applicationId, {
        description: values.description.trim(),
        amount: amountNum,
        vatAmount: vatNum != null && Number.isFinite(vatNum) ? vatNum : null,
        date: values.date || null,
        vendor: values.vendor.trim() || null,
        vendorAfm: values.vendorAfm.trim() || null,
        docNumber: values.docNumber.trim() || null,
      })
      toast.success('Η δαπάνη προστέθηκε.')
      onCreated(id)
      handleOpenChange(false)
    } catch {
      toast.error('Η δημιουργία της δαπάνης απέτυχε.')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Νέα δαπάνη</DialogTitle>
          <DialogDescription>Μετά την αποθήκευση, το DeepSeek θα προτείνει αυτόματα κατηγορία δαπάνης.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="field !mb-0">
            <label htmlFor="ne-desc">Περιγραφή*</label>
            <div className="inwrap">
              <LuFileText aria-hidden />
              <input id="ne-desc" value={values.description} onChange={e => set('description', e.target.value)} disabled={saving} autoFocus />
            </div>
            {errors.description && <div className="error">{errors.description}</div>}
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <div className="field !mb-0">
              <label htmlFor="ne-amount">Ποσό (€)*</label>
              <div className="inwrap">
                <LuEuro aria-hidden />
                <input id="ne-amount" inputMode="decimal" value={values.amount} onChange={e => set('amount', e.target.value)} disabled={saving} />
              </div>
              {errors.amount && <div className="error">{errors.amount}</div>}
            </div>

            <div className="field !mb-0">
              <label htmlFor="ne-vat">ΦΠΑ (€)</label>
              <div className="inwrap">
                <LuPercent aria-hidden />
                <input id="ne-vat" inputMode="decimal" value={values.vatAmount} onChange={e => set('vatAmount', e.target.value)} disabled={saving} />
              </div>
            </div>
          </div>

          <div className="field !mb-0">
            <label htmlFor="ne-date">Ημερομηνία</label>
            <div className="inwrap">
              <LuCalendar aria-hidden />
              <input id="ne-date" type="date" value={values.date} onChange={e => set('date', e.target.value)} disabled={saving} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <div className="field !mb-0">
              <label htmlFor="ne-vendor">Προμηθευτής</label>
              <div className="inwrap">
                <LuBuilding2 aria-hidden />
                <input id="ne-vendor" value={values.vendor} onChange={e => set('vendor', e.target.value)} disabled={saving} />
              </div>
            </div>

            <div className="field !mb-0">
              <label htmlFor="ne-vendor-afm">ΑΦΜ προμηθευτή</label>
              <div className="inwrap">
                <LuHash aria-hidden />
                <input id="ne-vendor-afm" value={values.vendorAfm} onChange={e => set('vendorAfm', e.target.value)} disabled={saving} />
              </div>
            </div>
          </div>

          <div className="field !mb-0">
            <label htmlFor="ne-doc">Αρ. παραστατικού</label>
            <div className="inwrap">
              <LuHash aria-hidden />
              <input id="ne-doc" value={values.docNumber} onChange={e => set('docNumber', e.target.value)} disabled={saving} />
            </div>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
            <Button type="submit" disabled={saving}>
              {saving ? 'Αποθήκευση…' : (<><LuPlus className="size-3.5" aria-hidden /> Προσθήκη</>)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
