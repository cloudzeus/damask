'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPinned, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { bulkMatchTrdrRegions, type BulkMatchTallies } from '@/lib/trdr/enrich-actions'

function talliesLabel(t: BulkMatchTallies): string {
  const parts = [`ΓΕΜΗ ${t.gemi}`, `Όνομα ${t.name}`, `Γεω ${t.geo}`, `Δεν βρέθηκαν ${t.none}`]
  if (t.failed > 0) parts.push(`Απέτυχαν ${t.failed}`)
  return parts.join(' · ')
}

/** Toolbar «Μαζικός εντοπισμός περιφερειών» (W2 T4 §0.8α) — confirm → bulkMatchTrdrRegions → toast tallies. */
export function BulkRegionMatchButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      const tallies = await bulkMatchTrdrRegions()
      toast.success(`Μαζικός εντοπισμός περιφερειών: ${talliesLabel(tallies)}.`)
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ο μαζικός εντοπισμός περιφερειών απέτυχε.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MapPinned className="size-3.5" strokeWidth={1.8} aria-hidden /> Μαζικός εντοπισμός περιφερειών
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Μαζικός εντοπισμός περιφερειών;</AlertDialogTitle>
            <AlertDialogDescription>
              Θα ελεγχθούν όλοι οι συναλλασσόμενοι χωρίς περιφέρεια (έως 500) και θα ενημερωθεί το πεδίο όπου εντοπιστεί αντιστοίχιση.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Άκυρο</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={handleConfirm}>
              {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <MapPinned className="size-3.5" aria-hidden />}
              Εντοπισμός
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
