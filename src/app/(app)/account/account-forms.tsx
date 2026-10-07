'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoaderCircle, Save, KeyRound, Eye, EyeOff, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateMyProfile, changeMyPassword, type AccountActionState } from './actions'

type AccountUser = {
  name: string
  email: string
  phone: string
  mobile: string
  address: string
  city: string
  role: string
  since: string
}

function useToastResult(state: AccountActionState | undefined) {
  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message)
  }, [state])
}

export function AccountForms({ user }: { user: AccountUser }) {
  const initials = user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section className="glass rounded-[22px] p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="avatar-ring size-12 shrink-0 text-[length:var(--fs-15)]">{initials}</span>
          <div className="min-w-0">
            <h2 className="truncate text-[length:var(--fs-16)] font-bold">{user.name}</h2>
            <p className="truncate text-[length:var(--fs-12-5)] text-muted-foreground">
              {user.email} · <span className="font-semibold">{user.role}</span> · μέλος από {user.since}
            </p>
          </div>
        </div>
        <ProfileForm user={user} />
      </section>
      <section className="glass rounded-[22px] p-5">
        <PasswordForm />
      </section>
    </div>
  )
}

function ProfileForm({ user }: { user: AccountUser }) {
  const [state, action, pending] = useActionState(updateMyProfile, undefined)
  useToastResult(state)
  return (
    <form action={action} className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 text-[length:var(--fs-13)] font-bold">
        <UserRound className="size-4 text-muted-foreground" aria-hidden /> Στοιχεία
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="acc-name" label="Ονοματεπώνυμο" required>
          <Input id="acc-name" name="name" defaultValue={user.name} required autoComplete="name" />
        </Field>
        <Field id="acc-email" label="Email" hint="Αλλάζει μόνο από τη διαχείριση χρηστών.">
          <Input id="acc-email" value={user.email} readOnly disabled />
        </Field>
        <Field id="acc-phone" label="Τηλέφωνο">
          <Input id="acc-phone" name="phone" type="tel" defaultValue={user.phone} autoComplete="tel" />
        </Field>
        <Field id="acc-mobile" label="Κινητό">
          <Input id="acc-mobile" name="mobile" type="tel" defaultValue={user.mobile} autoComplete="tel" />
        </Field>
        <Field id="acc-address" label="Διεύθυνση">
          <Input id="acc-address" name="address" defaultValue={user.address} autoComplete="street-address" />
        </Field>
        <Field id="acc-city" label="Πόλη">
          <Input id="acc-city" name="city" defaultValue={user.city} autoComplete="address-level2" />
        </Field>
      </div>
      {state?.error && <p role="alert" className="text-[length:var(--fs-12-5)] font-medium text-destructive">{state.error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          Αποθήκευση
        </Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const [state, action, pending] = useActionState(changeMyPassword, undefined)
  const [show, setShow] = useState(false)
  useToastResult(state)
  const type = show ? 'text' : 'password'
  return (
    // key: μετά από επιτυχία ξαναστήνεται η φόρμα ⇒ καθαρίζουν τα πεδία
    <form key={state?.ok ? 'done' : 'edit'} action={action} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[length:var(--fs-13)] font-bold">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden /> Αλλαγή κωδικού
        </h3>
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[length:var(--fs-12)] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-pressed={show}
        >
          {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          {show ? 'Απόκρυψη' : 'Εμφάνιση'}
        </button>
      </div>
      <Field id="acc-current" label="Τρέχων κωδικός" required>
        <Input id="acc-current" name="current" type={type} required autoComplete="current-password" />
      </Field>
      <Field id="acc-new" label="Νέος κωδικός" hint="Τουλάχιστον 8 χαρακτήρες." required>
        <Input id="acc-new" name="password" type={type} required minLength={8} autoComplete="new-password" />
      </Field>
      <Field id="acc-confirm" label="Επιβεβαίωση νέου κωδικού" required>
        <Input id="acc-confirm" name="confirm" type={type} required minLength={8} autoComplete="new-password" />
      </Field>
      {state?.error && <p role="alert" className="text-[length:var(--fs-12-5)] font-medium text-destructive">{state.error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
          Αλλαγή κωδικού
        </Button>
      </div>
    </form>
  )
}

function Field({ id, label, hint, required, children }: { id: string; label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[length:var(--fs-11-5)] text-muted-foreground">{hint}</p>}
    </div>
  )
}
