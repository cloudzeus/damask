# Program PM — C2a.1 (Core Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** PM foundation per «έργο» (`ProgramApplication`): lifecycle **stage**, **manager/processor assignment** + access scoping, **obligations** (auto-snapshotted from program deliverables/forms/criteria) with status/due/assignee + **document upload/download**, **scored eligibility assessment**, ΟΠΣΚΕ status, an **application hub page** with tabs, and an «Έργα» tab on the customer (`Trdr`) card.

**Architecture:** New Prisma models + `ProgramApplication`/`User` extensions. Isomorphic/pure libs (`types`, `assessment`, `obligations-gen`, `scoping`) + server `actions.ts` (scoped/gated). UI hub page + tabs, integrating the existing C3 `expense-list` as the «Δαπάνες» tab. Steel & Frost.

**Reference spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2a-design.md` (build the **C2a.1 core** subset — DEFER §2 `ProgramExpense`/`ProgramExpenseCertification` extensions, §3στ budget-compliance/substitution, §3ζ certification, and the budget/certification tabs to **C2a.2**).

**Verified DAMASK APIs:**
- `prisma` models (C1): `ProgramApplication` (id, trdrId, programId, status, notes, createdById, + `expenses`), `Program` (+ `criteria`, `deliverables`, `requiredForms`), `ProgramCriterion` (id, name, weight, order), `ProgramDeliverable` (id, name, mandatory, order), `ProgramRequiredForm` (id, name, mandatory, order). `Trdr` (id, NAME). `User` (id, name, email, roleId, trdrId).
- `src/lib/rbac-server.ts` — `requirePermission(perm) → Session` (`session.user.id`, `session.user.role`, `session.user.permissions: string[]`).
- `src/lib/bunny-storage.ts` — `bunnyUploadPrivate({key,body:Buffer,contentType})`, `bunnyDownload(key)→Buffer`.
- `src/lib/objects.ts` + `src/lib/permissions.ts` (`PERMISSION_GROUP_LABELS`, `ROLE_DEFAULTS`) + `npm run db:sync-permissions`.
- `src/components/programs/expense-list.tsx` (C3) — reused as a tab.
- `src/app/(app)/partners/[id]/page.tsx` — stacked panels (add «Έργα» tab like the tax `FinancialsTab`/programs applications-panel pattern).
- `src/lib/programs/actions.ts` — `createApplication({trdrId, programId})` (extend to auto-generate obligations).

**Conventions:** Greek UI; Steel & Frost; base-ui; react-icons/lu. Isomorphic: `types/assessment/obligations-gen/scoping` MUST NOT import prisma/react. **Before App-Router/server-action code, read `node_modules/next/dist/docs/`.** Ignore pre-existing `RouteContext` tsc error. Multi-line Prisma enums. After the registry task: **run `npm run db:sync-permissions`** (coordinator does it post-merge).

---

## Task 1: Prisma models + migration (C2a.1 subset)

**Files:** Modify `prisma/schema.prisma`; Test `tests/pm-schema.test.ts`.

- [ ] **Step 1:** Add enums (multi-line): `ApplicationStage { ASSESSMENT DOCUMENTS EXPENSES_DELIVERABLES OPSKE_SUBMISSION INSPECTION MONITORING }`, `ObligationKind { DELIVERABLE FORM CRITERION TASK CUSTOM }`, `ObligationStatus { PENDING IN_PROGRESS SUBMITTED APPROVED REJECTED WAIVED }`, `AssessmentVerdict { PENDING ELIGIBLE INELIGIBLE }`.
- [ ] **Step 2:** Extend `model ProgramApplication` with:
```prisma
  stage            ApplicationStage @default(ASSESSMENT)
  managerId        String?
  manager          User? @relation("AppManager",   fields:[managerId],   references:[id], onDelete:SetNull)
  processorId      String?
  processor        User? @relation("AppProcessor", fields:[processorId], references:[id], onDelete:SetNull)
  assessmentScore    Float?
  assessmentMaxScore Float?
  assessmentVerdict  AssessmentVerdict @default(PENDING)
  opskeStatus      String?
  opskeRef         String?
  opskeSubmittedAt DateTime?
  obligations      ApplicationObligation[]
  documents        ApplicationDocument[]
  criterionScores  ApplicationCriterionScore[]
