# C2b — Kanban Board · Deadlines · Global Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A status Kanban (drag to progress) + deadline radar over the unified `ApplicationObligation` model — globally across a user's έργα (assignee swimlanes) and per-έργο. No schema change, no new permissions.

**Architecture:** PURE grouping/bucketing engine (`board.ts`); two scoped read actions returning a context-rich `BoardObligation`; drag reuses the existing scoped `updateObligation(id,{status})`; `/pm` becomes a tabbed client workspace (Έργα / Πίνακας / Προθεσμίες); per-έργο obligations tab gains a Λίστα/Πίνακας toggle.

**Tech Stack:** Next.js 16.2 (RSC + server actions), Prisma 7.8, `@dnd-kit` (installed), base-ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2b-board-design.md`.

**Ground rules:** tests in `tests/`; pure `board.ts` NO prisma/react/**clock** (pass `todayMidnightMs`); every read scoped; don't stage `.planning/HANDOFF.json`/`vitest.config.ts`; known ambient tsc error in `src/app/api/import/status/[id]/route.ts` (RouteContext) may appear — ignore, add none.

**Verified facts:**
- `updateObligation(id, { status?, dueDate?, assigneeId?, notes? })` (`src/lib/pm/actions.ts:444`) already loads obligation→application→`requireVisibleApplication` (scoped). REUSE for drag.
- `visibleApplicationWhere(session)` (`src/lib/pm/scoping.ts`) → `{}` for pm.manage else `{ OR:[{managerId},{processorId}] }`. `requirePmAccess()` (pm.work→pm.manage) exists in actions.ts.
- `listVisibleApplications()` (`actions.ts:136`) → the scoped applications list (used by `/pm`).
- `ObligationStatusStr` = 'PENDING'|'IN_PROGRESS'|'SUBMITTED'|'APPROVED'|'REJECTED'|'WAIVED'; `obligationStatusLabel`, `stageLabel`, `obligationKindLabel` in `@/lib/pm/types`.
- `ApplicationObligation` has `application` relation → `trdr {NAME}`, `program {title}`, plus `assignee {name}`.
- `/pm/page.tsx` is an RSC rendering the applications table; obligations status list lives in `src/components/pm/obligations-tab.tsx`.
- dnd example: `src/components/media/product-image-collection.tsx` + `src/components/programs/task-templates-tab.tsx` (C2e).

---

## Task 1: PURE `src/lib/pm/board.ts`

**Files:** Create `src/lib/pm/board.ts`; Test `tests/pm-board.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-board.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { KANBAN_COLUMNS, isBoardStatus, groupByStatus, groupBySwimlane, bucketByDeadline, type BoardObligationLike } from '@/lib/pm/board'

const o = (p: Partial<BoardObligationLike>): BoardObligationLike => ({ id: 'x', status: 'PENDING', dueDate: null, assigneeId: null, assigneeName: null, ...p })

