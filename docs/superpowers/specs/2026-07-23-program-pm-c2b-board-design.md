# C2b — Kanban Board · Deadlines Timeline · Global Views — Design Spec

**Date:** 2026-07-23
**Sub-project:** C2b (part of C2 — ΕΣΠΑ Project Management). Pure visualization/interaction layer over the existing unified `ApplicationObligation` model (C2a.1 + C2e). **No schema change, no new permissions.**
**Status:** Approved design (brainstorming 2026-07-23) → ready for plan.

---

## 0. Locked decisions (brainstorming)
1. **Kanban columns = obligation STATUS**: `PENDING → IN_PROGRESS → SUBMITTED → APPROVED`. Drag between columns changes the obligation's `status`. `WAIVED`/`REJECTED` are not board columns (shown in a separate collapsed «Άλλες» area / filtered).
2. **Scope = global (`/pm`) + per-έργο**: a central board over ALL visible obligations (cross-customer) **and** a board view on each έργο.
3. **Global grouping = swimlanes ανά υπεύθυνο (assignee)** (+ an «Χωρίς ανάθεση» lane).
4. **Timeline = deadlines list** bucketed by due date (Εκπρόθεσμα / Σήμερα / Αυτή την εβδομάδα / Αργότερα / Χωρίς προθεσμία), overdue in coral.

## 1. Goal
Make the bureaucratic mass of obligations manageable at a glance: a status Kanban (drag to progress work), grouped by who owns it, plus a deadline radar so nothing slips — both globally across all a user's έργα and within a single έργο. This directly serves «τίποτα δεν ξεφεύγει» without touching the data model.

## 2. Data (no schema change)
Reuses `ApplicationObligation` (`status ObligationStatus`, `dueDate`, `assigneeId`, `stage`, `kind`, `templateId`, `name`, `applicationId`). Scoping via existing `visibleApplicationWhere(session)` on the joined application. Status mutation via existing scoped `updateObligation(id, { status })`.

New READ DTO (richer than `ObligationItem` — carries application context for the global board):
```ts
export type BoardObligation = {
  id: string
  name: string
  stage: StageStr
  kind: ObligationKindStr
  status: ObligationStatusStr
  dueDate: string | null
  mandatory: boolean
  templateId: string | null
  assigneeId: string | null
  assigneeName: string | null
  applicationId: string
  customerName: string      // trdr.NAME
  programTitle: string      // program.title
}
```

## 3. Logic

### 3α. PURE `src/lib/pm/board.ts`
- `KANBAN_COLUMNS: ObligationStatusStr[]` = `['PENDING','IN_PROGRESS','SUBMITTED','APPROVED']`.
- `isBoardStatus(s)` → whether s is a column (excludes WAIVED/REJECTED).
- `groupByStatus(obligations)` → `Record<ObligationStatusStr, BoardObligation[]>` (only the 4 columns; non-board statuses collected under an `other` key).
- `groupBySwimlane(obligations)` → ordered lanes `{ key: assigneeId|'__none__', label: assigneeName|'Χωρίς ανάθεση', items }[]` (stable order: named assignees alphabetical, «Χωρίς ανάθεση» last).
- `bucketByDeadline(obligations, todayMidnightMs)` → `{ overdue, today, thisWeek, later, noDate }`, each a `BoardObligation[]` sorted by dueDate. **Pure — `todayMidnightMs` passed in (no clock in the pure module).** «thisWeek» = due within the next 7 days (after today). Terminal-status (APPROVED/WAIVED) obligations are excluded from overdue (still shown under their real bucket but not flagged) — actually: exclude APPROVED/WAIVED from the deadline radar entirely (done work is not a pending deadline).

### 3β. Actions (`src/lib/pm/actions.ts`, pm-scoped)
- `listVisibleObligations(): Promise<BoardObligation[]>` — `requirePmAccess()`, then `prisma.applicationObligation.findMany({ where: { application: visibleApplicationWhere(session) }, include: { application: { select: { id, trdr:{select:{NAME}}, program:{select:{title}} } }, assignee: { select: { name } } } })`, mapped to `BoardObligation[]`. This is the single scoped source for the global board + deadlines.
- `listApplicationBoardObligations(applicationId): Promise<BoardObligation[]>` — `requireVisibleApplication(applicationId)`, obligations of that one app in `BoardObligation` shape (for the per-έργο board reuse). (Or reuse `listVisibleObligations` client-filtered — but a scoped per-app query is cleaner + avoids over-fetch.)
- **Drag = reuse existing `updateObligation(id, { status })`** (already scoped: loads obligation→application→`requireVisibleApplication`). No new mutation.

**Security:** both reads scoped via `visibleApplicationWhere`/`requireVisibleApplication`; drag reuses the scoped update. No new IDOR surface, no new permissions.

## 4. UI

