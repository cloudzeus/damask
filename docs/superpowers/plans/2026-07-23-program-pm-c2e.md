# C2e — Task Templates & Auto-Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SUPER_ADMIN/ADMIN author per-program per-stage task checklists that auto-materialize + auto-assign to manager/processor on customer enrollment, unified into the existing `ApplicationObligation` list.

**Architecture:** New authoring model `ProgramTaskTemplate`; tasks are `ApplicationObligation` rows with `kind=TASK` + `templateId`. Materialization reuses the idempotent `generateObligations` flow (sourceId-keyed). Admin authoring tab on the program page (dnd-kit reorder); manager/employee tab gains a source badge + overdue pill.

**Tech Stack:** Next.js 16.2 (server actions), Prisma 7.8/Postgres, base-ui Select/Dialog/Switch, `@dnd-kit` (installed), sonner toast, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2e-task-templates-design.md`

**Ground rules (from prior PM work):**
- Prisma 7.8: multi-line enum syntax. After `prisma migrate`/`format`, **revert any reformatting of unrelated models** — keep the diff minimal.
- Pure lib files (`obligations-gen.ts`, `types.ts`) must NOT import `@/lib/prisma` or react.
- Every application-scoped action routes through `requireVisibleApplication`. Template CRUD is program-global config → gate `programs.manage` via `requirePermission`.
- base-ui Select forbids empty-string item values.
- Run `npm test` (Vitest) — target green unit suite. e2e is the known `:3000` footgun, not a merge gate.

---

## File Structure

- `prisma/schema.prisma` — `TaskAssignTo` enum, `ProgramTaskTemplate` model, `ApplicationObligation.templateId`, `Program.taskTemplates`. Migration `program_pm_c2e`.
- `src/lib/pm/types.ts` — `TaskAssignToStr` + `taskAssignToLabel`.
- `src/lib/pm/obligations-gen.ts` — `buildTaskObligationRows` (pure).
- `src/lib/pm/actions.ts` — template CRUD/reorder; extend `generateObligations`; add `templateId` to `ObligationItem`.
- `src/lib/programs/actions.ts` — call `generateObligations` on enrollment (try/catch).
- `src/components/programs/task-templates-tab.tsx` (new) + wire into `program-editor.tsx` TabBar.
- `src/components/pm/obligations-tab.tsx` — source badge + overdue pill + `addedTasks` toast.
- Tests: `src/lib/pm/pm-obligations-gen.test.ts` (extend), `src/lib/pm/pm-types.test.ts` (extend), `src/lib/pm/pm-task-templates-guard.test.ts` (new), `src/lib/pm/pm-generate-tasks.test.ts` (new).

---

## Task 1: Schema — `ProgramTaskTemplate` + `ApplicationObligation.templateId`

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `src/lib/pm/pm-schema-c2e.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pm/pm-schema-c2e.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

