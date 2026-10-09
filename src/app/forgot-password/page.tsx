import { AuthShell } from '../portal/_components/auth-shell'
import { PortalForgotForm } from '../portal/_components/auth-forms'

export const metadata = { title: 'Ξέχασα τον κωδικό — World Wide Associates', robots: { index: false, follow: false } }

export default function ForgotPasswordPage() {
  return <AuthShell><PortalForgotForm loginHref="/login" /></AuthShell>
}
