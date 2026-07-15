import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, signOut } from '@/auth'

export default async function PortalPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center px-6">
      <div className="glass stagger w-full max-w-md p-8 text-center">
        <Link href="/" className="wordmark mb-6 inline-flex text-[18px] text-foreground">
          DAMASK
        </Link>
        <h1 className="mb-2 text-[22px]">B2B Portal — έρχεται στη Φάση 8</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Καλωσόρισες, {session.user.name}. Ο χώρος παραγγελιών, τιμών και containers για πελάτες &amp;
          αρχιτέκτονες θα είναι εδώ σύντομα.
        </p>
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <button type="submit" className="btn-pill btn-glass mx-auto">
            Αποσύνδεση
          </button>
        </form>
      </div>
    </div>
  )
}
