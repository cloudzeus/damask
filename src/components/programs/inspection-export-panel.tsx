'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuFileSpreadsheet, LuFileText, LuLoaderCircle, LuClipboardCheck } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { listExpensePurchases } from '@/lib/programs/expense-purchase'
import { exportInspectionXlsx } from '@/lib/programs/inspection-xlsx'

/**
 * Επιτόπιος έλεγχος (στάδιο «Δελτία ελέγχου») — δύο εξαγωγές για τον ελεγκτή που
 * έρχεται να δει το φυσικό αντικείμενο:
 *  • Excel: όλες οι δαπάνες με αρ. τιμολογίων & serials.
 *  • Word (.doc): όλα τα παραστατικά ως εικόνες (παραστατικό/extrait/φωτο
 *    προϊόντος+θέση/βεβαίωση) ανά δαπάνη.
 */
export function InspectionExportPanel({ applicationId }: { applicationId: string }) {
  const [xlsxBusy, setXlsxBusy] = React.useState(false)

  async function exportXlsx() {
    setXlsxBusy(true)
    try {
      const items = await listExpensePurchases(applicationId)
      if (items.length === 0) { toast.info('Δεν υπάρχουν δαπάνες προς εξαγωγή.'); return }
      exportInspectionXlsx(items)
      toast.success('Το Excel δημιουργήθηκε.')
    } catch { toast.error('Η εξαγωγή απέτυχε.') } finally { setXlsxBusy(false) }
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-1 flex items-center gap-1.5 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        <LuClipboardCheck className="size-3.5" aria-hidden /> Επιτόπιος έλεγχος
      </div>
      <p className="mb-3 text-[0.71875rem] text-muted-foreground">Έτοιμα αρχεία για τον ελεγκτή που έρχεται να δει το φυσικό αντικείμενο.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={exportXlsx} disabled={xlsxBusy}>
          {xlsxBusy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuFileSpreadsheet className="size-3.5" aria-hidden />} Excel δαπανών (τιμολόγια & serials)
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href={`/inspection-report/${applicationId}`} download />}>
          <LuFileText className="size-3.5" aria-hidden /> Word παραστατικών (φωτογραφίες)
        </Button>
      </div>
    </section>
  )
}
