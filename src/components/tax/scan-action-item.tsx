'use client'

import * as React from 'react'
import { LuScanText } from 'react-icons/lu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ScanFormDialog } from './scan-form-dialog'

/**
 * Row-action drop-in για το DropdownMenu ενέργειας μιας γραμμής συναλλασσόμενου
 * (Task 15 — /partners): `<DropdownMenuItem>` που ανοίγει το ScanFormDialog.
 * Ίδιο idiom με guides-table.tsx (delete action) — το state του dialog ζει σε
 * ΑΥΤΟ το component (sibling του DropdownMenuItem, όχι μέσα στο
 * DropdownMenuContent), ώστε το dialog να παραμένει ανοιχτό ακόμη κι όταν το
 * dropdown menu κλείνει μετά το κλικ.
 */
export function ScanActionItem({
  trdrId, trdrName, onSaved,
}: {
  trdrId: string
  trdrName: string
  onSaved?: () => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <DropdownMenuItem onClick={() => setOpen(true)}>
        <LuScanText className="size-3.5" aria-hidden /> Καταχώριση OCR εντύπου
      </DropdownMenuItem>
      <ScanFormDialog trdrId={trdrId} trdrName={trdrName} open={open} onOpenChange={setOpen} onSaved={onSaved} />
    </>
  )
}
