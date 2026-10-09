'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderCircle, RefreshCw, Sparkles, CheckCircle2, ExternalLink, CalendarClock, MapPin, Hash, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { associateTrdrPrograms } from '@/lib/pm/program-link'
import { recheckTrdrPotentialAction } from '@/lib/pm/potential-actions'
import type { PotentialProgramRow } from '@/lib/pm/potential-matching'
import { LIFECYCLE_LABELS, type LifecycleStr } from '@/lib/pm/types'

const dateFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const CRIT: Record<string, { label: string; icon: React.ReactNode }> = {
  kad: { label: 'ΚΑΔ', icon: <Hash className="size-3" aria-hidden /> },
  region: { label: 'Περιφέρεια', icon: <MapPin className="size-3" aria-hidden /> },
  legalForm: { label: 'Νομική μορφή', icon: <Scale className="size-3" aria-hidden /> },
}

/**
 * Tab «Δυνητικά προγράμματα» (καρτέλα πελάτη): ενεργά/αναμενόμενα προγράμματα όπου ο πελάτης ταιριάζει σε
 * περιφέρεια/ΚΑΔ/νομική μορφή. Η δυνητική συμμετοχή δημιουργείται με 1 κλικ (ανά πρόγραμμα ή για όλα).
 */
export function PotentialProgramsPanel({ trdrId, rows, evaluatedAt, hasKads, canManage }: {
  trdrId: string; rows: PotentialProgramRow[]; evaluatedAt: string | null; hasKads: boolean; canManage: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  const strong = rows.filter(r => r.restricted)
  const weak = rows.filter(r => !r.restricted)
  const creatable = strong.filter(r => !r.applicationId)

  const create = (ids: string[], key: string) => {
    setBusy(key)
    start(async () => {
      try {
        const r = await associateTrdrPrograms(trdrId, ids)
        toast.success(r.linked === 1 ? 'Δημιουργήθηκε δυνητική συμμετοχή.' : `Δημιουργήθηκαν ${r.linked} δυνητικές συμμετοχές.`)
        router.refresh()
      } catch {
        toast.error('Η δημιουργία απέτυχε.')
      } finally { setBusy(null) }
    })
  }
  const recheck = () => {
    setBusy('recheck')
    start(async () => {
      const r = await recheckTrdrPotentialAction(trdrId).catch(() => ({ ok: false, error: 'Ο έλεγχος απέτυχε.' }))
      if (r.ok) { toast.success('Ο έλεγχος ολοκληρώθηκε.'); router.refresh() } else toast.error(r.error ?? 'Ο έλεγχος απέτυχε.')
      setBusy(null)
    })
  }

  const Row = ({ r }: { r: PotentialProgramRow }) => (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/programs/${r.programId}`} className="font-semibold hover:underline">{r.title}</a>
          <span className={`badge-pill shrink-0 ${r.status === 'upcoming' ? 'warn' : 'teal'}`}>{r.status === 'upcoming' ? 'Αναμενόμενο' : 'Ανοιχτό'}</span>
          {r.fundingRate != null && <span className="badge-pill muted shrink-0 tabular-nums">έως {r.fundingRate}%</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-12)] text-muted-foreground">
          {r.submissionEnd && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden /> Υποβολές έως {dateFmt.format(new Date(r.submissionEnd))}</span>}
          {r.status === 'upcoming' && r.submissionStart && <span>Ανοίγει {dateFmt.format(new Date(r.submissionStart))}</span>}
          {/* ✓ μόνο για ό,τι ελέγχθηκε πραγματικά (στα «χωρίς περιορισμό» περνούν όλοι) */}
          {r.restricted && r.matched.filter(m => m !== 'kad' || r.matchedKads.length > 0).map(m => CRIT[m] && <span key={m} className="inline-flex items-center gap-1 text-[color:var(--success,#117235)]">{CRIT[m].icon}{CRIT[m].label} ✓</span>)}
        </div>
        {r.matchedKads.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">{r.matchedKads.slice(0, 6).map(k => <span key={k} className="badge-pill info shrink-0 tabular-nums">{k}</span>)}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {r.publicSlug && <a href={`/programmata/${r.publicSlug}`} target="_blank" rel="noopener" className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="Δημόσια σελίδα"><ExternalLink className="size-4" /></a>}
        {r.applicationId
          ? <span className="badge-pill success shrink-0"><CheckCircle2 className="size-3" aria-hidden /> {LIFECYCLE_LABELS[(r.lifecycle ?? 'POTENTIAL') as LifecycleStr] ?? 'Συμμετοχή'}</span>
          : canManage && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => create([r.programId], r.programId)}>
              {busy === r.programId ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Δυνητική συμμετοχή
            </Button>
          )}
      </div>
    </li>
  )

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[length:var(--fs-15)] font-semibold">Δυνητικά προγράμματα</h3>
          <p className="text-[length:var(--fs-12)] text-muted-foreground">
            Βασικός έλεγχος σε ενεργά & αναμενόμενα προγράμματα: περιφέρεια, ΚΑΔ, νομική μορφή (όχι μέγεθος/έτη).
            {evaluatedAt ? ` Τελευταίος έλεγχος ${dateFmt.format(new Date(evaluatedAt))}.` : ' Δεν έχει γίνει ακόμα έλεγχος.'}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={recheck}>
              {busy === 'recheck' ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Επανέλεγχος
            </Button>
            {creatable.length > 1 && (
              <Button size="sm" disabled={pending} onClick={() => create(creatable.map(r => r.programId), 'all')}>
                {busy === 'all' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Δυνητική συμμετοχή σε όλα ({creatable.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {!hasKads ? (
        <EmptyState title="Δεν υπάρχουν ΚΑΔ" hint="Χωρίς ΚΑΔ δεν μπορεί να γίνει έλεγχος. Συμπληρώστε τους ΚΑΔ (tab «ΚΑΔ» ή έλεγχος ΑΑΔΕ) και πατήστε «Επανέλεγχος»." />
      ) : rows.length === 0 ? (
        <EmptyState title="Κανένα δυνητικό πρόγραμμα" hint={evaluatedAt ? 'Ο πελάτης δεν ταιριάζει σε κανένα ενεργό ή αναμενόμενο πρόγραμμα με βάση περιφέρεια, ΚΑΔ και νομική μορφή.' : 'Πατήστε «Επανέλεγχος» για να γίνει ο πρώτος έλεγχος.'} />
      ) : (
        <>
          {strong.length > 0 ? (
            <ul className="flex flex-col gap-2">{strong.map(r => <Row key={r.programId} r={r} />)}</ul>
          ) : (
            <p className="text-[length:var(--fs-13)] text-muted-foreground">Κανένα πρόγραμμα με συγκεκριμένους επιλέξιμους ΚΑΔ ή περιφέρειες δεν ταιριάζει.</p>
          )}
          {weak.length > 0 && (
            <details className="rounded-xl border border-dashed p-3">
              <summary className="cursor-pointer text-[length:var(--fs-13)] font-semibold">Χωρίς περιορισμό ΚΑΔ/περιφέρειας ({weak.length}) — χρειάζεται έλεγχος από σύμβουλο</summary>
              <p className="mt-1 text-[length:var(--fs-12)] text-muted-foreground">Σε αυτά τα προγράμματα δεν έχουν καταχωριστεί επιλέξιμοι ΚΑΔ ή συγκεκριμένες περιφέρειες, οπότε «ταιριάζουν» σχεδόν όλοι. Συμπληρώστε τα στοιχεία του προγράμματος για ακριβέστερο έλεγχο.</p>
              <ul className="mt-2 flex flex-col gap-2">{weak.map(r => <Row key={r.programId} r={r} />)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