```
- [ ] **Step 3:** Add the three models from spec §2 (`ApplicationObligation`, `ApplicationDocument`, `ApplicationCriterionScore`) EXACTLY (obligation has `assignee User? @relation(...)`). Add to `model User`: `managedApplications ProgramApplication[] @relation("AppManager")`, `processedApplications ProgramApplication[] @relation("AppProcessor")`, `assignedObligations ApplicationObligation[]`.
- [ ] **Step 4:** `npx prisma migrate dev --name program_pm_c2a1` (STOP+BLOCKED on reset/drift; confirm additive-only). `npx prisma generate`.
- [ ] **Step 5:** `tests/pm-schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
describe('pm models', () => {
  it('exposes the new models', () => {
    for (const m of ['ApplicationObligation','ApplicationDocument','ApplicationCriterionScore']) expect((Prisma.ModelName as Record<string,string>)[m]).toBe(m)
  })
})
```
- [ ] **Step 6:** `npx vitest run tests/pm-schema.test.ts && npx tsc --noEmit`. Commit `feat(pm): prisma models for application PM (stage/assignments/obligations/documents/assessment)`.

---

## Task 2: `lib/pm/types.ts` — isomorphic labels + helpers

**Files:** Create `src/lib/pm/types.ts`; Test `tests/pm-types.test.ts`.

- [ ] **Step 1:** Failing test:
```ts
import { describe, it, expect } from 'vitest'
import { STAGE_ORDER, stageLabel, obligationStatusLabel, nextStage } from '@/lib/pm/types'
describe('pm types', () => {
  it('stage order + labels', () => {
    expect(STAGE_ORDER[0]).toBe('ASSESSMENT')
    expect(stageLabel('OPSKE_SUBMISSION')).toMatch(/ΟΠΣΚΕ/)
    expect(obligationStatusLabel('APPROVED')).toMatch(/Εγκρ/)
    expect(nextStage('ASSESSMENT')).toBe('DOCUMENTS')
    expect(nextStage('MONITORING')).toBeNull()
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (ISOMORPHIC): `StageStr`/`ObligationKindStr`/`ObligationStatusStr`/`VerdictStr` unions; `STAGE_ORDER: StageStr[]` (the 6 in order); `stageLabel`/`obligationKindLabel`/`obligationStatusLabel`/`verdictLabel` Greek maps; `nextStage(s)`/`prevStage(s)` (null at ends). Greek: ASSESSMENT «Αξιολόγηση», DOCUMENTS «Δικαιολογητικά», EXPENSES_DELIVERABLES «Δαπάνες & Παραδοτέα», OPSKE_SUBMISSION «Υποβολή ΟΠΣΚΕ», INSPECTION «Δελτία ελέγχου», MONITORING «Παρακολούθηση». Statuses: PENDING «Εκκρεμεί», IN_PROGRESS «Σε εξέλιξη», SUBMITTED «Υποβλήθηκε», APPROVED «Εγκρίθηκε», REJECTED «Απορρίφθηκε», WAIVED «Απαλλαγή».
- [ ] **Step 4:** Run → PASS + tsc. Commit `feat(pm): isomorphic stage/obligation labels + helpers`.

---

## Task 3: `lib/pm/assessment.ts` — scored assessment (pure)

**Files:** Create `src/lib/pm/assessment.ts`; Test `tests/pm-assessment.test.ts`.

- [ ] **Step 1:** Failing test:
```ts
import { describe, it, expect } from 'vitest'
import { computeAssessmentScore } from '@/lib/pm/assessment'
describe('computeAssessmentScore', () => {
  it('weighted percentage of achieved vs max', () => {
    const r = computeAssessmentScore([
      { weight: 2, score: 80, maxScore: 100 },
      { weight: 1, score: 40, maxScore: 100 },
    ])
    // achieved = 2*80 + 1*40 = 200 ; max = 2*100 + 1*100 = 300 ; pct = 66.67
    expect(r.pct).toBeCloseTo(66.67, 1); expect(r.achieved).toBe(200); expect(r.max).toBe(300)
  })
  it('handles empty / null scores', () => {
    expect(computeAssessmentScore([]).pct).toBe(0)
    expect(computeAssessmentScore([{ weight: 1, score: null, maxScore: 100 }]).pct).toBe(0)
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (PURE):
```ts
export type ScoreRow = { weight: number; score: number | null; maxScore: number }
export function computeAssessmentScore(rows: ScoreRow[]): { achieved: number; max: number; pct: number } {
  let achieved = 0, max = 0
  for (const r of rows) {
    const w = r.weight > 0 ? r.weight : 0
    max += w * r.maxScore
    if (r.score != null) achieved += w * Math.max(0, Math.min(r.score, r.maxScore))
  }
  return { achieved, max, pct: max > 0 ? (achieved / max) * 100 : 0 }
}
```
- [ ] **Step 4:** Run → PASS + tsc. Commit `feat(pm): scored assessment computation (pure)`.

---

## Task 4: `lib/pm/obligations-gen.ts` — snapshot generation (pure)

**Files:** Create `src/lib/pm/obligations-gen.ts`; Test `tests/pm-obligations-gen.test.ts`.

- [ ] **Step 1:** Failing test:
```ts
import { describe, it, expect } from 'vitest'
import { buildObligationRows, buildCriterionScoreRows } from '@/lib/pm/obligations-gen'
describe('obligations generation', () => {
  it('maps forms→DOCUMENTS, deliverables→EXPENSES_DELIVERABLES with sourceId + stage', () => {
    const rows = buildObligationRows({
      requiredForms: [{ id: 'f1', name: 'Ε3', mandatory: true }],
      deliverables: [{ id: 'd1', name: 'Έκθεση', mandatory: true }],
    })
    expect(rows.find(r => r.sourceId === 'f1')).toMatchObject({ kind: 'FORM', stage: 'DOCUMENTS', name: 'Ε3' })
    expect(rows.find(r => r.sourceId === 'd1')).toMatchObject({ kind: 'DELIVERABLE', stage: 'EXPENSES_DELIVERABLES' })
  })
  it('criterion score rows carry weight snapshot', () => {
    const s = buildCriterionScoreRows([{ id: 'c1', name: 'Κριτήριο', weight: 2 }])
    expect(s[0]).toMatchObject({ criterionId: 'c1', name: 'Κριτήριο', weight: 2, maxScore: 100 })
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (PURE): `buildObligationRows({ requiredForms, deliverables })` → `{ kind, stage, sourceId, name, mandatory, order }[]` (forms→FORM/DOCUMENTS, deliverables→DELIVERABLE/EXPENSES_DELIVERABLES; `order` = running index). `buildCriterionScoreRows(criteria)` → `{ criterionId, name, weight: weight ?? 1, maxScore: 100, order }[]`. Both pure; the server merges idempotently by `sourceId`/`criterionId`.
- [ ] **Step 4:** Run → PASS + tsc. Commit `feat(pm): pure obligation + criterion-score snapshot builders`.

---

## Task 5: `lib/pm/scoping.ts` — access scoping (pure)

**Files:** Create `src/lib/pm/scoping.ts`; Test `tests/pm-scoping.test.ts`.

- [ ] **Step 1:** Failing test:
```ts
import { describe, it, expect } from 'vitest'
import { visibleApplicationWhere } from '@/lib/pm/scoping'
describe('visibleApplicationWhere', () => {
  it('admin (pm.manage) sees all', () => {
    expect(visibleApplicationWhere({ id: 'u1', permissions: ['pm.manage'] })).toEqual({})
  })
  it('assigned-only otherwise', () => {
    expect(visibleApplicationWhere({ id: 'u1', permissions: ['pm.work'] })).toEqual({ OR: [{ managerId: 'u1' }, { processorId: 'u1' }] })
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (PURE): `visibleApplicationWhere(user: { id: string; permissions: string[] })` → `user.permissions.includes('pm.manage') ? {} : { OR: [{ managerId: user.id }, { processorId: user.id }] }`.
- [ ] **Step 4:** Run → PASS + tsc. Commit `feat(pm): application access-scoping predicate (pure)`.

---

## Task 6: Server actions — assign + generate + assessment + read (scoped)

**Files:** Create `src/lib/pm/actions.ts` (`'use server'`); Test `tests/pm-actions-guard.test.ts`.

> Mirror `src/lib/programs/actions.ts` gating + the actions-test mock convention (mock rbac-server/next-cache/prisma/bunny).

- [ ] **Step 1:** Implement (all gated; reads use `visibleApplicationWhere` + a `pm.work` OR `pm.manage` gate — a helper `requirePmAccess()` that `requirePermission`-checks the user has `pm.work` or `pm.manage`, returns session):
  - `getApplication(applicationId)` → application + program title + trdr name + counts, ENFORCING scoping (`findFirst({ where: { id, ...visibleApplicationWhere(user) } })` → `notFound()` if null).
  - `assignApplication(applicationId, { managerId, processorId })` → gated `pm.manage`; update.
  - `listInternalUsers()` → `{ id, name, email }[]` (users whose role is internal, e.g. NOT CUSTOMER/SUPPLIER/ARCHITECT — filter by role name); gated `pm.manage`. For the assign picker.
  - `generateObligations(applicationId)` → load application→program (include criteria/deliverables/requiredForms); `buildObligationRows` + `buildCriterionScoreRows`; upsert idempotently (skip existing by sourceId/criterionId); create missing. Returns `{ added }`.
  - `listCriterionScores(applicationId)` / `saveCriterionScore(scoreId, { score, note })` / `recomputeAssessment(applicationId)` (uses `computeAssessmentScore` over the scores → sets assessmentScore/max) / `setAssessmentVerdict(applicationId, verdict)`.
- [ ] **Step 2:** Guard test asserting the exported action names are functions (mirror `tests/programs-actions-guard.test.ts` mocking).
- [ ] **Step 3:** `npx vitest run tests/pm-actions-guard.test.ts && npx tsc --noEmit`. Commit `feat(pm): actions — assign + scoped read + generate + assessment`.

---

## Task 7: Server actions — obligations CRUD + documents + stage + opske

**Files:** Modify `src/lib/pm/actions.ts`; Create `src/lib/pm/doc-prep.ts` (pure) + Test `tests/pm-doc-prep.test.ts`.

- [ ] **Step 1:** Pure `doc-prep.ts` test: `applicationDocKey(applicationId, ext) → 'pm/{applicationId}/{something}.{ext}'` shape (assert prefix + ext). Implement `applicationDocKey(applicationId, ext)` returning `pm/${applicationId}/${crypto.randomUUID?}...` — actually keep it pure by taking an id arg: `applicationDocKey(applicationId, id, ext)`.
- [ ] **Step 2:** Append actions (all gated pm access + scoped to a visible application):
  - `listObligations(applicationId)` (grouped-ready flat list). `addObligation(applicationId, { stage, name, mandatory?, kind? })`. `updateObligation(id, { status?, dueDate?, assigneeId?, notes? })`. `removeObligation(id)`. `waiveObligation(id)`.
  - `uploadApplicationDocument(applicationId, obligationId | null, { name, base64, mimeType, ext })` → `bunnyUploadPrivate({ key: applicationDocKey(applicationId, crypto.randomUUID(), ext), body: Buffer.from(base64,'base64'), contentType: mimeType })` → create `ApplicationDocument`. `listApplicationDocuments(applicationId)`. `removeApplicationDocument(id)`.
  - `setApplicationStage(applicationId, stage)` (returns `{ pendingMandatory }` count for a warning). `updateOpske(applicationId, { opskeStatus?, opskeRef?, opskeSubmittedAt? })`.
  All enforce the application is visible to the user (via `getApplication`-style scoped fetch first).
- [ ] **Step 3:** `npx vitest run tests/pm-doc-prep.test.ts && npx tsc --noEmit`. Commit `feat(pm): obligations CRUD + document upload + stage + opske actions`.

---

## Task 8: Document download route (gated + scoped)

**Files:** Create `src/app/(app)/programs/[id]/applications/[appId]/documents/[docId]/route.ts`.

- [ ] Read the Next route-handler doc. GET: `requirePermission('pm.work')` (or pm.manage), load the `ApplicationDocument` by id, verify its application is visible to the user (`visibleApplicationWhere`), `bunnyDownload(storageKey)`, stream with Content-Type from mimeType + `Content-Disposition: attachment; filename="{name}"`, `Cache-Control: private, no-store`. 404/403 otherwise.
- [ ] `npx tsc --noEmit`. Commit `feat(pm): gated+scoped application-document download route`.

---

## Task 9: Registry object «Έργα» + permissions

**Files:** Modify `src/lib/objects.ts`, `src/lib/permissions.ts`; Test `tests/pm-registry.test.ts`.

- [ ] Add to `OBJECT_REGISTRY` (in the «Ευρωπαϊκά Προγράμματα» module, or its own): `{ key:'pm', href:'/pm', label:'Έργα', icon: <a lucide e.g. FolderKanban>, menuPermission:'pm.work', permissions:[{key:'pm.manage', description:'Διαχείριση & αναθέσεις έργων'},{key:'pm.work', description:'Εργασία σε ανατεθειμένα έργα'}] }`. (The `/pm` list page is C2b; for C2a.1 add a minimal `src/app/(app)/pm/page.tsx` that lists the user's visible applications with a link to each hub — or redirect; a simple list is enough.)
- [ ] `PERMISSION_GROUP_LABELS`: `pm: 'Ευρωπαϊκά Προγράμματα'`. `ROLE_DEFAULTS`: ensure `pm.work` is in MANAGER + EMPLOYEE defaults (add it); `pm.manage`+`pm.work` come to SUPER_ADMIN/ADMIN via `ALL`.
- [ ] Test (mirror programs-registry) + run FULL suite, UPDATE the permission-derivation tests (`tests/objects.test.ts` EXPECTED_KEYS +2 keys; `tests/permissions.test.ts` group count/labels — `pm.*` maps to the existing «Ευρωπαϊκά Προγράμματα» group so NO new group is added, but MANAGER/EMPLOYEE default lists changed if any test asserts them).
- [ ] `npx vitest run && npx tsc --noEmit`. Commit `feat(pm): register «Έργα» object + pm.manage/pm.work permissions`.

---

## Task 10: Application hub page + shell (tabs + stepper + assignment)

**Files:** Create `src/app/(app)/programs/[id]/applications/[appId]/page.tsx` (RSC), `src/components/pm/application-hub.tsx`, `src/components/pm/assign-application-dialog.tsx`, `src/app/(app)/pm/page.tsx` (minimal list).

- [ ] `[appId]/page.tsx`: `requirePermission('pm.work')`; `getApplication(appId)` (scoped → notFound if not visible); pass serializable data to `<ApplicationHub/>`. Breadcrumb.
- [ ] `application-hub.tsx`: header (πελάτης + πρόγραμμα, **stage stepper** using `STAGE_ORDER`/`stageLabel` with the active stage highlighted + a stage `<select>`/next-button calling `setApplicationStage`), manager/processor chips + «Ανάθεση» (opens `AssignApplicationDialog`, visible only if the user has `pm.manage` — pass a `canManage` bool from the page). A simple tab bar (`useState`) with tabs: Αξιολόγηση, Υποχρεώσεις & Δικαιολογητικά, Δαπάνες, Παραδοτέα, ΟΠΣΚΕ. Each tab renders its component (Tasks 11–12; stub the ones not built yet as «(σε εξέλιξη)» then fill).
- [ ] `assign-application-dialog.tsx`: base-ui Dialog, two selects (manager, processor) populated by `listInternalUsers()`, «Αποθήκευση» → `assignApplication`.
- [ ] `pm/page.tsx`: RSC `requirePermission('pm.work')`, list the user's visible applications (a new gated `listVisibleApplications()` action → scoped) with πελάτης/πρόγραμμα/στάδιο + link to hub. (Full board = C2b.)
- [ ] `npx tsc --noEmit && npm run build`. Commit `feat(pm-ui): application hub (stepper + tabs + assignment) + minimal /pm list`.

---

## Task 11: Assessment tab (UI)

**Files:** Create `src/components/pm/assessment-tab.tsx`.

- [ ] `'use client'`, props `{ applicationId, canManage }`. Load `listCriterionScores(applicationId)`. Table: κριτήριο (name), βάρος, βαθμός (number input 0–maxScore, save on blur via `saveCriterionScore`), σημείωση. Footer: «Υπολογισμός» → `recomputeAssessment` → show `assessmentScore`% + a verdict badge; a verdict `<select>` (ΕΝΤΑΣΣΕΤΑΙ/ΔΕΝ ΕΝΤΑΣΣΕΤΑΙ/ΕΚΚΡΕΜΕΙ) → `setAssessmentVerdict`. If no scores, a «Δημιουργία από κριτήρια προγράμματος» button → `generateObligations` (which also creates score rows). Greek.
- [ ] `npx tsc --noEmit && npm run build`. Commit `feat(pm-ui): scored assessment tab`.

---

## Task 12: Obligations & documents tab (UI)

**Files:** Create `src/components/pm/obligations-tab.tsx`, `src/components/pm/application-documents.tsx`.

- [ ] `obligations-tab.tsx` `'use client'` props `{ applicationId, canManage }`: load `listObligations`. Group by `stage` (using `STAGE_ORDER`); each obligation row: name, mandatory badge, status `<select>` (`updateObligation`), προθεσμία (date input), assignee `<select>` (from `listInternalUsers`), σημείωση, and an inline `<ApplicationDocuments obligationId=.../>` (upload + list). «+ Υποχρέωση» (addObligation), «Συγχρονισμός από πρόγραμμα» (`generateObligations` → refresh), waive/remove actions. Real progress on sync.
- [ ] `application-documents.tsx` `'use client'` props `{ applicationId, obligationId? }`: load `listApplicationDocuments` (filter by obligationId if given). Upload: file input → base64 (chunked encoder like `new-program-dialog`) → `uploadApplicationDocument`. Each doc: name + download link (`/programs/{pid}/applications/{appId}/documents/{docId}` — thread the ids via props) + remove. Greek.
- [ ] `npx tsc --noEmit && npm run build`. Commit `feat(pm-ui): obligations tab + application documents (upload/download)`.

---

## Task 13: ΟΠΣΚΕ tab + Δαπάνες tab (reuse C3) + Trdr «Έργα» tab

**Files:** Create `src/components/pm/opske-tab.tsx`, `src/components/pm/trdr-applications-tab.tsx`; modify `application-hub.tsx` (wire real tabs) + `src/app/(app)/partners/[id]/page.tsx`.

- [ ] `opske-tab.tsx`: form (opskeStatus/opskeRef/opskeSubmittedAt) → `updateOpske` + «Αποθήκευση».
- [ ] «Δαπάνες» tab: reuse the existing `src/components/programs/expense-list.tsx` (C3) — it takes `applicationId` + the program's categories; render it in the hub's Δαπάνες tab (fetch categories via the existing `getProgramExpenseCategories`). «Παραδοτέα» tab: show the DELIVERABLE-kind obligations (a filtered view of obligations-tab, or reuse it filtered to stage EXPENSES_DELIVERABLES) — simplest: the Παραδοτέα tab renders `<ObligationsTab>` filtered, OR a read-only list of deliverable obligations. Keep minimal.
- [ ] `trdr-applications-tab.tsx` `'use client'` props `{ trdrId }`: a new gated action `listTrdrApplications(trdrId)` (scoped) → the customer's applications (πρόγραμμα title, στάδιο, verdict, manager name) + link to each hub. Add it as a stacked «Έργα» panel on `partners/[id]/page.tsx` (mirror the tax `FinancialsTab` placement).
- [ ] `npx tsc --noEmit && npm run build`. Commit `feat(pm-ui): ΟΠΣΚΕ + Δαπάνες tabs + «Έργα» tab on partner card`.

---

## Task 14: e2e (create app → hub → assign → obligation)

**Files:** Create `e2e/program-pm.spec.ts`.

- [ ] Mirror `e2e/programs.spec.ts` auth + the known `:3000` footgun handling. Real steps where reachable (login pm.manage, open a program, link an application, open the hub, assert the stepper + tabs render). Deeper steps (DeepSeek/uploads) `test.skip` with reasons. Run or `--list`; DONE_WITH_CONCERNS if the env blocks login (prove via `login.spec.ts`).
- [ ] Commit `test(pm): e2e application hub happy path`.

---

## Final verification
- [ ] `npx vitest run` → all pass. `npx tsc --noEmit` → clean. `npm run build` → succeeds.
- [ ] **Coordinator runs `npm run db:sync-permissions`** after merge (grants pm.manage/pm.work) + reminds user to re-login.
- [ ] Manual smoke: from a program, link a company → open the έργο hub → generate obligations → score the assessment → set a stage → upload a δικαιολογητικό → see it on the Trdr «Έργα» tab.

## Notes for the executor
- **Scoping is security-critical**: EVERY read/list/mutation must confirm the target application is visible to the user (`visibleApplicationWhere`) — never trust `applicationId` alone.
- **Isomorphic**: `types/assessment/obligations-gen/scoping/doc-prep` must not import prisma/react.
- **Deferred to C2a.2** (NOT this plan): `ProgramExpense.status/replaces*`, `ProgramExpenseCertification`, budget-compliance engine + expense substitution UI, certification tab.
- **Permissions**: after Task 9, `npm run db:sync-permissions` is required for the menu + access to work.
