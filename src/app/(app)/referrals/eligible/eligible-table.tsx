'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuLoaderCircle, LuUserPlus, LuUserCheck, LuUsers, LuDownload } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { convertReferralToProspect, type EligibleCompanyRow, type ReferrerOption } from '@/lib/referrals/actions'
import { exportEligibleXlsx } from '@/lib/referrals/export-xlsx'
import { PromoButtons } from '../promo-buttons'

/**
 * Λίστα επιλέξιμων εταιριών ανά παραπομπή. Φίλτρο ανά εταιρία παραπομπής +
 * πρόγραμμα. Ανά εταιρία, ο διαχειριστής επιλέγει προγράμματα (chips) και
 * δημιουργεί δυνητικό πελάτη. «Ήδη πελάτης» badge για αποφυγή διπλοεγγραφής.
 */

const ALL = '__all__'

export function EligibleReferralsTable({
  rows, referrers,
}: {
  rows: EligibleCompanyRow[]
  referrers: ReferrerOption[]
}) {
  const router = useRouter()
  const [referrerFilter, setReferrerFilter] = React.useState<string>(ALL)
  const [programFilter, setProgramFilter] = React.useState<string>(ALL)
  const [selected, setSelected] = React.useState<Record<string, Set<string>>>({})
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [doneIds, setDoneIds] = React.useState<Set<string>>(new Set())

  // Λίστα προγραμμάτων (για φίλτρο) από τα eligiblePrograms όλων των γραμμών.
  const programOptions = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) for (const p of r.eligiblePrograms) m.set(p.programId, p.title)
    return [...m.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, 'el'))
  }, [rows])

  const visible = rows.filter(r => {
    if (doneIds.has(r.id)) return false
    if (referrerFilter !== ALL && r.referrerId !== referrerFilter) return false
    if (programFilter !== ALL && !r.eligiblePrograms.some(p => p.programId === programFilter)) return false
    return true
  })

  function selectedFor(r: EligibleCompanyRow): Set<string> {
    // Default: όλα τα επιλέξιμα προγράμματα (ή το φιλτραρισμένο) επιλεγμένα.
    if (selected[r.id]) return selected[r.id]
    const init = new Set(
      programFilter !== ALL
        ? r.eligiblePrograms.filter(p => p.programId === programFilter).map(p => p.programId)
        : r.eligiblePrograms.map(p => p.programId),
    )
    return init
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
      setDoneIds(prev => new Set(prev).add(r.id))
      toast.success(`Δημιουργήθηκε δυνητικός πελάτης (${res.linked} προγράμματα).`, {
        action: res.trdrId ? { label: 'Άνοιγμα καρτέλας', onClick: () => router.push(`/partners/${res.trdrId}`) } : undefined,
      })
      router.refresh()
    } catch {
      toast.error('Η δημιουργία απέτυχε.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="glass rounded-[22px] p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="field !mb-0 min-w-[200px]">
            <label htmlFor="f-referrer">Εταιρία παραπομπής</label>
            <Select value={referrerFilter} onValueChange={v => setReferrerFilter(v ?? ALL)}>
              <SelectTrigger id="f-referrer" className="h-9 w-full rounded-full border-border bg-card px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>— Όλες —</SelectItem>
                {referrers.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="field !mb-0 min-w-[200px]">
            <label htmlFor="f-program">Πρόγραμμα</label>
            <Select value={programFilter} onValueChange={v => setProgramFilter(v ?? ALL)}>
              <SelectTrigger id="f-program" className="h-9 w-full rounded-full border-border bg-card px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>— Όλα —</SelectItem>
                {programOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[0.75rem] text-muted-foreground">{visible.length} εταιρίες</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={visible.length === 0}
              onClick={() => exportEligibleXlsx(visible, 'epilexima-parapombes.xlsx')}
            >
              <LuDownload className="size-3.5" aria-hidden /> Εξαγωγή Excel
            </Button>
          </div>
        </div>

        {programOptions.length > 0 && (
          <div className="mb-3">
            <PromoButtons programs={programOptions.map(p => ({ programId: p.id, title: p.title }))} />
          </div>
        )}

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <LuUsers className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-[0.78125rem] text-muted-foreground">
              Δεν υπάρχουν επιλέξιμες εταιρίες προς αναγωγή. Τρέξε πρώτα μια χαρτογράφηση παραπομπών.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map(r => {
              const sel = selectedFor(r)
              const progs = programFilter !== ALL ? r.eligiblePrograms.filter(p => p.programId === programFilter) : r.eligiblePrograms
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-card/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.8125rem] font-semibold">{r.name ?? `ΑΦΜ ${r.afm}`}</span>
                        <span className="badge-pill muted shrink-0 tabular-nums">{r.afm}</span>
                        {r.existingTrdrId && (
                          <span className={cn('badge-pill shrink-0', r.existingIsCustomer ? 'warn' : 'muted')}>
                            <LuUserCheck className="size-3" aria-hidden /> {r.existingIsCustomer ? 'Ήδη πελάτης' : 'Ήδη καταχωρημένη'}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[0.71875rem] text-muted-foreground">
                        {r.referrerName}{r.regionName ? ` · ${r.regionName}` : ''}{r.city ? ` · ${r.city}` : ''}
                      </div>
                    </div>
                    <Button type="button" size="sm" onClick={() => handleConvert(r)} disabled={busyId === r.id}>
                      {busyId === r.id
                        ? <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Δημιουργία…</>
                        : <><LuUserPlus className="size-3.5" aria-hidden /> Δυνητικός πελάτης</>}
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {progs.map(p => {
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
          </div>
        )}
      </section>
    </div>
  )
}
