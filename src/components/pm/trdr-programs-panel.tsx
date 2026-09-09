'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, LoaderCircle, Landmark, ExternalLink, Trash2, CircleCheck, CircleX, Search, MoreVertical, ClipboardCheck, MailPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  listTrdrProgramCards, listActivePrograms, associateTrdrPrograms,
  setApplicationLifecycle, removeTrdrProgram, reevaluateApplication, getApplicationPending,
  type TrdrProgramCard, type ApplicationPending,
} from '@/lib/pm/program-link'
import type { SinglePairEligibility } from '@/lib/prospects/evaluate-pair'
import { NewDocumentRequestDialog } from '@/components/pm/new-document-request-dialog'
import { ObligationsTab } from '@/components/pm/obligations-tab'
import { EmailHistory } from '@/components/email/email-history'
import { listApplicationContactOptions, setApplicationContacts, setContactPortalScope, type AppContactOption } from '@/lib/pm/application-contacts'
import {
  LIFECYCLE_ORDER, LIFECYCLE_COLORS, lifecycleLabel, stageLabel, verdictLabel, obligationStatusLabel, type LifecycleStr,
} from '@/lib/pm/types'
import type { ApplicationLifecycle } from '@prisma/client'

const CRITERIA_LABELS: Record<string, string> = { kad: 'ΚΑΔ', region: 'Περιφέρεια', legalForm: 'Νομ. μορφή' }

