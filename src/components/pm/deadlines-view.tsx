'use client'

import * as React from 'react'
import Link from 'next/link'
import { LuChevronDown, LuChevronRight } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { type BoardObligation } from '@/lib/pm/actions'
import { bucketByDeadline } from '@/lib/pm/board'
import { obligationStatusLabel, stageLabel } from '@/lib/pm/types'

/**
 * «Προθεσμίες» (C2b) — deadline radar πάνω σε ApplicationObligation, ίδιο
 * bucketing engine (bucketByDeadline) με το board. Καθαρά read-only λίστα,
 * ταξινομημένη ανά επικινδυνότητα (Εκπρόθεσμα πρώτα).
 */
export function DeadlinesView({ obligations }: { obligations: BoardObligation[] }) {
  const buckets = React.useMemo(() => {
    const t = new Date()
    const todayMs = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())
    return bucketByDeadline(obligations, todayMs)
  }, [obligations])

  const [noDateOpen, setNoDateOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-4">
      <DeadlineSection title="Εκπρόθεσμα" items={buckets.overdue} coral />
      <DeadlineSection title="Σήμερα" items={buckets.today} />
      <DeadlineSection title="Αυτή την εβδομάδα" items={buckets.thisWeek} />
      <DeadlineSection title="Αργότερα" items={buckets.later} />

      {buckets.noDate.length > 0 && (
        <section className="glass rounded-[22px] p-4">
          <button
            type="button"
            onClick={() => setNoDateOpen(o => !o)}
            className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase"
          >
            {noDateOpen ? <LuChevronDown className="size-3.5" aria-hidden /> : <LuChevronRight className="size-3.5" aria-hidden />}
            Χωρίς προθεσμία ({buckets.noDate.length})
          </button>
          {noDateOpen && (
            <div className="mt-3 flex flex-col">
              {buckets.noDate.map(o => <DeadlineRow key={o.id} obligation={o} />)}
            </div>
          )}
        </section>
      )}

      {buckets.overdue.length === 0 && buckets.today.length === 0 && buckets.thisWeek.length === 0
        && buckets.later.length === 0 && buckets.noDate.length === 0 && (
        <p className="py-8 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν εκκρεμείς υποχρεώσεις με προθεσμία.</p>
      )}
    </div>
  )
}

function DeadlineSection({ title, items, coral = false }: { title: string; items: BoardObligation[]; coral?: boolean }) {
  if (items.length === 0) return null
  return (
    <section className="glass rounded-[22px] p-4">
      <div
        className="dotted-leader mb-2 text-[10.5px] font-extrabold tracking-[0.1em] uppercase"
        style={coral ? { color: 'var(--coral)' } : undefined}
      >
        {title} ({items.length})
      </div>
      <div className="flex flex-col">
        {items.map(o => <DeadlineRow key={o.id} obligation={o} />)}
      </div>
    </section>
  )
}

function DeadlineRow({ obligation: o }: { obligation: BoardObligation }) {
  const dueLabel = o.dueDate ? new Date(o.dueDate).toLocaleDateString('el-GR') : '—'
  return (
    <Link
      href={`/programs/${o.programId}/applications/${o.applicationId}`}
      className="dotted-row-bottom flex flex-wrap items-center gap-2.5 py-2.5 hover:bg-muted/40"
    >
      <span className={cn('w-[86px] shrink-0 text-[12px] font-semibold', o.dueDate ? '' : 'text-muted-foreground')}>{dueLabel}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{o.name}</div>
        <div className="text-[11.5px] text-muted-foreground">{o.customerName} · {o.programTitle}</div>
      </div>
      <span className="badge-pill info shrink-0">{stageLabel(o.stage)}</span>
      <span className="w-[130px] shrink-0 truncate text-[11.5px] text-muted-foreground">{o.assigneeName ?? 'Χωρίς ανάθεση'}</span>
      <span className="badge-pill muted shrink-0">{obligationStatusLabel(o.status)}</span>
    </Link>
  )
}
