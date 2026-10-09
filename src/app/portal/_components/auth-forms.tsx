'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { LuLoaderCircle, LuTriangleAlert, LuCircleCheck, LuEye, LuEyeOff, LuMail } from 'react-icons/lu'
import { loginAction } from '@/app/login/actions'
import { requestPasswordReset, type ForgotPasswordState } from '@/app/forgot-password/actions'
import { resetPassword, type ResetPasswordState } from '@/app/reset-password/actions'

function Err({ msg }: { msg?: string }) {
  return msg ? <div className="p-review bad" role="alert"><div className="msg"><LuTriangleAlert aria-hidden /><span>{msg}</span></div></div> : null
}

/** Σύνδεση πελάτη (ίδια ενέργεια με το /login — ο ρόλος αποφασίζει πού καταλήγει). */
export function PortalLoginForm({ justReset, forgotHref = '/portal/xechasa-kodiko', general = false }: { justReset: boolean; forgotHref?: string; general?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, {})
  const [show, setShow] = React.useState(false)
  return (
    <form action={action} className="p-auth-form">
      <h1>{general ? 'Σύνδεση' : 'Σύνδεση στο portal'}</h1>
      <p className="p-muted">{general ? 'Πελάτες: τα έργα, τα δικαιολογητικά και ο βοηθός σας. Συνεργάτες της WWA: η διαχείριση των έργων.' : 'Δείτε την πορεία των έργων σας, ανεβάστε δικαιολογητικά και ρωτήστε τον βοηθό.'}</p>
      {justReset && <div className="p-review checking" role="status" style={{ background: 'var(--p-success-bg)', color: 'var(--p-success)' }}><LuCircleCheck aria-hidden /> Ο νέος κωδικός ορίστηκε — συνδεθείτε.</div>}
      <label className="p-field"><span>Email</span><input id="email" name="email" type="email" autoComplete="username" required /></label>
      <label className="p-field"><span>Κωδικός</span><input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required /></label>
      <label className="p-check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> {show ? <LuEyeOff aria-hidden style={{ width: 16, height: 16 }} /> : <LuEye aria-hidden style={{ width: 16, height: 16 }} />} Εμφάνιση κωδικού</label>
      <Err msg={state?.error} />
      <button type="submit" className="p-btn" disabled={pending}>{pending && <LuLoaderCircle className="spin" aria-hidden />} Σύνδεση</button>
      <p className="p-auth-links"><Link href={forgotHref}>Ξεχάσατε τον κωδικό;</Link></p>
      {general && (
        <>
          <p className="p-muted" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>Μετά τη σύνδεση μεταφέρεστε αυτόματα στη σωστή σελίδα: πελάτες → τα έργα σας · συνεργάτες → διαχείριση.</p>
          <p className="p-auth-links" style={{ borderTop: '1px solid var(--p-rule)', paddingTop: 8 }}>Δεν έχετε λογαριασμό; <Link href="/register" style={{ marginLeft: 6 }}>Αίτημα πρόσβασης</Link></p>
        </>
      )}
    </form>
  )
}

/** «Ξέχασα τον κωδικό» — πάντα το ίδιο μήνυμα (δεν αποκαλύπτουμε αν υπάρχει το email). */
export function PortalForgotForm({ loginHref = '/portal/syndesi' }: { loginHref?: string }) {
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(requestPasswordReset, {})
  if (state.submitted) {
    return (
      <div className="p-auth-form">
        <h1>Ελέγξτε το email σας</h1>
        <div className="p-review checking" role="status"><LuMail aria-hidden /> Αν το email είναι καταχωρημένο, σας στείλαμε σύνδεσμο για νέο κωδικό. Ισχύει 30 λεπτά.</div>
        <p className="p-muted" style={{ fontSize: 14 }}>Δεν το βρίσκετε; Κοιτάξτε και στα ανεπιθύμητα (spam) ή καλέστε μας στο 210 721 8758.</p>
        <p className="p-auth-links"><Link href={loginHref}>← Πίσω στη σύνδεση</Link></p>
      </div>
    )
  }
  return (
    <form action={action} className="p-auth-form">
      <h1>Ξεχάσατε τον κωδικό;</h1>
      <p className="p-muted">Γράψτε το email με το οποίο συνδέεστε. Θα σας στείλουμε σύνδεσμο για να ορίσετε νέο κωδικό.</p>
      <label className="p-field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
      <button type="submit" className="p-btn" disabled={pending}>{pending && <LuLoaderCircle className="spin" aria-hidden />} Αποστολή συνδέσμου</button>
      <p className="p-auth-links"><Link href={loginHref}>← Πίσω στη σύνδεση</Link></p>
    </form>
  )
}

/** Ορισμός νέου κωδικού από τον σύνδεσμο του email (και για πρώτη πρόσβαση στο portal). */
export function PortalResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(resetPassword, {})
  const [show, setShow] = React.useState(false)
  const type = show ? 'text' : 'password'
  return (
    <form action={action} className="p-auth-form">
      <h1>Ορίστε νέο κωδικό</h1>
      <p className="p-muted">Τουλάχιστον 8 χαρακτήρες — π.χ. τρεις λέξεις με έναν αριθμό, που θυμάστε εύκολα.</p>
      <input type="hidden" name="token" value={token} />
      <label className="p-field"><span>Νέος κωδικός</span><input name="password" type={type} autoComplete="new-password" minLength={8} required /></label>
      <label className="p-field"><span>Επιβεβαίωση</span><input name="confirm" type={type} autoComplete="new-password" minLength={8} required /></label>
      <label className="p-check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Εμφάνιση κωδικών</label>
      <Err msg={state?.error} />
      <button type="submit" className="p-btn" disabled={pending}>{pending && <LuLoaderCircle className="spin" aria-hidden />} Αποθήκευση κωδικού</button>
    </form>
  )
}
