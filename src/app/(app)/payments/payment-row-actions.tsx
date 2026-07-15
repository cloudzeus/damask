'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LuEllipsisVertical, LuExternalLink, LuCopy, LuRefreshCw, LuBan } from 'react-icons/lu'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { refreshPaymentStatus, cancelPayment } from './actions'
import type { PaymentRow } from './payments-table'

function copyText(text: string, okMessage: string) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success(okMessage))
    .catch(() => toast.error('Αποτυχία αντιγραφής.'))
}

export function PaymentRowActions({ payment, canManage }: { payment: PaymentRow; canManage: boolean }) {
  const [refreshing, startRefresh] = useTransition()
  const [canceling, startCancel] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)

  function handleRefresh() {
    startRefresh(async () => {
      const res = await refreshPaymentStatus(payment.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleCancel() {
    startCancel(async () => {
      const res = await cancelPayment(payment.id)
      if (res.ok) {
        toast.success(res.message)
        setCancelOpen(false)
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
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${payment.orderCode}`}>
              <LuEllipsisVertical className="size-4" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a href={payment.checkoutUrl} target="_blank" rel="noopener noreferrer" />}>
            <LuExternalLink className="size-3.5" aria-hidden /> Άνοιγμα checkout link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyText(payment.orderCode, 'Ο κωδικός πληρωμής αντιγράφηκε.')}>
            <LuCopy className="size-3.5" aria-hidden /> Αντιγραφή κωδικού για κατάθεση
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={refreshing} onClick={handleRefresh}>
                <LuRefreshCw className="size-3.5" aria-hidden /> {refreshing ? 'Έλεγχος…' : 'Έλεγχος κατάστασης'}
              </DropdownMenuItem>
              {payment.status === 'PENDING' && (
                <DropdownMenuItem variant="destructive" onClick={() => setCancelOpen(true)}>
                  <LuBan className="size-3.5" aria-hidden /> Ακύρωση
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ακύρωση πληρωμής «{payment.orderCode}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Η ακύρωση είναι ΤΟΠΙΚΗ — δεν ακυρώνει ούτε επιστρέφει τίποτα στο Viva, απλά σημειώνει την πληρωμή ως ακυρωμένη εδώ μέσα.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={canceling} onClick={handleCancel}>
              {canceling ? 'Ακύρωση…' : 'Ακύρωση πληρωμής'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