describe('C2e schema', () => {
  it('exposes ProgramTaskTemplate model with expected fields', () => {
    const model = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramTaskTemplate')
    expect(model).toBeTruthy()
    const fields = new Set(model!.fields.map(f => f.name))
    for (const f of ['programId', 'stage', 'title', 'assignTo', 'mandatory', 'dueOffsetDays', 'order', 'active']) {
      expect(fields.has(f), `missing field ${f}`).toBe(true)
    }
  })
  it('TaskAssignTo enum has MANAGER/PROCESSOR/BOTH', () => {
    const e = Prisma.dmmf.datamodel.enums.find(en => en.name === 'TaskAssignTo')
    expect(e!.values.map(v => v.name).sort()).toEqual(['BOTH', 'MANAGER', 'PROCESSOR'])
  })
  it('ApplicationObligation has templateId', () => {
    const model = Prisma.dmmf.datamodel.models.find(m => m.name === 'ApplicationObligation')
    expect(model!.fields.some(f => f.name === 'templateId')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pm-schema-c2e`
Expected: FAIL (ProgramTaskTemplate undefined).

- [ ] **Step 3: Edit schema**

Add after the `AssessmentVerdict` enum block (near line 1226):

```prisma
enum TaskAssignTo {
  MANAGER
  PROCESSOR
  BOTH
}
```

Add a new model after `ApplicationCriterionScore`:

```prisma
model ProgramTaskTemplate {
  id            String           @id @default(cuid())
  programId     String
  program       Program          @relation(fields: [programId], references: [id], onDelete: Cascade)
  stage         ApplicationStage
  title         String
  description   String?
  assignTo      TaskAssignTo     @default(PROCESSOR)
  mandatory     Boolean          @default(true)
  dueOffsetDays Int?
  order         Int              @default(0)
  active        Boolean          @default(true)
  createdById   String?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  obligations   ApplicationObligation[]

  @@index([programId])
  @@index([programId, stage])
}
```

In `model ApplicationObligation`, add (after `documents ApplicationDocument[]`):

```prisma
  templateId String?
  template   ProgramTaskTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
```

And add to its index block:

```prisma
  @@index([templateId])
```

In `model Program`, add a back-relation field alongside its other relations:

```prisma
  taskTemplates ProgramTaskTemplate[]
```

- [ ] **Step 4: Migrate + generate**

Run:
```bash
npx prisma migrate dev --name program_pm_c2e
npx prisma generate
```
Expected: migration `<ts>_program_pm_c2e` created & applied; client regenerated.
**Then:** `git diff prisma/schema.prisma` — if `prisma` reformatted unrelated models, revert those hunks and keep only the C2e additions.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- pm-schema-c2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/pm/pm-schema-c2e.test.ts
git commit -m "feat(pm): C2e schema — ProgramTaskTemplate + obligation.templateId"
```

---

## Task 2: Types — `TaskAssignToStr` + `taskAssignToLabel`

**Files:**
- Modify: `src/lib/pm/types.ts`
- Test: `src/lib/pm/pm-types.test.ts` (extend)

- [ ] **Step 1: Add failing test**

Append to `src/lib/pm/pm-types.test.ts`:

```ts
import { taskAssignToLabel } from '@/lib/pm/types'

describe('taskAssignToLabel', () => {
  it('labels each assignTo in Greek', () => {
    expect(taskAssignToLabel('MANAGER')).toBe('Υπεύθυνος έργου')
    expect(taskAssignToLabel('PROCESSOR')).toBe('Διεκπεραιωτής')
    expect(taskAssignToLabel('BOTH')).toBe('Και οι δύο')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pm-types`
Expected: FAIL (`taskAssignToLabel` not exported).

- [ ] **Step 3: Implement**

Add to `src/lib/pm/types.ts`:

```ts
export type TaskAssignToStr = 'MANAGER' | 'PROCESSOR' | 'BOTH'

const TASK_ASSIGN_LABELS: Record<TaskAssignToStr, string> = {
  MANAGER: 'Υπεύθυνος έργου',
  PROCESSOR: 'Διεκπεραιωτής',
  BOTH: 'Και οι δύο',
}

export const taskAssignToLabel = (a: TaskAssignToStr) => TASK_ASSIGN_LABELS[a]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pm-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pm/types.ts src/lib/pm/pm-types.test.ts
git commit -m "feat(pm): C2e types — TaskAssignTo label"
```

---

## Task 3: Pure — `buildTaskObligationRows`

Expands templates into obligation rows. `BOTH` → 2 rows (one per assignee slot). Pure, deterministic, no clock/db.

**Files:**
- Modify: `src/lib/pm/obligations-gen.ts`
- Test: `src/lib/pm/pm-obligations-gen.test.ts` (extend)

- [ ] **Step 1: Add failing test**

Append to `src/lib/pm/pm-obligations-gen.test.ts`:

```ts
import { buildTaskObligationRows, type TaskTemplateInput } from '@/lib/pm/obligations-gen'

describe('buildTaskObligationRows', () => {
  const base: TaskTemplateInput = { id: 't1', stage: 'DOCUMENTS', title: 'Συλλογή ΑΦΜ', assignTo: 'PROCESSOR', mandatory: true, dueOffsetDays: 5, order: 0 }

  it('MANAGER → one row assigned to manager slot', () => {
    const rows = buildTaskObligationRows([{ ...base, assignTo: 'MANAGER' }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ templateId: 't1', kind: 'TASK', stage: 'DOCUMENTS', sourceId: 'task:t1', name: 'Συλλογή ΑΦΜ', assigneeSlot: 'MANAGER', dueOffsetDays: 5 })
  })

  it('PROCESSOR → one row assigned to processor slot', () => {
    const rows = buildTaskObligationRows([base])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sourceId: 'task:t1', assigneeSlot: 'PROCESSOR' })
  })

  it('BOTH → two rows with distinct sourceIds and slots', () => {
    const rows = buildTaskObligationRows([{ ...base, assignTo: 'BOTH' }])
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.sourceId).sort()).toEqual(['task:t1:manager', 'task:t1:processor'])
    expect(rows.map(r => r.assigneeSlot).sort()).toEqual(['MANAGER', 'PROCESSOR'])
  })

  it('empty input → []', () => {
    expect(buildTaskObligationRows([])).toEqual([])
  })

  it('preserves template order across multiple templates', () => {
    const rows = buildTaskObligationRows([{ ...base, id: 'a', order: 0 }, { ...base, id: 'b', order: 1 }])
    expect(rows.map(r => r.templateId)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pm-obligations-gen`
Expected: FAIL (`buildTaskObligationRows` not exported).

- [ ] **Step 3: Implement**

Add to `src/lib/pm/obligations-gen.ts` (import `TaskAssignToStr` from types):

```ts
import type { StageStr, ObligationKindStr, TaskAssignToStr } from '@/lib/pm/types'

export type TaskTemplateInput = {
  id: string
  stage: StageStr
  title: string
  assignTo: TaskAssignToStr
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
  assigneeSlot: 'MANAGER' | 'PROCESSOR'
  dueOffsetDays: number | null
}

export function buildTaskObligationRows(templates: TaskTemplateInput[]): TaskObligationRow[] {
  const rows: TaskObligationRow[] = []
  for (const t of templates) {
    const mk = (slot: 'MANAGER' | 'PROCESSOR', sourceId: string): TaskObligationRow => ({
      templateId: t.id, kind: 'TASK', stage: t.stage, sourceId, name: t.title,
      mandatory: t.mandatory, order: t.order, assigneeSlot: slot, dueOffsetDays: t.dueOffsetDays,
    })
    if (t.assignTo === 'MANAGER') rows.push(mk('MANAGER', `task:${t.id}`))
    else if (t.assignTo === 'PROCESSOR') rows.push(mk('PROCESSOR', `task:${t.id}`))
    else { rows.push(mk('MANAGER', `task:${t.id}:manager`)); rows.push(mk('PROCESSOR', `task:${t.id}:processor`)) }
  }
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pm-obligations-gen`
Expected: PASS (existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pm/obligations-gen.ts src/lib/pm/pm-obligations-gen.test.ts
git commit -m "feat(pm): C2e pure — buildTaskObligationRows"
```

---

## Task 4: Server actions — template CRUD + reorder

Gated `programs.manage`. Program-global config (no application scope).

**Files:**
- Modify: `src/lib/pm/actions.ts`
- Test: `src/lib/pm/pm-task-templates-guard.test.ts` (create)

- [ ] **Step 1: Write the failing guard test**

Mirror the existing `*-guard.test.ts` pattern (mock `@/lib/rbac-server` `requirePermission` to throw; assert each action rejects). Create `src/lib/pm/pm-task-templates-guard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requirePermission } from '@/lib/rbac-server'
import {
  listProgramTaskTemplates, createProgramTaskTemplate, updateProgramTaskTemplate,
  deleteProgramTaskTemplate, reorderProgramTaskTemplates,
} from '@/lib/pm/actions'

describe('task-template actions require programs.manage', () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset()
    vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
  })
  it('listProgramTaskTemplates', async () => { await expect(listProgramTaskTemplates('p1')).rejects.toThrow() })
  it('createProgramTaskTemplate', async () => { await expect(createProgramTaskTemplate({ programId: 'p1', stage: 'DOCUMENTS', title: 'x', assignTo: 'PROCESSOR', mandatory: true, dueOffsetDays: null })).rejects.toThrow() })
  it('updateProgramTaskTemplate', async () => { await expect(updateProgramTaskTemplate('t1', { title: 'y' })).rejects.toThrow() })
  it('deleteProgramTaskTemplate', async () => { await expect(deleteProgramTaskTemplate('t1')).rejects.toThrow() })
  it('reorderProgramTaskTemplates', async () => { await expect(reorderProgramTaskTemplates('p1', 'DOCUMENTS', ['t1'])).rejects.toThrow() })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pm-task-templates-guard`
Expected: FAIL (actions not exported).

- [ ] **Step 3: Implement actions**

Add to `src/lib/pm/actions.ts` (import `TaskAssignToStr` from types):

```ts
export type TaskTemplateItem = {
  id: string
  stage: StageStr
  title: string
  description: string | null
  assignTo: TaskAssignToStr
  mandatory: boolean
  dueOffsetDays: number | null
  order: number
  active: boolean
}

export async function listProgramTaskTemplates(programId: string): Promise<TaskTemplateItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programTaskTemplate.findMany({
    where: { programId },
    orderBy: [{ stage: 'asc' }, { order: 'asc' }],
  })
  return rows.map(r => ({
    id: r.id, stage: r.stage as StageStr, title: r.title, description: r.description,
    assignTo: r.assignTo as TaskAssignToStr, mandatory: r.mandatory, dueOffsetDays: r.dueOffsetDays,
    order: r.order, active: r.active,
  }))
}

export async function createProgramTaskTemplate(input: {
  programId: string; stage: StageStr; title: string; description?: string | null
  assignTo: TaskAssignToStr; mandatory: boolean; dueOffsetDays: number | null
}): Promise<{ id: string }> {
  const session = await requirePermission('programs.manage')
  const title = input.title.trim()
  if (!title) throw new Error('Ο τίτλος του βήματος είναι υποχρεωτικός.')
  const max = await prisma.programTaskTemplate.aggregate({
    where: { programId: input.programId, stage: input.stage }, _max: { order: true },
  })
  const t = await prisma.programTaskTemplate.create({
    data: {
      programId: input.programId, stage: input.stage, title, description: input.description?.trim() || null,
      assignTo: input.assignTo, mandatory: input.mandatory, dueOffsetDays: input.dueOffsetDays,
      order: (max._max.order ?? -1) + 1, createdById: session.user.id,
    },
  })
  revalidatePath(`/programs/${input.programId}`)
  return { id: t.id }
}

export async function updateProgramTaskTemplate(id: string, patch: {
  title?: string; description?: string | null; assignTo?: TaskAssignToStr
  mandatory?: boolean; dueOffsetDays?: number | null; active?: boolean
}): Promise<void> {
  await requirePermission('programs.manage')
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) { const t = patch.title.trim(); if (!t) throw new Error('Ο τίτλος του βήματος είναι υποχρεωτικός.'); data.title = t }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null
  if (patch.assignTo !== undefined) data.assignTo = patch.assignTo
  if (patch.mandatory !== undefined) data.mandatory = patch.mandatory
  if (patch.dueOffsetDays !== undefined) data.dueOffsetDays = patch.dueOffsetDays
  if (patch.active !== undefined) data.active = patch.active
  const t = await prisma.programTaskTemplate.update({ where: { id }, data })
  revalidatePath(`/programs/${t.programId}`)
}

export async function deleteProgramTaskTemplate(id: string): Promise<void> {
  await requirePermission('programs.manage')
  const t = await prisma.programTaskTemplate.delete({ where: { id } })
  revalidatePath(`/programs/${t.programId}`)
}

export async function reorderProgramTaskTemplates(programId: string, stage: StageStr, orderedIds: string[]): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.programTaskTemplate.updateMany({ where: { id, programId, stage }, data: { order: i } }),
    ),
  )
  revalidatePath(`/programs/${programId}`)
}
```

Add `TaskAssignToStr` to the existing `@/lib/pm/types` import line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pm-task-templates-guard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pm/actions.ts src/lib/pm/pm-task-templates-guard.test.ts
git commit -m "feat(pm): C2e actions — task template CRUD + reorder (programs.manage)"
```

