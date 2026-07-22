'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuPlus, LuHash, LuTag, LuCalendar, LuFileText } from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createTemplate } from '@/lib/tax/actions'

export function NewGuideDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <LuPlus className="size-3.5" aria-hidden /> Νέος οδηγός
      </Button>
      <NewGuideDialogContent open={open} onOpenChange={setOpen} />
    </>
  )
}

function NewGuideDialogContent({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function resetForm() {
    setCode('')
    setName('')
    setYear('')
    setDescription('')
    setErrors({})
  }

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) resetForm()
    onOpenChange(next)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const nextErrors: Record<string, string> = {}
    if (!code.trim()) nextErrors.code = 'Ο κωδικός είναι υποχρεωτικός (π.χ. «Ε3»).'
    if (!name.trim()) nextErrors.name = 'Το όνομα είναι υποχρεωτικό.'
    const yearTrimmed = year.trim()
    const yearNum = yearTrimmed ? Number(yearTrimmed) : null
    if (yearTrimmed && (!Number.isInteger(yearNum) || yearNum! < 2000 || yearNum! > 2100)) {
      nextErrors.year = 'Το έτος πρέπει να είναι έγκυρος 4ψήφιος αριθμός.'
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})

    startTransition(async () => {
      try {
        const { id } = await createTemplate({
          code: code.trim(),
          name: name.trim(),
          year: yearNum,
          description: description.trim() || null,
        })
        toast.success('Ο οδηγός δημιουργήθηκε.')
        onOpenChange(false)
        resetForm()
        router.push(`/tax-templates/${id}`)
      } catch {
        toast.error('Η δημιουργία απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Νέος οδηγός εντύπου</DialogTitle>
          <DialogDescription>
            Δημιουργεί έναν κενό οδηγό — η χαρτογράφηση πεδίων γίνεται στο επόμενο βήμα.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="ng-code">Κωδικός*</label>
              <div className="inwrap">
                <LuHash aria-hidden />
                <input
                  id="ng-code" value={code} onChange={e => setCode(e.target.value)}
                  placeholder="π.χ. Ε3" required disabled={pending} autoFocus
                />
              </div>
              {errors.code && <div className="error">{errors.code}</div>}
            </div>
            <div className="field">
              <label htmlFor="ng-year">Έτος</label>
              <div className="inwrap">
                <LuCalendar aria-hidden />
                <input
                  id="ng-year" inputMode="numeric" value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="π.χ. 2025" disabled={pending}
                />
              </div>
              {errors.year && <div className="error">{errors.year}</div>}
            </div>
          </div>

          <div className="field">
            <label htmlFor="ng-name">Όνομα*</label>
            <div className="inwrap">
              <LuTag aria-hidden />
              <input
                id="ng-name" value={name} onChange={e => setName(e.target.value)}
                placeholder="π.χ. Έντυπο Ε3 — Κατάσταση Οικονομικών Στοιχείων" required disabled={pending}
              />
            </div>
            {errors.name && <div className="error">{errors.name}</div>}
          </div>

          <div className="field">
            <label htmlFor="ng-description">Περιγραφή</label>
            <div className="inwrap">
              <LuFileText aria-hidden />
              <input
                id="ng-description" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Προαιρετική σημείωση για τον οδηγό" disabled={pending}
              />
            </div>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending}>Άκυρο</Button>} />
            <Button type="submit" disabled={pending}>
              {pending ? 'Δημιουργία…' : (<><LuPlus className="size-3.5" aria-hidden /> Δημιουργία</>)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
