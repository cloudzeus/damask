import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { auth, signOut } from '@/auth'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutMenuItem } from './sign-out-item'
import { MobileNavToggle } from './mobile-nav'
import { NotificationsBell } from './notifications-bell'
import { GlobalSearch } from './global-search'
import { HelpButton } from './help-button'

export async function Topbar() {
  const session = await auth()
  const name = session?.user?.name ?? ''
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <header className="glass mx-3.5 mt-3.5 mb-4 flex h-[54px] items-center gap-2.5 rounded-full py-0 pr-2 pl-2.5 sm:pl-4.5">
      <MobileNavToggle />
      <GlobalSearch />
      <div className="hidden flex-1 sm:block" />
      <Link
        href="/help"
        aria-label="Εγχειρίδιο χρήσης"
        title="Εγχειρίδιο χρήσης"
        className="hidden size-[30px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
      >
        <BookOpen className="size-[1.15rem]" strokeWidth={1.8} aria-hidden />
      </Link>
      <HelpButton />
      <NotificationsBell />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="avatar-ring size-[30px] shrink-0 cursor-pointer text-[0.6875rem]">
              {initials}
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{session?.user?.role}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <SignOutMenuItem action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }} />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