---

## Task 5: Extend `generateObligations` to materialize tasks

Resolve `assigneeSlot` → concrete managerId/processorId, `dueOffsetDays` + `app.createdAt` → concrete `dueDate`. Idempotent by sourceId. Return gains `addedTasks`.

**Files:**
- Modify: `src/lib/pm/actions.ts`
- Test: `src/lib/pm/pm-generate-tasks.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pm/pm-generate-tasks.test.ts` — mock prisma + `requireVisibleApplication` path. Because `generateObligations` calls `requireVisibleApplication` (which uses `requirePermission` + a prisma query), mock at the prisma layer. Model the app with `managerId`, `processorId`, `createdAt`, and one BOTH template; assert two task obligations are created with resolved assignees + dueDate, and a second call adds zero (idempotent).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db: any = {}
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u-admin' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { generateObligations } from '@/lib/pm/actions'

const CREATED = new Date('2026-03-01T00:00:00Z')

beforeEach(() => {
  const created: any[] = []
  ;(globalThis as any).__created = created
  db.programApplication = {
    findFirst: vi.fn().mockResolvedValue({ id: 'app1', programId: 'p1', managerId: 'mgr', processorId: 'proc', createdAt: CREATED }),
    findUniqueOrThrow: vi.fn(),
  }
  db.program = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'p1', criteria: [], deliverables: [], requiredForms: [], taskTemplates: [
    { id: 't1', stage: 'DOCUMENTS', title: 'Βήμα', assignTo: 'BOTH', mandatory: true, dueOffsetDays: 10, order: 0, active: true },
  ] }) }
  db.applicationObligation = {
    findMany: vi.fn().mockResolvedValue([]),   // nothing existing on first call
    createMany: vi.fn().mockImplementation(({ data }: any) => { created.push(...data); return { count: data.length } }),
  }
  db.applicationCriterionScore = { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 0 }) }
})

