'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Link2, LoaderCircle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  adminSubscribe, adminUnsubscribe, getUnsubscribeUrl,
  type SubscriberRow, type LeadRequestRow, type ConsentRow,
} from '@/lib/newsletter/actions'

/**
 * Διαχείριση Newsletter (admin) — τρεις καρτέλες: Εγγεγραμμένοι, δημόσια
 * Αιτήματα, και το αμετάβλητο αρχείο Συναινέσεων (GDPR). Το data-fetching μένει
 * server-side (page.tsx)· εδώ γίνεται μόνο η εναλλαγή/interactivity. Μετά από
 * κάθε mutation κάνουμε router.refresh() για να ξαναφορτώσουν τα server data.
 */

type TabKey = 'subscribers' | 'requests' | 'consents'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'subscribers', label: 'Εγγεγραμμένοι' },
  { key: 'requests', label: 'Αιτήματα' },
  { key: 'consents', label: 'Συναινέσεις' },
]

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function NewsletterTabs({
  subscribers, leadRequests, consents, canManage,
}: {
  subscribers: SubscriberRow[]
  leadRequests: LeadRequestRow[]
  consents: ConsentRow[]
  canManage: boolean
}) {
  const [active, setActive] = React.useState<TabKey>('subscribers')

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Ενότητες newsletter" className="glass flex flex-wrap gap-1 rounded-full p-1.5">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              'rounded-full px-4 py-2 text-[0.78125rem] font-semibold whitespace-nowrap transition-colors',
              active === t.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {active === 'subscribers' && <SubscribersTab rows={subscribers} canManage={canManage} />}
        {active === 'requests' && <RequestsTab rows={leadRequests} />}
        {active === 'consents' && <ConsentsTab rows={consents} />}
      </div>
    </div>
  )
}

// ── Εγγεγραμμένοι ────────────────────────────────────────────────────────────

const SUB_STATUS: Record<SubscriberRow['status'], { label: string; cls: string }> = {
  SUBSCRIBED: { label: 'Εγγεγραμμένος', cls: 'badge-pill ok' },
  UNSUBSCRIBED: { label: 'Διαγράφηκε', cls: 'badge-pill muted' },
  BOUNCED: { label: 'Bounced', cls: 'badge-pill danger' },
}

