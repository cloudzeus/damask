'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MapPin, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { geocodeSuggestAction } from './actions'
import type { GeocodeResult } from '@/lib/geocode'

/**
 * Address input σε δύο στρώματα:
 *
 * (a) **Google `PlaceAutocompleteElement`** (νέο Places API — μετά 3/2025 το legacy
 *     `google.maps.places.Autocomplete` απαιτεί το Places API (New) ενεργοποιημένο στο GCP
 *     project του key, αλλιώς πετάει `ApiNotActivatedMapError`). Custom element — ΔΕΝ ενισχύει
 *     ένα δικό μας `<input>` (όπως το legacy API), αλλά τοποθετείται μόνο του μέσα σε
 *     `containerRef`. Η επιλογή (`gmp-select`) καλεί `place.fetchFields(...)` και γεμίζει τα ίδια
 *     πεδία με πριν.
 * (b) **Fallback μέσω geocode.maps.co** (`geocodeSuggestAction`, βλ. actions.ts/lib/geocode.ts) —
 *     δικό μας debounced autocomplete dropdown. Ενεργοποιείται όταν δεν υπάρχει key, όταν το
 *     Google script/library αποτύχει να φορτώσει/κατασκευαστεί, ή όταν πιάσουμε γνωστό Google
 *     Maps API error event (π.χ. `ApiNotActivatedMapError`) — είτε στο αρχικό detection
 *     παράθυρο είτε αργότερα, όποτε ο χρήστης πληκτρολογήσει και το Google request αποτύχει.
 *
 * Το Maps JS API ΔΕΝ έχει επίσημο callback για σφάλματα όπως `ApiNotActivatedMapError· απλά τα
 * γράφει στο `console.error` και σιωπηλά αποτυγχάνουν οι επόμενες κλήσεις. Εγκαθιστούμε ΜΙΑ φορά
 * ανά σελίδα ένα λεπτό patch πάνω στο `console.error` που αναγνωρίζει τα γνωστά ονόματα σφαλμάτων
 * Google Maps και τα προωθεί σαν `CustomEvent` — ΧΩΡΙΣ να ξανακαλεί το original `console.error`
 * γι' αυτά (μόνο ΕΝΑ φιλικό `console.warn`), ώστε να μην πυροδοτείται το κόκκινο Next dev overlay.
 */

export type PlaceResolved = {
  address: string
  city: string
  zip: string
  country: string
  lat: number
  lng: number
}

type Phase = 'no-key' | 'detecting' | 'google' | 'fallback'

const SCRIPT_ATTR = 'data-damask-google-places'
const API_ERROR_EVENT = 'damask:google-maps-api-error'
const KNOWN_GOOGLE_MAPS_ERRORS = ['ApiNotActivatedMapError', 'RefererNotAllowedMapError', 'InvalidKeyMapError', 'MissingKeyMapError', 'ApiTargetBlockedMapError']

/** Πόση ώρα περιμένουμε αρχικά πριν δεχτούμε το Google widget ως «δουλεύει» — απλά ένα αρχικό
 * buffer· το reactive fallback (βλ. `onKnownError`) παραμένει ενεργό και ΜΕΤΑ από αυτό το
 * παράθυρο, αφού το `ApiNotActivatedMapError` συνήθως εμφανίζεται μόνο όταν ο χρήστης γράψει
 * (πρώτο πραγματικό request), όχι απαραίτητα κατά την αρχική κατασκευή του widget. */
const GOOGLE_DETECT_TIMEOUT_MS = 3_000

const FALLBACK_DEBOUNCE_MS = 450
const FALLBACK_MIN_CHARS = 3

let googleErrorWarnedOnce = false

function installGoogleMapsErrorWatcher() {
  const w = window as unknown as { __damaskGoogleMapsErrorWatcherInstalled?: boolean }
  if (w.__damaskGoogleMapsErrorWatcherInstalled) return
  w.__damaskGoogleMapsErrorWatcherInstalled = true

  const originalError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const text = args.map(a => String(a)).join(' ')
    const matched = KNOWN_GOOGLE_MAPS_ERRORS.find(name => text.includes(name))
    if (matched) {
      window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: matched }))
      if (!googleErrorWarnedOnce) {
        googleErrorWarnedOnce = true
        console.warn(`[DAMASK] Google Places API μη διαθέσιμο (${matched}) — αυτόματη εναλλαγή σε προτάσεις geocode.maps.co.`)
      }
      return // ΔΕΝ ξανακαλούμε το originalError για γνωστά Google Maps errors — αυτό σβήνει το dev-overlay
    }
    originalError(...args)
  }
}

