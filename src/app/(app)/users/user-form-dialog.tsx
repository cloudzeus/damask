'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { User, Mail, Lock, Phone, Smartphone, MapPin, Building2, Globe, Dices, Eye, EyeOff } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { createUser, updateUser, type UserFormValues } from './actions'

type RoleOption = { id: string; name: string }

export type EditableUser = {
  id: string
  name: string
  email: string
  roleId: string
  active: boolean
  phone: string | null
  mobile: string | null
  address: string | null
  city: string | null
  country: string | null
}

const EMPTY_FORM: UserFormValues = {
  name: '',
  email: '',
  roleId: '',
  password: '',
  phone: '',
  mobile: '',
  address: '',
  city: '',
  country: 'Ελλάδα',
  active: true,
}

/** Τυχαίος, ισχυρός κωδικός — χωρίς οπτικά διφορούμενους χαρακτήρες (0/O, 1/l/I). */
function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

function toFormValues(user: EditableUser): UserFormValues {
  return {
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    password: '',
    phone: user.phone ?? '',
    mobile: user.mobile ?? '',
    address: user.address ?? '',
    city: user.city ?? '',
    country: user.country ?? '',
    active: user.active,
  }
}

export function UserFormDialog({
  mode,
  roles,
  open,
  onOpenChange,
  user,
  isSelf = false,
}: {
  mode: 'create' | 'edit'
  roles: RoleOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: EditableUser
  isSelf?: boolean
}) {
  // Base UI's Dialog.Popup is unmounted while closed (keepMounted defaults to
  // false — verified in @base-ui/react/dialog/portal/DialogPortal.js), so this
  // component is freshly mounted on every open: the lazy useState initializers
  // below already give a clean form (create) or fresh data (edit) each time,
  // with no reset-on-open effect needed.
  const [values, setValues] = useState<UserFormValues>(() => (user ? toFormValues(user) : EMPTY_FORM))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues(v => ({ ...v, [key]: value }))
    setFieldErrors(e => {
      if (!(key in e)) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function handleGeneratePassword() {
    set('password', generatePassword())
    setShowPassword(true)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = mode === 'create' ? await createUser(values) : await updateUser(user!.id, values)

      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  const roleLocked = mode === 'edit' && isSelf
  const activeLocked = mode === 'edit' && isSelf

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[88vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Νέος χρήστης' : `Επεξεργασία — ${user?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Δημιούργησε λογαριασμό για μέλος της ομάδας.'
              : 'Ενημέρωσε τα στοιχεία του λογαριασμού.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <div className="field">
              <label htmlFor="user-form-name">Ονοματεπώνυμο*</label>
              <div className="inwrap">
                <User aria-hidden />
                <input
                  id="user-form-name"
                  value={values.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="π.χ. Μαρία Παπαδάκη"
                  required
                />
              </div>
              {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
            </div>

            <div className="field">
              <label htmlFor="user-form-email">Email*</label>
              <div className="inwrap">
                <Mail aria-hidden />
                <input
                  id="user-form-email"
                  type="email"
                  value={values.email}
                  onChange={e => set('email', e.target.value)}
                  required
                />
              </div>
              {fieldErrors.email && <div className="error">{fieldErrors.email}</div>}
            </div>

            <div className="field">
              <label htmlFor="user-form-role">Ρόλος*</label>
              <Select
                value={values.roleId}
                onValueChange={value => set('roleId', value as string)}
                disabled={roleLocked}
              >
                <SelectTrigger
                  id="user-form-role"
                  aria-label="Ρόλος"
                  className="h-11 w-full rounded-full border-border bg-card px-4"
                >
                  <SelectValue>
                    {(value: string) => roles.find(r => r.id === value)?.name ?? 'Επίλεξε ρόλο…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roleLocked && <div className="help">Δεν αλλάζεις τον δικό σου ρόλο.</div>}
              {fieldErrors.roleId && <div className="error">{fieldErrors.roleId}</div>}
            </div>

            <div className="field">
              <label htmlFor="user-form-password">
                {mode === 'create' ? 'Κωδικός*' : 'Νέος κωδικός (προαιρετικό)'}
              </label>
              <div className="inwrap">
                <Lock aria-hidden />
                <input
                  id="user-form-password"
                  type={showPassword ? 'text' : 'password'}
                  value={values.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder={mode === 'edit' ? 'Άφησέ το κενό — μένει ίδιος' : undefined}
                  autoComplete="new-password"
                  required={mode === 'create'}
                  style={{ paddingRight: 74 }}
                />
                <button
                  type="button"
                  className="eye"
                  style={{ right: 38 }}
                  aria-label="Τυχαίος κωδικός"
                  onClick={handleGeneratePassword}
                >
                  <Dices width={15} height={15} strokeWidth={1.8} aria-hidden />
                </button>
                <button
                  type="button"
                  className="eye"
                  aria-label={showPassword ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? (
                    <EyeOff width={15} height={15} strokeWidth={1.8} aria-hidden />
                  ) : (
                    <Eye width={15} height={15} strokeWidth={1.8} aria-hidden />
                  )}
                </button>
              </div>
              {fieldErrors.password && <div className="error">{fieldErrors.password}</div>}
            </div>

            <div className="field">
              <label htmlFor="user-form-phone">Τηλέφωνο</label>
              <div className="inwrap">
                <Phone aria-hidden />
                <input id="user-form-phone" type="tel" value={values.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="user-form-mobile">Mobile</label>
              <div className="inwrap">
                <Smartphone aria-hidden />
                <input id="user-form-mobile" type="tel" value={values.mobile} onChange={e => set('mobile', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="user-form-address">Διεύθυνση</label>
              <div className="inwrap">
                <MapPin aria-hidden />
                <input id="user-form-address" value={values.address} onChange={e => set('address', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="user-form-city">Πόλη</label>
              <div className="inwrap">
                <Building2 aria-hidden />
                <input id="user-form-city" value={values.city} onChange={e => set('city', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="user-form-country">Χώρα</label>
              <div className="inwrap">
                <Globe aria-hidden />
                <input id="user-form-country" value={values.country} onChange={e => set('country', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Ενεργός</label>
              <div className="flex h-11 items-center gap-2.5">
                <Switch
                  aria-label="Ενεργός"
                  checked={values.active}
                  onCheckedChange={checked => set('active', checked)}
                  disabled={activeLocked}
                />
                <span className="text-[12.5px] text-muted-foreground">
                  {values.active ? 'Ενεργός' : 'Ανενεργός'}
                </span>
              </div>
              {activeLocked && <div className="help">Δεν απενεργοποιείς τον εαυτό σου.</div>}
            </div>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending}>
              {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
