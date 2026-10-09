import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, signOut } from '@/auth'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { PortalPrograms } from './_components/portal-programs'
import { ThanosWidget } from '@/components/thanos/thanos-widget'

export const metadata = { title: 'Portal — World Wide Associates' }

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  // ?preview=<contactId>: χρήστης της εφαρμογής βλέπει το portal όπως η επαφή (μόνο ανάγνωση).
  const { preview } = await searchParams
  const dash = await getContactPortalDashboard(preview || undefined)

  return (
    <div className="app-canvas min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="wordmark text-[length:var(--fs-16)] text-foreground">World Wide Associates</Link>
          <div className="flex-1" />
          <span className="hidden text-[length:var(--fs-12-5)] text-muted-foreground sm:inline">{session.user.name}</span>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <button type="submit" className="btn-pill btn-glass h-9 px-3 text-[length:var(--fs-12-5)]">Αποσύνδεση</button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {dash.ok && dash.preview && (
          <div className="mb-4 rounded-xl border p-3 text-[length:var(--fs-13)] text-foreground" style={{ background: 'var(--card)', borderColor: 'var(--warning)', borderLeftWidth: 4 }} role="status">
            <b>Προεπισκόπηση:</b> έτσι βλέπει το portal η επαφή <b>{dash.contactName}</b>. Το ανέβασμα και ο βοηθός είναι απενεργοποιημένα εδώ.
          </div>
        )}
        {!dash.ok ? (
          <div className="glass p-8 text-center">
            <h1 className="mb-2 text-[length:var(--fs-20)]">Καλώς ήρθατε, {session.user.name}</h1>
            <p className="text-sm text-muted-foreground">{preview ? 'Η επαφή δεν βρέθηκε ή δεν έχετε δικαίωμα προβολής.' : 'Δεν υπάρχουν διαθέσιμα προγράμματα για τον λογαριασμό σας αυτή τη στιγμή. Επικοινωνήστε με τον σύμβουλό σας στη WWA.'}</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h1 className="text-[length:var(--fs-22)] font-semibold">Καλώς ήρθατε, {dash.contactName.split(' ')[0]}</h1>
              <p className="text-[length:var(--fs-14)]">Εδώ βλέπετε πού βρίσκεται κάθε έργο σας, τι χρειαζόμαστε από εσάς και τι ακολουθεί.</p>
              <p className="text-[length:var(--fs-13)] text-muted-foreground">
                {dash.companyName}
                {dash.central
                  ? ' · κεντρική πρόσβαση (όλα τα προγράμματα)'
                  : ' · πρόσβαση στα προγράμματα που σας αφορούν'}
              </p>
            </div>
            <PortalPrograms applications={dash.applications} preview={dash.preview} />
            {!dash.preview && <ThanosWidget firstName={session.user.name?.split(' ')[0]} />}
          </>
        )}
      </main>
    </div>
  )
}
