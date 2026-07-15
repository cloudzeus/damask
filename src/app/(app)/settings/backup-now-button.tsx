'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { LuDatabaseBackup } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { runBackupNow } from './backups-actions'

/** Πρωτεύον κουμπί ενέργειας της καρτέλας (MASTER §6.1 — μία κύρια ενέργεια/οθόνη,
 * πάνω-δεξιά, με κείμενο). Δεν υπάρχει μετρήσιμο progress % για pg_dump — «progress
 * state» = disabled + μεταβαλλόμενο label κατά τη διάρκεια, ίδιο idiom με
 * Αποθήκευση…/Έλεγχος… σε όλες τις κάρτες integrations. */
export function BackupNowButton() {
  const [running, startRun] = useTransition()

  function handleClick() {
    startRun(async () => {
      const res = await runBackupNow()
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <Button type="button" onClick={handleClick} disabled={running}>
      <LuDatabaseBackup className="size-3.5" aria-hidden />
      {running ? 'Δημιουργία αντιγράφου…' : 'Backup τώρα'}
    </Button>
  )
}
