'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { LoaderCircle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { harvestEspaCallsNow } from '@/lib/programs/actions'

/** «Νέες προσκλήσεις από espa.gr» — συλλογή, φιλτράρισμα (μόνο επιχειρήσεις) και αποδελτίωση ως πρόχειρα. */
export function HarvestEspaButton() {
  const [pending, start] = useTransition()
  return (
    <Button type="button" variant="outline" disabled={pending} title="Συλλογή νέων προσκλήσεων για επιχειρήσεις από το espa.gr (ως πρόχειρα)"
      onClick={() => start(async () => { const r = await harvestEspaCallsNow(); if (r.ok) toast.success(r.message); else toast.error(r.message) })}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pending ? 'Συλλογή… (λίγα λεπτά)' : 'Νέες προσκλήσεις από espa.gr'}
    </Button>
  )
}
