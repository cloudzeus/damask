'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { matchTrdrRegionAction } from '@/lib/trdr/enrich-actions'
import type { RegionMatch } from '@/lib/registries/regions'

function breadcrumbLabel(match: RegionMatch): string {
  const { breadcrumb } = match
  return [breadcrumb.region?.nameEL, breadcrumb.regionalUnit?.nameEL, breadcrumb.municipality?.nameEL]
    .filter(Boolean)
    .join(' › ')
}

/**
 * «Εντοπισμός Περιφέρειας» row-action (W2 T4 §0.8α) — καμία επιβεβαίωση
 * (μη-καταστροφική εγγραφή), απευθείας κλήση + toast breadcrumb/«Δεν βρέθηκε».
 */
export function RegionMatchActionItem({ trdrId, name }: { trdrId: string; name: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        const match = await matchTrdrRegionAction(trdrId)
        if (!match) {
          toast.warning(`Δεν βρέθηκε περιφέρεια για «${name}».`)
          return
        }
        toast.success(`Περιφέρεια «${name}»: ${breadcrumbLabel(match)}`)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Ο εντοπισμός περιφέρειας απέτυχε.')
      }
    })
  }

  return (
    <DropdownMenuItem disabled={pending} onClick={handleClick}>
      <MapPin className="size-3.5" strokeWidth={1.75} /> {pending ? 'Εντοπισμός…' : 'Εντοπισμός Περιφέρειας'}
    </DropdownMenuItem>
  )
}
