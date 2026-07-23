// Pure Gantt-model engine for C2g — no prisma/react/clock imports (mirror of
// deliverable-phases.ts). The UI (gantt-view.tsx) maps the DeliverableMatrixItem
// DTO into GanttTask/GanttEdge and calls buildGanttModel to lay out the SVG.
// «στο gantt τα task πρέπει να είναι συνδεδεμένα» — this module makes the DAG
// (built by buildAutoDependencyPairs in deliverable-phases.ts, plus manual
// deps) visible: topological order, the critical path (longest dependency
// chain), and a lane/column layout for the SVG renderer.

import { DELIVERABLE_PHASE_ORDER, type DeliverablePhaseStr, type DeliverableStatusStr } from './deliverable-phases'

export type GanttTask = {
  id: string
  laneKey: string
  phase: DeliverablePhaseStr
  name: string
  status: DeliverableStatusStr
  startMs: number | null
  endMs: number | null
}

export type GanttEdge = { dependentId: string; prerequisiteId: string; auto: boolean }

/**
 * Kahn's algorithm, stable: among the currently-ready nodes, always emits the
 * one that appears earliest in `taskIds`. Edges are {dependentId, prerequisiteId}
 * — the prerequisite must precede the dependent in the returned order.
 * Cyclic graphs (a dependency loop) can't be fully ordered: `cyclic: true` and
 * `order` holds only the acyclic prefix (nodes that could be resolved before
 * the cycle blocked further progress).
 */
export function topoSort(taskIds: string[], edges: GanttEdge[]): { order: string[]; cyclic: boolean } {
  const indexOf = new Map(taskIds.map((id, i) => [id, i]))
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>() // prerequisiteId -> [dependentId, ...]
  for (const id of taskIds) inDegree.set(id, 0)

  for (const e of edges) {
    if (!indexOf.has(e.dependentId) || !indexOf.has(e.prerequisiteId)) continue
    inDegree.set(e.dependentId, (inDegree.get(e.dependentId) ?? 0) + 1)
    const list = dependents.get(e.prerequisiteId) ?? []
    list.push(e.dependentId)
    dependents.set(e.prerequisiteId, list)
  }

  const ready = new Set<string>()
  for (const id of taskIds) {
    if ((inDegree.get(id) ?? 0) === 0) ready.add(id)
  }

  const order: string[] = []
  while (ready.size > 0) {
    let next: string | null = null
    let bestIdx = Infinity
    for (const id of ready) {
      const idx = indexOf.get(id)!
      if (idx < bestIdx) {
        bestIdx = idx
        next = id
      }
    }
    ready.delete(next!)
    order.push(next!)
    for (const dep of dependents.get(next!) ?? []) {
      const remaining = (inDegree.get(dep) ?? 0) - 1
      inDegree.set(dep, remaining)
      if (remaining === 0) ready.add(dep)
    }
  }

  return { order, cyclic: order.length < taskIds.length }
}

/**
 * The longest dependency chain, by node count. Empty edges -> `[]` (nothing
 * is "critical" without links between tasks). Ties (equal-length chains) are
 * broken by whichever chain's tasks appear first in `taskIds` — both when
 * choosing among candidate predecessors and when choosing the winning
 * end-of-chain node, since both scans walk the stable topo order and only
 * replace the current best on a STRICT improvement.
 */
export function criticalPath(taskIds: string[], edges: GanttEdge[]): string[] {
  if (edges.length === 0) return []

  const { order } = topoSort(taskIds, edges)
  const indexOf = new Map(taskIds.map((id, i) => [id, i]))

  const prereqsByDependent = new Map<string, string[]>()
  for (const e of edges) {
    if (!indexOf.has(e.dependentId) || !indexOf.has(e.prerequisiteId)) continue
    const list = prereqsByDependent.get(e.dependentId) ?? []
    list.push(e.prerequisiteId)
    prereqsByDependent.set(e.dependentId, list)
  }

  const length = new Map<string, number>()
  const prev = new Map<string, string | null>()

  for (const id of order) {
    const prereqs = prereqsByDependent.get(id) ?? []
    if (prereqs.length === 0) {
      length.set(id, 1)
      prev.set(id, null)
      continue
    }
    let bestPrereq: string | null = null
    let bestLen = 0
    for (const p of prereqs) {
      const pLen = length.get(p) ?? 1
      if (pLen > bestLen) {
        bestLen = pLen
        bestPrereq = p
      }
    }
    length.set(id, bestLen + 1)
    prev.set(id, bestPrereq)
  }

  let bestNode: string | null = null
  let bestLen = 0
  for (const id of order) {
    const l = length.get(id) ?? 1
    if (l > bestLen) {
      bestLen = l
      bestNode = id
    }
  }
  if (bestNode === null || bestLen <= 1) return []

  const path: string[] = []
  let cur: string | null = bestNode
  while (cur !== null) {
    path.unshift(cur)
    cur = prev.get(cur) ?? null
  }
  return path
}

export type GanttLane = { key: string; rows: { task: GanttTask; col: number }[] }
export type GanttModel = {
  lanes: GanttLane[]
  columns: DeliverablePhaseStr[]
  arrows: { from: string; to: string; auto: boolean }[]
  critical: Set<string>
}

/**
 * Lays out tasks for the SVG Gantt: columns = phases actually present (in
 * DELIVERABLE_PHASE_ORDER order), each task's `col` = its phase's column
 * index, lanes grouped by `laneKey` in stable input order. `arrows` mirrors
 * `edges` (from=prerequisiteId, to=dependentId — the direction the SVG draws
 * the connector). `critical` is the Set form of criticalPath, for outline
 * styling. `todayMs` is accepted but unused in v1 — phases are the x-axis,
 * not time (no time axis/today-line until v2).
 */
export function buildGanttModel(tasks: GanttTask[], edges: GanttEdge[], todayMs: number): GanttModel {
  void todayMs

  const columns = DELIVERABLE_PHASE_ORDER.filter((p) => tasks.some((t) => t.phase === p))
  const colIndex = new Map(columns.map((p, i) => [p, i]))

  const laneOrder: string[] = []
  const laneRows = new Map<string, { task: GanttTask; col: number }[]>()
  for (const t of tasks) {
    if (!laneRows.has(t.laneKey)) {
      laneRows.set(t.laneKey, [])
      laneOrder.push(t.laneKey)
    }
    laneRows.get(t.laneKey)!.push({ task: t, col: colIndex.get(t.phase) ?? 0 })
  }
  const lanes: GanttLane[] = laneOrder.map((key) => ({ key, rows: laneRows.get(key)! }))

  const arrows = edges.map((e) => ({ from: e.prerequisiteId, to: e.dependentId, auto: e.auto }))
  const critical = new Set(criticalPath(tasks.map((t) => t.id), edges))

  return { lanes, columns, arrows, critical }
}
