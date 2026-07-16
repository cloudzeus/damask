'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Building2, Tag, Fingerprint, Landmark, Briefcase, FileText, MapPin, Building, Hash, Globe2, Flag,
  Phone, Smartphone, Printer, Mail, Wallet, Clock, Link2, Compass, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextField } from './fields'
import { LogosField } from './logos-field'
import { saveCompanyProfile, lookupCompanyAfm, type CompanyProfileValues } from './actions'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="dotted-leader col-span-full mt-1 mb-1.5 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </div>
  )
}

export function CompanyForm({ initial }: { initial: CompanyProfileValues }) {
  const [values, setValues] = useState<CompanyProfileValues>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [lookingUp, startLookup] = useTransition()

  function set<K extends keyof CompanyProfileValues>(key: K, value: CompanyProfileValues[K]) {
    setValues(prev => ({ ...prev, [key]: value }))
    setFieldErrors(errors => {
      if (!(key in errors)) return errors
      const next = { ...errors }
      delete next[key]
      return next
    })
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveCompanyProfile(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
    })
  }

  function handleLookup() {
    if (!values.afm.trim()) {
      toast.error('Συμπλήρωσε πρώτα το ΑΦΜ.')
      return
    }
    startLookup(async () => {
      const result = await lookupCompanyAfm(values.afm)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setValues(prev => ({
        ...prev,
        name: result.data.name || prev.name,
        title: result.data.commerTitle || prev.title,
        address: result.data.address || prev.address,
        zip: result.data.zip || prev.zip,
        district: result.data.district || prev.district,
        doy: result.data.doyDescr || prev.doy,
        jobTypeDesc: result.data.jobTypeDesc || prev.jobTypeDesc,
      }))
      toast.success('Βρέθηκαν στοιχεία από το ΑΑΔΕ — έλεγξε τα πεδία και πάτησε «Αποθήκευση».')
    })
  }

  return (
    <div className="glass p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold">Στοιχεία εταιρείας</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Θα εμφανίζονται σε παραστατικά, email και το δημόσιο site.</p>
        </div>
        <Button type="button" onClick={handleSave} disabled={saving} className="shrink-0">
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
        <SectionLabel>Βασικά στοιχεία</SectionLabel>
        <TextField id="cp-name" label="Επωνυμία" icon={Building2} value={values.name} onChange={v => set('name', v)} error={fieldErrors.name} />
        <TextField id="cp-title" label="Διακριτικός τίτλος" icon={Tag} value={values.title} onChange={v => set('title', v)} error={fieldErrors.title} />
        <div className="field">
          <label htmlFor="cp-afm">ΑΦΜ</label>
          <div className="flex gap-1.5">
            <div className="inwrap flex-1">
              <Fingerprint aria-hidden />
              <input id="cp-afm" value={values.afm} onChange={e => set('afm', e.target.value)} placeholder="9 ψηφία" inputMode="numeric" />
            </div>
            <Button type="button" variant="outline" onClick={handleLookup} disabled={lookingUp} className="h-11 shrink-0 rounded-full px-3.5">
              <Search className="size-3.5" strokeWidth={1.8} aria-hidden />
              {lookingUp ? 'Αναζήτηση…' : 'ΑΑΔΕ'}
            </Button>
          </div>
          {fieldErrors.afm && <div className="error">{fieldErrors.afm}</div>}
        </div>
        <TextField id="cp-doy" label="ΔΟΥ" icon={Landmark} value={values.doy} onChange={v => set('doy', v)} error={fieldErrors.doy} />
        <TextField id="cp-jobtype" label="Δραστηριότητα" icon={Briefcase} value={values.jobTypeDesc} onChange={v => set('jobTypeDesc', v)} error={fieldErrors.jobTypeDesc} />
        <TextField id="cp-gemi" label="Αρ. ΓΕΜΗ" icon={FileText} value={values.gemiNumber} onChange={v => set('gemiNumber', v)} error={fieldErrors.gemiNumber} />

        <SectionLabel>Διεύθυνση</SectionLabel>
        <TextField id="cp-address" label="Διεύθυνση" icon={MapPin} value={values.address} onChange={v => set('address', v)} error={fieldErrors.address} />
        <TextField id="cp-city" label="Πόλη" icon={Building} value={values.city} onChange={v => set('city', v)} error={fieldErrors.city} />
        <TextField id="cp-zip" label="ΤΚ" icon={Hash} value={values.zip} onChange={v => set('zip', v)} error={fieldErrors.zip} />
        <TextField id="cp-district" label="Περιοχή / Νομός" icon={Compass} value={values.district} onChange={v => set('district', v)} error={fieldErrors.district} />
        <TextField id="cp-country" label="Χώρα" icon={Flag} value={values.country} onChange={v => set('country', v)} error={fieldErrors.country} placeholder="Ελλάδα" />
        <TextField id="cp-maps" label="Google Maps link" icon={Link2} value={values.googleMapsLink} onChange={v => set('googleMapsLink', v)} error={fieldErrors.googleMapsLink} />
        <TextField id="cp-lat" label="Γεωγρ. πλάτος (lat)" icon={Compass} value={values.lat} onChange={v => set('lat', v)} error={fieldErrors.lat} />
        <TextField id="cp-lng" label="Γεωγρ. μήκος (lng)" icon={Compass} value={values.lng} onChange={v => set('lng', v)} error={fieldErrors.lng} />

        <SectionLabel>Επικοινωνία</SectionLabel>
        <TextField id="cp-phone" label="Τηλέφωνο" icon={Phone} type="tel" value={values.phone} onChange={v => set('phone', v)} error={fieldErrors.phone} />
        <TextField id="cp-phone2" label="Τηλέφωνο 2" icon={Smartphone} type="tel" value={values.phone2} onChange={v => set('phone2', v)} error={fieldErrors.phone2} />
        <TextField id="cp-fax" label="Fax" icon={Printer} value={values.fax} onChange={v => set('fax', v)} error={fieldErrors.fax} />
        <TextField id="cp-email" label="Email" icon={Mail} type="email" value={values.email} onChange={v => set('email', v)} error={fieldErrors.email} />
        <TextField id="cp-website" label="Website" icon={Globe2} value={values.website} onChange={v => set('website', v)} error={fieldErrors.website} />
        <TextField id="cp-hours" label="Ωράριο" icon={Clock} value={values.hours} onChange={v => set('hours', v)} error={fieldErrors.hours} placeholder="Δευ–Παρ 09:00–17:00" />

        <SectionLabel>Οικονομικά</SectionLabel>
        <TextField id="cp-iban" label="IBAN" icon={Wallet} value={values.iban} onChange={v => set('iban', v)} error={fieldErrors.iban} />

        <SectionLabel>Λογότυπα</SectionLabel>
        <div className="col-span-full">
          <LogosField value={values.logos} onChange={next => set('logos', next)} />
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
      </div>
    </div>
  )
}
