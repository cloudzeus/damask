# Sub-project C2a — PM Θεμέλιο (στάδια · αναθέσεις · υποχρεώσεις · δικαιολογητικά · αξιολόγηση · σελίδα έργου) · Design Spec

**Ημερομηνία:** 2026-07-23
**Κατάσταση:** Εγκεκριμένο design (brainstorming) → έτοιμο για implementation plan
**Βάση:** [full analysis](2026-07-23-program-pm-analysis.md). Χτίζει πάνω σε C1 (`Program`/`ProgramApplication`/`ProgramExpense`/`ProgramDeliverable`/`ProgramRequiredForm`/`ProgramCriterion`) + B (`TaxFormTemplate`).

## 0. Απόφασεις (brainstorming 2026-07-23)
1. **Ξεκινάμε C2a** (θεμέλιο)· C2b (Kanban/timeline/global views) + C2c (reminders/reports) = επόμενες φάσεις.
2. **Διεκπεραιωτής = ανάθεση εσωτερικού User** (όχι νέος role). `ProgramApplication.managerId?` + `processorId?` (→ User).
3. **ΟΠΣΚΕ = καταγραφή κατάστασης** (scalars στο ProgramApplication· όχι API).
4. **Αξιολόγηση = scored φόρμα** — βαθμολογία ανά `ProgramCriterion` (με βάρος) → σύνολο + όριο ένταξης → verdict.
5. **Access scoping**: manager/processor βλέπουν ΜΟΝΟ τα assigned έργα· ADMIN/SUPER_ADMIN όλα.

## 1. Reuse (verified)
`bunny-storage` (δικαιολογητικά private), `User` (managerId/processorId/uploadedById + `trdrId` για CUSTOMER), `Trdr`, `rbac-server` (`requirePermission`), `objects.ts`+`db:sync-permissions`, C1 models. Το C3 expense-list ενσωματώνεται ως tab στη σελίδα έργου.

---

## 2. Μοντέλο δεδομένων (νέα Prisma + επεκτάσεις)

```prisma
enum ApplicationStage {
  ASSESSMENT              // Αξιολόγηση
  DOCUMENTS               // Συγκέντρωση δικαιολογητικών
  EXPENSES_DELIVERABLES   // Δαπάνες & Παραδοτέα
  OPSKE_SUBMISSION        // Υποβολή ΟΠΣΚΕ
  INSPECTION              // Δελτία ελέγχου φυσικού αντικειμένου
  MONITORING              // Παρακολούθηση / Ολοκλήρωση
}
enum ObligationKind   { DELIVERABLE FORM CRITERION TASK CUSTOM }
enum ObligationStatus { PENDING IN_PROGRESS SUBMITTED APPROVED REJECTED WAIVED }
enum AssessmentVerdict { PENDING ELIGIBLE INELIGIBLE }

// ── ProgramApplication: επεκτάσεις (υπάρχον model) ──
// stage ApplicationStage @default(ASSESSMENT)
// managerId String?  ; manager   User? @relation("AppManager",   fields:[managerId],   references:[id], onDelete:SetNull)
// processorId String?; processor User? @relation("AppProcessor", fields:[processorId], references:[id], onDelete:SetNull)
// assessmentScore Float?
// assessmentMaxScore Float?
// assessmentVerdict AssessmentVerdict @default(PENDING)
// opskeStatus String?  ; opskeRef String?  ; opskeSubmittedAt DateTime?
// obligations ApplicationObligation[] ; documents ApplicationDocument[] ; criterionScores ApplicationCriterionScore[]

model ApplicationObligation {
  id            String   @id @default(cuid())
  applicationId String
  application   ProgramApplication @relation(fields:[applicationId], references:[id], onDelete:Cascade)
  stage         ApplicationStage
  kind          ObligationKind @default(TASK)
  sourceId      String?                          // snapshot ref → deliverable/requiredForm/criterion id
  name          String
  mandatory     Boolean @default(true)
  status        ObligationStatus @default(PENDING)
  dueDate       DateTime?
  assigneeId    String?                          // User (manager/processor)
  assignee      User? @relation(fields:[assigneeId], references:[id], onDelete:SetNull)
  notes         String?
  order         Int @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  documents     ApplicationDocument[]
  @@index([applicationId]) @@index([applicationId, stage]) @@index([status])
}

model ApplicationDocument {
  id            String   @id @default(cuid())
  applicationId String
  application   ProgramApplication @relation(fields:[applicationId], references:[id], onDelete:Cascade)
  obligationId  String?
  obligation    ApplicationObligation? @relation(fields:[obligationId], references:[id], onDelete:SetNull)
  name          String
  storageKey    String                            // Bunny private
  mimeType      String?
  size          Int?
  uploadedById  String?
  uploadedAt    DateTime @default(now())
  @@index([applicationId]) @@index([obligationId])
}

model ApplicationCriterionScore {
  id            String   @id @default(cuid())
  applicationId String
  application   ProgramApplication @relation(fields:[applicationId], references:[id], onDelete:Cascade)
  criterionId   String?                           // snapshot ref → ProgramCriterion (nullable αν διαγραφεί)
  name          String                            // snapshot του κριτηρίου
  weight        Float @default(1)                 // βάρος (από ProgramCriterion.weight ή 1)
  score         Float?                            // βαθμός που έδωσε ο αξιολογητής (0..maxPerCriterion)
  maxScore      Float @default(100)
  note          String?
  order         Int @default(0)
  @@unique([applicationId, criterionId])
  @@index([applicationId])
}
```
`User` παίρνει back-relations (`managedApplications`/`processedApplications`/`assignedObligations`). Νέα migration (additive).

