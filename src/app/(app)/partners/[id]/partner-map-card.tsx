'use client'

import { useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { RefreshCw, LoaderCircle, MapPinned } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { refreshCoordinatesFromAddress } from '../actions'

// Leaflet αναφέρεται στο `window` κατά το import — αποκλειστικά client-side (ssr:false),
// ίδιο idiom με οποιοδήποτε browser-only widget σε αυτό το Next app.
const PartnerMapInner = dynamic(() => import('./partner-map-inner').then(m => m.PartnerMapInner), {
  ssr: false,
  loading: () => <Skeleton style={{ height: 260, borderRadius: 14 }} />,
})

export function PartnerMapCard({
  id, lat, lng, maptilerApiKey, editable,
}: {
  id: string
  lat: number | null
  lng: number | null
  maptilerApiKey: string | null
  editable: boolean
}) {
  const [refreshing, startRefresh] = useTransition()

  function handleRefresh() {
    startRefresh(async () => {
      const res = await refreshCoordinatesFromAddress(id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Χάρτης
        </div>
        {editable && (
          <button type="button" className="btn-pill btn-glass h-8 px-3.5 text-[12px]" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            Ενημέρωση από διεύθυνση
          </button>
        )}
      </div>

      <PartnerMapInner id={id} lat={lat} lng={lng} maptilerApiKey={maptilerApiKey} editable={editable} />

      {lat == null || lng == null ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <MapPinned className="size-3.5 shrink-0" aria-hidden /> Χωρίς συντεταγμένες ακόμα — κάνε κλικ στον χάρτη ή πάτησε «Ενημέρωση από διεύθυνση».
        </p>
      ) : (
        <p className="mt-2 text-[11.5px] text-muted-foreground">Συντεταγμένες: {lat.toFixed(5)}, {lng.toFixed(5)}</p>
      )}
    </div>
  )
}
