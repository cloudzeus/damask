import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { PasswordModal } from '../../_components/password-form'
import { PortalBanner } from '../../_components/portal-banner'

export const metadata = { title: 'Ο λογαριασμός μου — Portal World Wide Associates' }

/** «Ο λογαριασμός μου»: στοιχεία σύνδεσης + αλλαγή κωδικού. */
export default async function PortalAccount({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const session = await auth()
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } }) : null
  return (
    <>
      <PortalBanner eyebrow="Λογαριασμός" title="Ο λογαριασμός μου" lead="Τα στοιχεία σύνδεσής σας στο portal και η αλλαγή κωδικού." photo="team" />
      <main><div className="p-wrap p-stack">
        <div className="p-form">
          <h3 className="p-h3" style={{ margin: 0 }}>Στοιχεία σύνδεσης</h3>
          <dl className="p-dates" style={{ margin: 0 }}>
            <div><dt>Όνομα:</dt><dd>{user?.name ?? '—'}</dd></div>
            <div><dt>Email σύνδεσης:</dt><dd>{user?.email ?? '—'}</dd></div>
          </dl>
          <p className="p-muted" style={{ margin: 0, fontSize: 13 }}>Για αλλαγή email επικοινωνήστε με τον σύμβουλό σας στο 210 721 8758.</p>
          <div><PasswordModal disabled={!!preview} /></div>
        </div>
        {preview && <p className="p-muted" style={{ fontSize: 13, margin: 0 }}>Προεπισκόπηση: η αλλαγή κωδικού είναι απενεργοποιημένη (αφορά τον δικό σας λογαριασμό, όχι της επαφής).</p>}
        <p className="p-muted" style={{ fontSize: 13, margin: 0 }}>Ξεχάσατε τον κωδικό; Αποσυνδεθείτε και πατήστε «Ξέχασα τον κωδικό» στη σελίδα σύνδεσης.</p>
      </div></main>
    </>
  )
}
