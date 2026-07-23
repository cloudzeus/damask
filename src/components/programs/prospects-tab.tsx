'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  LuSearch, LuSend, LuLoaderCircle, LuExternalLink, LuFolderKanban,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  findProspects, sendProgramNewsletter, listProgramLeads, createOpportunityApplication,
  type ProspectRow, type ProgramLeadRow,
} from '@/lib/prospects/actions'
import type { SelectedCriteria, EligibilityCriterionKey } from '@/lib/prospects/eligibility'

/**
 * «Δυνητικοί πελάτες» tab (W3-T4). Δύο ενότητες:
 *  1. Κριτήρια + αναζήτηση δυνητικών πελατών (findProspects, pure στο client
 *     εξαιρουμένου του query) → πίνακας αποτελεσμάτων με matched/failed chips,
 *     επιλογή γραμμών → «Αποστολή ενημέρωσης» (sendProgramNewsletter).
 *  2. «Ευκαιρίες & Αποστολές» — self-fetching λίστα ProgramLead
 *     (listProgramLeads), με «Δημιουργία έργου» για CLICKED leads
 *     (createOpportunityApplication → link στο νέο application).
 *
 * Ref: docs/superpowers/specs/2026-07-23-prospects-w3-design.md §1,3,5.
 * Ίδιο idiom self-fetching client tab με required-forms-tab.tsx.
 */

const CRITERIA_LABELS: Record<EligibilityCriterionKey, string> = {
  kad: 'ΚΑΔ',
  region: 'Περιφέρεια',
  legalForm: 'Νομ. μορφή',
}

const LEAD_STATUS_META: Record<string, { label: string; badgeClass: string; style?: React.CSSProperties }> = {
  PENDING: { label: 'Εκκρεμεί', badgeClass: 'badge-pill muted' },
  SENT: { label: 'Εστάλη', badgeClass: 'badge-pill info' },
  CLICKED: { label: 'Ευκαιρία', badgeClass: 'badge-pill ok' },
  FAILED: {
    label: 'Απέτυχε', badgeClass: 'badge-pill',
    style: { color: 'var(--coral)', background: 'var(--coral-soft)' },
  },
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('el-GR')
}

