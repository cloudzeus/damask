'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { toast } from 'sonner'
import { reverseGeocodeAction, updatePartnerCoordinates } from '../actions'

/**
 * Leaflet + MapTiler raster tiles (χωρίς βαριά lib — leaflet είναι το standard
 * ελαφρύ npm package). Marker στο lat/lng· κλικ στον χάρτη ξεκινάει reverse
 * geocode και δείχνει toast με κουμπί «Επιβεβαίωση» πριν αποθηκευτούν οι νέες
 * συντεταγμένες (ΠΟΤΕ αθόρυβη αποθήκευση από απλό κλικ).
 */

const DEFAULT_CENTER: [number, number] = [38.0, 23.7] // Ελλάδα, fallback όταν δεν υπάρχουν συντεταγμένες ακόμα

function brassMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'partner-map-marker',
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25c0-8.3-6.7-15-15-15z" fill="#16323F"/>
      <circle cx="15" cy="15" r="6" fill="#fff"/>
    </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  })
}

export function PartnerMapInner({
  id, lat, lng, maptilerApiKey, editable,
}: {
  id: string
  lat: number | null
  lng: number | null
  maptilerApiKey: string | null
  editable: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const hasCoords = lat != null && lng != null
    const center: [number, number] = hasCoords ? [lat!, lng!] : DEFAULT_CENTER
    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, hasCoords ? 15 : 6)
    mapRef.current = map

    const tileUrl = maptilerApiKey
      ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${maptilerApiKey}`
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' // fallback ώστε ο χάρτης να μη μείνει άδειος όταν λείπει το κλειδί

    L.tileLayer(tileUrl, {
      attribution: maptilerApiKey ? '&copy; MapTiler &copy; OpenStreetMap' : '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    if (hasCoords) {
      markerRef.current = L.marker(center, { icon: brassMarkerIcon() }).addTo(map)
    }

    if (editable) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        setPending(true)
        reverseGeocodeAction(e.latlng.lat, e.latlng.lng)
          .then(res => {
            const label = res.ok ? (res.result.displayName || res.result.address || 'Άγνωστη διεύθυνση') : 'Άγνωστη διεύθυνση'
            toast(`Ενημέρωση συντεταγμένων στο: ${label};`, {
              action: {
                label: 'Επιβεβαίωση',
                onClick: () => {
                  updatePartnerCoordinates(id, e.latlng.lat, e.latlng.lng)
                    .then(saveRes => {
                      if (saveRes.ok) {
                        toast.success(saveRes.message)
                        if (markerRef.current) markerRef.current.setLatLng(e.latlng)
                        else if (mapRef.current) markerRef.current = L.marker(e.latlng, { icon: brassMarkerIcon() }).addTo(mapRef.current)
                      } else {
                        toast.error(saveRes.message)
                      }
                    })
                    .catch(() => toast.error('Αποτυχία αποθήκευσης συντεταγμένων.'))
                },
              },
            })
          })
          .finally(() => setPending(false))
      })
    }

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Marker/κέντρο ενημερώνονται όταν αλλάζουν οι συντεταγμένες από εξωτερική ενέργεια
  // (π.χ. «Ενημέρωση από διεύθυνση») χωρίς re-mount ολόκληρου του χάρτη.
  useEffect(() => {
    const map = mapRef.current
    if (!map || lat == null || lng == null) return
    const latlng: [number, number] = [lat, lng]
    if (markerRef.current) markerRef.current.setLatLng(latlng)
    else markerRef.current = L.marker(latlng, { icon: brassMarkerIcon() }).addTo(map)
    map.setView(latlng, Math.max(map.getZoom(), 15))
  }, [lat, lng])

  return (
    <div className="relative overflow-hidden rounded-[14px]" style={{ border: '1px solid var(--border)' }}>
      <div ref={containerRef} style={{ height: 260, width: '100%' }} data-testid="partner-map" />
      {pending && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
          Αναζήτηση διεύθυνσης…
        </div>
      )}
    </div>
  )
}
