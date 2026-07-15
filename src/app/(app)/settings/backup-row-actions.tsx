'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LuEllipsisVertical, LuDownload, LuRotateCcw, LuTrash2, LuShieldAlert } from 'react-icons/lu'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { restoreBackupAction, deleteBackupAction } from './backups-actions'
import type { BackupRow } from './backups-table'

const RESTORE_CONFIRM_WORD = 'RESTORE'

export function BackupRowActions({ backup }: { backup: BackupRow }) {
  const [restoring, startRestore] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const canRestore = backup.status === 'READY'
  const canDownload = backup.status === 'READY' || backup.status === 'RESTORING'
  const canDelete = backup.status !== 'RESTORING'

  function handleRestoreOpenChange(open: boolean) {
    setRestoreOpen(open)
    if (!open) setConfirmText('')
  }

  function handleRestore() {
    startRestore(async () => {
      const res = await restoreBackupAction(backup.id)
      if (res.ok) {
        toast.success(res.message)
        setRestoreOpen(false)
        setConfirmText('')
      } else {
        toast.error(res.message)
      }
    })
  }

  function handleDelete() {
    startDelete(async () => {
      const res = await deleteBackupAction(backup.id)
      if (res.ok) {
        toast.success(res.message)
        setDeleteOpen(false)
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${backup.filename}`}>
              <LuEllipsisVertical className="size-4" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          {canDownload && (
            <DropdownMenuItem render={<a href={`/api/backups/${backup.id}/download`} />}>
              <LuDownload className="size-3.5" aria-hidden /> Λήψη
            </DropdownMenuItem>
          )}
          {canRestore && (
            <DropdownMenuItem onClick={() => setRestoreOpen(true)}>
              <LuRotateCcw className="size-3.5" aria-hidden /> Επαναφορά…
            </DropdownMenuItem>
          )}
          {(canDownload || canRestore) && <DropdownMenuSeparator />}
          <DropdownMenuItem variant="destructive" disabled={!canDelete} onClick={() => setDeleteOpen(true)}>
            <LuTrash2 className="size-3.5" aria-hidden /> Διαγραφή
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={restoreOpen} onOpenChange={handleRestoreOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Επαναφορά ολόκληρης της βάσης από «{backup.filename}»;</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="mb-2 flex items-start gap-1.5">
                <LuShieldAlert className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden />
                <span>
                  Αυτό ΑΝΤΙΚΑΘΙΣΤΑ όλα τα δεδομένα της ζωντανής βάσης με την κατάσταση του {backup.createdAtLabel}. Πριν
                  ξεκινήσει, δημιουργείται αυτόματα ΝΕΟ αντίγραφο ασφαλείας της τρέχουσας κατάστασης — αλλά η ίδια η
                  επαναφορά δεν αναιρείται με ένα κλικ.
                </span>
              </span>
              Πληκτρολόγησε <b>{RESTORE_CONFIRM_WORD}</b> για να ενεργοποιηθεί το κουμπί.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="field">
            <label htmlFor="restore-confirm-input">Επιβεβαίωση</label>
            <Input
              id="restore-confirm-input"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={RESTORE_CONFIRM_WORD}
              autoComplete="off"
              autoFocus
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={confirmText !== RESTORE_CONFIRM_WORD || restoring}
              onClick={handleRestore}
            >
              {restoring ? 'Γίνεται επαναφορά…' : 'Επαναφορά'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή του backup «{backup.filename}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Διαγράφεται μόνιμα και από το BunnyCDN. Δεν μπορεί να αναιρεθεί.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
