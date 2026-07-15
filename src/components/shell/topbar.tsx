import { auth, signOut } from '@/auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutMenuItem } from './sign-out-item'

export async function Topbar() {
  const session = await auth()
  const name = session?.user?.name ?? ''
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-end border-b bg-background/85 px-5 backdrop-blur">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="gap-2">
              <Avatar className="size-7"><AvatarFallback className="bg-(--brass) text-[11px] font-semibold text-white">{initials}</AvatarFallback></Avatar>
              <span className="text-[13px]">{name}</span>
            </Button>
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
