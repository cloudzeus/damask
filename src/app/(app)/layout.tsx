import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'
import { PageTransition } from '@/components/shell/page-transition'
import { MobileNavProvider } from '@/components/shell/mobile-nav'
import { getEnabledObjectKeys } from '@/lib/objects-server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  // Περνάμε ΜΟΝΟ serializable string[] στο (client) Sidebar — τα Lucide icons είναι
  // functions και δεν σειριοποιούνται πάνω από το server→client boundary. Το buildNav
  // τρέχει μέσα στο Sidebar (client) με τα icon components.
  const enabled = await getEnabledObjectKeys()

  return (
    <MobileNavProvider>
      <div className="app-canvas">
        {/* ΕΝΑΣ μόνο κάθετος scroller: αυτός της σελίδας (document). Ούτε το
            περιεχόμενο, ούτε οι πίνακες, ούτε το sidebar έχουν δικό τους κάθετο
            scroll· το sidebar είναι «smart sticky» (βλ. sidebar.tsx) και το
            topbar sticky. items-start: απαραίτητο για να δουλέψει το sticky. */}
        <div className="flex min-h-dvh items-start">
          <Sidebar
            enabledKeys={[...enabled]}
            permissions={session.user.permissions}
            userName={session.user.name ?? ''}
            userRole={session.user.role}
          />
          <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 px-3.5 pb-16">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
      </div>
    </MobileNavProvider>
  )
}