function windowGoogle(): typeof google | undefined {
  return (window as unknown as { google?: typeof google }).google
}

function importLibraryReady(): boolean {
  return !!windowGoogle()?.maps?.importLibrary
}

const POLL_INTERVAL_MS = 100
const POLL_TIMEOUT_MS = 8_000

/**
 * Με `loading=async` το `<script>` onload πυροδοτεί μόλις κατέβει ο μικρός bootstrap
 * loader — ΟΧΙ όταν έχει ολοκληρωθεί το εσωτερικό setup του `google.maps.importLibrary`
 * (verified live: αμέσως μετά το onload το `importLibrary` μπορεί να λείπει ακόμα για
 * ~100-500ms, ίδιο φαινόμενο με το `google.maps.places.Autocomplete` στο legacy API).
 * Γι' αυτό περιμένουμε (poll, όχι μία ματιά) μέχρι να εμφανιστεί όντως, πριν προχωρήσουμε.
 */
function waitForImportLibrary(deadline = Date.now() + POLL_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    function tick() {
      if (importLibraryReady()) { resolve(); return }
      if (Date.now() >= deadline) { reject(new Error('google-maps-import-library-timeout')); return }
      setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()
  })
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (importLibraryReady()) { resolve(); return }
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}]`)
    if (existing) {
      if (importLibraryReady()) { resolve(); return }
      existing.addEventListener('load', () => waitForImportLibrary().then(resolve, reject), { once: true })
      existing.addEventListener('error', () => reject(new Error('google-maps-script-error')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&libraries=places&v=weekly`
    script.async = true
    script.defer = true
    script.setAttribute(SCRIPT_ATTR, 'true')
    script.addEventListener('load', () => waitForImportLibrary().then(resolve, reject), { once: true })
    script.addEventListener('error', () => reject(new Error('google-maps-script-error')), { once: true })
    document.head.appendChild(script)
  })
}

