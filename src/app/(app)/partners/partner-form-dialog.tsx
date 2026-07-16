'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Building2, Hash, Landmark, Briefcase, Mail, Phone, Globe, Building, MapPinned, Compass, StickyNote, Search, LoaderCircle,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createPartner, updatePartner, lookupPartnerAfm, geocodeAddressAction, type PartnerFormValues } from './actions'
import { GooglePlacesInput, type PlaceResolved } from './google-places-input'
import type { MapsClientConfig } from './actions'

const SODTYPE_OPTIONS = [
  { value: '13', label: 'Πελάτης' },
  { value: '12', label: 'Προμηθευτής' },
] as const

const STATUS_OPTIONS = [
  { value: 'LEAD', label: 'Υποψήφιος (Lead)' },
  { value: 'CUSTOMER', label: 'Πελάτης' },
] as const

export type EditablePartner = {
  id: string
  sodtype: number
  status: 'LEAD' | 'CUSTOMER'
  name: string
  afm: string | null
  doy: string | null
  legalForm: string | null
  profession: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  city: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  notes: string | null
}

function emptyForm(): PartnerFormValues {
  return {
    sodtype: 13,
    status: 'LEAD',
    name: '',
    afm: '',
    doy: '',
    legalForm: '',
    profession: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    zip: '',
    lat: null,
    lng: null,
    notes: '',
  }
}

function toFormValues(p: EditablePartner): PartnerFormValues {
  return {
    sodtype: p.sodtype === 12 ? 12 : 13,
    status: p.status,
    name: p.name,
    afm: p.afm ?? '',
    doy: p.doy ?? '',
    legalForm: p.legalForm ?? '',
    profession: p.profession ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    website: p.website ?? '',
    address: p.address ?? '',
    city: p.city ?? '',
    zip: p.zip ?? '',
    lat: p.lat,
    lng: p.lng,
    notes: p.notes ?? '',
  }
}

