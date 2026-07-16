'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { PartnerFormDialog } from './partner-form-dialog'
import type { MapsClientConfig } from './actions'

export function NewPartnerButton({ mapsConfig }: { mapsConfig: MapsClientConfig }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button type="button" className="btn-pill btn-navy" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" strokeWidth={2} aria-hidden /> Νέος συναλλασσόμενος
      </button>
      <PartnerFormDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
        mapsConfig={mapsConfig}
        onCreated={id => router.push(`/partners/${id}`)}
      />
    </>
  )
}
