'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderCircle, TriangleAlert, BadgeCheck, Plus, Minus, CircleCheck } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { aadeKadCheckTrdr, applyAadeToTrdr, type AadeKadCheck } from '@/lib/trdr/enrich-actions'

/**
 * «Έλεγχος για νέους ΚΑΔ» — controlled dialog που ανοίγει από την κάρτα ΚΑΔ
 * (trdr-enrich-cards.tsx). On open καλεί το read-only aadeKadCheckTrdr για να
 * δείξει diff (νέοι / προς αφαίρεση ΚΑΔ) πριν την εφαρμογή· η «Εφαρμογή» καλεί
 * το ίδιο applyAadeToTrdr με το «Έλεγχος ΑΑΔΕ» (πλήρης αντικατάσταση TrdrKad).
 */

type CheckState =
  | { status: 'loading' }
  | { status: 'ready'; data: AadeKadCheck }
  | { status: 'error'; message: string }

export function AadeKadCheckDialog({
  trdrId, afm, canEdit, open, onOpenChange,
}: {
  trdrId: string
  afm: string | null
  canEdit: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [state, setState] = React.useState<CheckState>({ status: 'loading' })
  const [applying, setApplying] = React.useState(false)

  React.useEffect(() => {
    if (!open || !afm) return
    let cancelled = false
    void (async () => {
      setState({ status: 'loading' })
      try {
        const data = await aadeKadCheckTrdr(trdrId)
        if (!cancelled) setState({ status: 'ready', data })
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Σφάλμα επικοινωνίας με την υπηρεσία ΑΑΔΕ.' })
      }
    })()
    return () => { cancelled = true }
  }, [open, afm, trdrId])

  async function handleApply() {
    setApplying(true)
    try {
      const res = await applyAadeToTrdr(trdrId)
      toast.success(`Οι ΚΑΔ ενημερώθηκαν από την ΑΑΔΕ (${res.kads} συνολικά).`)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η ενημέρωση ΚΑΔ απέτυχε.')
    } finally {
      setApplying(false)
    }
  }

  const data = state.status === 'ready' ? state.data : null
  const hasChanges = !!data && (data.added.length > 0 || data.removed.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[85vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Έλεγχος για νέους ΚΑΔ</DialogTitle>
          <DialogDescription>Σύγκριση των ΚΑΔ του μητρώου ΑΑΔΕ με τους καταχωρημένους στην καρτέλα.</DialogDescription>
        </DialogHeader>

        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Έλεγχος στο μητρώο ΑΑΔΕ…
          </div>
        )}
        {state.status === 'error' && (
          <div className="notice"><TriangleAlert aria-hidden /><span>{state.message}</span></div>
        )}
        {state.status === 'ready' && (
          <div className="flex flex-col gap-3">
            {!hasChanges && (
              <div className="notice success">
                <CircleCheck aria-hidden />
                <span>Οι ΚΑΔ είναι ήδη ενημερωμένοι — δεν βρέθηκαν νέοι ή προς αφαίρεση ({state.data.unchanged} καταχωρημένοι).</span>
              </div>
            )}

            {state.data.added.length > 0 && (
              <div>
                <div className="dotted-leader mb-1.5 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                  Νέοι ΚΑΔ ({state.data.added.length})
                </div>
                <ul className="flex flex-col gap-1.5">
                  {state.data.added.map((a, i) => (
                    <li key={`${a.code}-${i}`} className="flex items-center gap-2 text-[12.5px]">
                      <span className="badge-pill ok shrink-0"><Plus className="size-3" aria-hidden /> Νέος</span>
                      {a.kind === 'PRIMARY' && <span className="badge-pill muted shrink-0">Πρωτεύων</span>}
                      <span className="font-semibold tabular-nums">{a.code}</span>
                      <span className="truncate text-muted-foreground">{a.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {state.data.removed.length > 0 && (
              <div>
                <div className="dotted-leader mb-1.5 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                  Δεν υπάρχουν πλέον στην ΑΑΔΕ ({state.data.removed.length})
                </div>
                <ul className="flex flex-col gap-1.5">
                  {state.data.removed.map((r, i) => (
                    <li key={`${r.code}-${i}`} className="flex items-center gap-2 text-[12.5px]">
                      <span className="badge-pill warn shrink-0"><Minus className="size-3" aria-hidden /> Αφαίρεση</span>
                      <span className="font-semibold tabular-nums">{r.code}</span>
                      <span className="truncate text-muted-foreground">{r.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasChanges && (
              <p className="text-[11.5px] text-muted-foreground">
                Η «Εφαρμογή» αντικαθιστά όλους τους ΚΑΔ του συναλλασσόμενου με τους τρέχοντες της ΑΑΔΕ.
                {!canEdit && ' Δεν έχεις δικαίωμα επεξεργασίας — μόνο προβολή.'}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Κλείσιμο</Button>} />
          {canEdit && hasChanges && (
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