describe('KANBAN_COLUMNS / isBoardStatus', () => {
  it('four columns', () => { expect(KANBAN_COLUMNS).toEqual(['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED']) })
  it('WAIVED/REJECTED not board', () => { expect(isBoardStatus('WAIVED')).toBe(false); expect(isBoardStatus('PENDING')).toBe(true) })
})
describe('groupByStatus', () => {
  it('buckets into columns + other', () => {
    const g = groupByStatus([o({ id: 'a', status: 'PENDING' }), o({ id: 'b', status: 'APPROVED' }), o({ id: 'c', status: 'REJECTED' })])
    expect(g.PENDING.map(x => x.id)).toEqual(['a'])
    expect(g.APPROVED.map(x => x.id)).toEqual(['b'])
    expect(g.other.map(x => x.id)).toEqual(['c'])
  })
})
describe('groupBySwimlane', () => {
  it('named lanes alphabetical, Χωρίς ανάθεση last', () => {
    const lanes = groupBySwimlane([o({ id: '1', assigneeId: 'u2', assigneeName: 'Βασιλική' }), o({ id: '2', assigneeId: null }), o({ id: '3', assigneeId: 'u1', assigneeName: 'Ανδρέας' })])
    expect(lanes.map(l => l.label)).toEqual(['Ανδρέας', 'Βασιλική', 'Χωρίς ανάθεση'])
    expect(lanes[2].key).toBe('__none__')
  })
})
describe('bucketByDeadline', () => {
  const TODAY = Date.UTC(2026, 2, 10) // 2026-03-10 midnight
  it('buckets overdue/today/thisWeek/later/noDate; excludes APPROVED/WAIVED', () => {
    const r = bucketByDeadline([
      o({ id: 'over', status: 'PENDING', dueDate: '2026-03-01' }),
      o({ id: 'today', status: 'PENDING', dueDate: '2026-03-10' }),
      o({ id: 'week', status: 'IN_PROGRESS', dueDate: '2026-03-14' }),
      o({ id: 'later', status: 'PENDING', dueDate: '2026-04-01' }),
      o({ id: 'none', status: 'PENDING', dueDate: null }),
      o({ id: 'done', status: 'APPROVED', dueDate: '2026-03-01' }),
    ], TODAY)
    expect(r.overdue.map(x => x.id)).toEqual(['over'])
    expect(r.today.map(x => x.id)).toEqual(['today'])
    expect(r.thisWeek.map(x => x.id)).toEqual(['week'])
    expect(r.later.map(x => x.id)).toEqual(['later'])
    expect(r.noDate.map(x => x.id)).toEqual(['none'])
    // 'done' (APPROVED) excluded from every bucket
    expect([...r.overdue, ...r.today, ...r.thisWeek, ...r.later, ...r.noDate].some(x => x.id === 'done')).toBe(false)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/pm/board.ts`:
```ts
import type { ObligationStatusStr, StageStr, ObligationKindStr } from '@/lib/pm/types'

export const KANBAN_COLUMNS: ObligationStatusStr[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED']
export function isBoardStatus(s: ObligationStatusStr): boolean { return (KANBAN_COLUMNS as string[]).includes(s) }

// Minimal shape the pure fns need (BoardObligation is a superset).
export type BoardObligationLike = {
  id: string
  status: ObligationStatusStr
  dueDate: string | null
  assigneeId: string | null
  assigneeName: string | null
}

export type StatusGroups<T> = Record<'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'other', T[]>
export function groupByStatus<T extends BoardObligationLike>(items: T[]): StatusGroups<T> {
  const g: StatusGroups<T> = { PENDING: [], IN_PROGRESS: [], SUBMITTED: [], APPROVED: [], other: [] }
  for (const it of items) (isBoardStatus(it.status) ? g[it.status as keyof StatusGroups<T>] : g.other).push(it)
  return g
}

export type Swimlane<T> = { key: string; label: string; items: T[] }
export function groupBySwimlane<T extends BoardObligationLike>(items: T[]): Swimlane<T>[] {
  const byKey = new Map<string, Swimlane<T>>()
  for (const it of items) {
    const key = it.assigneeId ?? '__none__'
    const label = it.assigneeId ? (it.assigneeName ?? '—') : 'Χωρίς ανάθεση'
    if (!byKey.has(key)) byKey.set(key, { key, label, items: [] })
    byKey.get(key)!.items.push(it)
  }
  const lanes = [...byKey.values()]
  const none = lanes.filter(l => l.key === '__none__')
  const named = lanes.filter(l => l.key !== '__none__').sort((a, b) => a.label.localeCompare(b.label, 'el'))
  return [...named, ...none]
}

export type DeadlineBuckets<T> = { overdue: T[]; today: T[]; thisWeek: T[]; later: T[]; noDate: T[] }
export function bucketByDeadline<T extends BoardObligationLike>(items: T[], todayMidnightMs: number): DeadlineBuckets<T> {
  const DAY = 86_400_000
  const weekEnd = todayMidnightMs + 7 * DAY
  const r: DeadlineBuckets<T> = { overdue: [], today: [], thisWeek: [], later: [], noDate: [] }
  for (const it of items) {
    if (it.status === 'APPROVED' || it.status === 'WAIVED') continue // done work is not a pending deadline
    if (!it.dueDate) { r.noDate.push(it); continue }
    const d = Date.parse(it.dueDate.slice(0, 10) + 'T00:00:00Z')
    if (Number.isNaN(d)) { r.noDate.push(it); continue }
    if (d < todayMidnightMs) r.overdue.push(it)
    else if (d === todayMidnightMs) r.today.push(it)
    else if (d < weekEnd) r.thisWeek.push(it)
    else r.later.push(it)
  }
  const byDate = (a: T, b: T) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  r.overdue.sort(byDate); r.today.sort(byDate); r.thisWeek.sort(byDate); r.later.sort(byDate)
  return r
}
```
Run → PASS. Commit → `feat(pm): C2b pure — board grouping + deadline bucketing`.

---

## Task 2: Actions — `listVisibleObligations` + `listApplicationBoardObligations`

**Files:** Modify `src/lib/pm/actions.ts`; Test `tests/pm-c2b-actions-guard.test.ts`.

- [ ] **Step 1: Guard test** `tests/pm-c2b-actions-guard.test.ts` (mirror existing guard tests; `requirePermission` rejects → both reject):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
import { requirePermission } from '@/lib/rbac-server'
import { listVisibleObligations, listApplicationBoardObligations } from '@/lib/pm/actions'
beforeEach(() => { vi.mocked(requirePermission).mockReset(); vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden')) })
describe('C2b board actions enforce pm access', () => {
  it('listVisibleObligations', async () => { await expect(listVisibleObligations()).rejects.toThrow() })
  it('listApplicationBoardObligations', async () => { await expect(listApplicationBoardObligations('a1')).rejects.toThrow() })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** in `src/lib/pm/actions.ts`. Add the `BoardObligation` type + a shared mapper + the two actions. (`requirePmAccess`, `visibleApplicationWhere`, `requireVisibleApplication` already exist in this file; `StageStr`/`ObligationKindStr`/`ObligationStatusStr` already imported.)
```ts
export type BoardObligation = {
  id: string; name: string; stage: StageStr; kind: ObligationKindStr; status: ObligationStatusStr
  dueDate: string | null; mandatory: boolean; templateId: string | null
  assigneeId: string | null; assigneeName: string | null
  applicationId: string; customerName: string; programTitle: string
}

const BOARD_INCLUDE = {
  application: { select: { id: true, trdr: { select: { NAME: true } }, program: { select: { title: true } } } },
  assignee: { select: { name: true } },
} as const

function toBoardObligation(r: any): BoardObligation {
  return {
    id: r.id, name: r.name, stage: r.stage as StageStr, kind: r.kind as ObligationKindStr, status: r.status as ObligationStatusStr,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null, mandatory: r.mandatory, templateId: r.templateId ?? null,
    assigneeId: r.assigneeId ?? null, assigneeName: r.assignee?.name ?? null,
    applicationId: r.applicationId, customerName: r.application?.trdr?.NAME ?? '—', programTitle: r.application?.program?.title ?? '—',
  }
}

export async function listVisibleObligations(): Promise<BoardObligation[]> {
  const session = await requirePmAccess()
  const rows = await prisma.applicationObligation.findMany({
    where: { application: visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) },
    include: BOARD_INCLUDE,
    orderBy: [{ dueDate: 'asc' }, { order: 'asc' }],
  })
  return rows.map(toBoardObligation)
}

export async function listApplicationBoardObligations(applicationId: string): Promise<BoardObligation[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.applicationObligation.findMany({
    where: { applicationId },
    include: BOARD_INCLUDE,
    orderBy: [{ stage: 'asc' }, { order: 'asc' }],
  })
  return rows.map(toBoardObligation)
}
```
> Verify the exact arg shape `visibleApplicationWhere` expects by reading it + how `requireVisibleApplication` calls it (it passes `{ id: session.user.id, permissions: session.user.permissions ?? [] }`). Match exactly.

- [ ] **Step 3:** `npm test -- pm-c2b-actions-guard pm-` → green; `npx tsc --noEmit` → only known error. Commit → `feat(pm): C2b actions — scoped board obligation reads`.

---

## Task 3: UI — global `/pm` workspace (Έργα / Πίνακας / Προθεσμίες)

**Files:** Modify `src/app/(app)/pm/page.tsx`; Create `src/components/pm/pm-workspace.tsx`, `src/components/pm/applications-table.tsx`, `src/components/pm/obligations-board.tsx`, `src/components/pm/deadlines-view.tsx`.

- [ ] **Step 1: Extract the applications table.** Move the existing `<table>` markup from `pm/page.tsx` into `src/components/pm/applications-table.tsx` (`export function ApplicationsTable({ rows }: { rows: VisibleApplicationItem[] })`) — behaviour unchanged (it can stay a plain presentational component; `VisibleApplicationItem` is the `listVisibleApplications` return type — export it from actions if not already).

- [ ] **Step 2: `obligations-board.tsx`** (`'use client'`): `export function ObligationsBoard({ obligations, swimlaneBy = 'none', onStatusChange }: { obligations: BoardObligation[]; swimlaneBy?: 'assignee' | 'none'; onStatusChange?: () => void })`.
  - Use `groupBySwimlane` (assignee) or a single lane (none). Within each lane, `groupByStatus` → 4 columns (`KANBAN_COLUMNS`, labels via `obligationStatusLabel`) + a collapsed «Άλλες» (other) shown read-only.
  - dnd-kit: each card draggable; dropping onto another status column calls `updateObligation(card.id, { status: targetColumn })` then `onStatusChange?.()` (or local optimistic state + revert-on-throw + toast). Cards in «Άλλες»/APPROVED terminal may still be draggable back (allowed) — but keep it simple: all 4 columns are drop targets; «Άλλες» is not a drop target. Mirror the sensors/DndContext/closestCorners setup from `task-templates-tab.tsx`.
  - **Card**: `name`; source badge («Βήμα» if templateId else «Πρόγραμμα»); `stageLabel(stage)` badge; due pill (coral when overdue & status∉{APPROVED,WAIVED}); on the global board, a subtitle «{customerName} · {programTitle}» linking to `/programs/{app.programId?}/applications/{applicationId}` — NOTE the board obligation carries `applicationId` but not programId; either add `programId` to `BoardObligation` (extend the mapper + select `application.programId`) OR link to a route that only needs applicationId. Simplenst: extend `BoardObligation` with `programId` (add `program:{select:{id,title}}` already selects id via application.program — add `programId: r.application.program.id` in the mapper) so the link is `/programs/{programId}/applications/{applicationId}`.
  - `overflow-x-auto` wrappers; never body horizontal scroll. Greek, base-ui.

- [ ] **Step 3: `deadlines-view.tsx`** (`'use client'`): `export function DeadlinesView({ obligations }: { obligations: BoardObligation[] })`. Compute `const today = new Date(); today.setHours(0,0,0,0); const buckets = bucketByDeadline(obligations, Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))`. Render sections «Εκπρόθεσμα» (coral header + count), «Σήμερα», «Αυτή την εβδομάδα», «Αργότερα», «Χωρίς προθεσμία» (collapsible). Row: due date, name, «{customer} · {program}», stage badge, assignee, status pill; click → the έργο link. Empty sections hidden.

- [ ] **Step 4: `pm-workspace.tsx`** (`'use client'`): `export function PmWorkspace({ applications, obligations }: { applications: VisibleApplicationItem[]; obligations: BoardObligation[] })`. A pill-row view switcher (mirror program-editor `TabBar`) with three views: «Έργα» → `<ApplicationsTable rows={applications}/>`; «Πίνακας» → `<ObligationsBoard obligations={obligations} swimlaneBy="assignee" onStatusChange={() => router.refresh()}/>`; «Προθεσμίες» → `<DeadlinesView obligations={obligations}/>`. `router.refresh()` after a drag re-fetches server data.

- [ ] **Step 5: Refactor `pm/page.tsx`** (RSC): `await requirePermission('pm.work')`, `const [applications, obligations] = await Promise.all([listVisibleApplications(), listVisibleObligations()])`, keep the header breadcrumb, render `<PmWorkspace applications={applications} obligations={obligations} />`.

- [ ] **Step 6:** `npx tsc --noEmit` (only known error) + `npm run build` + `npm test` → green. Commit → `feat(pm): C2b UI — /pm workspace (Έργα · Πίνακας Kanban · Προθεσμίες)`.

---

## Task 4: UI — per-έργο Λίστα/Πίνακας toggle

**Files:** Modify `src/components/pm/obligations-tab.tsx`.

- [ ] **Step 1:** Add a small «Λίστα / Πίνακας» pill toggle at the top of the obligations tab. «Λίστα» = the existing editable list (unchanged). «Πίνακας» = `<ObligationsBoard obligations swimlaneBy="assignee" onStatusChange={reload}>` fed by `listApplicationBoardObligations(applicationId)` (fetch on switch to board / on mount). Drag updates status via the same `updateObligation` the list already calls; after change, reload the board data (and the list state, so switching back is consistent) + `router.refresh()`.
- [ ] **Step 2:** `npx tsc --noEmit` (only known error) + `npm run build` + `npm test` → green. Commit → `feat(pm): C2b UI — per-έργο Λίστα/Πίνακας toggle`.

---

## Task 5: Final verification + holistic review

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build` → green.
- [ ] **Step 2: Holistic review** over `git diff master...HEAD`: security (`listVisibleObligations` scoped via `visibleApplicationWhere`; `listApplicationBoardObligations` via `requireVisibleApplication`; drag reuses scoped `updateObligation` — no obligation of a non-visible app is readable or mutable), pure purity + clock-free `board.ts`, deadline-bucket boundary correctness (overdue/today/week edges, APPROVED/WAIVED excluded), Kanban drag can only set a valid status column (not WAIVED/REJECTED by accident), no runtime crash (empty lanes, null assignee, missing programId), spec coverage, no scope creep.
- [ ] **Step 3:** Fix CRITICAL/IMPORTANT; then superpowers:finishing-a-development-branch. **No schema change, no new permissions → no `db:sync-permissions`.**

---

## Self-Review Notes
- **Spec coverage:** §3α pure → T1; §3β actions → T2; §4α/β/γ global UI → T3; §4δ per-έργο → T4. All covered.
- **Type consistency:** `BoardObligation`/`BoardObligationLike` (superset) shared T1↔T2↔T3/T4; `KANBAN_COLUMNS`/`groupByStatus`/`groupBySwimlane`/`bucketByDeadline` shared. Drag calls existing `updateObligation(id,{status})`.
- **Security:** both reads scoped; drag scoped; no new permissions; no schema change.
- **Clock discipline:** `bucketByDeadline` takes `todayMidnightMs`; the client computes today, the pure fn stays clock-free.