### 4α. Global `/pm` → tabbed workspace
Refactor `src/app/(app)/pm/page.tsx` (RSC) to fetch `listVisibleApplications()` + `listVisibleObligations()` server-side and render a client `<PmWorkspace applications obligations>` with a view switcher (pill row, same idiom as program-editor TabBar):
- **«Έργα»** — the existing applications table (extracted into a component, unchanged behaviour).
- **«Πίνακας»** — `<ObligationsBoard obligations swimlaneBy="assignee">`.
- **«Προθεσμίες»** — `<DeadlinesView obligations>`.
No new menu item (the «Έργα» menu still points at `/pm`).

### 4β. `ObligationsBoard` (`src/components/pm/obligations-board.tsx`, client, dnd-kit)
- 4 status columns (`KANBAN_COLUMNS`, Greek labels via `obligationStatusLabel`), optionally an «Άλλες» collapsed column for WAIVED/REJECTED (or a filter toggle to show them).
- Swimlanes: when `swimlaneBy="assignee"`, one horizontal lane per assignee (via `groupBySwimlane`), each lane a mini board of the 4 columns. Per-έργο board can pass `swimlaneBy="none"` (single board) or also assignee.
- **Card**: obligation `name`, a source badge («Βήμα»/«Πρόγραμμα» from templateId), stage badge, due pill (coral if overdue & non-terminal), and — on the global board — customer + program subtitle (click → `/programs/{…}/applications/{applicationId}`).
- **Drag** (dnd-kit, mirror `product-image-collection.tsx` / the C2e task-templates dnd): moving a card to another status column calls `updateObligation(id, { status: targetStatus })`; optimistic move, revert + toast on failure. Dragging within «Άλλες»/terminal is disabled.
- base-ui, Greek, existing classes; horizontal scroll for columns/lanes on narrow screens (`overflow-x-auto`, never body-level horizontal scroll).

### 4γ. `DeadlinesView` (`src/components/pm/deadlines-view.tsx`, client)
- Computes `bucketByDeadline(obligations, startOfToday)` (client passes today; pure fn stays clock-free). Sections: «Εκπρόθεσμα» (coral), «Σήμερα», «Αυτή την εβδομάδα», «Αργότερα», «Χωρίς προθεσμία» (collapsible). Each row: due date, name, customer+program, stage badge, assignee, status; click → έργο. Excludes APPROVED/WAIVED.

### 4δ. Per-έργο board
In the existing `obligations-tab.tsx` (application-hub), add a **view toggle «Λίστα / Πίνακας»**: «Λίστα» = current editable list; «Πίνακας» = `<ObligationsBoard obligations={…} swimlaneBy="assignee" scopeApplicationId={app.id}>` fed by `listApplicationBoardObligations(app.id)`. Drag updates status in place (same action the list already uses), then refresh. (Deadlines per-έργο is out of scope — the list already surfaces due dates; global «Προθεσμίες» covers the radar.)

## 5. File structure
- `src/lib/pm/board.ts` (new, PURE) — columns + grouping + deadline bucketing.
- `src/lib/pm/actions.ts` — `listVisibleObligations`, `listApplicationBoardObligations` (+ `BoardObligation` type). Reuse `updateObligation`.
- `src/app/(app)/pm/page.tsx` — fetch obligations too; render `<PmWorkspace>`.
- `src/components/pm/pm-workspace.tsx` (new, client) — view switcher + the three views; `applications-table.tsx` (extracted existing table).
- `src/components/pm/obligations-board.tsx` (new) · `deadlines-view.tsx` (new).
- `src/components/pm/obligations-tab.tsx` — add Λίστα/Πίνακας toggle.
- Tests: `tests/pm-board.test.ts` (pure grouping + deadline buckets), `tests/pm-c2b-actions-guard.test.ts` (`listVisibleObligations`/`listApplicationBoardObligations` require pm access + scope).

## 6. Testing (TDD)
- **Pure:** `groupByStatus` (4 columns + other), `groupBySwimlane` (named + «Χωρίς ανάθεση» ordering), `bucketByDeadline` (overdue/today/thisWeek/later/noDate boundaries with a fixed `todayMidnightMs`; APPROVED/WAIVED excluded), `isBoardStatus`.
- **Server:** action guards + scoping (both list actions require pm access; `listApplicationBoardObligations` routes through `requireVisibleApplication`).
- Green unit suite; tsc clean; build OK. (e2e = known `:3000` footgun, not a merge gate; dnd is manual-verified.)

## 7. Out of scope
- Gantt (decided against for now). Reordering within a column (order is informational). Real-time multi-user sync. Reminders/notifications (C2c). Customer portal (C2d).

## 8. Definition of Done
`/pm` tabbed (Έργα / Πίνακας / Προθεσμίες); global status Kanban with assignee swimlanes + drag-to-change-status (scoped); deadline radar bucketed with coral overdue; per-έργο Λίστα/Πίνακας toggle. Pure/server tests green; tsc clean; build OK; Steel & Frost + Greek. No schema change, no `db:sync-permissions`.
