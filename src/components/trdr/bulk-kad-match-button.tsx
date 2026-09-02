'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ListChecks, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { bulkAadeKadTrdr, type BulkKadTallies } from '@/lib/trdr/enrich-actions'

function talliesLabel(t: BulkKadTallies): string {
  const parts = [`Ενημερώθηκαν ${t.updated}`, `Χωρίς ΚΑΔ ${t.noKad}`]
  if (t.failed > 0) parts.push(`Απέτυχαν ${t.failed}`)
  return parts.join(' · ')
}

/** Toolbar «Μαζικός εντοπισμός ΚΑΔ» — confirm → bulkAadeKadTrdr → toast tallies. Καθρέφτης του BulkRegionMatchButton. */
export function BulkKadMatchButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      const tallies = await bulkAadeKadTrdr()
      toast.success(`Μαζικός εντοπισμός ΚΑΔ: ${talliesLabel(tallies)}.`)
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ο μαζικός εντοπισμός ΚΑΔ απέτυχε.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ListChecks className="size-3.5" strokeWidth={1.8} aria-hidden /> Μαζικός εντοπισμός ΚΑΔ
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Μαζικός εντοπισμός ΚΑΔ;</AlertDialogTitle>
            <AlertDialogDescription>
              Θα ελεγχθούν όλοι οι συναλλασσόμενοι με ΑΦΜ αλλά χωρίς κανέναν ΚΑΔ (έως 200) και θα εισαχθούν οι ΚΑΔ τους από το μητρώο της ΑΑΔΕ. Γίνεται μία αναζήτηση ΑΑΔΕ ανά συναλλασσόμενο, οπότε μπορεί να διαρκέσει.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Άκυρο</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={handleConfirm}>
              {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <ListChecks className="size-3.5" aria-hidden />}
              Εντοπισμός
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
