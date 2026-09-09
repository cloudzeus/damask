'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderCircle, UserPlus, UserCheck, Upload, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  listEligibleReferralCompaniesForReferrer, convertReferralToProspect, type EligibleCompanyRow,
} from '@/lib/referrals/actions'

/**
 * Expanded panel μιας παραπομπής: οι επιλέξιμες εταιρίες (από χαρτογράφηση Excel)
 * που περιμένουν αναγωγή σε δυνητικό πελάτη. Ο διαχειριστής επιλέγει προγράμματα
 * (chips) ανά εταιρία και πατά «Δυνητικός πελάτης» → convertReferralToProspect.
 * Lazy φόρτωση (mount μόνο όταν ανοίγει η γραμμή) + refetch σε refreshToken.
 */
export function ReferrerEligiblePanel({
  referrerId, referrerName, refreshToken, onRunUpload, onChanged,
}: {
  referrerId: string
  referrerName: string
  refreshToken: number
  onRunUpload: () => void
  onChanged: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [rows, setRows] = React.useState<EligibleCompanyRow[]>([])
  const [selected, setSelected] = React.useState<Record<string, Set<string>>>({})
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    // setState σε async callback (όχι στο effect body) — αποφυγή set-state-in-effect lint.
    const t = setTimeout(() => {
      if (!alive) return
      setLoading(true)
      listEligibleReferralCompaniesForReferrer(referrerId)
        .then(r => { if (alive) { setRows(r); setLoading(false) } })
        .catch(() => { if (alive) { setRows([]); setLoading(false) } })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [referrerId, refreshToken])

  function selectedFor(r: EligibleCompanyRow): Set<string> {
    return selected[r.id] ?? new Set(r.eligiblePrograms.map(p => p.programId))
  }
  function toggleProgram(r: EligibleCompanyRow, programId: string) {
    setSelected(prev => {
      const cur = new Set(prev[r.id] ?? selectedFor(r))
      if (cur.has(programId)) cur.delete(programId)
      else cur.add(programId)
      return { ...prev, [r.id]: cur }
    })
  }

  async function handleConvert(r: EligibleCompanyRow) {
    const programIds = [...selectedFor(r)]
    if (programIds.length === 0) { toast.error('Επίλεξε τουλάχιστον ένα πρόγραμμα.'); return }
    setBusyId(r.id)
    try {
      const res = await convertReferralToProspect(r.id, programIds)
      if (!res.ok) { toast.error(res.message ?? 'Η δημιουργία απέτυχε.'); return }
      setRows(prev => prev.filter(x => x.id !== r.id))
      onChanged()
      toast.success(`Δημιουργήθηκε δυνητικός πελάτης (${res.linked} προγράμματα).`, {
        action: res.trdrId ? { label: 'Άνοιγμα καρτέλας', onClick: () => router.push(`/partners/${res.trdrId}`) } : undefined,
      })
    } catch {
      toast.error('Η δημιουργία απέτυχε.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="border-t border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Επιλέξιμες επαφές προς αναγωγή — {referrerName}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onRunUpload}>
          <Upload className="size-3.5" aria-hidden /> Έλεγχος επαφών (Excel)
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[0.78125rem] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Inbox className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-md text-[0.75rem] text-muted-foreground">
            Καμία επιλέξιμη επαφή σε αναμονή. Ανέβασε Excel με ΑΦΜ για να δεις σε ποια προγράμματα
            μπορούν να συμμετέχουν οι επαφές αυτής της παραπομπής.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(r => {
            const sel = selectedFor(r)
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.8125rem] font-semibold">{r.name ?? `ΑΦΜ ${r.afm}`}</span>
                      <span className="badge-pill muted shrink-0 tabular-nums">{r.afm}</span>
                      {r.existingTrdrId && (
                        <span className={cn('badge-pill shrink-0', r.existingIsCustomer ? 'warn' : 'muted')}>
                          <UserCheck className="size-3" aria-hidden /> {r.existingIsCustomer ? 'Ήδη πελάτης' : 'Ήδη καταχωρημένη'}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[0.71875rem] text-muted-foreground">
                      {r.regionName ?? '—'}{r.city ? ` · ${r.city}` : ''}
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={() => handleConvert(r)} disabled={busyId === r.id}>
                    {busyId === r.id
                      ? <><LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Δημιουργία…</>
                      : <><UserPlus className="size-3.5" aria-hidden /> Προσθήκη στους δυνητικούς</>}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.eligiblePrograms.map(p => {
                    const on = sel.has(p.programId)
                    return (
                      <button
                        key={p.programId}
                        type="button"
                        onClick={() => toggleProgram(r, p.programId)}
                        aria-pressed={on}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {p.title}{p.fundingRate != null ? ` · ${p.fundingRate}%` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <p className="px-1 text-[0.6875rem] text-muted-foreground">
            Τα προγράμματα με μπλε φόντο θα δημιουργηθούν ως δυνητικές αιτήσεις. Η επαφή συνδέεται αυτόματα με την παραπομπή «{referrerName}».
          </p>
        </div>
      )}
    </div>
  )
}
