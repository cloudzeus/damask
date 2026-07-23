'use client'

import * as React from 'react'
import { LuLoaderCircle, LuFolderOpen, LuX, LuDownload } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import {
  listApplicationDeliverables, listCertifications,
  type DeliverableMatrixItem, type CertificationItem,
} from '@/lib/pm/actions'
import { buildGanttModel, type GanttTask, type GanttEdge } from '@/lib/pm/gantt'
import { deliverablePhaseLabel, deliverableStatusLabel, type DeliverableStatusStr } from '@/lib/pm/deliverable-phases'

const COL_W = 190
const ROW_H = 46
const HEADER_H = 34
const LABEL_W = 200
const PAD = 6

type MatrixTask = DeliverableMatrixItem['tasks'][number]

const STATUS_STYLE: Record<DeliverableStatusStr, { fill: string; stroke: string; dashed: boolean }> = {
  PENDING: { fill: 'var(--muted)', stroke: 'var(--dotted)', dashed: false },
  UPLOADED: { fill: 'var(--info-soft)', stroke: 'var(--info)', dashed: false },
  ACCEPTED: { fill: 'var(--success-soft)', stroke: 'var(--success)', dashed: false },
  REJECTED: { fill: 'var(--coral-soft)', stroke: 'var(--coral)', dashed: false },
  WAIVED: { fill: 'var(--muted)', stroke: 'var(--dotted)', dashed: true },
}

/**
 * «Gantt» tab (C2g Tasks 10+11) — SVG διάγραμμα εργασιών παραδοτέων ομαδοποιημένων
 * ανά δαπάνη (lane), στηλοθετημένο ανά φάση (το ίδιο 9-φασικό μοντέλο με το
 * matrix tab, βλ. deliverable-phases.ts), με βέλη εξάρτησης (DAG — auto από
 * generateExpenseDeliverables + χειροκίνητες, βλ. addTaskDependency) και
 * ανάδειξη της κρίσιμης διαδρομής. «στο gantt τα task πρέπει να είναι
 * συνδεδεμένα γιατί χωρίς το ένα δεν μπορεί να εκτελεστεί το άλλο» — γι' αυτό
 * το tab υπάρχει: δείχνει ΟΠΤΙΚΑ το ήδη υπολογισμένο (server-side) DAG του
 * matrix tab, δεν το ξαναυπολογίζει.
 *
 * v1: χωρίς time axis — οι φάσεις είναι ο x-άξονας (startMs/endMs περνάνε
 * ανέπαφα στο GanttTask αλλά δεν σχεδιάζονται ακόμα· v2 θα προσθέσει χρονικό
 * άξονα + today line). Self-fetching client component, mirror του idiom
 * DeliverablesMatrixTab (ίδιες δύο actions, Promise.all).
 */
