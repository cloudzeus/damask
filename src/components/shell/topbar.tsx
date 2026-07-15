import { Bell, Search } from 'lucide-react'
import { auth, signOut } from '@/auth'
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
    <header className="glass mt-3.5 mb-4 flex h-[54px] items-center gap-2.5 rounded-full py-0 pr-2 pl-4.5">
      <div className="flex h-[34px] min-w-[220px] items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[12.5px] text-muted-foreground shadow-[inset_0_1px_3px_rgb(23_43_58_/_5%)]">
        <Search className="size-3.5 shrink-0" strokeWidth={1.8} />
        Γρήγορη αναζήτηση…
        <span className="ml-auto rounded border border-border px-1 text-[10px]">⌘K</span>
      </div>
      <div className="flex-1" />
      <span className="badge-pill ok">
        <span className="status-dot pulse" style={{ background: 'var(--success)', color: 'var(--success)' }} aria-hidden />
        Sync πριν 4′
      </span>
      <button type="button" className="icon-pill" aria-label="Ειδοποιήσεις">
        <Bell className="size-4" strokeWidth={1.8} />
        <span className="ndot" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="avatar-ring size-[30px] shrink-0 cursor-pointer text-[11px]">
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