describe('generateObligations materializes tasks', () => {
  it('BOTH template → 2 task rows with resolved assignees + dueDate', async () => {
    const res = await generateObligations('app1')
    expect(res.addedTasks).toBe(2)
    const created = (globalThis as any).__created.filter((r: any) => r.kind === 'TASK')
    expect(created).toHaveLength(2)
    const byAssignee = Object.fromEntries(created.map((r: any) => [r.assigneeId, r]))
    expect(Object.keys(byAssignee).sort()).toEqual(['mgr', 'proc'])
    // dueDate = createdAt + 10 days
    expect(new Date(byAssignee.mgr.dueDate).toISOString().slice(0, 10)).toBe('2026-03-11')
    expect(byAssignee.mgr.templateId).toBe('t1')
    expect(byAssignee.mgr.sourceId).toBe('task:t1:manager')
  })
})
```

> **Note to implementer:** the exact prisma access shape (`findFirst` vs the real `requireVisibleApplication` query) must match the real code in `actions.ts`. Read `requireVisibleApplication` first and adjust the mock to whatever query it issues (e.g. `findFirst`/`findUnique` with `visibleApplicationWhere`). Keep the *assertions* (2 rows, resolved assignees, dueDate, sourceId, templateId) intact.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pm-generate-tasks`
Expected: FAIL (`addedTasks` undefined / no task rows).

