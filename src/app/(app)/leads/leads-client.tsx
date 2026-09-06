'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  MoreVertical, UserCog, Phone, MessageSquarePlus, Sparkles, XCircle, ExternalLink, LoaderCircle, History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { relativeTime } from '@/lib/relative-time'
import {
  assignLead, logLeadCommunication, promoteLead, setLeadStatus, getLeadDetail,
  type LeadRow, type LeadCommRow,
} from '@/lib/leads/actions'
import type { StaffOption } from '@/lib/assignments/actions'
import type { LeadCommMedium } from '@prisma/client'

type Staff = { managers: StaffOption[]; employees: StaffOption[] }
const NONE = '__none__'
const dateFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const SOURCE_LABEL: Record<string, string> = { ELIGIBILITY: 'Επιλεξιμότητα', NEWSLETTER: 'Newsletter', MANUAL: 'Χειροκίνητο' }
const STATUS_META: Record<string, { label: string; variant: string }> = {
  NEW: { label: 'Νέο', variant: 'muted' },
  ASSIGNED: { label: 'Ανατέθηκε', variant: 'info' },
  IN_PROGRESS: { label: 'Σε εξέλιξη', variant: 'warn' },
  CONVERTED: { label: 'Δυνητικός', variant: 'ok' },
  NOT_INTERESTED: { label: 'Άκυρο', variant: 'coral' },
}
const MEDIA: { value: LeadCommMedium; label: string }[] = [
  { value: 'PHONE', label: 'Τηλέφωνο' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'MEETING', label: 'Συνάντηση' },
  { value: 'VIDEO_CALL', label: 'Βιντεοκλήση' },
  { value: 'OTHER', label: 'Άλλο' },
]
const mediumLabel = (m: string) => MEDIA.find(x => x.value === m)?.label ?? m

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, variant: 'muted' }
  const style = m.variant === 'coral' ? { color: 'var(--coral)', background: 'var(--coral-soft)' } : undefined
  return <span className={`badge-pill shrink-0 ${m.variant === 'coral' ? '' : m.variant}`} style={style}>{m.label}</span>
}

