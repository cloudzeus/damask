import { AuthShell } from '../_components/auth-shell'

export const metadata = { robots: { index: false, follow: false } }

export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>
}