- [ ] **Step 3: Implement**

In `generateObligations` (src/lib/pm/actions.ts ~line 230):
1. Add `taskTemplates: { where: { active: true } }` to the `program.findUniqueOrThrow` include.
2. Import `buildTaskObligationRows`. Build task rows from active templates:

```ts
import { buildObligationRows, buildCriterionScoreRows, buildTaskObligationRows } from '@/lib/pm/obligations-gen'
// ...
const taskRows = buildTaskObligationRows(
  program.taskTemplates.map(t => ({
    id: t.id, stage: t.stage as StageStr, title: t.title,
    assignTo: t.assignTo as TaskAssignToStr, mandatory: t.mandatory,
    dueOffsetDays: t.dueOffsetDays, order: t.order,
  })),
)
```

3. The existing `existingSourceIds` set already covers all `sourceId != null` rows (tasks included). Filter new task rows the same way:

```ts
const newTasks = taskRows.filter(r => !existingSourceIds.has(r.sourceId))
```

4. Resolve assignee + dueDate and insert (reuse `app.managerId`/`app.processorId`/`app.createdAt` — ensure `requireVisibleApplication` returns an `app` object carrying these; if it selects a narrow shape, widen the select to include `managerId, processorId, createdAt`):

```ts
function addDays(base: Date, days: number): Date { const d = new Date(base); d.setUTCDate(d.getUTCDate() + days); return d }

if (newTasks.length > 0) {
  await prisma.applicationObligation.createMany({
    data: newTasks.map(r => ({
      applicationId,
      stage: r.stage,
      kind: 'TASK' as const,
      sourceId: r.sourceId,
      templateId: r.templateId,
      name: r.name,
      mandatory: r.mandatory,
      order: r.order,
      assigneeId: r.assigneeSlot === 'MANAGER' ? (app.managerId ?? null) : (app.processorId ?? null),
      dueDate: r.dueOffsetDays != null ? addDays(app.createdAt, r.dueOffsetDays) : null,
    })),
  })
}
```

