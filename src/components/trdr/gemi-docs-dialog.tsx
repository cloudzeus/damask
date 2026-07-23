'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LoaderCircle, Download, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { listTrdrGemiDocuments, saveTrdrGemiDocument, type GemiDocumentPreview } from '@/lib/trdr/enrich-actions'

const DOC_KIND_LABEL: Record<GemiDocumentPreview['docKind'], string> = {
  DECISION: 'Απόφαση',
  PUBLICATION: 'Δημοσίευση',
}

/**
 * «Προβολή εγγράφων ΓΕΜΗ» (W2 T4 §0.8β) — on-demand ζωντανή λίστα (χωρίς
 * αποθήκευση) από `listTrdrGemiDocuments`, με «Αποθήκευση» ανά έγγραφο
 * (`saveTrdrGemiDocument`) → refresh της ίδιας λίστας (badge «Αποθηκευμένο»).
 */
export function GemiDocsDialog({
  trdrId, open, onOpenChange, onSaved,
}: {
  trdrId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const [items, setItems] = React.useState<GemiDocumentPreview[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [savingKak, setSavingKak] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setItems(null)
    setError(null)
    listTrdrGemiDocuments(trdrId)
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Η φόρτωση εγγράφων ΓΕΜΗ απέτυχε.'))
  }, [trdrId])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  async function handleSave(item: GemiDocumentPreview) {
    if (!item.sourceUrl) { toast.error('Το έγγραφο δεν έχει διαθέσιμο αρχείο για λήψη.'); return }
    setSavingKak(item.kak)
    try {
      await saveTrdrGemiDocument(trdrId, {
        kak: item.kak,
        docKind: item.docKind,
        title: item.title,
        sourceUrl: item.sourceUrl,
        dates: item.dates,
      })
      toast.success(`Το έγγραφο «${item.title}» αποθηκεύτηκε.`)
      load()
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποθήκευση του εγγράφου απέτυχε.')
    } finally {
      setSavingKak(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[85vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Έγγραφα ΓΕΜΗ</DialogTitle>
          <DialogDescription>Ζωντανή λίστα από το ΓΕΜΗ — επίλεξε ποια έγγραφα θα αποθηκευτούν στην καρτέλα.</DialogDescription>
        </DialogHeader>

        {items === null && !error && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση εγγράφων ΓΕΜΗ…
          </div>
        )}
        {error && <div className="notice"><span>{error}</span></div>}
        {items !== null && items.length === 0 && (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">Δεν βρέθηκαν έγγραφα στο ΓΕΜΗ.</p>
        )}
        {items !== null && items.length > 0 && (
          <div className="flex flex-col">
            {items.map(item => (
              <div key={item.kak} className="dotted-row-bottom flex flex-wrap items-center gap-2.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="badge-pill muted shrink-0">{DOC_KIND_LABEL[item.docKind]}</span>
                    <b className="truncate text-[13px]">{item.title}</b>
                  </div>
                  {item.dates.dateAnnounced && (
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      Ανακοίνωση: {new Date(item.dates.dateAnnounced).toLocaleDateString('el-GR')}
                    </div>
                  )}
                </div>
                {item.alreadySaved ? (
                  <span className="badge-pill ok shrink-0"><Check className="size-3" aria-hidden /> Αποθηκευμένο</span>
                ) : (
                  <Button type="button" size="sm" variant="outline" disabled={savingKak === item.kak} onClick={() => handleSave(item)}>
                    {savingKak === item.kak ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
                    Αποθήκευση
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogClose render={<Button variant="ghost" className="mt-1 self-end">Κλείσιμο</Button>} />
      </DialogContent>
    </Dialog>
  )
}
