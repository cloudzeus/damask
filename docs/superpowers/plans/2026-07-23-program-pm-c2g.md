# C2g — Phased Deliverables · Dependency DAG · Gantt · Annex Extraction — Implementation Plan (FULL PACKAGE)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Generalise certification into a phased, multi-file deliverables system per expense per customer (9-phase lifecycle), with an explicit dependency DAG (server-enforced gating), a Gantt of linked tasks, and DeepSeek extraction of the «ΠΑΡΑΡΤΗΜΑ ΠΑΡΑΔΟΤΕΑ ΠΙΣΤΟΠΟΙΗΣΗΣ» annex + matching against older programs' templates.

**Spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2g-deliverables-design.md` — READ IT FIRST for every task.

**Stages:** A = C2g.1 (T1–T9: model+absorption+gating+UI+C2d link) · B = C2g.2 (T10–T11: Gantt) · C = C2g.3 (T12–T13: extraction+matching) · T14 final review.

**Ground rules (from 7 prior PM merges — non-negotiable):**
- Tests in `tests/`. Prisma 7.8 multi-line enums; NEVER run `prisma format` (hand-edit); after migrate `git diff prisma/schema.prisma` → revert unrelated reformatting. `prisma migrate dev` may need TTY confirm (`yes |`).
- Pure lib files: NO prisma/react/clock (`todayMs`/`nowMs` passed in).
- EVERY application-scoped action → `requireVisibleApplication` (child rows load parent app first). Template CRUD → `requirePermission('programs.manage')`. **Gating/verified/dependency invariants enforced IN THE ACTION, never only in UI** (C2a.2 CRITICAL lesson). Public (C2d) fns re-derive ids from token record.
- `bunnyUploadPrivate({ key, body, contentType })` (object arg), `bunnyDownload(key)`.
- Don't stage `.planning/HANDOFF.json`/`vitest.config.ts`. Ambient tsc `RouteContext` error may appear — ignore, add none.
- base-ui Select forbids empty-string values. Greek UI, Steel & Frost, existing classes.

**Verified integration points:**
- `ProgramExpenseCertification` (C2a.2): `photoKey/bankStatementKey/newUnusedCertKey` (absorb → files), scalars serial/location/assetRegistryRef(+Date)/paid/verified/verifiedById stay. `upsertCertification` in `src/lib/pm/actions.ts` computes `verified = desired && certificationComplete(merged)` via `src/lib/pm/cert-prep.ts` — this recomputation gets rebuilt over deliverables (T6). C2f `expenseEligibleForPayment` reads `certification.verified` — MUST stay untouched.
- `certification-tab.tsx` uses `listCertifications/upsertCertification/uploadCertificationFile` + `CertificationItem` — reworked in T8.
- Extraction: `src/lib/programs/extract-prompt.ts` (JSON schema block ~line 155-180), `src/lib/programs/types.ts` `ExtractedProgram`, `src/lib/programs/persist-map.ts` `RelatedRows` + mapping, persist transaction in `src/lib/programs/persist.ts`. Add `deliverableTemplates[]` alongside `deliverables[]` (keep old field working).
- C2d: `DocumentRequest` model + `submitDocumentUpload` in `src/lib/pm/portal-public.ts` (creates/updates `ApplicationDocument`) — T9 adds optional `deliverableId` targeting.
- `application-hub.tsx` TabKey/TABS pattern; `program-editor.tsx` TabKey/TABS pattern (add tabs).
- dnd/dialog/upload idioms: `task-templates-tab.tsx`, `certification-tab.tsx`, `application-documents.tsx`.

---

## STAGE A — C2g.1

### Task 1: Schema + absorption migration

**Files:** `prisma/schema.prisma`; migration `program_pm_c2g` + a follow-up data migration `program_pm_c2g_absorb`; Test `tests/pm-schema-c2g.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-schema-c2g.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Prisma, DeliverablePhase, DeliverableStatus, DeliverableScope } from '@prisma/client'
describe('C2g schema', () => {
  it('DeliverablePhase has the 9 phases', () => {
    expect(Object.values(DeliverablePhase).sort()).toEqual(['APPROVAL', 'ASSESSMENT', 'AUTHORITY_AUDIT', 'FINAL_PAYMENT', 'FIRST_PAYMENT', 'FULL_CERTIFICATION', 'MODIFICATION', 'PHASE_A_CERTIFICATION', 'SUBMISSION'])
  })
  it('DeliverableStatus + DeliverableScope', () => {
    expect(Object.values(DeliverableStatus).sort()).toEqual(['ACCEPTED', 'PENDING', 'REJECTED', 'UPLOADED', 'WAIVED'])
    expect(Object.values(DeliverableScope).sort()).toEqual(['APPLICATION', 'EXPENSE'])
  })
  for (const [model, fields] of [
    ['ProgramDeliverableTemplate', ['programId', 'phase', 'name', 'mandatory', 'onSiteVerification', 'appliesTo', 'order', 'active', 'sourceTemplateId']],
    ['ExpenseDeliverable', ['applicationId', 'expenseId', 'templateId', 'phase', 'name', 'mandatory', 'onSiteVerification', 'status', 'acceptedById', 'order']],
    ['DeliverableFile', ['deliverableId', 'name', 'storageKey', 'mimeType', 'size', 'uploadedById']],
    ['DeliverableDependency', ['dependentId', 'prerequisiteId', 'auto']],
  ] as const) {
    it(`${model} fields`, () => {
      const m = Prisma.dmmf.datamodel.models.find(x => x.name === model)!
      const f = new Set(m.fields.map(x => x.name))
      for (const k of fields) expect(f.has(k), `${model}.${k}`).toBe(true)
    })
  }
  it('DocumentRequest has deliverableId', () => {
    const m = Prisma.dmmf.datamodel.models.find(x => x.name === 'DocumentRequest')!
    expect(m.fields.some(x => x.name === 'deliverableId')).toBe(true)
  })
})
```
Run `npm test -- pm-schema-c2g` → FAIL.

- [ ] **Step 2: Edit schema** (hand-edit; enums multi-line). Add the three enums + four models exactly per spec §2/§3:
```prisma
enum DeliverablePhase {
  ASSESSMENT
  SUBMISSION
  APPROVAL
  FIRST_PAYMENT
  PHASE_A_CERTIFICATION
  MODIFICATION
  FINAL_PAYMENT
  FULL_CERTIFICATION
  AUTHORITY_AUDIT
}
enum DeliverableStatus {
  PENDING
  UPLOADED
  ACCEPTED
  REJECTED
  WAIVED
}
enum DeliverableScope {
  EXPENSE
  APPLICATION
}

