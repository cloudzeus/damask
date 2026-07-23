'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { gemiSyncTrdr } from '@/lib/trdr/enrich-actions'

/**
 * «Συγχρονισμός ΓΕΜΗ» (W2 T4 §0.8α/β) — confirm→run→toast counts. Reusable
 * controlled dialog (row-action menu στη λίστα /partners ΚΑΙ η καρτέλα
 * ΓΕΜΗ&ΑΑΔΕ, βλ. trdr-enrich-cards.tsx) + `GemiSyncActionItem` wrapper.
 */
export function GemiSyncConfirmDialog({
  trdrId, name, open, onOpenChange,
}: {
  trdrId: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      const res = await gemiSyncTrdr(trdrId, {})
      const docsMsg = res.documentsFailed > 0
        ? `${res.documentsImported} έγγραφα (${res.documentsFailed} απέτυχαν)`
        : `${res.documentsImported} έγγραφα`
      toast.success(`Συγχρονισμός ΓΕΜΗ ολοκληρώθηκε — ${res.kads} ΚΑΔ, ${docsMsg}.`)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ο συγχρονισμός ΓΕΜΗ απέτυχε.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Συγχρονισμός ΓΕΜΗ — «{name}»;</AlertDialogTitle>
          <AlertDialogDescription>
            Θα ενημερωθούν τα στοιχεία ΓΕΜΗ και οι ΚΑΔ, και θα κατέβουν τα διαθέσιμα έγγραφα (αποφάσεις/δημοσιεύσεις).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Άκυρο</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={handleConfirm}>
            {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            Συγχρονισμός
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Row-action drop-in — mirror scan-action-item.tsx idiom (dialog state ζει σε sibling, όχι μέσα στο DropdownMenuContent). */
export function GemiSyncActionItem({ trdrId, name }: { trdrId: string; name: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <DropdownMenuItem onClick={() => setOpen(true)}>
        <RefreshCw className="size-3.5" strokeWidth={1.75} /> Συγχρονισμός ΓΕΜΗ
      </DropdownMenuItem>
      <GemiSyncConfirmDialog trdrId={trdrId} name={name} open={open} onOpenChange={setOpen} />
    </>
  )
}
