'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Mail, Phone, FileCheck2, LoaderCircle, ArrowDownLeft, ArrowUpRight, AlertCircle, ExternalLink,
} from 'lucide-react'
import { ComposeEmailDialog } from '@/components/email/compose-email-dialog'
import { relativeTime } from '@/lib/relative-time'
import { getCustomerCommunications, type CommItem, type CommKind } from '@/lib/communications/actions'

/**
 * Ενοποιημένο ιστορικό επικοινωνίας πελάτη — emails + κλήσεις/συναντήσεις (leads) +
 * αιτήματα δικαιολογητικών, με φίλτρα (τύπος/έργο/εκκρεμότητες), «ποιος», «μέσο»,
 * «για ποιο έργο». Self-fetching (setState μετά το await).
 */
const KIND_META: Record<CommKind, { label: string; icon: typeof Mail }> = {
  EMAIL: { label: 'Email', icon: Mail },
  CALL: { label: 'Επικοινωνία', icon: Phone },
  FILE_REQUEST: { label: 'Δικαιολογητικά', icon: FileCheck2 },
}

export function CommunicationTimeline({
  trdrId, defaultTo, canSend = false,
}: {
  trdrId: string
  defaultTo?: string
  canSend?: boolean
}) {
  const [items, setItems] = React.useState<CommItem[]>([])
  const [pendingCount, setPendingCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [kindFilter, setKindFilter] = React.useState<'ALL' | CommKind>('ALL')
  const [programFilter, setProgramFilter] = React.useState<string>('ALL')
  const [onlyPending, setOnlyPending] = React.useState(false)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const data = await getCustomerCommunications(trdrId)
        if (!cancelled) { setItems(data.items); setPendingCount(data.pendingCount) }
      } catch {
        if (!cancelled) setError('Η φόρτωση του ιστορικού απέτυχε.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [trdrId, reloadKey])

  const programs = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) if (i.programId && i.programTitle) m.set(i.programId, i.programTitle)
    return [...m.entries()]
  }, [items])

  const filtered = React.useMemo(() => items.filter(i =>
    (kindFilter === 'ALL' || i.kind === kindFilter)
    && (programFilter === 'ALL' || i.programId === programFilter)
    && (!onlyPending || i.pending),
  ), [items, kindFilter, programFilter, onlyPending])

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Ιστορικό επικοινωνίας ({items.length})
        </div>
        {canSend && (
          <ComposeEmailDialog trdrId={trdrId} defaultTo={defaultTo} onSent={() => setReloadKey(k => k + 1)} />
        )}
      </div>

      {/* Φίλτρα */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(['ALL', 'EMAIL', 'CALL', 'FILE_REQUEST'] as const).map(k => (
          <button key={k} type="button" onClick={() => setKindFilter(k)}
            className={`rounded-full px-3 py-1 text-[0.75rem] font-semibold transition-colors ${kindFilter === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            {k === 'ALL' ? 'Όλα' : KIND_META[k].label}
          </button>
        ))}
        {programs.length > 0 && (
          <select value={programFilter} onChange={e => setProgramFilter(e.target.value)}
            className="h-8 rounded-full border border-border bg-card px-3 text-[0.75rem] outline-none">
            <option value="ALL">Όλα τα έργα</option>
            {programs.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        )}
        {pendingCount > 0 && (
          <button type="button" onClick={() => setOnlyPending(v => !v)}
            className={`ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.75rem] font-bold transition-colors ${onlyPending ? '' : 'hover:opacity-80'}`}
            style={{ color: 'var(--coral)', background: 'var(--coral-soft)', outline: onlyPending ? '2px solid var(--coral)' : 'none' }}>
            <AlertCircle className="size-3.5" aria-hidden /> {pendingCount} εκκρεμότητες
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[0.78125rem] text-coral">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-[0.78125rem] text-muted-foreground">Δεν υπάρχει ιστορικό επικοινωνίας.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map(item => <CommRow key={item.id} item={item} />)}
        </ul>
      )}
    </section>
  )
}

function CommRow({ item }: { item: CommItem }) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon
  const iconColor = item.kind === 'EMAIL' ? 'var(--info)' : item.kind === 'CALL' ? 'var(--teal)' : 'var(--warn)'
  const iconBg = item.kind === 'EMAIL' ? 'var(--info-soft)' : item.kind === 'CALL' ? 'var(--teal-soft)' : 'var(--warn-soft)'
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-card/60 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: iconBg, color: iconColor }}>
        <Icon className="size-[1.05rem]" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[0.8125rem] font-bold text-foreground">{item.title}</span>
          {item.kind === 'EMAIL' && (
            item.direction === 'INBOUND'
              ? <span className="badge-pill teal shrink-0"><ArrowDownLeft className="size-3" aria-hidden /> Εισερχ.</span>
              : <span className="badge-pill info shrink-0"><ArrowUpRight className="size-3" aria-hidden /> Εξερχ.</span>
          )}
          <span className="badge-pill muted shrink-0">{item.medium}</span>
          {item.pending && <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>Εκκρεμεί</span>}
          <span className="ml-auto shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">{relativeTime(item.at)}</span>
        </div>
        {item.snippet && <p className="mt-1 line-clamp-2 text-[0.75rem] text-muted-foreground">{item.snippet}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
          {item.programTitle && (
            item.applicationId && item.programId
              ? <Link href={`/programs/${item.programId}/applications/${item.applicationId}`} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                  <ExternalLink className="size-3" aria-hidden /> {item.programTitle}
                </Link>
              : <span className="font-medium">{item.programTitle}</span>
          )}
          {item.byName && <span>· {item.byName}</span>}
        </div>
      </div>
    </li>
  )
}