function componentValue(components: google.maps.places.AddressComponent[] | undefined, type: string): string {
  return components?.find(c => c.types.includes(type))?.longText ?? ''
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
  const [phase, setPhase] = useState<Phase>(apiKey ? 'detecting' : 'no-key')
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<InstanceType<typeof google.maps.places.PlaceAutocompleteElement> | null>(null)
  // Μόλις ο χρήστης αλληλεπιδράσει με το fallback (γράψει/επιλέξει), δεν κάνουμε πλέον swap σε
  // Google ακόμα κι αν το detection ολοκληρωθεί επιτυχώς αργότερα — θα ήταν παραπλανητικό να
  // εξαφανιστεί το κείμενο που μόλις έγραψε.
  const userEngagedRef = useRef(false)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!apiKey) {
      queueMicrotask(() => setPhase('no-key'))
      return
    }
    installGoogleMapsErrorWatcher()

    let torndown = false
    // settled: μόνιμη απόφαση (google Ή fallback) — μπλοκάρει κάθε μεταγενέστερη μετάβαση εκτός
    // από το reactive error-path (toFallback μπορεί να «ανατρέψει» ένα ήδη committed 'google' αν
    // έρθει σφάλμα αργότερα, βλ. onKnownError μέσα στο gmp-error/gmp-select listener του el).
    let settled = false

    function toFallback() {
      if (torndown) return
      settled = true
      if (elementRef.current) {
        elementRef.current.remove()
        elementRef.current = null
      }
      setPhase('fallback')
    }

    function onKnownError() {
      toFallback()
    }
    window.addEventListener(API_ERROR_EVENT, onKnownError)

    // Αν μέχρι τα 3s δεν έχουμε ΟΥΤΕ επιτυχή κατασκευή ΟΥΤΕ σφάλμα, το θεωρούμε αργό/σπασμένο και
    // πέφτουμε σε fallback — καλύτερο από το να μείνει επ' αόριστον σε 'detecting' (το UI δεν
    // μπλοκάρει ποτέ γιατί το 'detecting' ήδη δείχνει το fallback input από την αρχή).
    const detectTimer = setTimeout(() => toFallback(), GOOGLE_DETECT_TIMEOUT_MS)

    void (async () => {
      try {
        await loadGoogleMapsScript(apiKey)
        const g = windowGoogle()
        if (!g?.maps?.importLibrary) throw new Error('google-maps-import-library-missing')
        const places = await g.maps.importLibrary('places')
        if (torndown || settled) return

        const el = new places.PlaceAutocompleteElement()
        el.id = `${id}-gmp`
        el.value = value
        el.addEventListener('gmp-error', onKnownError)
        el.addEventListener('gmp-select', (ev: google.maps.places.PlacePredictionSelectEvent) => {
          void (async () => {
            try {
              const { place: detailed } = await ev.placePrediction.toPlace().fetchFields({
                fields: ['formattedAddress', 'addressComponents', 'location'],
              })
              const loc = detailed.location
              if (!loc) return
              const comps = detailed.addressComponents
              const streetNumber = componentValue(comps, 'street_number')
              const route = componentValue(comps, 'route')
              const city = componentValue(comps, 'locality') || componentValue(comps, 'postal_town') || componentValue(comps, 'administrative_area_level_2')
              const zip = componentValue(comps, 'postal_code')
              const country = componentValue(comps, 'country')
              const address = [route, streetNumber].filter(Boolean).join(' ') || detailed.formattedAddress || ''

              onChangeRef.current(detailed.formattedAddress ?? address)
              onPlaceSelectedRef.current({ address, city, zip, country, lat: loc.lat(), lng: loc.lng() })
            } catch {
              onKnownError()
            }
          })()
        })
        // Best-effort: κρατάμε το controlled value του parent συγχρονισμένο καθώς ο χρήστης
        // γράφει μέσα στο (shadow-DOM) input του custom element, χωρίς επιλογή πρότασης.
        el.addEventListener('input', () => onChangeRef.current(el.value))

        if (torndown || settled) return
        // Το πραγματικό append στο containerRef γίνεται σε ξεχωριστό effect (βλ. παρακάτω) που
        // τρέχει ΜΕΤΑ το commit του phase='google' — τη στιγμή αυτή το container div ίσως δεν
        // έχει καν γίνει mount ακόμα (ακόμα δείχνουμε το fallback branch).
        elementRef.current = el
        clearTimeout(detectTimer)
        if (!userEngagedRef.current) {
          settled = true
          setPhase('google')
        }
        // Αν ο χρήστης έχει ήδη αρχίσει να γράφει στο fallback, δεν διακόπτουμε — το
        // elementRef.current μένει pending, αχρησιμοποίητο, και καθαρίζεται στο unmount.
      } catch {
        clearTimeout(detectTimer)
        toFallback()
      }
    })()

    return () => {
      torndown = true
      clearTimeout(detectTimer)
      window.removeEventListener(API_ERROR_EVENT, onKnownError)
      elementRef.current?.remove()
      elementRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, id])

  // Το container div (`.gpae-host` branch παρακάτω) γίνεται mount ΜΟΝΟ όταν phase==='google' —
  // άρα το πραγματικό append του ήδη κατασκευασμένου elementRef.current πρέπει να γίνει ΕΔΩ, σε
  // effect που τρέχει ΜΕΤΑ το commit (containerRef.current εγγυημένα non-null πλέον), όχι μέσα
  // στο πάνω effect όπου το container ίσως να μην υπάρχει ακόμα στο DOM.
  useEffect(() => {
    if (phase === 'google' && containerRef.current && elementRef.current && !containerRef.current.contains(elementRef.current)) {
      containerRef.current.replaceChildren(elementRef.current)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'google' && elementRef.current && elementRef.current.value !== value) {
      elementRef.current.value = value
    }
  }, [value, phase])

  if (phase === 'google') {
    return (
      <div className="field">
        <label htmlFor={`${id}-gmp`}>{label}{required ? '*' : ''}</label>
        <div className="inwrap gpae-host" style={{ position: 'relative' }}>
          <div ref={containerRef} />
          <span className="badge-pill info" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>Google</span>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    )
  }

  return (
    <FallbackAddressAutocomplete
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      onPlaceSelected={onPlaceSelected}
      error={error}
      required={required}
      noKey={phase === 'no-key'}
      onEngaged={() => { userEngagedRef.current = true }}
    />
  )
}

