'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Trash2, X } from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { bulkDeleteAssets } from './actions'

/** Floating footer «N επιλεγμένα · Μαζικές ενέργειες» (§4α) — εμφανίζεται όταν
 * υπάρχει έστω μία επιλογή στο grid (checkbox mode ή shift-click). */
export function BulkActionBar({
  selectedIds,
  onClear,
  onDeleted,
}: {
  selectedIds: string[]
  onClear: () => void
  onDeleted: () => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  if (selectedIds.length === 0 || typeof document === 'undefined') return null

  function handleDelete() {
    startTransition(async () => {
      const res = await bulkDeleteAssets(selectedIds)
      if (res.ok) {
        toast.success(res.message)
        setDeleteOpen(false)
        onDeleted()
      } else {
        toast.error(res.message)
      }
    })
  }

  // Portal στο document.body — ένα `position: fixed` μέσα στο κανονικό React
  // tree της σελίδας ρισκάρει να "παγιδευτεί" από accent transform/filter σε
  // κάποιον πρόγονο (π.χ. backdrop-filter του .glass ή page-transition
  // transform), οπότε το fixed positioning δεν κολλάει πια στο viewport αλλά
  // σε εκείνον τον πρόγονο. Το ίδιο idiom με το MediaLightbox.
  return createPortal(
    <>
      <div
        className="glass fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2"
        style={{ boxShadow: 'var(--shadow-float)' }}
      >
        <span className="pl-1 text-[13px] font-semibold tabular-nums">{selectedIds.length} επιλεγμένα</span>
        <button type="button" className="btn-pill btn-glass" onClick={onClear}>
          <X className="size-3.5" strokeWidth={1.8} aria-hidden /> Άκυρο
        </button>
        <button type="button" className="btn-pill btn-destructive-pill" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-3.5" strokeWidth={1.8} aria-hidden /> Διαγραφή επιλεγμένων ({selectedIds.length})
        </button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή {selectedIds.length} επιλεγμένων αρχείων;</AlertDialogTitle>
            <AlertDialogDescription>
              Διαγράφονται μόνιμα και από το BunnyCDN. Η ενέργεια δεν αναιρείται.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>,
    document.body,
  )
}