model ProgramDeliverableTemplate {
  id                 String           @id @default(cuid())
  programId          String
  program            Program          @relation(fields: [programId], references: [id], onDelete: Cascade)
  phase              DeliverablePhase
  name               String
  description        String?
  mandatory          Boolean          @default(true)
  onSiteVerification Boolean          @default(false)
  appliesTo          DeliverableScope @default(EXPENSE)
  order              Int              @default(0)
  active             Boolean          @default(true)
  sourceTemplateId   String?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt
  instances          ExpenseDeliverable[]

  @@index([programId])
  @@index([programId, phase])
}

model ExpenseDeliverable {
  id                 String            @id @default(cuid())
  applicationId      String
  application        ProgramApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  expenseId          String?
  expense            ProgramExpense?   @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  templateId         String?
  template           ProgramDeliverableTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  phase              DeliverablePhase
  name               String
  mandatory          Boolean           @default(true)
  onSiteVerification Boolean           @default(false)
  status             DeliverableStatus @default(PENDING)
  acceptedById       String?
  acceptedAt         DateTime?
  notes              String?
  order              Int               @default(0)
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  files              DeliverableFile[]
  dependencies       DeliverableDependency[] @relation("Dependent")
  dependents         DeliverableDependency[] @relation("Prerequisite")
  documentRequests   DocumentRequest[]

  @@unique([applicationId, expenseId, templateId])
  @@index([applicationId])
  @@index([expenseId])
  @@index([applicationId, phase])
}

