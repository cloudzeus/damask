'use client'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

export function SignOutMenuItem({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <DropdownMenuItem
        render={<button type="submit" className="w-full text-left" />}
        onClick={(event) => {
          // Base UI's non-native-button keyboard handling (Enter/Space) calls
          // preventDefault() and expects an explicit onClick — native form
          // submission via a real <button type="submit"> only fires on mouse
          // click by default, so we submit explicitly here for both paths.
          event.preventDefault()
          event.currentTarget.closest('form')?.requestSubmit()
        }}
      >
        Αποσύνδεση
      </DropdownMenuItem>
    </form>
  )
}
