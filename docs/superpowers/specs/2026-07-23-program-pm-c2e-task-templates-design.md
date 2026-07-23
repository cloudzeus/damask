# C2e — Task Templates & Auto-Assignment (Program PM) — Design Spec

**Date:** 2026-07-23
**Sub-project:** C2e (part of C2 — ΕΣΠΑ Project Management). Builds on C2a.1 foundation (`ProgramApplication`, `ApplicationObligation`) and C1 (`Program`).
**Status:** Approved for planning.

---

## 1. Goal

Let SUPER_ADMIN / ADMIN author, **per program, per stage**, a reusable checklist of procedural **tasks** (the program's "γραφειοκρατικός χάρτης"). When a customer is enrolled in that program (a `ProgramApplication` is created), those tasks **auto-materialize** into the application's checklist and **auto-assign** to the manager and/or the processor. Managers/employees then work a single unified per-stage list where admin tasks and program-derived obligations live side by side — nothing slips, because everything the office must do is one accountable, dated, checkable item.

This is the heavy-bureaucracy safety net: one missed step risks απένταξη (deregistration → lost funds), so the process must be explicit, assigned, and dated end-to-end.

## 2. Key decisions (locked in brainstorming)

1. **Unified model, not a separate `ApplicationTask`.** Tasks and program-derived obligations share the existing `ApplicationObligation` model. A task is an obligation with `kind = TASK` and a non-null `templateId`. One list, one Kanban, one status flow.
2. **Per-task assignment.** Each `ProgramTaskTemplate` declares `assignTo`: `MANAGER`, `PROCESSOR`, or `BOTH`. `BOTH` materializes as **two** obligation rows (one owned by each user), so each person checks off their own copy.
3. **C2f (payment requests) is a separate later phase** and depends on C2a.2 (certification/compliance). Out of scope here; referenced in §9.

## 3. Data model

### 3.1 New enum

```prisma
enum TaskAssignTo {
  MANAGER
  PROCESSOR
  BOTH
}
```

### 3.2 New model `ProgramTaskTemplate`

```prisma
model ProgramTaskTemplate {
  id           String           @id @default(cuid())
  programId    String
  program      Program          @relation(fields: [programId], references: [id], onDelete: Cascade)
  stage        ApplicationStage
  title        String
  description  String?
  assignTo     TaskAssignTo     @default(PROCESSOR)
  mandatory    Boolean          @default(true)
  dueOffsetDays Int?            // due = enrollment date + offset (null = no auto-deadline)
  order        Int              @default(0)
  active       Boolean          @default(true)
  createdById  String?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  obligations  ApplicationObligation[]

  @@index([programId])
  @@index([programId, stage])
}
```

### 3.3 `ApplicationObligation` — additive change

Add a nullable back-link to the template that generated the row. **No `origin` enum** — `templateId != null` already marks a template-generated task; `kind` already distinguishes TASK vs FORM/DELIVERABLE/CRITERION.

```prisma
model ApplicationObligation {
  // ... existing fields unchanged ...
  templateId String?
  template   ProgramTaskTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)

  @@index([templateId])
}
```

### 3.4 `Program` — back-relation

```prisma
model Program {
  // ...
  taskTemplates ProgramTaskTemplate[]
}
```

Migration is **additive** (new model + two nullable columns + indexes). No data backfill. Follow the C2a.1 migration convention (`prisma migrate dev --name program_pm_c2e`, multi-line enum syntax, revert any unrelated `prisma format` reformatting).

## 4. Materialization semantics (the heart of C2e)

Reuse the existing idempotent `generateObligations` flow. The **sourceId** is the idempotency key.

- **sourceId scheme for task rows:**
  - `assignTo = MANAGER` → one row, `sourceId = "task:{templateId}"`, assignee = `app.managerId`.
  - `assignTo = PROCESSOR` → one row, `sourceId = "task:{templateId}"`, assignee = `app.processorId`.
  - `assignTo = BOTH` → two rows, `sourceId = "task:{templateId}:manager"` (assignee managerId) and `"task:{templateId}:processor"` (assignee processorId).
- **dueDate:** if `dueOffsetDays != null`, `dueDate = enrollmentDate + dueOffsetDays` where enrollmentDate = `app.createdAt`. Else null.
- **Only `active` templates** materialize.
- **Idempotent:** rows whose `sourceId` already exists on the application are skipped (same mechanism already used for FORM/DELIVERABLE). So "Ανανέωση βημάτων" after editing templates safely pushes only the new/changed tasks to existing active applications.
- **Assignee may be null** if the application has no manager/processor yet. The row is still created (unassigned) so the work is visible; assignment can be backfilled. `assignTo = BOTH` with a null manager still creates the manager row (unassigned) — do not drop it.
- **Stage** on the obligation = the template's `stage`.

**Auto-trigger on enrollment:** the place where `ProgramApplication` is created (the "υπαγωγή πελάτη" action in `src/lib/programs/actions.ts`, e.g. `linkApplication`) calls `generateObligations(app.id)` after creation, inside/after the same request, so tasks appear immediately. Failure to generate must **not** roll back the enrollment — wrap in try/catch, log, and rely on the manual "Ανανέωση βημάτων" button as the recovery path (same resilience posture as the sync dispatcher).

## 5. Pure / isomorphic layer

New pure function in `src/lib/pm/obligations-gen.ts` (no prisma, no react — testable in isolation):

```ts
export type TaskTemplateInput = {
  id: string
  stage: StageStr
  title: string
  assignTo: 'MANAGER' | 'PROCESSOR' | 'BOTH'
  mandatory: boolean
  dueOffsetDays: number | null
  order: number
}

export type TaskObligationRow = {
  templateId: string
  kind: 'TASK'
  stage: StageStr
  sourceId: string
  name: string
  mandatory: boolean
  order: number
  assigneeSlot: 'MANAGER' | 'PROCESSOR'   // which app user this row is owned by
  dueOffsetDays: number | null
}

// Expands templates into obligation rows (BOTH → 2 rows). Pure; deterministic order.
export function buildTaskObligationRows(templates: TaskTemplateInput[]): TaskObligationRow[]
```

The **server action** resolves `assigneeSlot` → concrete `assigneeId` (managerId/processorId) and `dueOffsetDays` + `app.createdAt` → concrete `dueDate`. Keeping user-id and date resolution out of the pure function preserves isomorphic discipline and keeps the function trivially testable (no clock, no db).

## 6. Server actions (`src/lib/pm/actions.ts`)

All gated + scoped exactly like existing PM actions.

**Template authoring (admin only — gate `programs.manage`, same as the program editor):**
- `listProgramTaskTemplates(programId)` → grouped-by-stage list.
- `createProgramTaskTemplate(input)` / `updateProgramTaskTemplate(id, patch)` / `deleteProgramTaskTemplate(id)`. **Delete = hard delete**; safe because `ApplicationObligation.templateId` is `onDelete: SetNull`, so already-materialized tasks survive as (now template-less) obligations. The separate `active` flag is *not* deletion — it stops **future** materialization while keeping the template for existing applications.
- `reorderProgramTaskTemplates(programId, stage, orderedIds)` — persist `order`.

**Materialization (pm-scoped — gate via `requireVisibleApplication`):**
- Extend `generateObligations(applicationId)` to also build + idempotently insert task rows (merge with existing FORM/DELIVERABLE/criterion logic). Return value gains `addedTasks`.
- Auto-call from the enrollment action (see §4).

**Security:** template CRUD is `programs.manage` (admin/super only — templates are program-global config). Materialization stays `requireVisibleApplication` (pm.work sees only assigned apps). No new IDOR surface: template actions key off `programId` (global config, admin-gated); obligation actions already route through the chokepoint.

## 7. UI / UX

### 7.1 Admin — "Βήματα Διαχείρισης" tab on the Program page
`src/components/programs/*` (new tab wired into the existing tabbed `program-editor`).
- **One column per stage** (6 stages, horizontal scroll on narrow screens), each showing its ordered task list.
- Inline **add** (title, description, assignTo select, mandatory toggle, optional dueOffsetDays), inline **edit**, **delete**.
- **Reorder** within a stage via `@dnd-kit` (already installed). Persist on drop.
- `assignTo` select uses a base-ui Select (values `MANAGER`/`PROCESSOR`/`BOTH`; never empty-string). Greek labels: «Υπεύθυνος έργου», «Διεκπεραιωτής», «Και οι δύο».
- Empty state per stage: «Δεν έχουν οριστεί βήματα για αυτό το στάδιο».

### 7.2 Manager / Employee — unified checklist (existing obligations tab)
The current "Υποχρεώσεις & Δικαιολογητικά" tab already renders `ApplicationObligation` rows. Changes:
- Rename tab → **«Εργασίες & Υποχρεώσεις»**.
- Each row shows a small **source badge**: «Βήμα» (templateId set) vs «Πρόγραμμα» (FORM/DELIVERABLE/CRITERION). Overdue rows (dueDate < today, status not terminal) get a red date pill.
- Add a **«Ανανέωση βημάτων»** button (calls `generateObligations`) — surfaces newly-added template tasks onto this application; toast reports `addedTasks/addedObligations`.
- No new list — this stays the single per-stage surface. The C2b Kanban (later) reads the same rows.

### 7.3 Customer portal
Out of scope for C2e (portal is C2d). The unified rows are portal-ready (read-only progress per stage) when C2d lands.

## 8. Testing

- **Pure:** `buildTaskObligationRows` — MANAGER→1 row, PROCESSOR→1 row, BOTH→2 rows with correct distinct sourceIds and assigneeSlots; deterministic order; empty input → []; inactive templates excluded is enforced at the query layer (test the action, not the pure fn).
- **Action guards:** template CRUD rejects non-`programs.manage`; `generateObligations` still enforces `requireVisibleApplication`; idempotency — calling twice adds tasks once (no duplicate sourceId).
- **Materialization:** BOTH with null manager still creates the manager row (unassigned); dueDate computed from `createdAt + offset`; existing FORM/DELIVERABLE rows untouched.
- **Enrollment hook:** creating an application generates tasks; a thrown generation error does not roll back enrollment.
- Follow the existing `*-guard.test.ts` and pm test patterns. Target: green unit suite (e2e remains the known `:3000` footgun — not a merge gate).

## 9. Out of scope — future phases (context only)

- **C2f — Payment Requests / δόσεις** (separate spec later): `PaymentRequest` (ordinal, requestedAmount, status DRAFT→SUBMITTED→APPROVED→PAID/REJECTED) + `ProgramExpense.paymentRequestId?`; an expense may join a δόση **only if certified + compliant** → depends on **C2a.2** (certification + budget-compliance). Build order: C2a.2 → C2f.
- **C2b** Kanban reads the unified obligation rows produced here.

## 10. File map

- `prisma/schema.prisma` — `TaskAssignTo` enum, `ProgramTaskTemplate` model, `ApplicationObligation.templateId`, `Program.taskTemplates`. Migration `program_pm_c2e`.
- `src/lib/pm/obligations-gen.ts` — add `buildTaskObligationRows` (pure).
- `src/lib/pm/actions.ts` — template CRUD + reorder; extend `generateObligations`.
- `src/lib/programs/actions.ts` — call `generateObligations` on enrollment (try/catch).
- `src/components/programs/task-templates-tab.tsx` (new) + wire into program editor tabs.
- `src/components/pm/obligations-tab.tsx` — source badge, overdue pill, «Ανανέωση βημάτων», tab rename.
- Tests alongside each (`pm-obligations-gen.test.ts` extended, `pm-task-templates-guard.test.ts` new).

No new permission keys (reuses `programs.manage` + `pm.work`). No `db:sync-permissions` needed.
