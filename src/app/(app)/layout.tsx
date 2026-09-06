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
        {/* Fixed-height shell: το ΠΕΡΙΕΧΟΜΕΝΟ κάνει scroll, όχι όλη η σελίδα —
            έτσι το scrollbar δεν εκτείνεται σε όλο το ύψος (και στο sidebar). */}
        <div className="flex h-dvh overflow-hidden">
          <Sidebar
            enabledKeys={[...enabled]}
            permissions={session.user.permissions}
            userName={session.user.name ?? ''}
            userRole={session.user.role}
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
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
