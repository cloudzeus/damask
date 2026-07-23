'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LuGripVertical, LuChevronDown, LuChevronRight } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { updateObligation, type BoardObligation } from '@/lib/pm/actions'
import { KANBAN_COLUMNS, groupByStatus, groupBySwimlane, type Swimlane } from '@/lib/pm/board'
import { obligationStatusLabel, stageLabel, type ObligationStatusStr } from '@/lib/pm/types'

/**
 * «Πίνακας» (C2b) — global status Kanban πάνω σε ApplicationObligation, με
 * προαιρετικά swimlanes ανά ανάθεση (`swimlaneBy="assignee"`). Ένα ενιαίο
 * DndContext καλύπτει ΟΛΕΣ τις λωρίδες/κολόνες· το drop target κωδικοποιεί
 * `${laneKey}::${status}` — μόνο το status εξάγεται και στέλνεται στο
 * updateObligation (ίδιο scoped action με το ObligationsTab), ποτέ η λωρίδα
 * (η ανάθεση ΔΕΝ αλλάζει με drag εδώ — μόνο η κατάσταση).
 *
 * Drag hijacking το link: το ΜΟΝΟ στοιχείο με drag listeners είναι το μικρό
 * grip handle (ίδιο idiom με task-templates-tab.tsx) — ο τίτλος/υποτίτλος/
 * link του project παραμένουν εκτός {...listeners}, άρα το click στο Link
 * λειτουργεί κανονικά χωρίς pointer-down να ξεκινήσει drag.
 */
export function ObligationsBoard({
  obligations, swimlaneBy = 'none', onStatusChange,
}: {
  obligations: BoardObligation[]
  swimlaneBy?: 'assignee' | 'none'
  onStatusChange?: () => void
}) {
  const [local, setLocal] = React.useState<BoardObligation[]>(obligations)

  React.useEffect(() => { setLocal(obligations) }, [obligations])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const lanes: Swimlane<BoardObligation>[] = swimlaneBy === 'assignee'
    ? groupBySwimlane(local)
    : [{ key: 'all', label: '', items: local }]

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const id = String(active.id)
    const dropId = String(over.id)
    const sep = dropId.lastIndexOf('::')
    if (sep === -1) return
    const targetStatus = dropId.slice(sep + 2) as ObligationStatusStr
    const current = local.find(o => o.id === id)
    if (!current || current.status === targetStatus) return

    const prev = local
    setLocal(list => list.map(o => (o.id === id ? { ...o, status: targetStatus } : o)))
    try {
      await updateObligation(id, { status: targetStatus })
      onStatusChange?.()
    } catch {
      toast.error('Η αλλαγή κατάστασης απέτυχε.')
      setLocal(prev)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-5">
        {lanes.map(lane => (
          <BoardLane key={lane.key} lane={lane} />
        ))}
        {lanes.length === 0 && (
          <p className="py-8 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν υποχρεώσεις.</p>
        )}
      </div>
    </DndContext>
  )
}

function BoardLane({ lane }: { lane: Swimlane<BoardObligation> }) {
  const grouped = groupByStatus(lane.items)
  const [otherOpen, setOtherOpen] = React.useState(false)

  return (
    <section className="glass rounded-[22px] p-3.5">
      {lane.label && (
        <div className="mb-2.5 flex items-center gap-1.5 px-0.5 text-[12.5px] font-extrabold">
          {lane.label}
          <span className="text-[11px] font-normal text-muted-foreground">({lane.items.length})</span>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-1">
        {KANBAN_COLUMNS.map(status => (
          <BoardColumn key={status} laneKey={lane.key} status={status} items={grouped[status as 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED']} />
        ))}
      </div>

      {grouped.other.length > 0 && (
        <div className="mt-3" style={{ borderTop: '1px dotted var(--dotted)', paddingTop: 10 }}>
          <button
            type="button"
            onClick={() => setOtherOpen(o => !o)}
            className="flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {otherOpen ? <LuChevronDown className="size-3.5" aria-hidden /> : <LuChevronRight className="size-3.5" aria-hidden />}
            Άλλες ({grouped.other.length})
          </button>
          {otherOpen && (
            <div className="mt-2 flex flex-col gap-1.5">
              {grouped.other.map(o => (
                <ReadOnlyCard key={o.id} obligation={o} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function BoardColumn({ laneKey, status, items }: { laneKey: string; status: ObligationStatusStr; items: BoardObligation[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${laneKey}::${status}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[280px] shrink-0 flex-col gap-1.5 rounded-[16px] border border-border bg-card/50 p-2.5 transition-colors',
        isOver && 'border-primary/50 bg-primary/5',
      )}
    >
      <div className="mb-0.5 flex items-center justify-between px-0.5">
        <span className="text-[12px] font-extrabold">{obligationStatusLabel(status)}</span>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-[11.5px] text-muted-foreground">—</p>
      ) : (
        items.map(o => <BoardCard key={o.id} obligation={o} />)
      )}
    </div>
  )
}

function dueBadgeIsCoral(o: BoardObligation): boolean {
  if (!o.dueDate || o.status === 'APPROVED' || o.status === 'WAIVED') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(o.dueDate) < today
}

function CardBody({ obligation: o, showStatus = false }: { obligation: BoardObligation; showStatus?: boolean }) {
  const overdue = dueBadgeIsCoral(o)
  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold break-words">{o.name}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className={cn('badge-pill shrink-0', o.templateId ? 'ok' : 'muted')}>{o.templateId ? 'Βήμα' : 'Πρόγραμμα'}</span>
        <span className="badge-pill info shrink-0">{stageLabel(o.stage)}</span>
        {showStatus && <span className="badge-pill muted shrink-0">{obligationStatusLabel(o.status)}</span>}
        {o.dueDate && (
          <span
            className="badge-pill shrink-0"
            style={overdue ? { color: 'var(--coral)', background: 'var(--coral-soft)' } : undefined}
          >
            {new Date(o.dueDate).toLocaleDateString('el-GR')}
          </span>
        )}
      </div>
      <Link
        href={`/programs/${o.programId}/applications/${o.applicationId}`}
        className="mt-1.5 block truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
      >
        {o.customerName} · {o.programTitle}
      </Link>
    </>
  )
}

function BoardCard({ obligation: o }: { obligation: BoardObligation }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: o.id })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('rounded-[14px] border border-border bg-card p-2.5', isDragging && 'opacity-70 shadow-lg')}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Μετακίνηση — ${o.name}`}
          className="mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 active:cursor-grabbing"
        >
          <LuGripVertical className="size-3.5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <CardBody obligation={o} />
        </div>
      </div>
    </div>
  )
}

/** Κάρτα «Άλλες» (WAIVED/REJECTED) — read-only, δεν είναι draggable. */
function ReadOnlyCard({ obligation: o }: { obligation: BoardObligation }) {
  return (
    <div className="rounded-[14px] border border-border bg-card/60 p-2.5 opacity-70">
      <CardBody obligation={o} showStatus />
    </div>
  )
}
