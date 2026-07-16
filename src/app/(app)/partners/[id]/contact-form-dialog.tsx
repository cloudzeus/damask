'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { User, Briefcase, Mail, Phone, Smartphone } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { createContact, updateContact, type ContactFormValues } from '../actions'

export type EditableContact = {
  id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  isPrimary: boolean
}

function emptyForm(): ContactFormValues {
  return { name: '', position: '', email: '', phone: '', mobile: '', isPrimary: false }
}

function toFormValues(c: EditableContact): ContactFormValues {
  return {
    name: c.name, position: c.position ?? '', email: c.email ?? '',
    phone: c.phone ?? '', mobile: c.mobile ?? '', isPrimary: c.isPrimary,
  }
}

export function ContactFormDialog({
  mode, customerId, open, onOpenChange, contact,
}: {
  mode: 'create' | 'edit'
  customerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  contact?: EditableContact
}) {
  const [values, setValues] = useState<ContactFormValues>(() => (contact ? toFormValues(contact) : emptyForm()))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function set<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues(v => ({ ...v, [key]: value }))
    setFieldErrors(e => {
      if (!(key in e)) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = mode === 'create'
        ? await createContact(customerId, values)
        : await updateContact(contact!.id, values)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass w-full max-w-[calc(100%-2rem)] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Νέα επαφή' : `Επεξεργασία — ${contact?.name}`}</DialogTitle>
          <DialogDescription>Στοιχεία επαφής του συναλλασσόμενου.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-0">
            <div className="field">
              <label htmlFor="contact-form-name">Όνομα*</label>
              <div className="inwrap">
                <User aria-hidden />
                <input id="contact-form-name" value={values.name} onChange={e => set('name', e.target.value)} required />
              </div>
              {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
            </div>

            <div className="field">
              <label htmlFor="contact-form-position">Θέση</label>
              <div className="inwrap">
                <Briefcase aria-hidden />
                <input id="contact-form-position" value={values.position} onChange={e => set('position', e.target.value)} placeholder="π.χ. Οικονομικός Διευθυντής" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="contact-form-email">Email</label>
              <div className="inwrap">
                <Mail aria-hidden />
                <input id="contact-form-email" type="email" value={values.email} onChange={e => set('email', e.target.value)} />
              </div>
              {fieldErrors.email && <div className="error">{fieldErrors.email}</div>}
            </div>

            <div className="field">
              <label htmlFor="contact-form-phone">Τηλέφωνο</label>
              <div className="inwrap">
                <Phone aria-hidden />
                <input id="contact-form-phone" type="tel" value={values.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="contact-form-mobile">Mobile</label>
              <div className="inwrap">
                <Smartphone aria-hidden />
                <input id="contact-form-mobile" type="tel" value={values.mobile} onChange={e => set('mobile', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Κύρια επαφή</label>
              <div className="flex h-11 items-center gap-2.5">
                <Switch aria-label="Κύρια επαφή" checked={values.isPrimary} onCheckedChange={checked => set('isPrimary', checked)} />
                <span className="text-[12.5px] text-muted-foreground">
                  {values.isPrimary ? 'Ναι — θα αντικαταστήσει την τρέχουσα κύρια επαφή' : 'Όχι'}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending}>{pending ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
