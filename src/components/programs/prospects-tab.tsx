'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  LuSearch, LuSend, LuLoaderCircle, LuExternalLink, LuFolderKanban, LuFlaskConical, LuSave,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  findProspects, sendProgramNewsletter, sendProgramNewsletterTest, listProgramLeads, createOpportunityApplication,
  saveProgramLeads,
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

const CRITERIA_COLOR: Record<EligibilityCriterionKey, string> = {
  kad: 'info',       // μπλε
  region: 'teal',    // τιρκουάζ
  legalForm: 'violet', // μωβ
}

const CRITERIA_LABELS: Record<EligibilityCriterionKey, string> = {
  kad: 'ΚΑΔ',
  region: 'Περιφέρεια',
  legalForm: 'Νομ. μορφή',
}

const LEAD_STATUS_META: Record<string, { label: string; badgeClass: string; style?: React.CSSProperties }> = {
  PENDING: { label: 'Εκκρεμεί', badgeClass: 'badge-pill muted' },
  SAVED: { label: 'Αποθηκευμένος', badgeClass: 'badge-pill muted' },
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

  // Γιατί 0 επιλέξιμοι; — αποτυχίες ανά κριτήριο ώστε το κενό αποτέλεσμα να εξηγείται
  const failSummary = React.useMemo(() => {
    if (!results || results.length === 0) return null
    if (results.some(r => r.eligible)) return null
    const counts = new Map<EligibilityCriterionKey, number>()
    for (const r of results) for (const k of r.failed) counts.set(k, (counts.get(k) ?? 0) + 1)
    return [...counts.entries()].map(([k, n]) => `${CRITERIA_LABELS[k]}: ${n}`).join(' · ')
  }, [results])

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

  // ── Δοκιμαστική αποστολή (preview) ──────────────────────────────────
  const [testEmail, setTestEmail] = React.useState('')
  const [sendingTest, setSendingTest] = React.useState(false)

  async function handleTestSend() {
    const email = testEmail.trim()
    if (!email) {
      toast.error('Συμπλήρωσε διεύθυνση για το δοκιμαστικό email.')
      return
    }
    setSendingTest(true)
    try {
      const res = await sendProgramNewsletterTest(programId, email)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    } catch {
      toast.error('Η αποστολή του δοκιμαστικού απέτυχε.')
    } finally {
      setSendingTest(false)
    }
  }

  // ── Αποθήκευση λίστας χωρίς email ────────────────────────────────────
  const [savingList, setSavingList] = React.useState(false)

  async function handleSaveList() {
    const ids = displayedRows.map(r => r.trdrId)
    if (ids.length === 0) return
    setSavingList(true)
    try {
      const res = await saveProgramLeads(programId, ids)
      toast.success(`Αποθηκεύτηκαν ${res.saved} δυνητικοί (χωρίς email).`)
      loadLeads()
    } catch {
      toast.error('Η αποθήκευση της λίστας απέτυχε.')
    } finally {
      setSavingList(false)
    }
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

  const prospectColumns: DataTableColumn<ProspectRow>[] = [
    {
      id: 'select',
      header: (
        <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableIds.length === 0} aria-label="Επιλογή όλων" />
      ),
      headerLabel: 'Επιλογή',
      width: 34,
      enableHide: false,
      enableResize: false,
      cell: row => (
        <input
          type="checkbox"
          checked={selected.has(row.trdrId)}
          onChange={() => toggleRow(row.trdrId)}
          disabled={!(row.eligible && !!row.email)}
          aria-label={`Επιλογή ${row.name}`}
        />
      ),
    },
    {
      id: 'name',
      header: 'Επωνυμία',
      width: 220,
      enableHide: false,
      sortValue: r => r.name,
      cell: row => (
        <Link href={`/partners/${row.trdrId}`} className="font-semibold hover:underline">{row.name}</Link>
      ),
    },
    { id: 'email', header: 'Email', width: 200, sortValue: r => r.email, cell: row => <span className="text-muted-foreground">{row.email ?? '—'}</span> },
    {
      id: 'eligible',
      header: 'Επιλεξιμότητα',
      width: 130,
      sortValue: r => r.eligible,
      cell: row => (
        <span className={cn('badge-pill', row.eligible ? 'ok' : 'muted')}>
          {row.eligible ? 'Επιλέξιμος' : 'Μη επιλέξιμος'}
        </span>
      ),
    },
    {
      id: 'criteria',
      header: 'Κριτήρια',
      width: 180,
      cell: row => (
        <div className="flex flex-wrap gap-1">
          {row.matched.map(k => (
            <span key={k} className={cn('badge-pill', CRITERIA_COLOR[k])}>{CRITERIA_LABELS[k]}</span>
          ))}
          {row.failed.map(k => (
            <span key={k} className="badge-pill danger">{CRITERIA_LABELS[k]}</span>
          ))}
        </div>
      ),
    },
    {
      id: 'kads',
      header: 'Δραστηριότητα που ταιριάζει',
      width: 240,
      cell: row => {
        if (row.matchedKads.length === 0) return <span className="text-muted-foreground">—</span>
        // Κύριος ΚΑΔ → coral (primary-kad) με ★ και πάντα πρώτος· δευτερεύων → πράσινο.
        // Δείχνουμε το ΟΝΟΜΑ (περιγραφή) της δραστηριότητας — ο κωδικός στο tooltip.
        const sorted = [...row.matchedKads].sort((a, b) => Number(b.primary) - Number(a.primary))
        return (
          <div className="flex flex-wrap gap-1">
            {sorted.map(k => (
              <Tooltip key={k.code}>
                <TooltipTrigger
                  render={
                    <span className={cn('badge-pill max-w-[200px] truncate cursor-default', k.primary ? 'primary-kad' : 'ok')}>
                      {k.primary ? '★ ' : ''}{k.description || k.code}
                    </span>
                  }
                />
                <TooltipContent>
                  {k.description ? `${k.description} · ` : ''}ΚΑΔ {k.code}{k.primary ? ' (Κύριος)' : ''}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )
      },
    },
  ]

  return (
    <>
      {/* Κριτήρια + αναζήτηση δυνητικών πελατών */}
      <section className="glass rounded-[22px] p-4">
        <div className="dotted-leader mb-3 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Κριτήρια αναζήτησης
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-[0.78125rem] font-semibold">
            <input type="checkbox" checked={critKad} onChange={e => setCritKad(e.target.checked)} disabled={searching} className="size-3.5" />
            Επιλέξιμοι ΚΑΔ
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[0.78125rem] font-semibold">
            <input type="checkbox" checked={critRegion} onChange={e => setCritRegion(e.target.checked)} disabled={searching} className="size-3.5" />
            Περιφέρεια
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[0.78125rem] font-semibold">
            <input type="checkbox" checked={critLegalForm} onChange={e => setCritLegalForm(e.target.checked)} disabled={searching} className="size-3.5" />
            Νομική μορφή
          </label>
          <div className="flex-1" />
          <Button type="button" onClick={handleSearch} disabled={searching}>
            {searching ? (<><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Αναζήτηση…</>) : (<><LuSearch className="size-3.5" aria-hidden /> Αναζήτηση δυνητικών</>)}
          </Button>
        </div>

        {searchError && <p className="mt-3 text-[0.78125rem] text-coral">{searchError}</p>}

        {results && (
          <div className="mt-4">
            {failSummary && (
              <p className="mb-2.5 rounded-xl px-3 py-2 text-[0.75rem]" style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}>
                Καμία εταιρεία δεν πληροί ΟΛΑ τα επιλεγμένα κριτήρια. Αποτυχίες ανά κριτήριο (στις {results.length}): {failSummary}.
                Δοκίμασε λιγότερα κριτήρια, ή απενεργοποίησε το «Μόνο επιλέξιμοι» για να δεις αναλυτικά ποιο κριτήριο αποτυγχάνει ανά εταιρεία.
              </p>
            )}

            <DataTable
              bare
              tableId="prospects"
              columns={prospectColumns}
              rows={displayedRows}
              rowKey={r => r.trdrId}
              emptyMessage="Κανένα αποτέλεσμα."
              toolbarExtras={
                <>
                  <div className="text-[0.78125rem] font-semibold text-muted-foreground">
                    {displayedRows.length} από {results.length} {results.length === 1 ? 'εταιρεία' : 'εταιρείες'}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-[0.78125rem] font-semibold">
                    Μόνο επιλέξιμοι
                    <Switch checked={onlyEligible} onCheckedChange={setOnlyEligible} size="sm" />
                  </label>
                </>
              }
            />

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleSaveList} disabled={savingList || displayedRows.length === 0}>
                {savingList ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuSave className="size-3.5" aria-hidden />}
                Αποθήκευση λίστας ({displayedRows.length})
              </Button>
              <Button type="button" onClick={() => setConfirmOpen(true)} disabled={selected.size === 0}>
                <LuSend className="size-3.5" aria-hidden /> Αποστολή ενημέρωσης ({selected.size})
              </Button>
            </div>
          </div>
        )}

        {/* Δοκιμαστική αποστολή (preview) — ίδιο template με την κανονική, [ΔΟΚΙΜΗ] στο θέμα */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <span className="flex items-center gap-1.5 text-[0.71875rem] font-semibold text-muted-foreground">
            <LuFlaskConical className="size-3.5" aria-hidden /> Δοκιμαστικό preview email:
          </span>
          <Input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !sendingTest) handleTestSend() }}
            placeholder="π.χ. gkozyris@i4ria.com"
            className="h-8 w-64 text-[0.78125rem]"
            disabled={sendingTest}
          />
          <Button type="button" size="sm" variant="outline" onClick={handleTestSend} disabled={sendingTest || !testEmail.trim()}>
            {sendingTest ? (<><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Αποστολή…</>) : (<><LuSend className="size-3.5" aria-hidden /> Αποστολή δοκιμής</>)}
          </Button>
          <span className="text-[0.65625rem] text-muted-foreground">
            Στέλνει το ακριβές email του προγράμματος με δείγμα επωνυμίας — χωρίς καταγραφή lead, ο σύνδεσμος δεν είναι ενεργός.
          </span>
        </div>
      </section>

      {/* «Ευκαιρίες & Αποστολές» */}
      <section className="glass rounded-[22px] p-4">
        <div className="dotted-leader mb-3 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Ευκαιρίες &amp; Αποστολές ({leads.length})
        </div>

        {leadsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
          </div>
        ) : leadsError ? (
          <p className="py-4 text-center text-[0.78125rem] text-coral">{leadsError}</p>
        ) : leads.length === 0 ? (
          <p className="py-6 text-center text-[0.78125rem] text-muted-foreground">
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
                      <td className="text-muted-foreground">{lead.email ?? '—'}</td>
                      <td><span className={meta.badgeClass} style={meta.style}>{meta.label}</span></td>
                      <td className="text-muted-foreground">{formatDateTime(lead.sentAt)}</td>
                      <td className="text-muted-foreground">{formatDateTime(lead.clickedAt)}</td>
                      <td className="ctr">
                        {lead.status === 'CLICKED' && (
                          appId ? (
                            <Link href={`/programs/${programId}/applications/${appId}`} className="inline-flex items-center gap-1.5 text-[0.78125rem] font-semibold text-primary hover:underline">
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
