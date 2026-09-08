import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, signOut } from '@/auth'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { PortalPrograms } from './_components/portal-programs'

export const metadata = { title: 'Portal — World Wide Associates' }

export default async function PortalPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const dash = await getContactPortalDashboard()

  return (
    <div className="app-canvas min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="wordmark text-[1rem] text-foreground">World Wide Associates</Link>
          <div className="flex-1" />
          <span className="hidden text-[0.78125rem] text-muted-foreground sm:inline">{session.user.name}</span>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <button type="submit" className="btn-pill btn-glass h-9 px-3 text-[0.78125rem]">Αποσύνδεση</button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {!dash.ok ? (
          <div className="glass p-8 text-center">
            <h1 className="mb-2 text-[1.25rem]">Καλωσόρισες, {session.user.name}</h1>
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν διαθέσιμα προγράμματα για τον λογαριασμό σου αυτή τη στιγμή. Επικοινώνησε με τον σύμβουλό σου στη WWA.</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h1 className="text-[1.375rem] font-semibold">Τα προγράμματά μου</h1>
              <p className="text-[0.8125rem] text-muted-foreground">
                {dash.companyName}
                {dash.central
                  ? ' · κεντρική πρόσβαση (όλα τα προγράμματα)'
                  : ' · πρόσβαση στα προγράμματα που σας αφορούν'}
              </p>
            </div>
            <PortalPrograms applications={dash.applications} />
          </>
        )}
      </main>
    </div>
  )
}
