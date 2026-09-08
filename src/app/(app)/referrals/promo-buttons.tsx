'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuFileText, LuLoaderCircle } from 'react-icons/lu'
import { getPromoProgram } from '@/lib/referrals/actions'
import { openPromo } from '@/lib/referrals/promo-html'

/**
 * Κουμπιά «Promo PDF» ανά επιλέξιμο πρόγραμμα — ανοίγουν εκτυπώσιμο promo
 * (save-as-PDF) που η εταιρία παραπομπής στέλνει στους πελάτες της.
 */
export function PromoButtons({ programs }: { programs: { programId: string; title: string }[] }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  if (programs.length === 0) return null

  async function handle(programId: string) {
    setBusy(programId)
    try {
      const p = await getPromoProgram(programId)
      if (!p) { toast.error('Το πρόγραμμα δεν βρέθηκε.'); return }
      if (!openPromo(p)) toast.error('Επίτρεψε τα popups για να ανοίξει το promo.')
    } catch {
      toast.error('Η δημιουργία του promo απέτυχε.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="dotted-leader text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Promo PDF ανά πρόγραμμα
      </div>
      <div className="flex flex-wrap gap-1.5">
        {programs.map(p => (
          <button
            key={p.programId}
            type="button"
            onClick={() => handle(p.programId)}
            disabled={busy === p.programId}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[0.71875rem] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {busy === p.programId ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuFileText className="size-3.5" aria-hidden />}
            {p.title}
          </button>
        ))}
      </div>
    </div>
  )
}
