'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { seedBasicLegalPages } from './actions'

/** «Δημιουργία βασικών» — idempotent: ξανά-κλικ δεν δημιουργεί διπλότυπα, μόνο ό,τι λείπει. */
export function SeedLegalButton() {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const res = await seedBasicLegalPages()
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      <Sparkles className="size-3.5" strokeWidth={1.8} aria-hidden />
      {pending ? 'Δημιουργία…' : 'Δημιουργία βασικών'}
    </Button>
  )
}