export function GanttView({ applicationId, programId }: { applicationId: string; programId: string }) {
  const [matrix, setMatrix] = React.useState<DeliverableMatrixItem[]>([])
  const [certs, setCerts] = React.useState<CertificationItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listApplicationDeliverables(applicationId), listCertifications(applicationId)])
      .then(([m, c]) => { setMatrix(m); setCerts(c) })
      .catch(() => setError('Η φόρτωση των παραδοτέων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  React.useEffect(() => { load() }, [load])

  const certByExpenseId = React.useMemo(() => new Map(certs.map(c => [c.expenseId, c])), [certs])

  // Decouple the DTO into the pure gantt module's input shapes, plus a
  // lookup back to the full task DTO (files/blockingNames/notes) for the
  // side panel — buildGanttModel only carries the fields it needs to lay out.
  const { ganttTasks, edges, metaById, laneLabelByKey } = React.useMemo(() => {
    const ganttTasks: GanttTask[] = []
    const edges: GanttEdge[] = []
    const metaById = new Map<string, { task: MatrixTask; groupName: string }>()
    const laneLabelByKey = new Map<string, string>()

    for (const g of matrix) {
      const laneKey = g.expenseId ?? '__app__'
      if (!laneLabelByKey.has(laneKey)) {
        const cert = g.expenseId != null ? certByExpenseId.get(g.expenseId) : undefined
        laneLabelByKey.set(laneKey, cert?.expenseDescription ?? 'Έργο')
      }
      for (const t of g.tasks) {
        ganttTasks.push({
          id: t.id,
          laneKey,
          phase: t.phase,
          name: t.name,
          status: t.status,
          startMs: null,
          endMs: null,
        })
        metaById.set(t.id, { task: t, groupName: g.name })
        for (const d of t.dependencies) {
          edges.push({ dependentId: t.id, prerequisiteId: d.prerequisiteId, auto: d.auto })
        }
      }
    }
    return { ganttTasks, edges, metaById, laneLabelByKey }
  }, [matrix, certByExpenseId])

  // Lazy initializer — computed once at mount, not re-evaluated on render
  // (buildGanttModel accepts todayMs for the v2 time axis; unused in v1).
  const [todayMs] = React.useState(() => Date.now())
  const model = React.useMemo(
    () => buildGanttModel(ganttTasks, edges, todayMs),
    [ganttTasks, edges, todayMs],
  )

  // Global row index (top-to-bottom across all lanes) + x/y anchors per task —
  // feeds both the rects and the arrow endpoints.
  const layout = React.useMemo(() => {
    const posById = new Map<string, { col: number; row: number }>()
    const laneBands: { key: string; label: string; startRow: number; rowCount: number }[] = []
    let row = 0
    for (const lane of model.lanes) {
      const startRow = row
      for (const r of lane.rows) {
        posById.set(r.task.id, { col: r.col, row })
        row += 1
      }
      laneBands.push({ key: lane.key, label: laneLabelByKey.get(lane.key) ?? 'Έργο', startRow, rowCount: lane.rows.length })
    }
    return { posById, laneBands, totalRows: row }
  }, [model.lanes, laneLabelByKey])

  const svgWidth = Math.max(model.columns.length, 1) * COL_W
  const svgHeight = HEADER_H + Math.max(layout.totalRows, 1) * ROW_H

  const selected = selectedId != null ? metaById.get(selectedId) : undefined

  if (loading) {
    return (
      <section className="glass rounded-[22px] p-4">
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="glass rounded-[22px] p-4">
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      </section>
    )
  }

  if (matrix.length === 0 || ganttTasks.length === 0) {
    return (
      <section className="glass rounded-[22px] p-4">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuFolderOpen className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">
            Δεν υπάρχουν παραδοτέα — πάτησε «Ανανέωση παραδοτέων» στο tab «Φάκελος &amp; Πιστοποίηση».
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Gantt — συνδεδεμένες εργασίες ({ganttTasks.length})
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <div className="flex" style={{ minWidth: LABEL_W + svgWidth }}>
          {/* Sticky-ish label column — plain HTML, mirrors the SVG's row heights. */}
          <div className="shrink-0 border-r border-border" style={{ width: LABEL_W }}>
            <div style={{ height: HEADER_H }} className="border-b border-border" />
            {layout.laneBands.map(band => (
              <div
                key={band.key}
                className="flex items-center border-b border-border px-2.5 text-[12px] font-semibold"
                style={{ height: band.rowCount * ROW_H }}
                title={band.label}
              >
                <span className="truncate">{band.label}</span>
              </div>
            ))}
          </div>

          <svg width={svgWidth} height={svgHeight} role="img" aria-label="Gantt διάγραμμα εργασιών">
            <defs>
              <marker id="pm-gantt-arrow-gray" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill="var(--dotted)" />
              </marker>
              <marker id="pm-gantt-arrow-coral" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill="var(--coral)" />
              </marker>
            </defs>

            {/* Column headers */}
            {model.columns.map((p, i) => (
              <text
                key={p}
                x={i * COL_W + COL_W / 2}
                y={HEADER_H / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="var(--muted-foreground)"
              >
                {deliverablePhaseLabel(p)}
              </text>
            ))}
            <line x1={0} y1={HEADER_H} x2={svgWidth} y2={HEADER_H} stroke="var(--dotted)" strokeWidth={1} />

            {/* Column separators */}
            {model.columns.map((_, i) => (
              i > 0 && (
                <line key={i} x1={i * COL_W} y1={0} x2={i * COL_W} y2={svgHeight} stroke="var(--dotted)" strokeWidth={1} strokeDasharray="2 3" />
              )
            ))}

            {/* Lane separators */}
            {layout.laneBands.map(band => (
              <line
                key={band.key}
                x1={0}
                y1={HEADER_H + (band.startRow + band.rowCount) * ROW_H}
                x2={svgWidth}
                y2={HEADER_H + (band.startRow + band.rowCount) * ROW_H}
                stroke="var(--dotted)"
                strokeWidth={1}
              />
            ))}

            {/* Arrows — drawn before rects so rects sit on top */}
            {model.arrows.map((a, i) => {
              const from = layout.posById.get(a.from)
              const to = layout.posById.get(a.to)
              if (!from || !to) return null
              const x1 = from.col * COL_W + COL_W - PAD
              const y1 = HEADER_H + from.row * ROW_H + ROW_H / 2
              const x2 = to.col * COL_W + PAD
              const y2 = HEADER_H + to.row * ROW_H + ROW_H / 2
              const dx = Math.max(24, Math.abs(x2 - x1) / 2)
              const critical = model.critical.has(a.from) && model.critical.has(a.to)
              const stroke = critical ? 'var(--coral)' : 'var(--dotted)'
              const marker = critical ? 'url(#pm-gantt-arrow-coral)' : 'url(#pm-gantt-arrow-gray)'
              return (
                <path
                  key={i}
                  d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={critical ? 1.75 : 1.25}
                  strokeDasharray={a.auto ? undefined : '4 3'}
                  markerEnd={marker}
                />
              )
            })}

            {/* Task rects */}
            {model.lanes.flatMap(lane => lane.rows.map(({ task, col }) => {
              const pos = layout.posById.get(task.id)
              if (!pos) return null
              const meta = metaById.get(task.id)
              const style = STATUS_STYLE[task.status]
              const isCritical = model.critical.has(task.id)
              const x = col * COL_W + PAD
              const y = HEADER_H + pos.row * ROW_H + PAD
              const w = COL_W - PAD * 2
              const h = ROW_H - PAD * 2
              const blocked = meta?.task.blocked ?? false
              const titleParts = [
                task.name,
                `Κατάσταση: ${deliverableStatusLabel(task.status)}`,
                blocked ? `Μπλοκαρισμένο — περιμένει: ${meta?.task.blockingNames.join(', ')}` : null,
              ].filter(Boolean)
              return (
                <g
                  key={task.id}
                  onClick={() => setSelectedId(task.id)}
                  className="cursor-pointer"
                  opacity={blocked ? 0.6 : 1}
                >
                  <title>{titleParts.join(' — ')}</title>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={9}
                    fill={style.fill}
                    stroke={isCritical ? 'var(--coral)' : style.stroke}
                    strokeWidth={isCritical ? 2.5 : 1.25}
                    strokeDasharray={style.dashed ? '4 3' : undefined}
                  />
                  <text x={x + 10} y={y + h / 2 + 4} fontSize={11.5} fontWeight={600} fill="var(--foreground)">
                    <tspan>{blocked ? '⛔ ' : ''}{truncateLabel(task.name, w)}</tspan>
                  </text>
                </g>
              )
            }))}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <LegendSwatch fill="var(--muted)" stroke="var(--dotted)" label="Εκκρεμεί" />
        <LegendSwatch fill="var(--info-soft)" stroke="var(--info)" label="Ανέβηκε" />
        <LegendSwatch fill="var(--success-soft)" stroke="var(--success)" label="Εγκρίθηκε" />
        <LegendSwatch fill="var(--coral-soft)" stroke="var(--coral)" label="Απορρίφθηκε" />
        <LegendSwatch fill="var(--muted)" stroke="var(--dotted)" dashed label="Απαλλαγή" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-full" style={{ border: '2.5px solid var(--coral)' }} aria-hidden />
          Κρίσιμη διαδρομή
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={10} aria-hidden><line x1={0} y1={5} x2={20} y2={5} stroke="var(--dotted)" strokeWidth={1.25} strokeDasharray="4 3" /></svg>
          Χειροκίνητη εξάρτηση
        </span>
        <span>⛔ Μπλοκαρισμένη εργασία</span>
      </div>

      {selected && (
        <TaskDetailPanel
          task={selected.task}
          groupName={selected.groupName}
          applicationId={applicationId}
          programId={programId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  )
}

function truncateLabel(name: string, colWidth: number): string {
  const maxChars = Math.max(6, Math.floor((colWidth - 24) / 6.2))
  return name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name
}

function LegendSwatch({ fill, stroke, label, dashed }: { fill: string; stroke: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width={16} height={12} aria-hidden>
        <rect x={0.75} y={0.75} width={14.5} height={10.5} rx={3} fill={fill} stroke={stroke} strokeWidth={1.25} strokeDasharray={dashed ? '3 2' : undefined} />
      </svg>
      {label}
    </span>
  )
}

/**
 * Lean side panel για την επιλεγμένη εργασία — μόνο ανάγνωση (το tab «Φάκελος
 * &amp; Πιστοποίηση» παραμένει η μοναδική επιφάνεια διαχείρισης status/αρχείων/
 * εξαρτήσεων, βλ. deliverables-matrix-tab.tsx). Λήψη αρχείου εδώ mirror του
 * ίδιου href idiom με εκείνο το tab.
 */
function TaskDetailPanel({
  task, groupName, applicationId, programId, onClose,
}: {
  task: MatrixTask
  groupName: string
  applicationId: string
  programId: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col gap-3 overflow-y-auto border-l border-border bg-card p-4 shadow-2xl sm:top-20 sm:bottom-4 sm:right-4 sm:rounded-2xl sm:border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-muted-foreground">{groupName}</div>
          <div className="text-[14px] font-bold">{task.name}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Κλείσιμο"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LuX className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('badge-pill', task.status === 'REJECTED' ? undefined : task.status === 'ACCEPTED' || task.status === 'WAIVED' ? 'ok' : task.status === 'UPLOADED' ? 'info' : 'muted')}
          style={task.status === 'REJECTED' ? { color: 'var(--coral)', background: 'var(--coral-soft)' } : undefined}
        >
          {deliverableStatusLabel(task.status)}
        </span>
        {task.mandatory && <span className="badge-pill warn">Υποχρεωτικό</span>}
        {task.blocked && (
          <span className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>Μπλοκαρισμένο</span>
        )}
      </div>

      {task.blocked && task.blockingNames.length > 0 && (
        <p className="text-[12px] text-muted-foreground">Περιμένει: {task.blockingNames.join(', ')}</p>
      )}

      <div>
        <div className="text-[11px] font-semibold text-muted-foreground">Αρχεία ({task.files.length})</div>
        {task.files.length === 0 ? (
          <p className="mt-1 text-[12px] text-muted-foreground">—</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {task.files.map(f => (
              <li key={f.id} className="flex min-w-0 items-center gap-1.5 text-[12px]">
                <span className="min-w-0 truncate" title={f.name}>{f.name}</span>
                <a
                  href={`/programs/${programId}/applications/${applicationId}/deliverables/${f.id}`}
                  className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Λήψη — ${f.name}`}
                  title="Λήψη"
                >
                  <LuDownload className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {task.notes && (
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground">Σημείωση</div>
          <p className="mt-1 text-[12px] text-muted-foreground">{task.notes}</p>
        </div>
      )}

      <p className="mt-auto border-t border-dashed border-border pt-2 text-[11px] text-muted-foreground">
        Διαχείριση στο tab «Φάκελος &amp; Πιστοποίηση».
      </p>
    </div>
  )
}