function FallbackAddressAutocomplete({
  id, label, value, onChange, onPlaceSelected, error, required, noKey, onEngaged,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onPlaceSelected: (place: PlaceResolved) => void
  error?: string
  required?: boolean
  noKey: boolean
  onEngaged: () => void
}) {
  const [query, setQuery] = useState(value)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Ο parent μπορεί να αλλάξει το value εξωτερικά (π.χ. reset φόρμας, ΑΑΔΕ lookup) — συγχρόνισε.
  // queueMicrotask: αποφεύγει cascading render μέσα στο ίδιο effect commit
  // (react-hooks/set-state-in-effect) — ίδιο idiom με το state='no-key' παραπάνω.
  useEffect(() => { queueMicrotask(() => setQuery(value)) }, [value])

  useEffect(() => {
    const clean = query.trim()
    if (clean.length < FALLBACK_MIN_CHARS) {
      queueMicrotask(() => { setSuggestions([]); setOpen(false) })
      return
    }
    const timeout = setTimeout(() => setDebouncedQuery(clean), FALLBACK_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query])

  // Εξάγουμε το fetch σε ξεχωριστή async function (ίδιο idiom με fetchList του
  // media-picker.tsx) — οι setState κλήσεις εδώ μέσα ΔΕΝ θεωρούνται "συγχρονισμένες μέσα
  // στο effect" από το react-hooks/set-state-in-effect, αφού καλούνται από ξεχωριστή
  // function και όχι απευθείας στο σώμα του effect. requestIdRef προστατεύει από race
  // condition όταν μια παλιά απάντηση φτάσει μετά από νεότερο αίτημα.
  const requestIdRef = useRef(0)
  const runSuggest = useCallback(async (q: string) => {
    const myId = ++requestIdRef.current
    setLoading(true)
    setFetchError(null)
    try {
      const res = await geocodeSuggestAction(q)
      if (requestIdRef.current !== myId) return
      setLoading(false)
      if (res.ok) {
        setSuggestions(res.results)
        setHighlighted(-1)
        setOpen(res.results.length > 0)
      } else {
        setSuggestions([])
        setFetchError(res.message)
      }
    } catch {
      if (requestIdRef.current !== myId) return
      setLoading(false)
      setFetchError('Σφάλμα αναζήτησης διεύθυνσης.')
    }
  }, [])

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < FALLBACK_MIN_CHARS) return
    // queueMicrotask: αποφεύγει το react-hooks/set-state-in-effect (ο linter «βλέπει» μέσα
    // στο runSuggest και αλλιώς θεωρεί το κάλεσμα σαν συγχρονισμένο setState μέσα στο effect).
    queueMicrotask(() => { void runSuggest(debouncedQuery) })
  }, [debouncedQuery, runSuggest])

  function selectResult(r: GeocodeResult) {
    const display = r.displayName || query
    onChange(display)
    setQuery(display)
    onPlaceSelected({ address: r.address ?? '', city: r.city ?? '', zip: r.zip ?? '', country: r.country ?? '', lat: r.lat, lng: r.lng })
    setOpen(false)
    setSuggestions([])
    onEngaged()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && highlighted < suggestions.length) {
        e.preventDefault()
        selectResult(suggestions[highlighted])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="field" style={{ position: 'relative' }}>
      <label htmlFor={id}>{label}{required ? '*' : ''}</label>
      <div className="inwrap">
        <MapPin aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          value={query}
          onChange={e => {
            onEngaged()
            setQuery(e.target.value)
            onChange(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Άρχισε να γράφεις τη διεύθυνση…"
          autoComplete="off"
          required={required}
          style={{ paddingRight: 66 }}
        />
        {loading
          ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden style={{ position: 'absolute', right: 42, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          : null}
        <span className="badge-pill muted" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>OSM</span>
      </div>
      {open && suggestions.length > 0 && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="glass"
          style={{ position: 'absolute', zIndex: 50, top: '100%', marginTop: 4, width: '100%', maxHeight: 260, overflowY: 'auto', padding: 4 }}
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.lat}-${s.lng}-${i}`}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              className={cn('dotted-row-bottom', 'w-full cursor-pointer rounded-lg px-3 py-2 text-left text-[13px]', i === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground')}
              onMouseDown={e => { e.preventDefault(); selectResult(s) }}
              onMouseEnter={() => setHighlighted(i)}
            >
              {s.displayName}
            </button>
          ))}
        </div>
      )}
      {noKey ? (
        <div className="help">Δεν έχει ρυθμιστεί Google Maps API key (Ρυθμίσεις → Χάρτες &amp; Geocoding) — οι προτάσεις διεύθυνσης εμφανίζονται μέσω OSM (geocode.maps.co).</div>
      ) : (
        <div className="help">Για Google προτάσεις: ενεργοποίησε το Places API (New) στο Google Cloud Console (APIs &amp; Services).</div>
      )}
      {fetchError && <div className="help">{fetchError}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