export function LeadsClient({ rows, staff, canAssign }: { rows: LeadRow[]; staff: Staff; canAssign: boolean }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [assigning, setAssigning] = React.useState<LeadRow | null>(null)
  const [logging, setLogging] = React.useState<LeadRow | null>(null)
  const [promoting, setPromoting] = React.useState<LeadRow | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [acting, startActing] = React.useTransition()

  const filtered = React.useMemo(
    () => (statusFilter === 'ALL' ? rows : rows.filter(r => r.status === statusFilter)),
    [rows, statusFilter],
  )

  function markNotInterested(row: LeadRow) {
    setBusyId(row.id)
    startActing(async () => {
      try {
        const res = await setLeadStatus(row.id, 'NOT_INTERESTED')
        if (!res.ok) throw new Error(res.error)
        toast.success('Το lead σημάνθηκε ως άκυρο.')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η ενέργεια απέτυχε.')
      } finally {
        setBusyId(null)
      }
    })
  }

  const columns: DataTableColumn<LeadRow>[] = [
    {
      id: 'company', header: 'Ενδιαφερόμενος', width: 240, enableHide: false,
      sortValue: r => r.companyName ?? r.email,
      cell: r => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{r.companyName ?? r.email}</div>
          <div className="truncate text-[0.71875rem] text-muted-foreground">
            {r.afm ? `ΑΦΜ ${r.afm} · ` : ''}{r.email}{r.phone ? ` · ${r.phone}` : ''}
          </div>
        </div>
      ),
    },
    { id: 'source', header: 'Πηγή', width: 130, sortValue: r => r.source, cell: r => <span className="badge-pill muted shrink-0">{SOURCE_LABEL[r.source] ?? r.source}</span> },
    { id: 'status', header: 'Κατάσταση', width: 130, sortValue: r => r.status, cell: r => <StatusBadge status={r.status} /> },
    {
      id: 'eligible', header: 'Επιλέξιμα', width: 100, align: 'center', nowrap: true, sortValue: r => r.eligibleCount,
      cell: r => r.eligibleCount ? <span className="badge-pill teal shrink-0 tabular-nums">{r.eligibleCount}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'assignee', header: 'Ανατέθηκε σε', width: 170, sortValue: r => r.assignedToName ?? '',
      cell: r => r.assignedToName ? <span className="badge-pill info shrink-0"><UserCog className="size-3" aria-hidden /> {r.assignedToName}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'comms', header: 'Επικοιν.', width: 120, align: 'center', nowrap: true, sortValue: r => r.lastCommAt ?? '',
      cell: r => r.commCount ? <span className="badge-pill muted shrink-0 tabular-nums" title={r.lastCommAt ? relativeTime(r.lastCommAt) : undefined}>{r.commCount}</span> : <span className="text-muted-foreground">—</span>,
    },
    { id: 'createdAt', header: 'Ημ/νία', width: 110, nowrap: true, sortValue: r => r.createdAt, cell: r => <span className="tabular-nums">{dateFmt.format(new Date(r.createdAt))}</span> },
    {
      id: 'actions', header: '⋯', headerLabel: 'Ενέργειες', align: 'center', width: 70, enableHide: false, enableResize: false,
      cell: r => {
        const rowBusy = acting && busyId === r.id
        const converted = r.status === 'CONVERTED'
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" aria-label="Ενέργειες" disabled={rowBusy}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
                  {rowBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-max min-w-56">
              {canAssign && (
                <DropdownMenuItem onClick={() => setAssigning(r)}>
                  <UserCog className="size-3.5" aria-hidden /> Ανάθεση επικοινωνίας
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setLogging(r)}>
                <MessageSquarePlus className="size-3.5" aria-hidden /> Καταγραφή επικοινωνίας
              </DropdownMenuItem>
              {!converted && (
                <DropdownMenuItem onClick={() => setPromoting(r)}>
                  <Sparkles className="size-3.5" aria-hidden /> Αναγωγή σε δυνητικό πελάτη
                </DropdownMenuItem>
              )}
              {r.trdrId && (
                <DropdownMenuItem render={<a href={`/partners/${r.trdrId}`} />}>
                  <ExternalLink className="size-3.5" aria-hidden /> Άνοιγμα καρτέλας
                </DropdownMenuItem>
              )}
              {!converted && r.status !== 'NOT_INTERESTED' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => markNotInterested(r)} style={{ color: 'var(--destructive)' }}>
                    <XCircle className="size-3.5" aria-hidden /> Δεν ενδιαφέρεται
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {['ALL', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'NOT_INTERESTED'].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-[0.75rem] font-semibold transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {s === 'ALL' ? 'Όλα' : STATUS_META[s].label}
          </button>
        ))}
      </div>

      <DataTable
        tableId="leads"
        columns={columns}
        rows={filtered}
        rowKey={r => r.id}
        initialSort={{ columnId: 'createdAt', dir: 'desc' }}
        emptyMessage="Δεν υπάρχουν leads."
        fillHeight
        footer={<span>{filtered.length} {filtered.length === 1 ? 'ενδιαφερόμενος' : 'ενδιαφερόμενοι'}</span>}
      />

      {assigning && (
        <AssignDialog key={assigning.id} row={assigning} staff={staff} open onOpenChange={o => { if (!o) setAssigning(null) }} onDone={() => { setAssigning(null); router.refresh() }} />
      )}
      {logging && (
        <CommDialog key={logging.id} row={logging} open onOpenChange={o => { if (!o) setLogging(null) }} onDone={() => { setLogging(null); router.refresh() }} />
      )}
      {promoting && (
        <PromoteDialog key={promoting.id} row={promoting} open onOpenChange={o => { if (!o) setPromoting(null) }} onDone={trdrId => { setPromoting(null); router.refresh(); if (trdrId) router.push(`/partners/${trdrId}`) }} />
      )}
    </>
  )
}

function AssignDialog({ row, staff, open, onOpenChange, onDone }: { row: LeadRow; staff: Staff; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const options = React.useMemo(() => {
    const seen = new Set<string>()
    return [...staff.managers, ...staff.employees].filter(u => (seen.has(u.id) ? false : (seen.add(u.id), true)))
  }, [staff])
  const [userId, setUserId] = React.useState<string>(row.assignedToId ?? NONE)
  const [saving, startSaving] = React.useTransition()

  function handleSave() {
    startSaving(async () => {
      try {
        const res = await assignLead(row.id, userId === NONE ? null : userId)
        if (!res.ok) throw new Error(res.error)
        toast.success(userId === NONE ? 'Η ανάθεση αφαιρέθηκε.' : 'Το lead ανατέθηκε.')
        onDone()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η ανάθεση απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] bg-popover sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Ανάθεση επικοινωνίας</DialogTitle>
          <DialogDescription>{row.companyName ?? row.email} — επίλεξε ποιος θα κάνει το follow-up.</DialogDescription>
        </DialogHeader>
        <div className="field !mb-0">
          <label htmlFor="lead-assignee">Υπεύθυνος</label>
          <select
            id="lead-assignee"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus-visible:border-(--info) focus-visible:ring-4 focus-visible:ring-(--info-soft)"
          >
            <option value={NONE}>— Χωρίς ανάθεση —</option>
            {options.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.role}) · {u.assignedCount} έργα</option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <UserCog className="size-3.5" aria-hidden />}
            Αποθήκευση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CommDialog({ row, open, onOpenChange, onDone }: { row: LeadRow; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [medium, setMedium] = React.useState<LeadCommMedium>('PHONE')
  const [note, setNote] = React.useState('')
  const [when, setWhen] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [history, setHistory] = React.useState<LeadCommRow[]>([])
  const [loadingHist, setLoadingHist] = React.useState(true)
  const [saving, startSaving] = React.useTransition()

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingHist(true)
      try {
        const d = await getLeadDetail(row.id)
        if (!cancelled) setHistory(d?.communications ?? [])
      } finally {
        if (!cancelled) setLoadingHist(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [row.id])

  function handleSave() {
    if (!note.trim()) { toast.error('Γράψε τι ειπώθηκε.'); return }
    startSaving(async () => {
      try {
        const res = await logLeadCommunication(row.id, { medium, note: note.trim(), occurredAt: when })
        if (!res.ok) throw new Error(res.error)
        toast.success('Η επικοινωνία καταγράφηκε.')
        onDone()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η καταγραφή απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="flex max-h-[88vh] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden bg-popover sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Καταγραφή επικοινωνίας</DialogTitle>
          <DialogDescription>{row.companyName ?? row.email}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field !mb-0">
            <label htmlFor="comm-medium">Μέσο</label>
            <select id="comm-medium" value={medium} onChange={e => setMedium(e.target.value as LeadCommMedium)}
              className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus-visible:border-(--info) focus-visible:ring-4 focus-visible:ring-(--info-soft)">
              {MEDIA.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="field !mb-0">
            <label htmlFor="comm-when">Ημ/νία</label>
            <Input id="comm-when" type="date" value={when} onChange={e => setWhen(e.target.value)} />
          </div>
        </div>
        <div className="field !mb-0">
          <label htmlFor="comm-note">Σημειώσεις*</label>
          <textarea id="comm-note" className="cms-textarea" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Τι ειπώθηκε, επόμενα βήματα…" autoFocus />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border p-2">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-[0.65625rem] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            <History className="size-3.5" aria-hidden /> Ιστορικό
          </div>
          {loadingHist ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[0.78125rem] text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
          ) : history.length === 0 ? (
            <p className="px-1 py-3 text-[0.75rem] text-muted-foreground">Καμία καταγραφή ακόμα.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map(c => (
                <li key={c.id} className="rounded-lg bg-card/60 p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="badge-pill info shrink-0"><Phone className="size-3" aria-hidden /> {mediumLabel(c.medium)}</span>
                    <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{relativeTime(c.occurredAt)}</span>
                    {c.byName && <span className="text-[0.6875rem] text-muted-foreground">· {c.byName}</span>}
                  </div>
                  <p className="mt-1 text-[0.78125rem] whitespace-pre-wrap">{c.note}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Κλείσιμο</Button>} />
          <Button type="button" onClick={handleSave} disabled={saving || !note.trim()}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <MessageSquarePlus className="size-3.5" aria-hidden />}
            Καταγραφή
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PromoteDialog({ row, open, onOpenChange, onDone }: { row: LeadRow; open: boolean; onOpenChange: (o: boolean) => void; onDone: (trdrId?: string) => void }) {
  const [saving, startSaving] = React.useTransition()

  function handlePromote() {
    startSaving(async () => {
      try {
        const res = await promoteLead(row.id)
        if (!res.ok) throw new Error(res.error)
        toast.success(res.linked ? `Αναγωγή ολοκληρώθηκε — ${res.linked} έργα POTENTIAL.` : 'Αναγωγή σε δυνητικό πελάτη ολοκληρώθηκε.')
        onDone(res.trdrId)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η αναγωγή απέτυχε.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] bg-popover sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Αναγωγή σε δυνητικό πελάτη</DialogTitle>
          <DialogDescription>
            {row.companyName ?? row.email} — θα δημιουργηθεί/εξασφαλιστεί «Υποψήφιος» πελάτης
            {row.eligibleCount ? <> και {row.eligibleCount} έργα (POTENTIAL) για τα επιλέξιμα προγράμματα</> : null}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handlePromote} disabled={saving}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
            Αναγωγή
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
