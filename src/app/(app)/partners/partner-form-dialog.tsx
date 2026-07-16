'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Building2, Hash, Briefcase, Mail, Phone, Globe, Building, MapPinned, Compass, StickyNote, Search, LoaderCircle,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { CountrySelect } from '@/components/s1/country-select'
import { IrsdataSelect } from '@/components/s1/irsdata-select'
import { TrdCategorySelect } from '@/components/s1/trd-category-select'
import { PaymentSelect } from '@/components/s1/payment-select'
import { ShipmentSelect } from '@/components/s1/shipment-select'
import { createPartner, updatePartner, lookupPartnerAfm, geocodeAddressAction, type PartnerFormValues } from './actions'
import { GooglePlacesInput, type PlaceResolved } from './google-places-input'
import type { MapsClientConfig } from './actions'
import type { S1Option } from '@/lib/s1-options'

const SODTYPE_OPTIONS = [
  { value: '13', label: 'Πελάτης' },
  { value: '12', label: 'Προμηθευτής' },
] as const

const ISPROSP_OPTIONS = [
  { value: '1', label: 'Υποψήφιος (Lead)' },
  { value: '0', label: 'Πελάτης' },
] as const

export type EditablePartner = {
  id: string
  sodtype: number
  isProsp: boolean
  name: string
  afm: string | null
  irsdata: string | null
  jobtypetrd: string | null
  legalForm: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  city: string | null
  zip: string | null
  country: number | null
  trdCategory: number | null
  payment: number | null
  shipment: number | null
  lat: number | null
  lng: number | null
  notes: string | null
}

function emptyForm(): PartnerFormValues {
  return {
    SODTYPE: 13,
    ISPROSP: 1,
    NAME: '',
    AFM: '',
    IRSDATA: '',
    JOBTYPETRD: '',
    appLegalForm: '',
    EMAIL: '',
    PHONE01: '',
    WEBPAGE: '',
    ADDRESS: '',
    CITY: '',
    ZIP: '',
    COUNTRY: '',
    TRDCATEGORY: '',
    PAYMENT: '',
    SHIPMENT: '',
    appLat: null,
    appLng: null,
    appNotes: '',
  }
}

function toFormValues(p: EditablePartner): PartnerFormValues {
  return {
    SODTYPE: p.sodtype === 12 ? 12 : 13,
    ISPROSP: p.isProsp ? 1 : 0,
    NAME: p.name,
    AFM: p.afm ?? '',
    IRSDATA: p.irsdata ?? '',
    JOBTYPETRD: p.jobtypetrd ?? '',
    appLegalForm: p.legalForm ?? '',
    EMAIL: p.email ?? '',
    PHONE01: p.phone ?? '',
    WEBPAGE: p.website ?? '',
    ADDRESS: p.address ?? '',
    CITY: p.city ?? '',
    ZIP: p.zip ?? '',
    COUNTRY: p.country != null ? String(p.country) : '',
    TRDCATEGORY: p.trdCategory != null ? String(p.trdCategory) : '',
    PAYMENT: p.payment != null ? String(p.payment) : '',
    SHIPMENT: p.shipment != null ? String(p.shipment) : '',
    appLat: p.lat,
    appLng: p.lng,
    appNotes: p.notes ?? '',
  }
}

