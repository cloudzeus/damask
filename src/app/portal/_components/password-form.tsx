'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { LuEye, LuEyeOff, LuLoaderCircle, LuKeyRound, LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'
import { changeMyPassword, type AccountActionState } from '@/app/(app)/account/actions'
import { PModal } from './p-modal'

/** Αλλαγή κωδικού από το portal (ίδια ασφαλής ενέργεια με τον λογαριασμό της εφαρμογής: userId από το session + τρέχων κωδικός). */
export function PasswordForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<AccountActionState | undefined, FormData>(changeMyPassword, undefined)
  const [show, setShow] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)
  React.useEffect(() => { if (state?.ok) formRef.current?.reset() }, [state])
  const type = show ? 'text' : 'password'
  return (
    <form ref={formRef} action={action} className="p-form" noValidate>
      <label className="p-field"><span>Τρέχων κωδικός</span><input name="current" type={type} autoComplete="current-password" required disabled={disabled} /></label>
      <div className="row2">
        <label className="p-field"><span>Νέος κωδικός</span><input name="password" type={type} autoComplete="new-password" minLength={8} required disabled={disabled} /></label>
        <label className="p-field"><span>Επιβεβαίωση νέου κωδικού</span><input name="confirm" type={type} autoComplete="new-password" minLength={8} required disabled={disabled} /></label>
      </div>
      <label className="p-check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> {show ? <LuEyeOff aria-hidden style={{ width: 16, height: 16 }} /> : <LuEye aria-hidden style={{ width: 16, height: 16 }} />} Εμφάνιση κωδικών</label>
      {state?.error && <div className="p-review bad" role="alert"><div className="msg"><LuTriangleAlert aria-hidden /><span>{state.error}</span></div></div>}
      {state?.ok && <div className="p-review checking" role="status" style={{ background: 'var(--p-success-bg)', color: 'var(--p-success)' }}><LuCircleCheck aria-hidden /> Ο κωδικός σας άλλαξε. Την επόμενη φορά συνδεθείτε με τον νέο.</div>}
      <div><button type="submit" className="p-btn" disabled={pending || disabled}>{pending ? <LuLoaderCircle className="spin" aria-hidden /> : null} Αλλαγή κωδικού</button></div>
    </form>
  )
}

/** Κουμπί «Αλλαγή κωδικού» που ανοίγει τη φόρμα σε modal. */
export function PasswordModal({ disabled }: { disabled?: boolean }) {
  return (
    <PModal title="Αλλαγή κωδικού" description="Τουλάχιστον 8 χαρακτήρες. Προτιμήστε μια φράση που θυμάστε εύκολα, π.χ. τρεις λέξεις με αριθμό." disabled={disabled}
      trigger={<><LuKeyRound aria-hidden /> Αλλαγή κωδικού</>}>
      <PasswordForm />
    </PModal>
  )
}
