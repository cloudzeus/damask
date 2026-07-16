'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { PartnerFormDialog } from './partner-form-dialog'
import type { MapsClientConfig } from './actions'
import type { S1Option } from '@/lib/s1-options'

export function NewPartnerButton({
  mapsConfig, formOptions,
}: {
  mapsConfig: MapsClientConfig
  formOptions: { country: S1Option[]; irsdata: S1Option[]; trdCategory: S1Option[]; payment: S1Option[]; shipment: S1Option[] }
}) {
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
        formOptions={formOptions}
        onCreated={id => router.push(`/partners/${id}`)}
      />
    </>
  )
}
