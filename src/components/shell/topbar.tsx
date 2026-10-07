import Link from 'next/link'
import { BookOpen, UserRound } from 'lucide-react'
import { auth, signOut } from '@/auth'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
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
    // sticky: με το document ως μοναδικό scroller, το topbar μένει ορατό στην κορυφή.
    <header className="glass sticky top-3.5 z-40 mx-3.5 mt-3.5 mb-4 flex h-[54px] items-center gap-2.5 rounded-full py-0 pr-2 pl-2.5 sm:pl-4.5">
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
            <button type="button" className="avatar-ring size-[30px] shrink-0 cursor-pointer text-[length:var(--fs-11)]">
              {initials}
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block truncate text-foreground">{name}</span>
              <span className="block truncate font-medium">{session?.user?.role}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account" />}>
            <UserRound className="size-4" aria-hidden /> Ο λογαριασμός μου
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/help" />}>
            <BookOpen className="size-4" aria-hidden /> Εγχειρίδιο χρήσης
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <SignOutMenuItem action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }} />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