function SubscribersTab({ rows, canManage }: { rows: SubscriberRow[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  function handleDelete(row: SubscriberRow) {
    if (!window.confirm(`Διαγραφή (opt-out) της εγγραφής «${row.email}»;\nΘα καταγραφεί ίχνος UNSUBSCRIBE.`)) return
    setBusyId(row.id)
    startTransition(async () => {
      try {
        await adminUnsubscribe(row.email)
        toast.success('Η εγγραφή διαγράφηκε.')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η διαγραφή απέτυχε.')
      } finally {
        setBusyId(null)
      }
    })
  }

  async function handleCopyLink(row: SubscriberRow) {
    setBusyId(row.id)
    try {
      const res = await getUnsubscribeUrl(row.id)
      if (!res.ok || !res.url) {
        toast.error('Δεν ήταν δυνατή η δημιουργία του link.')
        return
      }
      await navigator.clipboard.writeText(res.url)
      toast.success('Το link διαγραφής αντιγράφηκε.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αντιγραφή απέτυχε.')
    } finally {
      setBusyId(null)
    }
  }

  const columns: DataTableColumn<SubscriberRow>[] = [
    {
      id: 'email',
      header: 'Email',
      width: 240,
      enableHide: false,
      sortValue: r => r.email,
      cell: r => <b>{r.email}</b>,
    },
    { id: 'name', header: 'Όνομα', width: 180, sortValue: r => r.name, cell: r => r.name ?? '—' },
    {
      id: 'afm',
      header: 'ΑΦΜ',
      width: 120,
      sortValue: r => r.afm,
      cell: r => <span className="tabular-nums">{r.afm ?? '—'}</span>,
    },
    {
      id: 'source',
      header: 'Πηγή',
      width: 120,
      sortValue: r => r.source,
      cell: r => <span className="badge-pill info">{r.source}</span>,
    },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 140,
      sortValue: r => r.status,
      cell: r => {
        const meta = SUB_STATUS[r.status]
        return <span className={meta.cls}>{meta.label}</span>
      },
    },
    {
      id: 'confirmedAt',
      header: 'Επιβεβαίωση',
      width: 150,
      sortValue: r => r.confirmedAt,
      cell: r => <span className="tabular-nums">{fmtDate(r.confirmedAt)}</span>,
    },
    {
      id: 'createdAt',
      header: 'Ημ/νία',
      width: 150,
      sortValue: r => r.createdAt,
      cell: r => <span className="tabular-nums">{fmtDate(r.createdAt)}</span>,
    },
    ...(canManage
      ? [{
          id: 'actions',
          header: '⋯',
          headerLabel: 'Ενέργειες',
          align: 'center' as const,
          width: 96,
          enableHide: false,
          enableResize: false,
          cell: (r: SubscriberRow) => (
            <div className="flex items-center justify-center gap-1">
              <Button
                type="button" variant="ghost" size="icon-sm" disabled={busyId === r.id}
                onClick={() => handleCopyLink(r)} aria-label={`Αντιγραφή link διαγραφής ${r.email}`}
                title="Αντιγραφή link διαγραφής"
              >
                <Link2 className="size-3.5" aria-hidden />
              </Button>
              <Button
                type="button" variant="ghost" size="icon-sm" disabled={busyId === r.id || pending}
                onClick={() => handleDelete(r)} aria-label={`Διαγραφή ${r.email}`}
                title="Διαγραφή (opt-out)"
              >
                {busyId === r.id && pending
                  ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  : <Trash2 className="size-3.5" aria-hidden />}
              </Button>
            </div>
          ),
        }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-3">
      {canManage && <AddSubscriberForm />}
      <DataTable
        tableId="newsletter-subscribers"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        emptyMessage="Δεν υπάρχουν εγγεγραμμένοι ακόμη."
        footer={<span>{rows.length} {rows.length === 1 ? 'εγγραφή' : 'εγγραφές'}</span>}
      />
    </div>
  )
}

function AddSubscriberForm() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [email, setEmail] = React.useState('')
  const [name, setName] = React.useState('')
  const [afm, setAfm] = React.useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Το email είναι υποχρεωτικό.')
      return
    }
    startTransition(async () => {
      try {
        const res = await adminSubscribe({ email, name: name || undefined, afm: afm || undefined })
        if (!res.ok) {
          toast.error(res.error ?? 'Η εγγραφή απέτυχε.')
          return
        }
        toast.success('Η εγγραφή προστέθηκε.')
        setEmail(''); setName(''); setAfm('')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η εγγραφή απέτυχε.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="glass flex flex-wrap items-end gap-2 px-4 py-3">
      <div className="field mb-0 min-w-[200px] flex-1">
        <label htmlFor="nl-email">Email*</label>
        <Input id="nl-email" type="email" className="w-full" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
      </div>
      <div className="field mb-0 min-w-[150px] flex-1">
        <label htmlFor="nl-name">Όνομα</label>
        <Input id="nl-name" className="w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Προαιρετικό" />
      </div>
      <div className="field mb-0 min-w-[120px]">
        <label htmlFor="nl-afm">ΑΦΜ</label>
        <Input id="nl-afm" className="w-full" value={afm} onChange={e => setAfm(e.target.value)} placeholder="Προαιρετικό" />
      </div>
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
        Προσθήκη εγγραφής
      </Button>
    </form>
  )
}

// ── Αιτήματα (δημόσια φόρμα) ─────────────────────────────────────────────────

const LEAD_STATUS: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: 'Επιβεβαιωμένο', cls: 'badge-pill ok' },
  PENDING_OTP: { label: 'Αναμονή OTP', cls: 'badge-pill warn' },
  EXPIRED: { label: 'Έληξε', cls: 'badge-pill muted' },
  FAILED: { label: 'Απέτυχε', cls: 'badge-pill danger' },
}

function RequestsTab({ rows }: { rows: LeadRequestRow[] }) {
  const columns: DataTableColumn<LeadRequestRow>[] = [
    {
      id: 'companyName',
      header: 'Επωνυμία',
      width: 220,
      enableHide: false,
      sortValue: r => r.companyName,
      cell: r => <b>{r.companyName ?? '—'}</b>,
    },
    {
      id: 'afm',
      header: 'ΑΦΜ',
      width: 120,
      sortValue: r => r.afm,
      cell: r => <span className="tabular-nums">{r.afm}</span>,
    },
    { id: 'email', header: 'Email', width: 220, sortValue: r => r.email, cell: r => r.email },
    {
      id: 'phone',
      header: 'Τηλέφωνο',
      width: 140,
      sortValue: r => r.phone,
      cell: r => <span className="tabular-nums">{r.phone}</span>,
    },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 150,
      sortValue: r => r.status,
      cell: r => {
        const meta = LEAD_STATUS[r.status] ?? { label: r.status, cls: 'badge-pill muted' }
        return <span className={meta.cls}>{meta.label}</span>
      },
    },
    {
      id: 'eligibleCount',
      header: 'Επιλέξιμα',
      align: 'right',
      width: 100,
      sortValue: r => r.eligibleCount,
      cell: r => <span className="tabular-nums">{r.eligibleCount}</span>,
    },
    {
      id: 'newsletterOptIn',
      header: 'Newsletter',
      width: 110,
      sortValue: r => r.newsletterOptIn,
      cell: r => r.newsletterOptIn
        ? <span className="badge-pill ok">Ναι</span>
        : <span className="badge-pill muted">Όχι</span>,
    },
    {
      id: 'createdAt',
      header: 'Ημ/νία',
      width: 150,
      sortValue: r => r.createdAt,
      cell: r => <span className="tabular-nums">{fmtDate(r.createdAt)}</span>,
    },
    {
      id: 'verifiedAt',
      header: 'Επιβεβαίωση',
      width: 150,
      sortValue: r => r.verifiedAt,
      cell: r => <span className="tabular-nums">{fmtDate(r.verifiedAt)}</span>,
    },
  ]

  return (
    <DataTable
      tableId="newsletter-requests"
      columns={columns}
      rows={rows}
      rowKey={r => r.id}
      emptyMessage="Δεν υπάρχουν αιτήματα ακόμη."
      footer={<span>{rows.length} {rows.length === 1 ? 'αίτημα' : 'αιτήματα'}</span>}
    />
  )
}