export function PartnerFormDialog({
  mode, open, onOpenChange, partner, mapsConfig, onCreated,
}: {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  partner?: EditablePartner
  mapsConfig: MapsClientConfig
  onCreated?: (partnerId: string) => void
}) {
  const [values, setValues] = useState<PartnerFormValues>(() => (partner ? toFormValues(partner) : emptyForm()))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [afmLooking, startAfmLookup] = useTransition()
  const [geocoding, startGeocode] = useTransition()
  const [coordsHint, setCoordsHint] = useState<string | null>(
    partner?.lat != null && partner?.lng != null ? `${partner.lat.toFixed(5)}, ${partner.lng.toFixed(5)}` : null,
  )

  function set<K extends keyof PartnerFormValues>(key: K, value: PartnerFormValues[K]) {
    setValues(v => ({ ...v, [key]: value }))
    setFieldErrors(e => {
      if (!(key in e)) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function handleSodtypeChange(next: '12' | '13') {
    const sodtype = next === '12' ? 12 : 13
    set('sodtype', sodtype)
    if (sodtype === 12) set('status', 'CUSTOMER') // status badge δεν εμφανίζεται σε προμηθευτές — force CUSTOMER
  }

  function handlePlaceSelected(place: PlaceResolved) {
    setValues(v => ({
      ...v,
      address: place.address || v.address,
      city: place.city || v.city,
      zip: place.zip || v.zip,
      lat: place.lat,
      lng: place.lng,
    }))
    setCoordsHint(`${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`)
  }

  function handleAfmLookup() {
    const afm = (values.afm ?? '').trim()
    if (!/^\d{9}$/.test(afm)) {
      toast.error('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
      return
    }
    startAfmLookup(async () => {
      const res = await lookupPartnerAfm(afm)
      if (!res.ok) { toast.error(res.message); return }
      if (!res.found) { toast.warning('Δεν βρέθηκαν στοιχεία για αυτό το ΑΦΜ στο μητρώο της ΑΑΔΕ.'); return }
      const c = res.company
      setValues(v => ({
        ...v,
        name: c.name || v.name,
        doy: c.doy ?? v.doy,
        legalForm: c.legalForm ?? v.legalForm,
        profession: c.profession ?? v.profession,
        address: c.address ?? v.address,
        city: c.city ?? v.city,
        zip: c.zip ?? v.zip,
      }))
      toast.success('Συμπληρώθηκαν τα στοιχεία από την ΑΑΔΕ.')
    })
  }

  function handleGeocode() {
    const address = [values.address, values.city, values.zip].filter(Boolean).join(', ')
    if (!address.trim()) {
      toast.error('Συμπλήρωσε πρώτα διεύθυνση.')
      return
    }
    startGeocode(async () => {
      const res = await geocodeAddressAction(address)
      if (!res.ok) { toast.error(res.message); return }
      set('lat', res.result.lat)
      set('lng', res.result.lng)
      setCoordsHint(`${res.result.lat.toFixed(5)}, ${res.result.lng.toFixed(5)}`)
      toast.success('Βρέθηκαν συντεταγμένες.')
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createPartner(values)
        if (res.ok) {
          toast.success(res.message)
          onOpenChange(false)
          if (res.partnerId) onCreated?.(res.partnerId)
        } else {
          toast.error(res.message)
          setFieldErrors(res.fieldErrors ?? {})
        }
        return
      }
      const res = await updatePartner(partner!.id, values)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[88vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Νέος συναλλασσόμενος' : `Επεξεργασία — ${partner?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Δημιούργησε τοπική καρτέλα πελάτη ή προμηθευτή.' : 'Ενημέρωσε τα στοιχεία της καρτέλας.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <div className="field">
              <label htmlFor="partner-form-sodtype">Τύπος*</label>
              <Select value={String(values.sodtype) as '12' | '13'} onValueChange={v => handleSodtypeChange(v as '12' | '13')}>
                <SelectTrigger id="partner-form-sodtype" aria-label="Τύπος" className="h-11 w-full rounded-full border-border bg-card px-4">
                  <SelectValue>{(v: string) => SODTYPE_OPTIONS.find(o => o.value === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SODTYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {values.sodtype === 13 && (
              <div className="field">
                <label htmlFor="partner-form-status">Κατάσταση*</label>
                <Select value={values.status} onValueChange={v => set('status', v as 'LEAD' | 'CUSTOMER')}>
                  <SelectTrigger id="partner-form-status" aria-label="Κατάσταση" className="h-11 w-full rounded-full border-border bg-card px-4">
                    <SelectValue>{(v: string) => STATUS_OPTIONS.find(o => o.value === v)?.label ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="sm:col-span-2" style={{ gridColumn: values.sodtype === 13 ? undefined : '1 / -1' }}>
              <div className="field">
                <label htmlFor="partner-form-name">Επωνυμία*</label>
                <div className="inwrap">
                  <Building2 aria-hidden />
                  <input id="partner-form-name" value={values.name} onChange={e => set('name', e.target.value)} required placeholder="π.χ. Interior Concept Ε.Π.Ε." />
                </div>
                {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-afm">ΑΦΜ</label>
              <div className="inwrap" style={{ paddingRight: 4 }}>
                <Hash aria-hidden />
                <input id="partner-form-afm" value={values.afm} onChange={e => set('afm', e.target.value.replace(/\D/g, ''))} maxLength={9} placeholder="9 ψηφία" style={{ paddingRight: 78 }} />
                <button
                  type="button"
                  className="eye"
                  style={{ right: 6, width: 'auto', padding: '0 9px', gap: 4, fontSize: 11, fontWeight: 700 }}
                  onClick={handleAfmLookup}
                  disabled={afmLooking}
                >
                  {afmLooking ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Search className="size-3.5" aria-hidden />}
                  ΑΑΔΕ
                </button>
              </div>
              {fieldErrors.afm && <div className="error">{fieldErrors.afm}</div>}
            </div>

            <div className="field">
              <label htmlFor="partner-form-doy">ΔΟΥ</label>
              <div className="inwrap">
                <Landmark aria-hidden />
                <input id="partner-form-doy" value={values.doy} onChange={e => set('doy', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-legalform">Νομική μορφή</label>
              <div className="inwrap">
                <Briefcase aria-hidden />
                <input id="partner-form-legalform" value={values.legalForm} onChange={e => set('legalForm', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-profession">Δραστηριότητα</label>
              <div className="inwrap">
                <Briefcase aria-hidden />
                <input id="partner-form-profession" value={values.profession} onChange={e => set('profession', e.target.value)} />
              </div>
            </div>

            <div className="sm:col-span-2">
              <GooglePlacesInput
                id="partner-form-address"
                label="Διεύθυνση"
                apiKey={mapsConfig.googleMapsApiKey}
                value={values.address ?? ''}
                onChange={v => set('address', v)}
                onPlaceSelected={handlePlaceSelected}
                error={fieldErrors.address}
              />
            </div>

            <div className="field">
              <label htmlFor="partner-form-city">Πόλη</label>
              <div className="inwrap">
                <Building aria-hidden />
                <input id="partner-form-city" value={values.city} onChange={e => set('city', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-zip">ΤΚ</label>
              <div className="inwrap">
                <MapPinned aria-hidden />
                <input id="partner-form-zip" value={values.zip} onChange={e => set('zip', e.target.value)} />
              </div>
            </div>

            <div className="sm:col-span-2 flex items-center gap-2.5">
              <Button type="button" variant="outline" onClick={handleGeocode} disabled={geocoding}>
                {geocoding ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Compass className="size-3.5" aria-hidden />}
                Γεωκωδικοποίηση
              </Button>
              <span className="text-[11.5px] text-muted-foreground">
                {coordsHint ? `Συντεταγμένες: ${coordsHint}` : 'Χωρίς συντεταγμένες ακόμα — επίλεξε πρόταση Google Places ή πάτησε «Γεωκωδικοποίηση».'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="partner-form-phone">Τηλέφωνο</label>
              <div className="inwrap">
                <Phone aria-hidden />
                <input id="partner-form-phone" type="tel" value={values.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-email">Email</label>
              <div className="inwrap">
                <Mail aria-hidden />
                <input id="partner-form-email" type="email" value={values.email} onChange={e => set('email', e.target.value)} />
              </div>
              {fieldErrors.email && <div className="error">{fieldErrors.email}</div>}
            </div>

            <div className="sm:col-span-2">
              <div className="field">
                <label htmlFor="partner-form-website">Website</label>
                <div className="inwrap">
                  <Globe aria-hidden />
                  <input id="partner-form-website" value={values.website} onChange={e => set('website', e.target.value)} placeholder="https://…" />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="field">
                <label htmlFor="partner-form-notes">Σημειώσεις</label>
                <div className="inwrap" style={{ alignItems: 'flex-start', paddingTop: 9 }}>
                  <StickyNote aria-hidden />
                  <textarea
                    id="partner-form-notes"
                    value={values.notes}
                    onChange={e => set('notes', e.target.value)}
                    rows={2}
                    style={{ resize: 'vertical', width: '100%', border: 'none', background: 'transparent', outline: 'none', font: 'inherit', padding: '4px 0' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending}>{pending ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
