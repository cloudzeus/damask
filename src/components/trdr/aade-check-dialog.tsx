'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderCircle, TriangleAlert, BadgeCheck } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { aadeLookupTrdr, applyAadeToTrdr } from '@/lib/trdr/enrich-actions'
import type { AadeTrdrPatch, AadeTrdrActivity } from '@/lib/trdr/aade'

/**
 * «Έλεγχος ΑΑΔΕ» (W2 T4 §0.8α/β) — preview στοιχείων ΑΑΔΕ πριν την εφαρμογή
 * στην καρτέλα Trdr. Reusable controlled dialog (χρησιμοποιείται ΚΑΙ από το
 * row-action menu στη λίστα /partners ΚΑΙ από την καρτέλα ΓΕΜΗ&ΑΑΔΕ,
 * βλ. trdr-enrich-cards.tsx) + `AadeCheckActionItem` wrapper για dropdown.
 */

type PreviewState =
  | { status: 'loading' }
  | { status: 'found'; mapped: AadeTrdrPatch; activities: AadeTrdrActivity[] }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

function formatDateEl(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('el-GR')
}

export function AadeCheckDialog({
  trdrId, afm, open, onOpenChange,
}: {
  trdrId: string
  afm: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [state, setState] = React.useState<PreviewState>({ status: 'loading' })
  const [applying, setApplying] = React.useState(false)

  React.useEffect(() => {
    if (!open || !afm) return
    let cancelled = false
    setState({ status: 'loading' })
    aadeLookupTrdr(afm)
      .then(res => {
        if (cancelled) return
        if (!res) { setState({ status: 'not_found' }); return }
        setState({ status: 'found', mapped: res.mapped, activities: res.activities })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Σφάλμα επικοινωνίας με την υπηρεσία ΑΑΔΕ.' })
      })
    return () => { cancelled = true }
  }, [open, afm])

  async function handleApply() {
    setApplying(true)
    try {
      const res = await applyAadeToTrdr(trdrId)
      toast.success(`Εφαρμόστηκαν τα στοιχεία ΑΑΔΕ για «${res.name}» (${res.kads} ΚΑΔ).`)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η εφαρμογή στοιχείων ΑΑΔΕ απέτυχε.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[85vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Έλεγχος ΑΑΔΕ</DialogTitle>
          <DialogDescription>Προεπισκόπηση στοιχείων από το μητρώο ΑΑΔΕ πριν την εφαρμογή στην καρτέλα.</DialogDescription>
        </DialogHeader>

        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Αναζήτηση στο μητρώο ΑΑΔΕ…
          </div>
        )}
        {state.status === 'not_found' && (
          <div className="notice"><TriangleAlert aria-hidden /><span>Δεν βρέθηκαν στοιχεία για αυτό το ΑΦΜ στο μητρώο της ΑΑΔΕ.</span></div>
        )}
        {state.status === 'error' && (
          <div className="notice"><TriangleAlert aria-hidden /><span>{state.message}</span></div>
        )}
        {state.status === 'found' && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {([
                ['Επωνυμία', state.mapped.NAME || null],
                ['Διεύθυνση', [state.mapped.ADDRESS, state.mapped.CITY, state.mapped.ZIP].filter(Boolean).join(', ') || null],
                ['Ημ/νία ίδρυσης', formatDateEl(state.mapped.foundingDate)],
                ['Κατάσταση ΑΑΔΕ', state.mapped.aadeStatus],
                ['Είδος επιχείρησης', state.mapped.aadeFirmKind],
                ['Νομική μορφή', state.mapped.appLegalForm],
              ] as const).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="mb-0.5 text-[11px] font-semibold text-muted-foreground">{label}</dt>
                  <dd className="truncate text-[13px]">{value || '—'}</dd>
                </div>
              ))}
            </dl>

            <div>
              <div className="dotted-leader mb-1.5 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                ΚΑΔ ({state.activities.length})
              </div>
              {state.activities.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">Δεν βρέθηκαν δραστηριότητες.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {state.activities.map((a, i) => (
                    <li key={`${a.code ?? 'x'}-${i}`} className="flex items-center gap-2 text-[12.5px]">
                      {a.kind === 'PRIMARY' && <span className="badge-pill ok shrink-0">Πρωτεύων</span>}
                      <span className="font-semibold">{a.code ?? '—'}</span>
                      <span className="truncate text-muted-foreground">{a.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Κλείσιμο</Button>} />
          {state.status === 'found' && (
            <Button onClick={handleApply} disabled={applying}>
              {applying ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <BadgeCheck className="size-3.5" aria-hidden />}
              Εφαρμογή
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Row-action drop-in για το menu ενέργειας μιας γραμμής στο /partners — mirror src/components/tax/scan-action-item.tsx idiom. */
export function AadeCheckActionItem({ trdrId, afm }: { trdrId: string; afm: string | null }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <DropdownMenuItem disabled={!afm} onClick={() => setOpen(true)}>
        <BadgeCheck className="size-3.5" strokeWidth={1.75} /> Έλεγχος ΑΑΔΕ
      </DropdownMenuItem>
      <AadeCheckDialog trdrId={trdrId} afm={afm} open={open} onOpenChange={setOpen} />
    </>
  )
}
