import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'
import { PageTransition } from '@/components/shell/page-transition'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return (
    <div className="app-canvas">
      <div className="flex">
        <Sidebar
          permissions={session.user.permissions}
          userName={session.user.name ?? ''}
          userRole={session.user.role}
        />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-3.5 pb-16">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </div>
  )
}