model DeliverableFile {
  id            String   @id @default(cuid())
  deliverableId String
  deliverable   ExpenseDeliverable @relation(fields: [deliverableId], references: [id], onDelete: Cascade)
  name          String
  storageKey    String
  mimeType      String?
  size          Int?
  uploadedById  String?
  uploadedAt    DateTime @default(now())

  @@index([deliverableId])
}

model DeliverableDependency {
  id             String  @id @default(cuid())
  dependentId    String
  dependent      ExpenseDeliverable @relation("Dependent", fields: [dependentId], references: [id], onDelete: Cascade)
  prerequisiteId String
  prerequisite   ExpenseDeliverable @relation("Prerequisite", fields: [prerequisiteId], references: [id], onDelete: Cascade)
  auto           Boolean @default(true)

  @@unique([dependentId, prerequisiteId])
  @@index([prerequisiteId])
}
```
Back-relations: `Program.deliverableTemplates ProgramDeliverableTemplate[]`, `ProgramApplication.expenseDeliverables ExpenseDeliverable[]`, `ProgramExpense.deliverables ExpenseDeliverable[]`. In `model DocumentRequest` add: `deliverableId String?` + `deliverable ExpenseDeliverable? @relation(fields: [deliverableId], references: [id], onDelete: SetNull)` + `@@index([deliverableId])`.
> NOTE the `@@unique([applicationId, expenseId, templateId])` — Postgres treats NULLs as distinct, so application-level rows (expenseId NULL) can duplicate per template on re-materialization. The materializer (T4) MUST therefore check-before-insert by (applicationId, templateId, expenseId-null-safe) in code, not rely on the constraint alone. Keep the constraint anyway (guards the expense-scoped path).

- [ ] **Step 3: Migrate + absorption.** `npx prisma migrate dev --name program_pm_c2g` + `npx prisma generate`; revert unrelated reformatting. Then create an ABSORPTION data migration: `mkdir prisma/migrations/<ts>_program_pm_c2g_absorb` with hand-written `migration.sql` that, for each `ProgramExpenseCertification` row having a non-null key, inserts an `ExpenseDeliverable` (+ one `DeliverableFile` with the existing bunny key) — phases: photoKey→`FULL_CERTIFICATION` («Φωτογραφία φυσικού αντικειμένου»), bankStatementKey→`FINAL_PAYMENT` («Εξτρέ τράπεζας»), newUnusedCertKey→`FULL_CERTIFICATION` («Βεβαίωση καινούργιου & αμεταχείριστου»), status `UPLOADED`, `templateId NULL`, cuid-like ids via `gen_random_uuid()::text`. Apply with `npx prisma migrate dev` (it picks up the folder) or `npx prisma migrate deploy` — verify with a psql count. (If `gen_random_uuid` unavailable, `md5(random()::text || clock_timestamp()::text)` is acceptable for these ids.)
- [ ] **Step 4:** `npm test -- pm-schema-c2g` → PASS; `npx tsc --noEmit` → only known error. Commit → `feat(pm): C2g schema — phased deliverables + dependency DAG + C2a.2 absorption`.

### Task 2: PURE `src/lib/pm/deliverable-phases.ts`

**Files:** create it; Test `tests/pm-deliverable-phases.test.ts`.

- [ ] **Step 1: Failing test** covering: `DELIVERABLE_PHASE_ORDER` (9, spec order), `deliverablePhaseLabel` Greek labels, `OPTIONAL_PHASES` = FIRST_PAYMENT/MODIFICATION, `APPLICATION_LEVEL_PHASES` = ASSESSMENT/APPROVAL/AUTHORITY_AUDIT, `effectivePhases(usedOptional: DeliverablePhaseStr[])` (drops unused optional, keeps order), `previousEffectivePhase(phase, used)` (SUBMISSION→ASSESSMENT; FINAL_PAYMENT→PHASE_A_CERTIFICATION όταν δεν χρησιμοποιείται MODIFICATION, αλλιώς MODIFICATION), `buildAutoDependencyPairs(items)` — given materialized items `{id, phase, expenseId, mandatory}` returns `{dependentId, prerequisiteId}[]`: each item of phase N depends on all **mandatory** items of the previous effective phase with the SAME expenseId, or on application-level items of that phase when the previous phase is application-level (cross link); `hasCycle(edges)` detects a cycle; `deliverableBlocked(deliverableId, edges, statusById)` → true if any prerequisite not ACCEPTED/WAIVED; `verifiedFromDeliverables(items)` → all mandatory of PHASE_A_CERTIFICATION+FULL_CERTIFICATION (that exist) are ACCEPTED.
- [ ] **Step 2: Implement** (pure, type-only imports; export `DeliverablePhaseStr`, `DeliverableStatusStr` string-union types mirroring the enums). Deterministic; no clock.
- [ ] **Step 3:** tests PASS; tsc; commit → `feat(pm): C2g pure — phase order, auto-DAG builder, cycle guard, gating + verified predicates`.

### Task 3: Actions — template CRUD + copy-from-program

**Files:** `src/lib/pm/actions.ts`; Test `tests/pm-c2g-templates-guard.test.ts`.

- [ ] Guard test (mirror `pm-task-templates-guard`): `listDeliverableTemplates(programId)`, `createDeliverableTemplate`, `updateDeliverableTemplate`, `deleteDeliverableTemplate`, `reorderDeliverableTemplates(programId, phase, orderedIds)`, `listDeliverableTemplateLibrary()` (all programs' templates grouped for reuse), `copyDeliverableTemplates(programId, templateIds)` (copies with `sourceTemplateId`) — ALL gated `requirePermission('programs.manage')`. Implement mirroring the C2e `ProgramTaskTemplate` CRUD exactly (max order+1 per phase, trim/validate, revalidatePath `/programs/${programId}`). Commit → `feat(pm): C2g actions — deliverable template CRUD + library copy`.

### Task 4: Actions — materialization + auto-DAG

**Files:** `src/lib/pm/actions.ts`; Test `tests/pm-c2g-materialize.test.ts`.

- [ ] `generateExpenseDeliverables(applicationId)` (pm-scoped via `requireVisibleApplication`): loads program's active templates + the application's ACTIVE expenses + existing `ExpenseDeliverable`s. Materializes: EXPENSE-scoped template × each ACTIVE expense; APPLICATION-scoped template × once (expenseId null). **Idempotent in code**: skip when a row with same (applicationId, templateId, expenseId-or-null) exists (NULL-safe check — see T1 note). After inserting, rebuild AUTO dependency edges: compute `buildAutoDependencyPairs` over ALL the app's deliverables, delete existing `auto:true` edges for the app, `createMany` the fresh pairs (`skipDuplicates`), never touching `auto:false` manual edges. Returns counts. **Auto-trigger**: call it (try/catch non-fatal, C2e idiom) from expense creation (`createExpense`/`addExpense` in `src/lib/programs/actions.ts` — find the actual name), from `replaceExpense` (new expense needs its deliverables; also its MODIFICATION-phase items), and from `createApplication` enrollment (after generateObligations). Test with hoisted prisma mocks: materializes expense×template, app-level once, idempotent second run adds 0, auto edges rebuilt. Commit → `feat(pm): C2g — deliverable materialization + auto dependency DAG (idempotent, non-fatal triggers)`.

### Task 5: Actions — instance ops + files + gating + manual deps + download route

**Files:** `src/lib/pm/actions.ts`; route `src/app/(app)/programs/[id]/applications/[appId]/deliverables/[fileId]/route.ts`; Tests `tests/pm-c2g-instance-guard.test.ts`, `tests/pm-c2g-gating.test.ts`.

- [ ] Implement (all via a `requireVisibleDeliverable(deliverableId)` helper → loads row → `requireVisibleApplication`):
  - `listApplicationDeliverables(applicationId)` → matrix DTO: per deliverable `{id, expenseId, phase, name, mandatory, onSiteVerification, status, files:{id,name,size}[], blocked:boolean, blockingNames:string[]}` — `blocked` computed server-side via edges+statuses (pure `deliverableBlocked`).
  - `uploadDeliverableFileAction(deliverableId, {filename, base64, mimeType})` — **gating check first** (blocked → throw «Προηγούμενο παραδοτέο εκκρεμεί: …»); size cap 8MB (align C2d); key `pm/{applicationId}/deliverables/{deliverableId}/{fileId}.{ext}` (ext sanitised); bunny private; create `DeliverableFile`; if status PENDING/REJECTED → set UPLOADED.
  - `removeDeliverableFile(fileId)` (loads file→deliverable→app; delete row; bunny object left orphaned — acceptable, note it).
  - `setDeliverableStatus(deliverableId, status, note?)` — ACCEPTED requires ≥1 file (unless WAIVED path); **ACCEPTED/UPLOADED blocked while `deliverableBlocked`** (server-enforced); ACCEPTED stamps acceptedById/At; REJECTED requires note; WAIVED allowed by pm.manage only (try `requirePermission('pm.manage')` for that transition).
  - `addDeliverableDependency(dependentId, prerequisiteId)` / `removeDeliverableDependency(id)` — same application only, `auto:false`, **cycle guard** via pure `hasCycle` over existing+new edge (throw «Η εξάρτηση δημιουργεί κύκλο.»).
  - Download route mirrors the documents route (pm.manage-or-assigned scope, bunnyDownload stream, 404/403 posture).
- [ ] `pm-c2g-gating.test.ts` (security-critical): blocked deliverable → upload throws AND setDeliverableStatus(ACCEPTED) throws (prereq PENDING); prereq ACCEPTED → allowed; cycle add → throws; guard test covers all new actions reject without permission. Commit → `feat(pm): C2g actions — deliverable files + server-enforced gating + manual dependencies`.

### Task 6: Rework `verified` over deliverables (C2f untouched)

**Files:** `src/lib/pm/actions.ts` (`upsertCertification`, `listCertifications`), `src/lib/pm/cert-prep.ts`; Test: extend `tests/pm-cert-verified-guard.test.ts`.

- [ ] `certificationComplete` gains a deliverables-aware variant: `certificationCompleteV2(scalars, deliverables)` = scalars (identified + registry + paid) AND `verifiedFromDeliverables(deliverables)`. `upsertCertification` recomputation now loads the expense's deliverables and uses V2 (keeps `verified = desired && complete` on EVERY write — do NOT weaken the C2a.2 fix). `listCertifications.complete` uses V2. Old per-key checks (photoKey etc.) drop out of the predicate (files migrated in T1). **Do not touch** `src/lib/pm/payment.ts` / `expenseEligibleForPayment` / C2f actions. Extend the verified-guard test: incomplete deliverables → verified forced false; all mandatory cert-phase deliverables ACCEPTED + scalars → true. Commit → `feat(pm): C2g — verified derives from deliverable completeness (C2f eligibility unchanged)`.

### Task 7: UI — program tab «Παραδοτέα ανά Φάση»

**Files:** `src/components/programs/deliverable-templates-tab.tsx` (new) + `program-editor.tsx` wiring.

- [ ] Mirror `task-templates-tab.tsx` EXACTLY (it's the proven pattern): 9 phase columns (`DELIVERABLE_PHASE_ORDER` + Greek labels, optional phases marked «προαιρετική»), per-column ordered template list, add/edit dialog (name, description, mandatory Switch, onSiteVerification Switch «Επιτόπια επαλήθευση», appliesTo Select ΔΑΠΑΝΗ/ΕΡΓΟ), dnd reorder per phase, active toggle, delete. Plus a «Βιβλιοθήκη» dialog: `listDeliverableTemplateLibrary()` grouped by program → checkbox pick → `copyDeliverableTemplates`. Wire TabKey `'deliverableTemplates'` label «Παραδοτέα ανά Φάση» after «Βήματα Διαχείρισης». tsc+build+tests. Commit → `feat(pm): C2g UI — Παραδοτέα ανά Φάση template editor + βιβλιοθήκη`.

### Task 8: UI — «Φάκελος δαπάνης» (rework certification tab)

**Files:** `src/components/pm/deliverables-matrix-tab.tsx` (new); `application-hub.tsx` (replace the `certification` tab render with the new component, label «Φάκελος & Πιστοποίηση»); keep `certification-tab.tsx` file (scalars form gets embedded/reused).

- [ ] `DeliverablesMatrixTab({ applicationId, programId })`: fetch `listApplicationDeliverables` + `listCertifications`. Top: «Έργο» row (application-level deliverables per phase) then one row per ACTIVE expense. Cells = phase chips με progress (`x/y` accepted/mandatory, χρώμα: γκρι PENDING / info UPLOADED / πράσινο complete / coral REJECTED-or-blocked). Expand row → per-phase deliverable list: files (download links → the T5 route, remove), multi-upload input (base64 idiom), status actions (Αποδοχή/Απόρριψη+note/Απαλλαγή), blocked rows disabled με tooltip «Περιμένει: {blockingNames}», manual dependency add (small select of other deliverables) — plus the certification scalars block (serial/location/registry/paid/verified switch) reusing the existing persist calls. «Ανανέωση παραδοτέων» button → `generateExpenseDeliverables`. tsc+build+tests. Commit → `feat(pm): C2g UI — Φάκελος δαπάνης (matrix δαπανών × φάσεων + gating)`.

### Task 9: C2d magic-link → deliverable targeting

**Files:** `src/lib/pm/actions.ts` (`createDocumentRequest` gains `deliverableId?` — validate belongs to app), `src/lib/pm/portal-public.ts` (`submitDocumentUpload`: when the request has `deliverableId`, ALSO create a `DeliverableFile` on it (key reuse) + set that deliverable UPLOADED — ids from the record only), UI: «Ζήτησε από πελάτη» button per deliverable in the matrix (prefills title=deliverable name, passes deliverableId). Extend `tests/pm-portal-public.test.ts`: request with deliverableId → DeliverableFile created on THAT deliverable (record-derived), without deliverableId → unchanged behaviour. Commit → `feat(pm): C2g — magic-link αίτημα στοχεύει συγκεκριμένο παραδοτέο`.

---

## STAGE B — C2g.2 Gantt

### Task 10: PURE `src/lib/pm/gantt.ts`

- [ ] Test + implement: `topoSort(nodes, edges)` (stable, throws/flags on cycle), `criticalPath(nodes, edges)` (longest chain of ids), `buildGanttModel(deliverables, edges, todayMs)` → `{ lanes: [{key, label(expense/Έργο), segments: [{phase, status, startMs|null, endMs|null, deliverableIds}]}], arrows: [{fromSeg, toSeg}] , critical: Set<id> }` — dates from createdAt/uploadedAt/acceptedAt of the deliverables (min/max per phase-segment), null-tolerant (undated segments render as sequence-ordered). Clock-free (`todayMs` in). Commit → `feat(pm): C2g pure — gantt model (toposort, critical path, lanes/arrows)`.

### Task 11: UI — Gantt view

**Files:** `src/components/pm/gantt-view.tsx` (new, custom SVG — NO new npm dependency); `application-hub.tsx` tab «Gantt».

- [ ] Renders lanes (Έργο + ανά δαπάνη), phase segments (rounded rects, status colours, label on hover/tooltip), **dependency arrows** (SVG paths between segment ends — from the DAG, manual edges dashed), critical path highlighted (thicker/coral outline), today line. Horizontal scroll container; click segment → expands the matching row in the matrix tab (simplest: switch tab + scroll anchor, or an inline detail panel — implementer's choice, keep simple). Data via `listApplicationDeliverables` + a light `listDeliverableDependencies(applicationId)` action (add it, scoped). tsc+build+tests. Commit → `feat(pm): C2g UI — Gantt συνδεδεμένων παραδοτέων (SVG, critical path)`.

---

## STAGE C — C2g.3 Extraction + matching

### Task 12: Extraction of the certification-deliverables annex

**Files:** `src/lib/programs/extract-prompt.ts`, `src/lib/programs/types.ts`, `src/lib/programs/persist-map.ts`, `src/lib/programs/persist.ts`; Tests: extend `tests/programs-extract.test.ts` + persist-map test (find exact names via grep).

- [ ] Add to the JSON schema block: `"deliverableTemplates": [ { "phase": "SUBMISSION"|"FIRST_PAYMENT"|"PHASE_A_CERTIFICATION"|"FINAL_PAYMENT"|"FULL_CERTIFICATION"|"AUTHORITY_AUDIT"|null, "name": string, "description": string|null, "mandatory": boolean, "onSiteVerification": boolean, "categoryHint": string|null } ]` + prompt guidance: αναγνώριση ενοτήτων «ΠΑΡΑΡΤΗΜΑ … ΠΑΡΑΔΟΤΕΑ ΠΙΣΤΟΠΟΙΗΣΗΣ ΦΥΣΙΚΟΥ/ΟΙΚΟΝΟΜΙΚΟΥ ΑΝΤΙΚΕΙΜΕΝΟΥ» — αριθμημένα δικαιολογητικά ανά κατηγορία δαπάνης (π.χ. «01.09 Μισθολογικό κόστος» → κάθε αριθμημένη γραμμή = ένα template, στήλη ✓ «ΕΠΙΤΟΠΙΑ ΕΠΑΛΗΘΕΥΣΗ» → `onSiteVerification:true`, η κατηγορία → `categoryHint`, phase-guess: μισθοδοσία/πληρωμές→FINAL_PAYMENT, βεβαιώσεις/φωτογραφίες→FULL_CERTIFICATION, προσφορές→SUBMISSION, default FULL_CERTIFICATION). `ExtractedProgram.deliverableTemplates` (default `[]` in normalize), `RelatedRows.deliverableTemplates` mapping (categoryHint→description prefix «[{hint}] », invalid phase→FULL_CERTIFICATION), persist creates `ProgramDeliverableTemplate` rows in the transaction. Old `deliverables[]` flow untouched. Tests: normalization defaults, mapping, persist rows. Commit → `feat(pm): C2g extraction — annex «Παραδοτέα Πιστοποίησης» → deliverable templates`.

### Task 13: Matching wizard «Αντιστοίχιση με παλαιότερα»

**Files:** `src/lib/pm/deliverable-match.ts` (PURE: `suggestTemplateMatches(extracted, library)` — normalized-name fuzzy: lowercase, strip accents/punct, token overlap score ≥0.6 → suggestions sorted), action `applyTemplateMatches(programId, decisions)` (per item: `keep` as-is | `link` set sourceTemplateId | `replaceWithLibrary` copy the library one) gated `programs.manage`; UI: in the T7 tab, a «Αντιστοίχιση με παλαιότερα» step-dialog (multi-step: 1 προεπισκόπηση εξαχθέντων → 2 προτάσεις match ανά item (accept/decline) → 3 σύνοψη+commit). Test the pure matcher (exact, fuzzy, no-match) + action guard. Commit → `feat(pm): C2g — αντιστοίχιση εξαχθέντων παραδοτέων με βιβλιοθήκη παλαιότερων`.

---

### Task 14: Final verification + holistic review

- [ ] `npm test` + `npx tsc --noEmit` + `npm run build` green. Holistic review (opus) over `git diff master...HEAD`, focus: **server-enforced gating cannot be bypassed** (upload/accept on blocked deliverable via direct action call), cycle guard, `verified` integrity (V2 recompute on every write; C2f untouched — diff `payment.ts` must be empty), absorption migration lossless, public C2d path still re-derives ids (deliverableId from record), scoping on every new action + download route, matrix/Gantt crash-safety (empty apps, no dates), extraction doesn't break old `deliverables[]`, no new permission. Fix CRITICAL/IMPORTANT → finishing-a-development-branch. No `db:sync-permissions`.

---

## Self-Review Notes
- Spec §2→T1/T2, §3→T1/T2/T4/T5, §4→T1(absorb)/T6/T8, §5→T10/T11, §6→T12/T13, §7 invariants→T4/T5/T6/T9/T14. Covered.
- `DeliverablePhaseStr`/`DeliverableStatusStr` shared pure↔actions↔UI; `buildAutoDependencyPairs`/`hasCycle`/`deliverableBlocked`/`verifiedFromDeliverables` single source in `deliverable-phases.ts`; gantt engine separate.
- Lessons applied: server-side invariants (gating, verified, cycle), idempotent materialization with NULL-safe check, non-fatal auto-triggers, record-derived ids on public path, C2f contract frozen.
