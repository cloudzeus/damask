'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'

/**
 * Address input με Google Places Autocomplete — φορτώνει το Maps JS API script
 * lazily (μόνο όταν υπάρχει apiKey), μία φορά ανά σελίδα (guard σε
 * `document.querySelector`). Καθώς ο χρήστης γράφει εμφανίζονται προτάσεις·
 * η επιλογή γεμίζει address/city/zip/country + lat/lng από τη γεωμετρία του
 * place (onPlaceSelected). Αν το script αποτύχει να φορτώσει (key χωρίς Places
 * API enabled, δίκτυο, κ.λπ.) ή δεν υπάρχει καθόλου key, δείχνει καθαρό
 * ελληνικό fallback μήνυμα — ο χρήστης συνεχίζει με απλό text input +
 * το κουμπί «Γεωκωδικοποίηση» (βλ. partner-form-dialog.tsx).
 */

export type PlaceResolved = {
  address: string
  city: string
  zip: string
  country: string
  lat: number
  lng: number
}

type ScriptState = 'loading' | 'ready' | 'error' | 'error-not-activated' | 'no-key'

const SCRIPT_ATTR = 'data-damask-google-places'
const API_ERROR_EVENT = 'damask:google-maps-api-error'

/**
 * Το Maps JS API ΔΕΝ έχει επίσημο callback για σφάλματα όπως ApiNotActivatedMapError
 * (Places API όχι ενεργοποιημένο στο GCP project του key) — απλά τα γράφει στο
 * console.error και σιωπηλά αποτυγχάνουν οι επόμενες κλήσεις (π.χ. οι προτάσεις
 * του Autocomplete μένουν άδειες, χωρίς exception). Εγκαθιστούμε ΜΙΑ φορά ανά
 * σελίδα ένα λεπτό patch πάνω στο console.error που αναγνωρίζει τα γνωστά
 * ονόματα σφαλμάτων Google Maps και τα προωθεί σαν CustomEvent, ώστε το UI να
 * μπορεί να δείξει καθαρό ελληνικό μήνυμα αντί να μένει σιωπηλά «σπασμένο».
 */
const KNOWN_GOOGLE_MAPS_ERRORS = ['ApiNotActivatedMapError', 'RefererNotAllowedMapError', 'InvalidKeyMapError', 'MissingKeyMapError', 'ApiTargetBlockedMapError']

function installGoogleMapsErrorWatcher() {
  const w = window as unknown as { __damaskGoogleMapsErrorWatcherInstalled?: boolean }
  if (w.__damaskGoogleMapsErrorWatcherInstalled) return
  w.__damaskGoogleMapsErrorWatcherInstalled = true

  const originalError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const text = args.map(a => String(a)).join(' ')
    const matched = KNOWN_GOOGLE_MAPS_ERRORS.find(name => text.includes(name))
    if (matched) window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: matched }))
    originalError(...args)
  }
}

function windowGoogle(): typeof google | undefined {
  return (window as unknown as { google?: typeof google }).google
}

function placesReady(): boolean {
  return !!windowGoogle()?.maps?.places?.Autocomplete
}

const POLL_INTERVAL_MS = 100
const POLL_TIMEOUT_MS = 8_000

/**
 * Με `loading=async` το `<script>` onload πυροδοτεί μόλις κατέβει ο μικρός
 * bootstrap loader — ΟΧΙ όταν έχει ολοκληρωθεί το εσωτερικό, δικό του async
 * φόρτωμα του namespace `google.maps.places` (verified live: αμέσως μετά το
 * onload το `Autocomplete` μπορεί να λείπει ακόμα για ~200-500ms). Γι' αυτό
 * περιμένουμε (poll, όχι μία ματιά) μέχρι να εμφανιστεί όντως το
 * `google.maps.places.Autocomplete`, πριν πούμε στον χρήστη «error».
 */
function waitForPlacesReady(onReady: () => void, onError: () => void, deadline = Date.now() + POLL_TIMEOUT_MS) {
  if (placesReady()) { onReady(); return }
  if (Date.now() >= deadline) { onError(); return }
  setTimeout(() => waitForPlacesReady(onReady, onError, deadline), POLL_INTERVAL_MS)
}