---

## 3. Λογική

### 3α. Αναθέσεις & access scoping
- `assignApplication(applicationId, { managerId?, processorId? })` — gated `pm.manage` (ADMIN/SUPER_ADMIN).
- **Scoping helper** `visibleApplicationWhere(session)`: αν ο χρήστης έχει `pm.manage` → `{}` (όλα)· αλλιώς `{ OR: [{ managerId: userId }, { processorId: userId }] }`. Όλα τα PM list/read actions το εφαρμόζουν. Ένα read ενός μη-ορατού έργου → `notFound()`.

### 3β. Generation υποχρεώσεων + assessment (snapshot)
- `generateObligations(applicationId)` (gated pm access σε assigned): για το πρόγραμμα του application, δημιουργεί (αν δεν υπάρχουν ήδη, ή «resync» προσθέτει τα λείποντα by sourceId):
  - `ProgramRequiredForm` → obligation `kind=FORM`, `stage=DOCUMENTS`.
  - `ProgramDeliverable` → obligation `kind=DELIVERABLE`, `stage=EXPENSES_DELIVERABLES`.
  - `ProgramCriterion` → `ApplicationCriterionScore` row (weight από criterion) **και** obligation `kind=CRITERION stage=ASSESSMENT` (προαιρετικό — ή μόνο score rows).
  - name = snapshot· mandatory από την πηγή. Idempotent by (applicationId, kind, sourceId).
- Τρέχει auto στο `createApplication` (C1 — επεκτείνεται να καλεί generate) + κουμπί «Δημιουργία/Συγχρονισμός υποχρεώσεων».

### 3γ. Αξιολόγηση (scored)
- `saveCriterionScore(scoreId, { score, note })`· `recomputeAssessment(applicationId)` → `assessmentScore = Σ(weight*score)/Σ(weight*maxScore) * 100`, αποθηκεύεται· ο χρήστης θέτει verdict (ELIGIBLE/INELIGIBLE) ή auto βάσει ορίου (setting `pm.eligibilityThreshold`, default 50). Verdict INELIGIBLE → το έργο μπορεί να κλείσει.

### 3δ. Υποχρεώσεις & δικαιολογητικά
- `updateObligation(id, { status?, dueDate?, assigneeId?, notes? })`· `addObligation` / `removeObligation` / `waiveObligation`.
- **Upload δικαιολογητικού**: `uploadApplicationDocument(applicationId, obligationId?, { name, base64, mimeType, ext })` → `bunnyUploadPrivate(key=pm/{applicationId}/{cuid}.{ext})` + `ApplicationDocument`. `listApplicationDocuments`, `removeApplicationDocument`, `downloadApplicationDocument` (server route, gated).

### 3ε. Στάδιο & ΟΠΣΚΕ
- `setApplicationStage(applicationId, stage)` — free-set στο C2a (το enforced drag-drop/gating έρχεται στο C2b). Απλός έλεγχος: προειδοποίηση αν υπάρχουν εκκρεμείς mandatory obligations του τρέχοντος σταδίου.
- `updateOpske(applicationId, { opskeStatus?, opskeRef?, opskeSubmittedAt? })`.

---

## 4. Δομή αρχείων
```
src/lib/pm/
  types.ts             # ISOMORPHIC: stage/kind/status labels + helpers
  obligations-gen.ts   # PURE: (program deliverables/forms/criteria) → obligation/score write-rows (snapshot, idempotent keys)
  assessment.ts        # PURE: computeAssessmentScore(scores[]) → { score, max, pct }
  scoping.ts           # visibleApplicationWhere(session) (pure, needs session shape only)
  actions.ts           # 'use server': assign, generate, assessment, obligations CRUD, documents, stage, opske  (scoped/gated)
src/components/pm/
  application-hub.tsx        # η σελίδα έργου: header (stage badge, αναθέσεις) + tabs
  assessment-tab.tsx         # scored κριτήρια + σύνολο + verdict
  obligations-tab.tsx        # υποχρεώσεις ανά στάδιο + status/προθεσμία/assignee + upload δικαιολογητικών
  opske-tab.tsx              # καταγραφή ΟΠΣΚΕ
  assign-application-dialog.tsx  # ADMIN: manager + processor picker (User)
  application-documents.tsx  # λίστα/upload/download δικαιολογητικών
  trdr-applications-tab.tsx  # tab «Έργα» στην καρτέλα πελάτη
src/app/(app)/programs/[id]/applications/[appId]/page.tsx  # RSC → <ApplicationHub/>
src/app/(app)/programs/[id]/applications/[appId]/documents/[docId]/route.ts  # gated download
```
Οι δαπάνες (C3 `expense-list`) γίνονται tab «Δαπάνες» στο hub· τα παραδοτέα εμφανίζονται στο obligations-tab (stage EXPENSES_DELIVERABLES).

