'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MapPinned, KeyRound, Map, Compass, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, SecretField, maskSecretPreview } from '../fields'
import { saveMapsSettings, testMapsSettings, type MapsValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

export type MapsMaskedKeys = {
  googleMapsApiKey: string | null
  maptilerApiKey: string | null
  geocodeApiKey: string | null
  gemiApiKey: string | null
}

/**
 * «Χάρτες & Geocoding» — Google Places Autocomplete (/partners, νέος συναλλασσόμενος),
 * MapTiler tiles (/partners/[id], χάρτης), geocode.maps.co search/reverse
 * (src/lib/geocode.ts), ΓΕΜΗ (opendata.businessportal.gr — αποθηκεύεται εδώ,
 * χρήση σε επόμενο βήμα). Ίδιο idiom με τις υπόλοιπες κάρτες integrations —
 * και τα 4 πεδία έχουν ήδη fallback στα αντίστοιχα .env vars (settings.ts).
 */
export function MapsCard({
  maskedKeys, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  maskedKeys: MapsMaskedKeys
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<MapsValues>({
    googleMapsApiKey: '', maptilerApiKey: '', geocodeApiKey: '', gemiApiKey: '',
  })
  const [maskedHints, setMaskedHints] = useState(maskedKeys)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof MapsValues>(key: K, value: MapsValues[K]) {
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
      const res = await saveMapsSettings(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
      const next = { ...maskedHints }
      let anyNew = false
      for (const key of ['googleMapsApiKey', 'maptilerApiKey', 'geocodeApiKey', 'gemiApiKey'] as const) {
        if (values[key].trim() !== '') {
          next[key] = maskSecretPreview(values[key])
          anyNew = true
        }
      }
      setMaskedHints(next)
      setValues({ googleMapsApiKey: '', maptilerApiKey: '', geocodeApiKey: '', gemiApiKey: '' })
      setConfigured(Boolean(
        (anyNew || next.googleMapsApiKey) && (anyNew || next.maptilerApiKey) && (anyNew || next.geocodeApiKey),
      ))
    })
  }

  function handleTest() {
    startTest(async () => {
      const result = await testMapsSettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={MapPinned}
        title="Χάρτες & Geocoding"
        description="Google Places Autocomplete, MapTiler tiles, geocode.maps.co, ΓΕΜΗ (opendata.businessportal.gr)."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <SecretField id="maps-google" label="Google Maps API Key" icon={KeyRound} value={values.googleMapsApiKey} onChange={v => set('googleMapsApiKey', v)} maskedHint={maskedHints.googleMapsApiKey} error={fieldErrors.googleMapsApiKey} />
        <SecretField id="maps-maptiler" label="MapTiler API Key" icon={Map} value={values.maptilerApiKey} onChange={v => set('maptilerApiKey', v)} maskedHint={maskedHints.maptilerApiKey} error={fieldErrors.maptilerApiKey} />
        <SecretField id="maps-geocode" label="Geocode API Key (geocode.maps.co)" icon={Compass} value={values.geocodeApiKey} onChange={v => set('geocodeApiKey', v)} maskedHint={maskedHints.geocodeApiKey} error={fieldErrors.geocodeApiKey} />
        <SecretField id="maps-gemi" label="ΓΕΜΗ API Key (opendata.businessportal.gr)" icon={Building} value={values.gemiApiKey} onChange={v => set('gemiApiKey', v)} maskedHint={maskedHints.gemiApiKey} error={fieldErrors.gemiApiKey} />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης (geocode)'}</Button>
      </div>
    </div>
  )
}
