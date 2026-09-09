import { auth, signOut } from '@/auth'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutMenuItem } from './sign-out-item'
import { MobileNavToggle } from './mobile-nav'
import { NotificationsBell } from './notifications-bell'
import { GlobalSearch } from './global-search'

export async function Topbar() {
  const session = await auth()
  const name = session?.user?.name ?? ''
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <header className="glass mx-3.5 mt-3.5 mb-4 flex h-[54px] items-center gap-2.5 rounded-full py-0 pr-2 pl-2.5 sm:pl-4.5">
      <MobileNavToggle />
      <GlobalSearch />
      <div className="hidden flex-1 sm:block" />
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