export function PartnerFormDialog({
  mode, open, onOpenChange, partner, mapsConfig, formOptions, onCreated,
}: {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  partner?: EditablePartner
  mapsConfig: MapsClientConfig
  formOptions: { country: S1Option[]; irsdata: S1Option[]; trdCategory: S1Option[]; payment: S1Option[]; shipment: S1Option[] }
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
    set('SODTYPE', sodtype)
    if (sodtype === 12) set('ISPROSP', 0) // lead badge δεν εμφανίζεται σε προμηθευτές — force ISPROSP=0
  }

  function handlePlaceSelected(place: PlaceResolved) {
    setValues(v => ({
      ...v,
      ADDRESS: place.address || v.ADDRESS,
      CITY: place.city || v.CITY,
      ZIP: place.zip || v.ZIP,
      appLat: place.lat,
      appLng: place.lng,
    }))
    setCoordsHint(`${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`)
  }

  function handleAfmLookup() {
    const afm = (values.AFM ?? '').trim()
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
        NAME: c.name || v.NAME,
        appLegalForm: c.legalForm ?? v.appLegalForm,
        JOBTYPETRD: c.profession ?? v.JOBTYPETRD,
        ADDRESS: c.address ?? v.ADDRESS,
        CITY: c.city ?? v.CITY,
        ZIP: c.zip ?? v.ZIP,
      }))
      // Το ΔΟΥ όνομα από ΑΑΔΕ (c.doy) δεν αντιστοιχεί αυτόματα σε Irsdata.CODE — ο χρήστης το επιλέγει από το combo.
      toast.success('Συμπληρώθηκαν τα στοιχεία από την ΑΑΔΕ.')
    })
  }

  function handleGeocode() {
    const address = [values.ADDRESS, values.CITY, values.ZIP].filter(Boolean).join(', ')
    if (!address.trim()) {
      toast.error('Συμπλήρωσε πρώτα διεύθυνση.')
      return
    }
    startGeocode(async () => {
      const res = await geocodeAddressAction(address)
      if (!res.ok) { toast.error(res.message); return }
      set('appLat', res.result.lat)
      set('appLng', res.result.lng)
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
              <Select value={String(values.SODTYPE) as '12' | '13'} onValueChange={v => handleSodtypeChange(v as '12' | '13')}>
                <SelectTrigger id="partner-form-sodtype" aria-label="Τύπος" className="h-11 w-full rounded-full border-border bg-card px-4">
                  <SelectValue>{(v: string) => SODTYPE_OPTIONS.find(o => o.value === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SODTYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {values.SODTYPE === 13 && (
              <div className="field">
                <label htmlFor="partner-form-isprosp">Κατάσταση*</label>
                <Select value={String(values.ISPROSP) as '0' | '1'} onValueChange={v => set('ISPROSP', (v === '1' ? 1 : 0))}>
                  <SelectTrigger id="partner-form-isprosp" aria-label="Κατάσταση" className="h-11 w-full rounded-full border-border bg-card px-4">
                    <SelectValue>{(v: string) => ISPROSP_OPTIONS.find(o => o.value === v)?.label ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ISPROSP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="sm:col-span-2" style={{ gridColumn: values.SODTYPE === 13 ? undefined : '1 / -1' }}>
              <div className="field">
                <label htmlFor="partner-form-name">Επωνυμία*</label>
                <div className="inwrap">
                  <Building2 aria-hidden />
                  <input id="partner-form-name" value={values.NAME} onChange={e => set('NAME', e.target.value)} required placeholder="π.χ. Interior Concept Ε.Π.Ε." />
                </div>
                {fieldErrors.NAME && <div className="error">{fieldErrors.NAME}</div>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-afm">ΑΦΜ</label>
              <div className="inwrap" style={{ paddingRight: 4 }}>
                <Hash aria-hidden />
                <input id="partner-form-afm" value={values.AFM} onChange={e => set('AFM', e.target.value.replace(/\D/g, ''))} maxLength={9} placeholder="9 ψηφία" style={{ paddingRight: 78 }} />
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
              {fieldErrors.AFM && <div className="error">{fieldErrors.AFM}</div>}
            </div>

            <IrsdataSelect
              id="partner-form-irsdata"
              options={formOptions.irsdata}
              value={values.IRSDATA || null}
              onChange={v => set('IRSDATA', v ?? '')}
            />

            <CountrySelect
              id="partner-form-country"
              options={formOptions.country}
              value={values.COUNTRY || null}
              onChange={v => set('COUNTRY', v ?? '')}
            />

            <TrdCategorySelect
              id="partner-form-trdcategory"
              options={formOptions.trdCategory}
              value={values.TRDCATEGORY || null}
              onChange={v => set('TRDCATEGORY', v ?? '')}
            />

            <div className="field">
              <label htmlFor="partner-form-legalform">Νομική μορφή</label>
              <div className="inwrap">
                <Briefcase aria-hidden />
                <input id="partner-form-legalform" value={values.appLegalForm} onChange={e => set('appLegalForm', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-jobtype">Δραστηριότητα</label>
              <div className="inwrap">
                <Briefcase aria-hidden />
                <input id="partner-form-jobtype" value={values.JOBTYPETRD} onChange={e => set('JOBTYPETRD', e.target.value)} />
              </div>
            </div>

            <PaymentSelect
              id="partner-form-payment"
              options={formOptions.payment}
              value={values.PAYMENT || null}
              onChange={v => set('PAYMENT', v ?? '')}
            />

            <ShipmentSelect
              id="partner-form-shipment"
              options={formOptions.shipment}
              value={values.SHIPMENT || null}
              onChange={v => set('SHIPMENT', v ?? '')}
            />

            <div className="sm:col-span-2">
              <GooglePlacesInput
                id="partner-form-address"
                label="Διεύθυνση"
                apiKey={mapsConfig.googleMapsApiKey}
                value={values.ADDRESS ?? ''}
                onChange={v => set('ADDRESS', v)}
                onPlaceSelected={handlePlaceSelected}
                error={fieldErrors.ADDRESS}
              />
            </div>

            <div className="field">
              <label htmlFor="partner-form-city">Πόλη</label>
              <div className="inwrap">
                <Building aria-hidden />
                <input id="partner-form-city" value={values.CITY} onChange={e => set('CITY', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-zip">ΤΚ</label>
              <div className="inwrap">
                <MapPinned aria-hidden />
                <input id="partner-form-zip" value={values.ZIP} onChange={e => set('ZIP', e.target.value)} />
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
                <input id="partner-form-phone" type="tel" value={values.PHONE01} onChange={e => set('PHONE01', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="partner-form-email">Email</label>
              <div className="inwrap">
                <Mail aria-hidden />
                <input id="partner-form-email" type="email" value={values.EMAIL} onChange={e => set('EMAIL', e.target.value)} />
              </div>
              {fieldErrors.EMAIL && <div className="error">{fieldErrors.EMAIL}</div>}
            </div>

            <div className="sm:col-span-2">
              <div className="field">
                <label htmlFor="partner-form-website">Website</label>
                <div className="inwrap">
                  <Globe aria-hidden />
                  <input id="partner-form-website" value={values.WEBPAGE} onChange={e => set('WEBPAGE', e.target.value)} placeholder="https://…" />
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
                    value={values.appNotes}
                    onChange={e => set('appNotes', e.target.value)}
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