function loadScript(apiKey: string, onReady: () => void, onError: () => void) {
  if (placesReady()) {
    onReady()
    return
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}]`)
  if (existing) {
    waitForPlacesReady(onReady, onError)
    return
  }
  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`
  script.async = true
  script.defer = true
  script.setAttribute(SCRIPT_ATTR, 'true')
  script.addEventListener('load', () => waitForPlacesReady(onReady, onError))
  script.addEventListener('error', onError)
  document.head.appendChild(script)
}

function componentValue(components: google.maps.GeocoderAddressComponent[] | undefined, type: string): string {
  return components?.find(c => c.types.includes(type))?.long_name ?? ''
}

export function GooglePlacesInput({
  id, label, apiKey, value, onChange, onPlaceSelected, error, required,
}: {
  id: string
  label: string
  apiKey: string | null
  value: string
  onChange: (value: string) => void
  onPlaceSelected: (place: PlaceResolved) => void
  error?: string
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // "Latest ref" idiom — ενημερώνεται ΜΕΣΑ σε effect (όχι στο render body) ώστε ο
  // Places listener (effect παρακάτω) να μη χρειάζεται να ξαναδημιουργείται σε
  // κάθε render όταν ο parent περνάει νέο inline onChange/onPlaceSelected.
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected
    onChangeRef.current = onChange
  })
  const [state, setState] = useState<ScriptState>(apiKey ? 'loading' : 'no-key')

  useEffect(() => {
    if (!apiKey) {
      // queueMicrotask: αποφεύγει cascading render μέσα στο ίδιο effect commit
      // (react-hooks/set-state-in-effect) — ίδιο idiom με step-sheet.tsx.
      queueMicrotask(() => setState('no-key'))
      return
    }
    installGoogleMapsErrorWatcher()
    const onApiError = () => setState('error-not-activated')
    window.addEventListener(API_ERROR_EVENT, onApiError)
    loadScript(apiKey, () => setState('ready'), () => setState('error'))
    return () => window.removeEventListener(API_ERROR_EVENT, onApiError)
  }, [apiKey])

  useEffect(() => {
    if (state !== 'ready' || !inputRef.current) return
    const places = windowGoogle()?.maps?.places
    if (!places) {
      queueMicrotask(() => setState('error'))
      return
    }

    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ['address_components', 'geometry', 'formatted_address'],
      types: ['address'],
    })
    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      const location = place.geometry?.location
      if (!location) return

      const comps = place.address_components
      const streetNumber = componentValue(comps, 'street_number')
      const route = componentValue(comps, 'route')
      const city = componentValue(comps, 'locality') || componentValue(comps, 'postal_town') || componentValue(comps, 'administrative_area_level_2')
      const zip = componentValue(comps, 'postal_code')
      const country = componentValue(comps, 'country')
      const address = [route, streetNumber].filter(Boolean).join(' ') || place.formatted_address || inputRef.current!.value

      onChangeRef.current(place.formatted_address ?? address)
      onPlaceSelectedRef.current({ address, city, zip, country, lat: location.lat(), lng: location.lng() })
    })

    return () => listener.remove()
  }, [state])

  return (
    <div className="field">
      <label htmlFor={id}>{label}{required ? '*' : ''}</label>
      <div className="inwrap">
        <MapPin aria-hidden />
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Άρχισε να γράφεις τη διεύθυνση…"
          autoComplete="off"
          required={required}
        />
      </div>
      {state === 'no-key' && (
        <div className="help">Δεν έχει ρυθμιστεί Google Maps API key (Ρυθμίσεις → Χάρτες &amp; Geocoding) — συμπλήρωσε τη διεύθυνση χειροκίνητα και χρησιμοποίησε «Γεωκωδικοποίηση».</div>
      )}
      {state === 'error' && (
        <div className="help">Οι προτάσεις διεύθυνσης δεν είναι διαθέσιμες αυτή τη στιγμή — συμπλήρωσε τη διεύθυνση χειροκίνητα και χρησιμοποίησε «Γεωκωδικοποίηση».</div>
      )}
      {state === 'error-not-activated' && (
        <div className="help">Το Google Maps API key δεν έχει ενεργοποιημένο το Places API (GCP Console → APIs) — συμπλήρωσε τη διεύθυνση χειροκίνητα και χρησιμοποίησε «Γεωκωδικοποίηση».</div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