---

## 5. UI (Steel & Frost, §4β/§6)
- **Σελίδα έργου** `/programs/[id]/applications/[appId]`: header με πελάτη+πρόγραμμα, **stage badge/stepper**, αναθέσεις (manager/processor chips + «Ανάθεση» για ADMIN), tabs: Αξιολόγηση · Υποχρεώσεις & Δικαιολογητικά · Δαπάνες (C3) · Παραδοτέα · ΟΠΣΚΕ.
- **Αξιολόγηση tab**: πίνακας κριτηρίων (name, βάρος, βαθμός input, σημείωση) + σύνολο % + verdict badge + κουμπί υπολογισμού.
- **Υποχρεώσεις tab**: ομαδοποίηση ανά στάδιο· κάθε obligation: name, mandatory, status `<select>`, προθεσμία, assignee `<select>`, σημείωση, **upload δικαιολογητικού** (+ λίστα αρχείων με download/remove). «+ Υποχρέωση», «Συγχρονισμός από πρόγραμμα».
- **ΟΠΣΚΕ tab**: status/αρ. πρωτοκόλλου/ημ/νία υποβολής.
- **Καρτέλα Trdr** → tab «Έργα»: λίστα applications (πρόγραμμα, στάδιο, verdict, manager) + link στη σελίδα έργου + «Νέο έργο» (link σε πρόγραμμα).
- react-icons/lu, base-ui, Ελληνικά, role-gated κόστος όπου υπάρχει AI.

---

## 6. Permissions
- `pm.manage` (νέο) — ADMIN/SUPER_ADMIN: αναθέσεις + βλέπουν όλα τα έργα.
- `pm.work` (νέο) — MANAGER/EMPLOYEE (defaults): δουλεύουν στα **assigned** έργα (scoping).
- Νέο object registry item «**Έργα**» (`/pm` list — πλήρες στο C2b· στο C2a τουλάχιστον redirect/λίστα assigned) menuPermission `pm.work`, permissions `pm.manage`+`pm.work`. Μετά: **`npm run db:sync-permissions`** (βλ. [[permissions-sync-gap]]).
- ROLE_DEFAULTS: `pm.manage`→ADMIN (μέσω ALL)· `pm.work`→ADMIN(ALL)+MANAGER+EMPLOYEE.

## 7. Security
Κάθε action gated· scoping σε ΚΑΘΕ read/list (manager/processor μόνο assigned)· δικαιολογητικά σε private Bunny· download route gated + scoped. Καμία raw error.

## 8. Testing (TDD)
- **Pure**: `computeAssessmentScore` (weighted %, edge: μηδέν βάρη/κενά), `obligations-gen` (snapshot rows από deliverables/forms/criteria, idempotent by sourceId), `visibleApplicationWhere` (admin `{}` vs assigned OR), stage/label helpers.
- **Server**: action guards + scoping (mocked prisma/rbac)· document-prep.
- **e2e**: create app → generate obligations → assess → set status (όπου εφικτό).

## 9. Εκτός scope (C2a)
- **C2b**: Kanban (dnd-kit) + timeline + global `/pm` board + λίστα υποχρεώσεων ανά πρόγραμμα (cross-πελάτες) + φίλτρα.
- **C2c**: pg-boss reminders + email + reports/dashboards εκκρεμοτήτων.
- **C2d**: portal πελάτη (CUSTOMER upload/view).
- Stage-transition enforcement/gating (C2a = free-set με προειδοποίηση).

## 10. Definition of Done
- Migration + models/enums + ProgramApplication/User relations.
- Ανάθεση manager/processor (ADMIN) + access scoping (assigned-only) λειτουργικά.
- Σελίδα έργου με tabs: **scored αξιολόγηση**, **υποχρεώσεις ανά στάδιο** (auto-gen από παραδοτέα/έντυπα/κριτήρια) με status/προθεσμία/assignee + **upload/download δικαιολογητικών**, δαπάνες (C3), ΟΠΣΚΕ καταγραφή, stage.
- Καρτέλα Trdr tab «Έργα». Object «Έργα» + permissions synced.
- Pure/server tests πράσινα· tsc clean· build ΟΚ· Steel & Frost + Ελληνικά.
