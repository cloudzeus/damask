'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil, ArrowUpRight, ImagePlus, Globe2, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MediaPicker } from '@/components/media/media-picker'
import { PartnerFormDialog, type EditablePartner } from '../partner-form-dialog'
import { convertLeadToCustomer, setPartnerLogo, setPartnerLogoFromWebsite } from '../actions'
import type { MapsClientConfig } from '../actions'

function initialsOf(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function PartnerHeader({
  partner, logoUrl, mapsConfig,
}: {
  partner: EditablePartner
  logoUrl: string | null
  mapsConfig: MapsClientConfig
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [converting, startConvert] = useTransition()
  const [favicoLoading, startFavicon] = useTransition()

  function handleConvert() {
    startConvert(async () => {
      const res = await convertLeadToCustomer(partner.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleLogoFromWebsite() {
    startFavicon(async () => {
      const res = await setPartnerLogoFromWebsite(partner.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <div className="glass stagger mb-3 flex flex-wrap items-center gap-4 p-4">
      <div className="group relative">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="thumb-ring size-16 rounded-full object-cover" width={64} height={64} />
        ) : (
          <span className="avatar-ring size-16 text-[18px]">{initialsOf(partner.name)}</span>
        )}
        <button
          type="button"
          className="icon-pill absolute -right-1.5 -bottom-1.5 size-7"
          aria-label="Αλλαγή λογότυπου"
          onClick={() => setPickerOpen(true)}
        >
          <ImagePlus className="size-3.5" strokeWidth={1.9} aria-hidden />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[20px]">{partner.name}</h1>
          <span className="badge-pill info">{partner.sodtype === 12 ? 'Προμηθευτής' : 'Πελάτης'}</span>
          {partner.sodtype === 13 && (
            <span className={`badge-pill ${partner.status === 'LEAD' ? 'warn' : 'ok'}`}>
              {partner.status === 'LEAD' ? 'Υποψήφιος' : 'Πελάτης'}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {[partner.afm ? `ΑΦΜ ${partner.afm}` : null, [partner.city, partner.address].filter(Boolean).join(', ') || null]
            .filter(Boolean).join(' · ') || 'Χωρίς επιπλέον στοιχεία'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" onClick={handleLogoFromWebsite} disabled={favicoLoading}>
          {favicoLoading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Globe2 className="size-3.5" aria-hidden />}
          Από website
        </Button>
        {partner.sodtype === 13 && partner.status === 'LEAD' && (
          <Button type="button" onClick={handleConvert} disabled={converting}>
            <ArrowUpRight className="size-3.5" aria-hidden /> {converting ? 'Μετατροπή…' : 'Μετατροπή σε Πελάτη'}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5" aria-hidden /> Επεξεργασία
        </Button>
      </div>

      <PartnerFormDialog mode="edit" open={editOpen} onOpenChange={setEditOpen} partner={partner} mapsConfig={mapsConfig} />

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        accept={['IMAGE']}
        onSelect={assets => {
          const asset = assets[0]
          if (!asset) return
          setPartnerLogo(partner.id, asset.url)
            .then(res => { if (res.ok) toast.success(res.message); else toast.error(res.message) })
            .catch(() => toast.error('Αποτυχία αποθήκευσης λογότυπου.'))
        }}
      />
    </div>
  )
}
