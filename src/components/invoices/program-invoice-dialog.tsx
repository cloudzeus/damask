'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  LuScanText, LuLoaderCircle, LuCheck, LuTriangleAlert, LuBuilding2, LuHash,
  LuCalendar, LuEuro, LuPercent, LuSparkles, LuArrowLeft,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { OcrUploader } from '@/components/ocr/ocr-uploader'
import { processProgramInvoice } from '@/lib/invoice-flows/program'
import type { ExtractedDocument } from '@/lib/ocr/schema'
import type { ExpenseCategoryOption } from '@/lib/programs/actions'

/**
 * UI (W4 T2) του Workflow Β «Ευρωπαϊκό Πρόγραμμα» (docs/superpowers/specs/
 * 2026-07-23-invoice-ocr-w4-design.md §Workflow Β) — self-contained trigger +
 * Dialog, mirror του idiom στο replace-expense-dialog.tsx ώστε να τοποθετείται
 * απευθείας στο header του expenses-tab.tsx.
 *
 * Βήμα 1: reuse <OcrUploader> (ίδιο upload/rasterize/review pipeline με το OCR
 * page — runOcrExtraction) → onConfirm δίνει το (πιθανώς διορθωμένο από τον
 * χρήστη) ExtractedDocument. Βήμα 2: preview προμηθευτή+ποσών ειδικά για
 * δαπάνη έργου + checkbox εμπλουτισμού ΑΑΔΕ → «Καταχώριση δαπάνης» →
 * processProgramInvoice (server action, program.ts) → toast (+πρόταση
 * κατηγορίας αν υπάρχει) → onCreated() (refreshKey pattern του tab).
 */

function fmtMoney(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(2)}€`
}

export interface ProgramInvoiceDialogProps {
  applicationId: string
  categories: ExpenseCategoryOption[]
  onCreated: () => void
}

export function ProgramInvoiceDialog({ applicationId, categories, onCreated }: ProgramInvoiceDialogProps) {
  const [open, setOpen] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedDocument | null>(null)
  const [enrichAade, setEnrichAade] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (submitting) return
    setOpen(next)
    if (!next) {
      setExtracted(null)
      setEnrichAade(true)
      setError(null)
    }
  }

  const supplier = extracted?.issuer ?? null
  const afm = supplier?.afm?.trim() ?? ''
  const afmValid = /^\d{9}$/.test(afm)

  async function handleSubmit() {
    if (!extracted) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await processProgramInvoice({ applicationId, extracted, enrichAade })
      const category = result.suggested?.categoryId
        ? categories.find(c => c.id === result.suggested!.categoryId)
        : null
      toast.success(
        category
          ? `Η δαπάνη καταχωρήθηκε — προτεινόμενη κατηγορία: «${category.name}».`
          : 'Η δαπάνη καταχωρήθηκε.',
      )
      handleOpenChange(false)
      onCreated()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Η καταχώριση της δαπάνης απέτυχε.'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <LuScanText className="size-3.5" aria-hidden /> Καταχώριση από OCR
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>Καταχώριση δαπάνης από τιμολόγιο (OCR)</DialogTitle>
            <DialogDescription>
              Ανέβασε το τιμολόγιο του προμηθευτή — μετά την ανάγνωση θα καταχωριστεί ως δαπάνη σε αυτή την αίτηση.
            </DialogDescription>
          </DialogHeader>

          {!extracted ? (
            <OcrUploader title="Ανάγνωση τιμολογίου προμηθευτή" docTypeHint="invoice" onConfirm={setExtracted} />
          ) : (
            <div className="flex flex-col gap-3.5">
              <button
                type="button"
                onClick={() => setExtracted(null)}
                className="flex w-fit items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <LuArrowLeft className="size-3.5" aria-hidden /> Πίσω στο ανέβασμα
              </button>

              <div className="rounded-2xl border border-border p-3.5">
                <span className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold">
                  <LuBuilding2 className="size-3.5" aria-hidden /> Προμηθευτής
                </span>
                <div className="grid grid-cols-1 gap-1.5 text-[12.5px] sm:grid-cols-2">
                  <div><b>Επωνυμία:</b> {supplier?.name || '—'}</div>
                  <div><b>ΑΦΜ:</b> {afm || '—'}</div>
                </div>
                {!afmValid && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--warning)' }}>
                    <LuTriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    Χρειάζεται έγκυρο ΑΦΜ (9 ψηφία) — δεν μπορεί να καταχωριστεί η δαπάνη.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border p-3.5">
                <span className="mb-2 block text-[12.5px] font-bold">Στοιχεία δαπάνης</span>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                      <LuHash className="size-3" aria-hidden /> Αρ. παραστατικού
                    </div>
                    <div className="text-[12.5px]">{extracted.documentNumber || '—'}</div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                      <LuCalendar className="size-3" aria-hidden /> Ημερομηνία
                    </div>
                    <div className="text-[12.5px]">{extracted.date || '—'}</div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                      <LuPercent className="size-3" aria-hidden /> ΦΠΑ
                    </div>
                    <div className="text-[12.5px] tabular-nums">{fmtMoney(extracted.totals.vat)}</div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                      <LuEuro className="size-3" aria-hidden /> Σύνολο
                    </div>
                    <div className="text-[12.5px] font-semibold tabular-nums">{fmtMoney(extracted.totals.gross)}</div>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
                <input
                  type="checkbox"
                  checked={enrichAade}
                  onChange={e => setEnrichAade(e.target.checked)}
                  disabled={submitting}
                  className="size-3.5"
                />
                Εμπλουτισμός από ΑΑΔΕ
              </label>

              {error && (
                <div className="notice" style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)' }} role="alert">
                  <LuTriangleAlert className="size-4 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden />
                  <span style={{ color: 'var(--destructive)' }}>{error}</span>
                </div>
              )}

              <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
                <DialogClose render={<Button type="button" variant="outline" disabled={submitting}>Άκυρο</Button>} />
                <Button type="button" onClick={handleSubmit} disabled={submitting || !afmValid}>
                  {submitting ? (
                    <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Καταχώριση…</>
                  ) : (
                    <><LuSparkles className="size-3.5" aria-hidden /> Καταχώριση δαπάνης</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