export function TrdrProgramsPanel({ trdrId, canManage }: { trdrId: string; canManage: boolean }) {
  const router = useRouter()
  const [cards, setCards] = React.useState<TrdrProgramCard[]>([])
  const [loading, setLoading] = React.useState(true)
  const [addOpen, setAddOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<TrdrProgramCard | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function evaluateCard(card: TrdrProgramCard) {
    setBusyId(card.id)
    try {
      const snapshot = await reevaluateApplication(card.id)
      setCards(prev => prev.map(c => (c.id === card.id ? { ...c, snapshot } : c)))
      toast.success(snapshot.eligible ? 'Η εταιρία πληροί τα κριτήρια.' : 'Η εταιρία δεν πληροί όλα τα κριτήρια.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αξιολόγηση απέτυχε.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeCard(card: TrdrProgramCard) {
    if (!window.confirm(`Αφαίρεση σύνδεσης με «${card.programTitle}»;`)) return
    setBusyId(card.id)
    try {
      await removeTrdrProgram(card.id)
      setCards(prev => prev.filter(c => c.id !== card.id))
      toast.success('Η σύνδεση αφαιρέθηκε.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αφαίρεση απέτυχε.')
    } finally {
      setBusyId(null)
    }
  }

  const load = React.useCallback(() => {
    setLoading(true)
    listTrdrProgramCards(trdrId)
      .then(setCards)
      .catch(() => setCards([]))
      .finally(() => setLoading(false))
  }, [trdrId])

  // Mount fetch: setState μόνο σε async callbacks (όχι synchronous στο effect body).
  React.useEffect(() => {
    let cancelled = false
    listTrdrProgramCards(trdrId)
      .then(d => { if (!cancelled) setCards(d) })
      .catch(() => { if (!cancelled) setCards([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trdrId])

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Ευρωπαϊκά Προγράμματα ({cards.length})
        </div>
        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" aria-hidden /> Σύνδεση με πρόγραμμα
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : cards.length === 0 ? (
        <p className="py-6 text-center text-[0.78125rem] text-muted-foreground">
          Ο πελάτης δεν έχει συνδεθεί με κάποιο πρόγραμμα ακόμη.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => {
            const c = LIFECYCLE_COLORS[card.lifecycle]
            const busy = busyId === card.id
            return (
              <div
                key={card.id}
                className="lift relative rounded-[14px] border p-3 transition-shadow"
                style={{ borderColor: c.fg, background: c.bg }}
              >
                {/* Dropdown ενεργειών — πάνω δεξιά */}
                <div className="absolute top-2 right-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Ενέργειες"
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
                          disabled={busy}
                          onClick={e => e.stopPropagation()}
                        >
                          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
                        </button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-max min-w-52">
                      {canManage && (
                        <DropdownMenuItem onClick={() => evaluateCard(card)}>
                          <ClipboardCheck className="size-3.5" aria-hidden /> Αξιολόγηση εταιρίας
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setSelected(card)}>
                        <Search className="size-3.5" aria-hidden /> Λεπτομέρειες αξιολόγησης
                      </DropdownMenuItem>
                      <DropdownMenuItem render={<Link href={`/programs/${card.programId}/applications/${card.id}`} />}>
                        <ExternalLink className="size-3.5" aria-hidden /> Άνοιγμα έργου
                      </DropdownMenuItem>
                      {canManage && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => removeCard(card)} style={{ color: 'var(--destructive)' }}>
                            <Trash2 className="size-3.5" aria-hidden /> Αφαίρεση σύνδεσης
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Σώμα κάρτας — άνοιγμα αξιολόγησης */}
                <button type="button" onClick={() => setSelected(card)} className="block w-full pr-7 text-left">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--card)', color: c.fg }}>
                      <Landmark className="size-3.5" aria-hidden />
                    </span>
                    <span className="badge-pill" style={{ color: c.fg, background: 'var(--card)' }}>{lifecycleLabel(card.lifecycle)}</span>
                  </div>
                  <div className="line-clamp-2 text-[0.78125rem] font-semibold text-foreground">{card.programTitle}</div>
                  <div className="mt-1.5">
                    {card.snapshot ? (
                      card.snapshot.eligible ? (
                        <span className="badge-pill ok"><CircleCheck className="size-3" aria-hidden /> Πληροί τα κριτήρια</span>
                      ) : (
                        <span className="badge-pill" style={{ color: 'var(--card)', background: 'var(--coral)' }}>
                          <CircleX className="size-3" aria-hidden /> Δεν πληροί όλα
                        </span>
                      )
                    ) : (
                      <span className="badge-pill muted">Χωρίς αξιολόγηση</span>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {addOpen && (
        <AddProgramDialog
          trdrId={trdrId}
          open={addOpen}
          onOpenChange={setAddOpen}
          onSaved={() => { setAddOpen(false); load(); router.refresh() }}
        />
      )}

      {selected && (
        <EvaluationDialog
          card={selected}
          trdrId={trdrId}
          canManage={canManage}
          open={!!selected}
          onOpenChange={o => { if (!o) setSelected(null) }}
          onChanged={() => { setSelected(null); load(); router.refresh() }}
        />
      )}
    </div>
  )
}

function CriteriaBadges({ snapshot }: { snapshot: SinglePairEligibility | null }) {
  if (!snapshot) return <p className="text-[0.78125rem] text-muted-foreground">Δεν υπάρχει αποθηκευμένη αξιολόγηση.</p>
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1">
        {snapshot.matched.map(k => (
          <span key={k} className="badge-pill ok"><CircleCheck className="size-3" aria-hidden /> {CRITERIA_LABELS[k] ?? k}</span>
        ))}
        {snapshot.failed.map(k => (
          <span key={k} className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
            <CircleX className="size-3" aria-hidden /> {CRITERIA_LABELS[k] ?? k}
          </span>
        ))}
      </div>
      {snapshot.matchedKads.length > 0 && (
        <div>
          <div className="mb-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">ΚΑΔ που ταιριάζουν</div>
          <div className="flex flex-wrap gap-1">
            {snapshot.matchedKads.map(code => <span key={code} className="badge-pill ok tabular-nums">{code}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}

type DetailTab = 'overview' | 'docs' | 'comm'
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Επισκόπηση' },
  { key: 'docs', label: 'Δικαιολογητικά & εργασίες' },
  { key: 'comm', label: 'Επικοινωνία' },
]

function EvaluationDialog({
  card, trdrId, canManage, open, onOpenChange, onChanged,
}: {
  card: TrdrProgramCard
  trdrId: string
  canManage: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [tab, setTab] = React.useState<DetailTab>('overview')
  const [busy, setBusy] = React.useState(false)
  const [pending, setPending] = React.useState<ApplicationPending | null>(null)
  const [contacts, setContacts] = React.useState<AppContactOption[] | null>(null)

  const reloadPending = React.useCallback(() => {
    getApplicationPending(card.id).then(setPending).catch(() => {})
  }, [card.id])
  const reloadContacts = React.useCallback(() => {
    listApplicationContactOptions(card.id).then(setContacts).catch(() => setContacts([]))
  }, [card.id])

  React.useEffect(() => {
    let cancelled = false
    getApplicationPending(card.id).then(p => { if (!cancelled) setPending(p) }).catch(() => {})
    listApplicationContactOptions(card.id).then(c => { if (!cancelled) setContacts(c) }).catch(() => { if (!cancelled) setContacts([]) })
    return () => { cancelled = true }
  }, [card.id])

  async function toggleContact(contactId: string, link: boolean) {
    if (!contacts) return
    const next = link
      ? [...contacts.filter(c => c.linked).map(c => c.contactId), contactId]
      : contacts.filter(c => c.linked && c.contactId !== contactId).map(c => c.contactId)
    setContacts(contacts.map(c => (c.contactId === contactId ? { ...c, linked: link } : c)))
    try {
      await setApplicationContacts(card.id, next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η ενημέρωση επαφών απέτυχε.')
      reloadContacts()
    }
  }

  async function togglePortalScope(contactId: string, all: boolean) {
    if (!contacts) return
    setContacts(contacts.map(c => (c.contactId === contactId ? { ...c, portalAllPrograms: all } : c)))
    try {
      await setContactPortalScope(contactId, all)
      toast.success(all ? 'Κεντρική πρόσβαση portal (όλα τα προγράμματα).' : 'Πρόσβαση μόνο στα συνδεδεμένα προγράμματα.')
    } catch {
      toast.error('Η αλλαγή πρόσβασης απέτυχε.')
      reloadContacts()
    }
  }

  async function changeLifecycle(next: LifecycleStr) {
    setBusy(true)
    try {
      await setApplicationLifecycle(card.id, next as ApplicationLifecycle)
      toast.success(`Κατάσταση: ${lifecycleLabel(next)}.`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αλλαγή κατάστασης απέτυχε.')
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Αφαίρεση σύνδεσης με «${card.programTitle}»;`)) return
    setBusy(true)
    try {
      await removeTrdrProgram(card.id)
      toast.success('Η σύνδεση αφαιρέθηκε.')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αφαίρεση απέτυχε.')
      setBusy(false)
    }
  }

  const c = LIFECYCLE_COLORS[card.lifecycle]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[88vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[840px]">
        <DialogHeader>
          <DialogTitle>{card.programTitle}</DialogTitle>
          <DialogDescription>
            Αξιολόγηση ένταξης — <span className="badge-pill" style={{ color: c.fg, background: c.bg }}>{lifecycleLabel(card.lifecycle)}</span>
            {' · '}Στάδιο PM: {stageLabel(card.stage)} · {verdictLabel(card.verdict)}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs — «τα πάντα από παντού»: επισκόπηση, πλήρης διαχείριση
            δικαιολογητικών/εργασιών, και επικοινωνία, χωρίς έξοδο από την καρτέλα. */}
        <div role="tablist" aria-label="Ενότητες έργου" className="flex flex-wrap gap-1 rounded-full bg-muted/50 p-1">
          {DETAIL_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1.5 text-[0.75rem] font-semibold whitespace-nowrap transition-colors ${tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'docs' && (
          <div className="mt-1">
            <ObligationsTab applicationId={card.id} canManage={canManage} programId={card.programId} />
          </div>
        )}
        {tab === 'comm' && (
          <div className="mt-1">
            <EmailHistory trdrId={trdrId} programId={card.programId} applicationId={card.id} canSend={canManage} />
          </div>
        )}

        {tab === 'overview' && (<>
        <CriteriaBadges snapshot={card.snapshot} />

        {/* Εκκρεμότητες / δικαιολογητικά — έμφαση στην τρέχουσα φάση */}
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
              Δικαιολογητικά &amp; εκκρεμότητες · Φάση: {stageLabel(card.stage)}
            </span>
            {canManage && (
              <NewDocumentRequestDialog
                applicationId={card.id}
                onCreated={reloadPending}
                trigger={<button type="button" className="btn-pill btn-glass h-7 px-3 text-[0.6875rem]"><MailPlus className="size-3" aria-hidden /> Νέο αίτημα</button>}
              />
            )}
          </div>
          {!pending ? (
            <p className="text-[0.71875rem] text-muted-foreground">Φόρτωση…</p>
          ) : pending.openCount === 0 ? (
            <p className="text-[0.71875rem] text-muted-foreground">Καμία εκκρεμότητα.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pending.obligations.map(o => (
                <li key={o.id} className="flex flex-wrap items-center gap-1.5 text-[0.78125rem]">
                  {o.current && <span className="badge-pill info">Τρέχουσα φάση</span>}
                  {o.kind === 'FORM' && <span className="badge-pill violet">Δικαιολογητικό</span>}
                  <span className="font-medium">{o.name}</span>
                  <span className="badge-pill muted">{stageLabel(o.stage)}</span>
                  <span className={`badge-pill ${o.status === 'REJECTED' ? '' : 'warn'}`} style={o.status === 'REJECTED' ? { color: 'var(--card)', background: 'var(--coral)' } : undefined}>
                    {obligationStatusLabel(o.status)}
                  </span>
                  {o.dueDate && <span className="text-[0.6875rem] text-muted-foreground">έως {new Date(o.dueDate).toLocaleDateString('el-GR')}</span>}
                  {canManage && o.kind === 'FORM' && (
                    <NewDocumentRequestDialog
                      applicationId={card.id}
                      obligationId={o.id}
                      defaultTitle={o.name}
                      onCreated={reloadPending}
                      trigger={<button type="button" className="badge-pill" style={{ color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', cursor: 'pointer' }}><MailPlus className="size-3" aria-hidden /> Στείλε στον πελάτη</button>}
                    />
                  )}
                </li>
              ))}
              {pending.fileRequests.map(f => (
                <li key={f.id} className="flex flex-wrap items-center gap-1.5 text-[0.78125rem]">
                  <span className="badge-pill violet">Δικαιολογητικά</span>
                  <span className="font-medium">{f.title}</span>
                  <span className="badge-pill muted tabular-nums">{f.uploadedCount}/{f.itemCount} ανέβηκαν</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Επαφές έργου — εδώ συσχετίζεις τις επαφές της εταιρίας με το πρόγραμμα */}
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
            <Users className="size-3.5" aria-hidden /> Επαφές έργου
          </div>
          {!contacts ? (
            <p className="text-[0.71875rem] text-muted-foreground">Φόρτωση…</p>
          ) : contacts.length === 0 ? (
            <p className="text-[0.71875rem] text-muted-foreground">Ο πελάτης δεν έχει επαφές ακόμη — πρόσθεσέ τες στην καρτέλα πελάτη.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {contacts.map(ct => (
                <li key={ct.contactId} className="flex flex-wrap items-center gap-1.5 text-[0.78125rem]">
                  <input type="checkbox" checked={ct.linked} disabled={!canManage} onChange={e => toggleContact(ct.contactId, e.target.checked)} className="size-3.5 accent-[var(--primary)]" aria-label={`Σύνδεση ${ct.name}`} />
                  <span className="font-medium">{ct.name}</span>
                  {ct.isPrimary && <span className="badge-pill info">Κύρια</span>}
                  {ct.position && <span className="text-[0.6875rem] text-muted-foreground">{ct.position}</span>}
                  {ct.email && <span className="text-[0.6875rem] text-muted-foreground">· {ct.email}</span>}
                  {ct.hasPortalAccess && (
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => togglePortalScope(ct.contactId, !ct.portalAllPrograms)}
                      className="badge-pill"
                      style={ct.portalAllPrograms ? { color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', cursor: 'pointer' } : { cursor: 'pointer' }}
                      title="Εναλλαγή: κεντρική πρόσβαση portal (όλα τα προγράμματα) ή μόνο τα συνδεδεμένα"
                    >
                      portal: {ct.portalAllPrograms ? 'όλα' : 'συνδεδεμένα'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[0.65625rem] text-muted-foreground">Επίλεξε ποιες επαφές αφορούν το πρόγραμμα — σε αυτές στέλνονται τα αιτήματα δικαιολογητικών.</p>
        </div>

        {canManage && (
          <div className="mt-2 flex flex-col gap-1.5">
            <label htmlFor="lifecycle-select" className="text-[0.6875rem] font-semibold text-muted-foreground">Κατάσταση συμμετοχής</label>
            <Select value={card.lifecycle} onValueChange={v => changeLifecycle(v as LifecycleStr)} disabled={busy}>
              <SelectTrigger id="lifecycle-select" className="h-10 w-full rounded-full border-border bg-card px-4">
                <SelectValue>{(v: string) => lifecycleLabel(v as LifecycleStr)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LIFECYCLE_ORDER.map(l => <SelectItem key={l} value={l}>{lifecycleLabel(l)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        </>)}

        <DialogFooter className="flex-wrap gap-2">
          {canManage && (
            <Button type="button" variant="ghost" onClick={handleRemove} disabled={busy} style={{ color: 'var(--destructive)' }}>
              <Trash2 className="size-3.5" aria-hidden /> Αφαίρεση
            </Button>
          )}
          <div className="flex-1" />
          <Link href={`/programs/${card.programId}/applications/${card.id}`} className="btn-pill btn-glass h-9 px-4 text-[0.78125rem]">
            <ExternalLink className="size-3.5" aria-hidden /> Άνοιγμα έργου
          </Link>
          <DialogClose render={<Button variant="outline">Κλείσιμο</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddProgramDialog({
  trdrId, open, onOpenChange, onSaved,
}: {
  trdrId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [options, setOptions] = React.useState<{ value: string; label: string }[]>([])
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    listActivePrograms().then(o => { if (!cancelled) setOptions(o) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const allFilteredSelected = filtered.length > 0 && filtered.every(o => selected.has(o.value))

  function toggle(value: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }
  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) filtered.forEach(o => next.delete(o.value))
      else filtered.forEach(o => next.add(o.value))
      return next
    })
  }

  async function handleSave() {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const res = await associateTrdrPrograms(trdrId, [...selected])
      toast.success(`Συνδέθηκαν ${res.linked} ${res.linked === 1 ? 'πρόγραμμα' : 'προγράμματα'} (Δυνητικός).`)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η σύνδεση απέτυχε.')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Σύνδεση με ενεργά προγράμματα</DialogTitle>
          <DialogDescription>Επίλεξε ένα ή περισσότερα ενεργά προγράμματα. Αποθηκεύονται ως «Δυνητικός» με αυτόματη αξιολόγηση ένταξης.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Αναζήτηση προγράμματος…" className="w-full bg-transparent text-[0.8125rem] outline-none"
              aria-label="Αναζήτηση προγράμματος"
            />
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[0.78125rem] font-semibold whitespace-nowrap">
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} disabled={filtered.length === 0} className="size-4" />
            Επιλογή όλων
          </label>
          <span className="text-[0.75rem] text-muted-foreground">{selected.size} επιλεγμένα</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-[0.78125rem] text-muted-foreground">Δεν υπάρχουν ενεργά προγράμματα.</p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map(o => (
                <li key={o.value} className="dotted-row-bottom">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                    <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} className="size-4 shrink-0" />
                    <span className="text-[0.8125rem]">{o.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={selected.size === 0 || saving}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            Αποθήκευση σύνδεσης ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
