'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuLayers, LuCheck, LuChevronDown, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { DocumentPreviewButton } from '@/components/ui/document-preview'
import { updateTrdrDossierDoc, removeTrdrDossierDoc, type DossierDocItem } from '@/lib/documents/actions'
import { lastPeriods, rangePeriods, normalizePeriod, periodLabel, seriesMeta, type SeriesKind } from '@/lib/documents/series'
import { PeriodInput } from './dossier-smart-upload'

/**
 * Ένας τύπος-σειρά στα δικαιολογητικά του πελάτη (π.χ. Φ2 ανά μήνα): πλέγμα περιόδων ✓/κενό (με ένα βλέμμα τι υπάρχει
 * και τι λείπει) + λίστα εγγράφων με διορθώσιμη περίοδο. Για LIST: απλή λίστα αρχείων.
 */
const WINDOW: Record<Exclude<SeriesKind, 'LIST'>, number> = { MONTHLY: 24, QUARTERLY: 12, YEARLY: 6 }

export function DossierSeriesGroup({ trdrId, kind, typeName, docs, canEdit, onChanged }: {
  trdrId: string
  kind: SeriesKind
  typeName: string
  docs: DossierDocItem[]
  canEdit: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [today] = React.useState(() => new Date())
  const byPeriod = new Map<string, DossierDocItem>()
  const noPeriod: DossierDocItem[] = []
  for (const d of docs) {
    const p = kind === 'LIST' ? null : normalizePeriod(d.period, kind)
    if (p) { if (!byPeriod.has(p)) byPeriod.set(p, d) } else if (kind !== 'LIST') noPeriod.push(d)
  }

  // Πλέγμα: οι τελευταίες περίοδοι (συμπεριλ. της τρέχουσας) + όσες παλαιότερες έχουν έγγραφο.
  let grid: string[] = []
  if (kind !== 'LIST') {
    const recent = lastPeriods(kind, WINDOW[kind], today)
    // Η τρέχουσα (ανοιχτή) περίοδος = η «τελευταία ολοκληρωμένη» μιας ημερομηνίας μία περίοδο μετά.
    const now = lastPeriods(kind, 1, new Date(today.getTime() + (kind === 'MONTHLY' ? 32 : kind === 'QUARTERLY' ? 93 : 366) * 864e5))[0]
    const oldest = [...byPeriod.keys()].sort()[0]
    grid = oldest && oldest < recent[0] ? rangePeriods(kind, oldest, now) : [...recent, now]
    grid = grid.slice(-48)
  }

  async function setPeriod(d: DossierDocItem, v: string) {
    try { await updateTrdrDossierDoc(d.id, { period: v || null }); onChanged() } catch { toast.error('Η αλλαγή περιόδου απέτυχε.') }
  }
  async function remove(d: DossierDocItem) {
    if (!window.confirm(`Διαγραφή του «${d.name}»;`)) return
    try { await removeTrdrDossierDoc(d.id); toast.success('Διαγράφηκε.'); onChanged() } catch { toast.error('Η διαγραφή απέτυχε.') }
  }

  const present = grid.filter(p => byPeriod.has(p)).length
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <LuLayers className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="text-[length:var(--fs-13)] font-semibold">{typeName}</span>
        <span className="badge-pill info">{kind === 'LIST' ? `${docs.length} αρχεία` : `${byPeriod.size} ${seriesMeta(kind).unit}`}</span>
        {noPeriod.length > 0 && (
          <span className="badge-pill warn" title="Ορίστε την περίοδο ώστε να μετρούν στην κάλυψη">
            <LuTriangleAlert className="size-3" aria-hidden /> {noPeriod.length} χωρίς περίοδο
          </span>
        )}
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[length:var(--fs-12)] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          {open ? 'Λιγότερα' : 'Έγγραφα'} <LuChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>

      {kind !== 'LIST' && (
        <>
          <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5" aria-label={`Περίοδοι ${typeName}`}>
            {grid.map(p => {
              const d = byPeriod.get(p)
              return (
                <li key={p}>
                  {d ? (
                    <DocumentPreviewButton
                      url={`/partners/${trdrId}/dossier/${d.id}`}
                      name={`${typeName} ${periodLabel(p)}`}
                      mimeType={d.mimeType}
                      trigger={
                        <span className="flex h-11 flex-col items-center justify-center rounded-lg bg-[color:var(--success)]/12 text-[length:var(--fs-11)] font-semibold text-[color:var(--success)] ring-1 ring-[color:var(--success)]/30" title={`${periodLabel(p)} — ${d.name}`}>
                          <LuCheck className="size-3.5" aria-hidden /> {periodLabel(p)}
                        </span>
                      }
                    />
                  ) : (
                    <span className="flex h-11 items-center justify-center rounded-lg border border-dashed border-border text-[length:var(--fs-11)] text-muted-foreground" title={`${periodLabel(p)} — δεν υπάρχει`}>
                      {periodLabel(p)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[length:var(--fs-11)] text-muted-foreground">{present} από {grid.length} περιόδους στο διάστημα · πράσινο = υπάρχει (κλικ για προβολή)</p>
        </>
      )}

      {open && (
        <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border">
          {[...docs].sort((a, b) => (b.period ?? '').localeCompare(a.period ?? '')).map(d => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[length:var(--fs-12-5)]" title={d.name}>{d.name}</span>
              {kind !== 'LIST' && (
                canEdit
                  ? <PeriodInput kind={kind} value={normalizePeriod(d.period, kind) ?? ''} onChange={v => void setPeriod(d, v)} />
                  : <span className="text-[length:var(--fs-12)] font-semibold">{periodLabel(d.period)}</span>
              )}
              <DocumentPreviewButton url={`/partners/${trdrId}/dossier/${d.id}`} name={d.name} mimeType={d.mimeType} />
              {canEdit && (
                <button type="button" onClick={() => void remove(d)} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Διαγραφή — ${d.name}`}>
                  <LuTrash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
