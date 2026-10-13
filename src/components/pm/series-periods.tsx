'use client'

import { LuCheck, LuLayers, LuTriangleAlert } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { DocumentPreviewButton } from '@/components/ui/document-preview'
import { periodLabel } from '@/lib/documents/series'
import type { SeriesDetail } from '@/lib/pm/form-obligations'

/**
 * Πίνακας περιόδων ενός δικαιολογητικού-σειράς μέσα στο έργο (π.χ. Φ2 τελευταίων 12 μηνών): κάθε απαιτούμενη περίοδος
 * ✓ (κλικ = προβολή του εγγράφου) ή κενή. Τα αρχεία μπαίνουν με το «Ανέβασμα με AI» — η περίοδος αναγνωρίζεται αυτόματα.
 */
export function SeriesPeriods({ trdrId, detail }: { trdrId: string; detail: SeriesDetail }) {
  return (
    <div className="ml-2 rounded-xl border border-dashed border-border bg-muted/30 p-2.5 sm:ml-6">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[length:var(--fs-11-5)]">
        <LuLayers className="size-3.5 text-primary" aria-hidden />
        <span className="font-semibold">Περίοδοι: {detail.requirement}</span>
        <span className={cn('badge-pill tabular-nums', detail.complete ? 'ok' : 'warn')} title={detail.coverage}>
          {detail.complete ? `Πλήρης ${detail.have}/${detail.needed}` : `${detail.have}/${detail.needed} · λείπουν ${detail.needed - detail.have}`}
        </span>
        {detail.withoutPeriod > 0 && (
          <span className="badge-pill warn" title="Ορίστε την περίοδο στα δικαιολογητικά του πελάτη ώστε να μετρούν">
            <LuTriangleAlert className="size-3" aria-hidden /> {detail.withoutPeriod} χωρίς περίοδο
          </span>
        )}
      </div>
      {detail.kind === 'LIST' ? (
        <p className="text-[length:var(--fs-11-5)] text-muted-foreground">{detail.have} από {detail.needed} αρχεία.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5" aria-label={`Περίοδοι — ${detail.requirement}`}>
          {detail.periods.map(p => (
            <li key={p.period}>
              {p.doc ? (
                <DocumentPreviewButton
                  url={`/partners/${trdrId}/dossier/${p.doc.id}`}
                  name={`${periodLabel(p.period)} — ${p.doc.name}`}
                  mimeType={p.doc.mimeType}
                  trigger={
                    <span className="flex h-10 flex-col items-center justify-center rounded-lg bg-[color:var(--success)]/12 text-[length:var(--fs-11)] font-semibold text-[color:var(--success)] ring-1 ring-[color:var(--success)]/30" title={`${periodLabel(p.period)} — ${p.doc.name}`}>
                      <LuCheck className="size-3.5" aria-hidden /> {periodLabel(p.period)}
                    </span>
                  }
                />
              ) : (
                <span className="flex h-10 items-center justify-center rounded-lg border border-dashed border-[color:var(--warning)]/60 text-[length:var(--fs-11)] font-semibold text-[color:var(--warning)]" title={`${periodLabel(p.period)} — λείπει`}>
                  {periodLabel(p.period)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