export function ProspectsTab({ programId }: { programId: string }) {
  // ── Κριτήρια + αναζήτηση ────────────────────────────────────────────
  const [critKad, setCritKad] = React.useState(true)
  const [critRegion, setCritRegion] = React.useState(true)
  const [critLegalForm, setCritLegalForm] = React.useState(true)
  const [searching, setSearching] = React.useState(false)
  const [results, setResults] = React.useState<ProspectRow[] | null>(null)
  const [searchError, setSearchError] = React.useState<string | null>(null)
  const [onlyEligible, setOnlyEligible] = React.useState(true)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  async function handleSearch() {
    if (!critKad && !critRegion && !critLegalForm) {
      toast.error('Επίλεξε τουλάχιστον ένα κριτήριο.')
      return
    }
    const selectedCriteria: SelectedCriteria = { kad: critKad, region: critRegion, legalForm: critLegalForm }
    setSearching(true)
    setSearchError(null)
    try {
      const rows = await findProspects(programId, selectedCriteria)
      setResults(rows)
      setSelected(new Set(rows.filter(r => r.eligible && r.email).map(r => r.trdrId)))
    } catch {
      setSearchError('Η αναζήτηση δυνητικών πελατών απέτυχε.')
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  const displayedRows = React.useMemo(() => {
    if (!results) return []
    return onlyEligible ? results.filter(r => r.eligible) : results
  }, [results, onlyEligible])

  const selectableIds = React.useMemo(
    () => displayedRows.filter(r => r.eligible && r.email).map(r => r.trdrId),
    [displayedRows],
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) selectableIds.forEach(id => next.delete(id))
      else selectableIds.forEach(id => next.add(id))
      return next
    })
  }

  // ── Αποστολή ενημέρωσης ──────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  async function handleSend() {
    setSending(true)
    try {
      const result = await sendProgramNewsletter(programId, [...selected])
      toast.success(`Στάλθηκαν ${result.sent}, παραλείφθηκαν ${result.skipped}, απέτυχαν ${result.failed}.`)
      setConfirmOpen(false)
      setSelected(new Set())
      loadLeads()
    } catch {
      toast.error('Η αποστολή ενημέρωσης απέτυχε.')
    } finally {
      setSending(false)
    }
  }

  // ── «Ευκαιρίες & Αποστολές» — self-fetching λίστα leads ─────────────
  const [leads, setLeads] = React.useState<ProgramLeadRow[]>([])
  const [leadsLoading, setLeadsLoading] = React.useState(true)
  const [leadsError, setLeadsError] = React.useState<string | null>(null)
  const [creatingLeadId, setCreatingLeadId] = React.useState<string | null>(null)
  const [createdApps, setCreatedApps] = React.useState<Record<string, string>>({})

  const loadLeads = React.useCallback(() => {
    setLeadsLoading(true)
    setLeadsError(null)
    listProgramLeads(programId)
      .then(setLeads)
      .catch(() => setLeadsError('Η φόρτωση ευκαιριών/αποστολών απέτυχε.'))
      .finally(() => setLeadsLoading(false))
  }, [programId])

  React.useEffect(() => { loadLeads() }, [loadLeads])

  async function handleCreateOpportunity(lead: ProgramLeadRow) {
    setCreatingLeadId(lead.id)
    try {
      const { applicationId } = await createOpportunityApplication(lead.id)
      setCreatedApps(prev => ({ ...prev, [lead.id]: applicationId }))
      toast.success(`Το έργο για «${lead.name}» δημιουργήθηκε.`)
    } catch {
      toast.error('Η δημιουργία έργου απέτυχε.')
    } finally {
      setCreatingLeadId(null)
    }
  }

  return (
    <>
      {/* Κριτήρια + αναζήτηση δυνητικών πελατών */}
      <section className="glass rounded-[22px] p-4">
        <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Κριτήρια αναζήτησης
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
            <input type="checkbox" checked={critKad} onChange={e => setCritKad(e.target.checked)} disabled={searching} className="size-3.5" />
            Επιλέξιμοι ΚΑΔ
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
            <input type="checkbox" checked={critRegion} onChange={e => setCritRegion(e.target.checked)} disabled={searching} className="size-3.5" />
            Περιφέρεια
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
            <input type="checkbox" checked={critLegalForm} onChange={e => setCritLegalForm(e.target.checked)} disabled={searching} className="size-3.5" />
            Νομική μορφή
          </label>
          <div className="flex-1" />
          <Button type="button" onClick={handleSearch} disabled={searching}>
            {searching ? (<><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Αναζήτηση…</>) : (<><LuSearch className="size-3.5" aria-hidden /> Αναζήτηση δυνητικών</>)}
          </Button>
        </div>

        {searchError && <p className="mt-3 text-[12.5px] text-coral">{searchError}</p>}

        {results && (
          <div className="mt-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12.5px] font-semibold text-muted-foreground">
                {displayedRows.length} από {results.length} {results.length === 1 ? 'εταιρεία' : 'εταιρείες'}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
                Μόνο επιλέξιμοι
                <Switch checked={onlyEligible} onCheckedChange={setOnlyEligible} size="sm" />
              </label>
            </div>

            {displayedRows.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">Κανένα αποτέλεσμα.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableIds.length === 0} aria-label="Επιλογή όλων" />
                      </th>
                      <th>Επωνυμία</th>
                      <th>Email</th>
                      <th>Επιλεξιμότητα</th>
                      <th>Κριτήρια</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map(row => {
                      const selectable = row.eligible && !!row.email
                      return (
                        <tr key={row.trdrId} className="dotted-row-bottom">
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(row.trdrId)}
                              onChange={() => toggleRow(row.trdrId)}
                              disabled={!selectable}
                              aria-label={`Επιλογή ${row.name}`}
                            />
                          </td>
                          <td className="font-semibold">{row.name}</td>
                          <td className="text-muted-foreground">{row.email ?? '—'}</td>
                          <td>
                            <span className={cn('badge-pill', row.eligible ? 'ok' : 'muted')}>
                              {row.eligible ? 'Επιλέξιμος' : 'Μη επιλέξιμος'}
                            </span>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {row.matched.map(k => (
                                <span key={k} className="badge-pill ok">{CRITERIA_LABELS[k]}</span>
                              ))}
                              {row.failed.map(k => (
                                <span key={k} className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>{CRITERIA_LABELS[k]}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={() => setConfirmOpen(true)} disabled={selected.size === 0}>
                <LuSend className="size-3.5" aria-hidden /> Αποστολή ενημέρωσης ({selected.size})
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* «Ευκαιρίες & Αποστολές» */}
      <section className="glass rounded-[22px] p-4">
        <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Ευκαιρίες &amp; Αποστολές ({leads.length})
        </div>

        {leadsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
          </div>
        ) : leadsError ? (
          <p className="py-4 text-center text-[12.5px] text-coral">{leadsError}</p>
        ) : leads.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">
            Δεν έχει σταλεί ακόμη καμία ενημέρωση για αυτό το πρόγραμμα.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Επωνυμία</th>
                  <th>Email</th>
                  <th>Κατάσταση</th>
                  <th>Απεστάλη</th>
                  <th>Έδειξε ενδιαφέρον</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => {
                  const meta = LEAD_STATUS_META[lead.status] ?? LEAD_STATUS_META.PENDING
                  const appId = createdApps[lead.id]
                  return (
                    <tr key={lead.id} className="dotted-row-bottom">
                      <td className="font-semibold">{lead.name}</td>
                      <td className="text-muted-foreground">{lead.email}</td>
                      <td><span className={meta.badgeClass} style={meta.style}>{meta.label}</span></td>
                      <td className="text-muted-foreground">{formatDateTime(lead.sentAt)}</td>
                      <td className="text-muted-foreground">{formatDateTime(lead.clickedAt)}</td>
                      <td className="ctr">
                        {lead.status === 'CLICKED' && (
                          appId ? (
                            <Link href={`/programs/${programId}/applications/${appId}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline">
                              <LuExternalLink className="size-3.5" aria-hidden /> Άνοιγμα έργου
                            </Link>
                          ) : (
                            <Button type="button" size="sm" variant="outline" onClick={() => handleCreateOpportunity(lead)} disabled={creatingLeadId === lead.id}>
                              {creatingLeadId === lead.id ? (<><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Δημιουργία…</>) : (<><LuFolderKanban className="size-3.5" aria-hidden /> Δημιουργία έργου</>)}
                            </Button>
                          )
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirm αποστολής */}
      <Dialog open={confirmOpen} onOpenChange={next => { if (!sending) setConfirmOpen(next) }}>
        <DialogContent className="glass sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Αποστολή ενημέρωσης</DialogTitle>
            <DialogDescription>
              Θα σταλεί προσωποποιημένο email σε <b>{selected.size}</b> {selected.size === 1 ? 'παραλήπτη' : 'παραλήπτες'}, με σύνδεσμο εκδήλωσης ενδιαφέροντος ανά επιχείρηση. Η αποστολή γίνεται άμεσα και δεν αναιρείται.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={sending}>Άκυρο</Button>} />
            <Button type="button" onClick={handleSend} disabled={sending}>
              {sending ? (<><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Αποστολή…</>) : (<><LuSend className="size-3.5" aria-hidden /> Αποστολή ({selected.size})</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
