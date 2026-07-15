import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'
import { PageTransition } from '@/components/shell/page-transition'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return (
    <div className="flex">
      <Sidebar permissions={session.user.permissions} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 p-5">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  )
}