5. Return `{ addedObligations: newObligations.length, addedScores: newScores.length, addedTasks: newTasks.length }`. Update the function's return type accordingly.

> **Isomorphic guard:** `addDays` stays inside `actions.ts` (server) — do NOT move date math into the pure `obligations-gen.ts` (keeps the pure fn clock-free, per spec §5).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pm-generate-tasks pm-obligations-gen`
Expected: PASS.

- [ ] **Step 5: Verify idempotency + existing PM tests**

Run: `npm test -- pm-`
Expected: all pm-* green (existing `generateObligations` callers still compile — the added return key is additive).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pm/actions.ts src/lib/pm/pm-generate-tasks.test.ts
git commit -m "feat(pm): C2e — generateObligations materializes task templates (assignee + dueDate resolution)"
```

---

## Task 6: Auto-generate on enrollment

`createApplication` (src/lib/programs/actions.ts:175) calls `generateObligations` after upsert, in try/catch — generation failure must not roll back enrollment.

**Files:**
- Modify: `src/lib/programs/actions.ts`
- Test: `src/lib/programs/programs-enrollment-tasks.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/programs/programs-enrollment-tasks.test.ts`. Mock prisma upsert + spy that `generateObligations` is invoked with the new app id; and a second test where `generateObligations` throws → `createApplication` still resolves with the id.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const genMock = vi.fn().mockResolvedValue({ addedObligations: 0, addedScores: 0, addedTasks: 3 })
vi.mock('@/lib/pm/actions', () => ({ generateObligations: (...a: any[]) => genMock(...a) }))
const db: any = { programApplication: { upsert: vi.fn().mockResolvedValue({ id: 'app-new' }) } }
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { createApplication } from '@/lib/programs/actions'

beforeEach(() => { genMock.mockClear(); genMock.mockResolvedValue({ addedObligations: 0, addedScores: 0, addedTasks: 3 }) })

