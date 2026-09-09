'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuLoaderCircle } from 'react-icons/lu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { isPdfFile, imageFileToPage, rasterizePdf, type RasterizedPage } from '@/lib/ocr/rasterize'
import { getTemplateFields } from '@/lib/tax/actions'
import { RegionPreview, type PreviewRegion } from './region-preview'

/**
 * RV-2b — προεπισκόπηση ΑΠΟΘΗΚΕΥΜΕΝΟΥ record στην καρτέλα: κατεβάζει το
 * αρχειοθετημένο αρχείο (PDF/εικόνα), το rasterize-άρει, φορτώνει τα
 * χαρτογραφημένα πεδία του template και δείχνει τα marks (+ τιμές) πάνω στο
 * έντυπο — τα marks «παραμένουν διαθέσιμα στο preview». Lazy: όλη η δουλειά
 * γίνεται στο mount (το parent το κάνει mount μόνο όταν ανοίξει, με key).
 */

async function fileToPages(file: File): Promise<RasterizedPage[]> {
  if (isPdfFile(file)) { const { pages } = await rasterizePdf(file); return pages }
  return [await imageFileToPage(file)]
}

export function RecordPreviewDialog({
  trdrId, recordId, templateId, title, valueByKey, onClose,
}: {
  trdrId: string
  recordId: string
  templateId: string
  title: string
  /** fieldKey → εμφανιζόμενη τιμή (για την τρέχουσα χρονιά του record). */
  valueByKey: Map<string, string>
  onClose: () => void
}) {
  const [pages, setPages] = React.useState<RasterizedPage[]>([])
  const [regions, setRegions] = React.useState<PreviewRegion[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [res, fields] = await Promise.all([
          fetch(`/partners/${trdrId}/form-records/${recordId}`, { cache: 'no-store' }),
          getTemplateFields(templateId),
        ])
        if (!res.ok) throw new Error('download')
        const blob = await res.blob()
        const file = new File([blob], 'record', { type: blob.type })
        const rasterized = await fileToPages(file)
        if (cancelled) return
        setPages(rasterized)
        setRegions(
          fields
            .filter(f => !!f.regionHint)
            .map(f => ({ page: f.regionHint!.page, bbox: f.regionHint!.bbox, label: f.label, value: valueByKey.get(f.fieldKey) ?? null })),
        )
      } catch {
        if (!cancelled) { setError('Αποτυχία φόρτωσης προεπισκόπησης.'); toast.error('Αποτυχία φόρτωσης προεπισκόπησης εντύπου.') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [trdrId, recordId, templateId, valueByKey])

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="glass sm:max-w-[840px]">
        <DialogHeader>
          <DialogTitle>Προεπισκόπηση εντύπου</DialogTitle>
          <DialogDescription>{title} — οι χαρτογραφημένες περιοχές &amp; οι τιμές πάνω στο αρχειοθετημένο έντυπο.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[0.78125rem] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση δείγματος…
          </div>
        ) : error ? (
          <p className="py-8 text-center text-[0.78125rem] text-coral">{error}</p>
        ) : (
          <RegionPreview pages={pages} regions={regions} />
        )}
      </DialogContent>
    </Dialog>
  )
}