// ── Συναινέσεις (GDPR proof) — read-only audit trail ─────────────────────────

const CONSENT_ACTION: Record<string, { label: string; cls: string }> = {
  SUBSCRIBE: { label: 'Εγγραφή', cls: 'badge-pill ok' },
  UNSUBSCRIBE: { label: 'Διαγραφή', cls: 'badge-pill muted' },
}

function ConsentsTab({ rows }: { rows: ConsentRow[] }) {
  const [selected, setSelected] = React.useState<ConsentRow | null>(null)

  const columns: DataTableColumn<ConsentRow>[] = [
    {
      id: 'email',
      header: 'Email',
      width: 230,
      enableHide: false,
      sortValue: r => r.email,
      cell: r => <b>{r.email}</b>,
    },
    {
      id: 'action',
      header: 'Ενέργεια',
      width: 120,
      sortValue: r => r.action,
      cell: r => {
        const meta = CONSENT_ACTION[r.action] ?? { label: r.action, cls: 'badge-pill muted' }
        return <span className={meta.cls}>{meta.label}</span>
      },
    },
    {
      id: 'method',
      header: 'Μέθοδος',
      width: 180,
      sortValue: r => r.method,
      cell: r => <span className="font-mono text-[0.6875rem]">{r.method}</span>,
    },
    {
      id: 'consentVersion',
      header: 'Έκδοση',
      width: 100,
      sortValue: r => r.consentVersion,
      cell: r => r.consentVersion ?? '—',
    },
    {
      id: 'ip',
      header: 'IP',
      width: 130,
      sortValue: r => r.ip,
      cell: r => <span className="font-mono text-[0.6875rem]">{r.ip ?? '—'}</span>,
    },
    {
      id: 'createdAt',
      header: 'Ημ/νία',
      width: 150,
      sortValue: r => r.createdAt,
      cell: r => <span className="tabular-nums">{fmtDate(r.createdAt)}</span>,
    },
  ]

  return (
    <>
      <div className="mb-2 flex items-center gap-1.5 text-[0.71875rem] font-semibold text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden />
        Αμετάβλητο αρχείο συναινέσεων (GDPR) — μόνο ανάγνωση. Πατήστε μια γραμμή για το πλήρες κείμενο.
      </div>
      <DataTable
        tableId="newsletter-consents"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        onRowClick={r => setSelected(r)}
        emptyMessage="Δεν υπάρχουν καταγραφές συναίνεσης ακόμη."
        footer={<span>{rows.length} {rows.length === 1 ? 'καταγραφή' : 'καταγραφές'}</span>}
      />

      <Dialog open={selected !== null} onOpenChange={next => { if (!next) setSelected(null) }}>
        <DialogContent className="glass sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Απόδειξη συναίνεσης</DialogTitle>
            <DialogDescription>
              {selected ? `${CONSENT_ACTION[selected.action]?.label ?? selected.action} · ${fmtDate(selected.createdAt)}` : ''}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="flex flex-col gap-3 text-[0.78125rem]">
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
                <dt className="font-semibold text-muted-foreground">Email</dt>
                <dd className="break-all">{selected.email}</dd>
                {selected.afm && (<>
                  <dt className="font-semibold text-muted-foreground">ΑΦΜ</dt>
                  <dd className="tabular-nums">{selected.afm}</dd>
                </>)}
                <dt className="font-semibold text-muted-foreground">Μέθοδος</dt>
                <dd className="font-mono text-[0.6875rem]">{selected.method}</dd>
                <dt className="font-semibold text-muted-foreground">Έκδοση</dt>
                <dd>{selected.consentVersion ?? '—'}</dd>
                <dt className="font-semibold text-muted-foreground">Πηγή</dt>
                <dd>{selected.source ?? '—'}</dd>
                <dt className="font-semibold text-muted-foreground">IP</dt>
                <dd className="font-mono text-[0.6875rem]">{selected.ip ?? '—'}</dd>
                <dt className="font-semibold text-muted-foreground">User agent</dt>
                <dd className="font-mono text-[0.6875rem] break-all">{selected.userAgent ?? '—'}</dd>
              </dl>

              <div>
                <div className="mb-1 font-semibold text-muted-foreground">Κείμενο συναίνεσης</div>
                <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border bg-card p-3 whitespace-pre-wrap">
                  {selected.consentText}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