describe('createApplication auto-generates tasks', () => {
  it('calls generateObligations with the new app id', async () => {
    const res = await createApplication({ trdrId: 'tr1', programId: 'p1' })
    expect(res.id).toBe('app-new')
    expect(genMock).toHaveBeenCalledWith('app-new')
  })
  it('does not roll back enrollment if generation throws', async () => {
    genMock.mockRejectedValueOnce(new Error('boom'))
    const res = await createApplication({ trdrId: 'tr1', programId: 'p1' })
    expect(res.id).toBe('app-new')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- programs-enrollment-tasks`
Expected: FAIL (generateObligations not called).

- [ ] **Step 3: Implement**

In `createApplication`, after the upsert and before `return { id: app.id }`:

```ts
// C2e: materialize per-stage task templates onto the new/linked application.
// Generation failure must NOT roll back the enrollment — the manager can
// re-run via «Ανανέωση βημάτων».
try {
  const { generateObligations } = await import('@/lib/pm/actions')
  await generateObligations(app.id)
} catch (err) {
  console.error('[createApplication] task generation failed', err)
}
```

> **Why dynamic import:** avoids a static server-module import cycle between `programs/actions` and `pm/actions`. If no cycle exists, a top-of-file static import is fine — implementer's judgment after checking imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- programs-enrollment-tasks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/programs/actions.ts src/lib/programs/programs-enrollment-tasks.test.ts
git commit -m "feat(pm): C2e — auto-generate tasks on customer enrollment (non-fatal)"
```

---

## Task 7: Admin UI — «Βήματα Διαχείρισης» tab

Self-fetching client tab on the program page: one column per stage, add/edit/delete, dnd-kit reorder within a stage. Mirror `src/components/programs/required-forms-tab.tsx` for fetch/CRUD/toast/dialog structure.

**Files:**
- Create: `src/components/programs/task-templates-tab.tsx`
- Modify: `src/components/programs/program-editor.tsx`

- [ ] **Step 1: Build `TaskTemplatesTab`**

Client component `export function TaskTemplatesTab({ programId }: { programId: string })`. Structure:
- On mount, `listProgramTaskTemplates(programId)` → `TaskTemplateItem[]`; loading/error states mirroring `RequiredFormsTab`.
- Group items by `stage` using `STAGE_ORDER` + `stageLabel` from `@/lib/pm/types`. Render 6 stage columns in a horizontally-scrollable flex row (`overflow-x-auto`), each a `glass` card with the stage label header + ordered task list + an inline «+ Βήμα» add control.
- Each task row shows: title, `taskAssignToLabel(assignTo)` pill, «Υποχρεωτικό» pill when mandatory, `dueOffsetDays` («+Nη ημέρα» hint) when set, edit (pencil) + delete (trash) buttons.
- **Add/Edit dialog** (base-ui `Dialog`): fields `title` (Input), `description` (textarea), `assignTo` (Select — items `MANAGER`/`PROCESSOR`/`BOTH` with `taskAssignToLabel`; **never** empty value), `mandatory` (Switch), `dueOffsetDays` (numeric Input, empty → null). Submit calls `createProgramTaskTemplate`/`updateProgramTaskTemplate`, then reloads + toast.
- **Delete**: confirm inline (mirror RequiredFormsTab remove), call `deleteProgramTaskTemplate`, toast.
- **Reorder**: `@dnd-kit/core` + `@dnd-kit/sortable` within each stage column (`SortableContext` per stage). On drop, compute new ordered id array for that stage and call `reorderProgramTaskTemplates(programId, stage, orderedIds)`; optimistic local reorder, revert + toast on failure. Reference the existing dnd usage in the codebase (`ProductImageCollection` / any `@dnd-kit` consumer) for the sensor + `SortableContext` boilerplate.
- Empty state per column: «Δεν έχουν οριστεί βήματα για αυτό το στάδιο».
- a11y: buttons have `aria-label`; Select has an associated label; follow the labelling already used in `required-forms-tab.tsx`.

Import from `@/lib/pm/actions`: `listProgramTaskTemplates, createProgramTaskTemplate, updateProgramTaskTemplate, deleteProgramTaskTemplate, reorderProgramTaskTemplates, type TaskTemplateItem`. Import `STAGE_ORDER, stageLabel, taskAssignToLabel, type StageStr, type TaskAssignToStr` from `@/lib/pm/types`.

- [ ] **Step 2: Wire into the editor TabBar**

In `src/components/programs/program-editor.tsx`:
- Extend `type TabKey` with `'tasks'`.
- Add to `TABS`: `{ key: 'tasks', label: 'Βήματα Διαχείρισης' }` (place it after `'forms'`).
- Add render: `{activeTab === 'tasks' && <TaskTemplatesTab programId={program.id} />}`.
- Add the import: `import { TaskTemplatesTab } from './task-templates-tab'`.

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/programs/task-templates-tab.tsx src/components/programs/program-editor.tsx
git commit -m "feat(pm): C2e admin UI — Βήματα Διαχείρισης tab (per-stage authoring + dnd reorder)"
```

---

## Task 8: Manager UI — source badge + overdue pill + `addedTasks` toast

**Files:**
- Modify: `src/lib/pm/actions.ts` (add `templateId` to `ObligationItem` + its list select)
- Modify: `src/components/pm/obligations-tab.tsx`

- [ ] **Step 1: Thread `templateId` through `ObligationItem`**

In `src/lib/pm/actions.ts`:
- Add `templateId: string | null` to the `ObligationItem` type.
- In `listApplicationObligations` (the action that maps obligation rows → `ObligationItem`), select `templateId` and include it in the mapped object.

- [ ] **Step 2: Update the tab**

In `src/components/pm/obligations-tab.tsx`:
- **Source badge**: next to the existing kind badge, render a small pill — `o.templateId ? 'Βήμα' : 'Πρόγραμμα'` (use existing `badge-pill` classes; `Βήμα` gets an accent variant, `Πρόγραμμα` muted). Keep the existing `obligationKindLabel(o.kind)` badge.
- **Overdue pill**: when `o.dueDate` is set, `new Date(o.dueDate) < startOfToday`, and `o.status` is not terminal (`APPROVED`/`WAIVED`), render a red pill «Εκπρόθεσμο» near the due-date field. Compute `startOfToday` once per render (`const today = new Date(); today.setHours(0,0,0,0)`).
- **Toast**: the existing «Ανανέωση» handler destructures `{ addedObligations }` — change to also read `addedTasks` and include it in the toast message, e.g. `Προστέθηκαν ${addedObligations + addedTasks} νέες εγγραφές` (or a two-part message «X βήματα, Y υποχρεώσεις»).
- **Tab label**: update the tab's display label to «Εργασίες & Υποχρεώσεις» wherever this tab is titled (in `application-hub`/the tab bar that mounts `ObligationsTab`). Grep for the current «Υποχρεώσεις & Δικαιολογητικά» / «Υποχρεώσεις» string and rename.

- [ ] **Step 3: Type-check + build + full test**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pm/actions.ts src/components/pm/obligations-tab.tsx src/components/pm/application-hub.tsx
git commit -m "feat(pm): C2e manager UI — source badge, overdue pill, task-aware refresh toast"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all green (prior ~818 + new C2e tests).

- [ ] **Step 2: Type-check + production build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Manual smoke (describe, don't automate)**

Confirm in the plan review: as ADMIN, open a program → «Βήματα Διαχείρισης» → add a BOTH task in DOCUMENTS with offset 5 → link a TRDR to the program → open the application → «Εργασίες & Υποχρεώσεις» shows 2 task rows (one per assignee) with due dates + «Βήμα» badge.

- [ ] **Step 4: Holistic review**

Dispatch a final code reviewer over the whole C2e diff (spec compliance + security: template CRUD gated `programs.manage`, no new IDOR, materialization still routes through `requireVisibleApplication`, isomorphic purity of `obligations-gen.ts`). Then use superpowers:finishing-a-development-branch.

---

## Self-Review Notes

- **Spec coverage:** §3 schema → T1; §4 materialization → T3/T5; §4 auto-trigger → T6; §5 pure → T3; §6 actions → T4/T5; §7.1 admin UI → T7; §7.2 manager UI → T8. All covered.
- **Type consistency:** `TaskAssignToStr`/`assignTo` values `MANAGER|PROCESSOR|BOTH` used identically across types, pure fn, actions, UI. `sourceId` scheme (`task:{id}` / `task:{id}:manager|processor`) identical in T3 pure fn and T5 idempotency filter. `addedTasks` return key added in T5, consumed in T8.
- **No new permissions** — `programs.manage` (template CRUD) + `pm.work`/`pm.manage` via existing `requireVisibleApplication` (materialization). No `db:sync-permissions`.
- **Isomorphic discipline:** date/assignee resolution kept in `actions.ts`; `obligations-gen.ts` stays pure (T3/T5 notes enforce this).
