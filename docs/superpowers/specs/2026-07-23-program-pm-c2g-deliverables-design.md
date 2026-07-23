# C2g — Παραδοτέα ανά Δαπάνη ανά Φάση · Εξαρτήσεις · Gantt — Design Spec

**Date:** 2026-07-23
**Sub-project:** C2g (extension of C2 — ΕΣΠΑ PM). Generalises the rigid C2a.2 certification into a multi-file, phased, dependency-linked deliverables system per expense per customer, with a Gantt view of linked tasks.
**Status:** Approved direction (brainstorming 2026-07-23) → ready for plan. Build order: **C2g.1** (model + templates + instances + phase gating + UI) → **C2g.2** (Gantt με συνδεδεμένα tasks) → **C2g.3** (extraction από PDF «ΠΑΡΑΡΤΗΜΑ ΠΑΡΑΔΟΤΕΑ ΠΙΣΤΟΠΟΙΗΣΗΣ» + αντιστοίχιση με παλαιότερα παραδοτέα).

---

## 0. Locked decisions (brainstorming)
1. **Παραδοτέο = αρχείο ή group αρχείων**, επαναλαμβανόμενο ανά δαπάνη ανά πελάτη ανά φάση (π.χ. μία δαπάνη έχει τιμολόγιο + βεβαίωση + extre· screenshots για software).
2. **Πλήρης κύκλος 9 φάσεων** (ο χρήστης τον όρισε ρητά): Αξιολόγηση → Υποβολή → Έγκριση → Πληρωμή Α΄ δόσης *(προαιρετική)* → Πιστοποίηση φυσικού Α΄ φάσης (μόνο υπηρεσίες/προϊόντα Α΄ φάσης) → Τροποποίηση δαπάνης *(προαιρετική)* → Πλήρης αποπληρωμή → Πιστοποίηση συνόλου φυσικού αντικειμένου → Έλεγχος πιστοποιούσας αρχής.
3. **Template ανά ΠΡΟΓΡΑΜΜΑ** (όχι ανά κατηγορία) — ο admin ορίζει τη λίστα παραδοτέων ανά φάση μία φορά· το extraction προτείνει (C2g.3)· δυνατότητα αντιστοίχισης/αντιγραφής από παλαιότερα προγράμματα.
4. **Απορρόφηση C2a.2**: τα άκαμπτα `photoKey/bankStatementKey/newUnusedCertKey` γίνονται multi-file deliverables των φάσεων πιστοποίησης· το `verified` παράγεται server-side από την πληρότητα των mandatory παραδοτέων → το C2f (δόση-eligibility) συνεχίζει να δουλεύει αναλλοίωτο.
5. **Tasks ΣΥΝΔΕΔΕΜΕΝΑ (dependencies) + Gantt**: το gating είναι ρητό DAG — χωρίς το ένα δεν εκτελείται το άλλο, και το Gantt δείχνει τα βέλη σύνδεσης.

## 1. Goal
Κάθε δαπάνη ενός έργου κουβαλά τον δικό της «φάκελο τεκμηρίωσης» σε όλη τη διαδρομή (προσφορά → τιμολόγιο/extre → βεβαιώσεις/screenshots → έλεγχος), ως αλληλένδετα βήματα με σαφή σειρά. Το γραφείο βλέπει σε Gantt ποιο βήμα μπλοκάρει ποιο, ανά έργο και ανά δαπάνη — μηδενικό ρίσκο να «ξεφύγει λεπτομέρεια» που κοστίζει απένταξη.

## 2. Φάσεις (enum `DeliverablePhase` — σταθερές, με optional flags)
```prisma
enum DeliverablePhase {
  ASSESSMENT            // Αξιολόγηση (επίπεδο έργου)
  SUBMISSION            // Υποβολή — προσφορά/πρόταση (ανά δαπάνη)
  APPROVAL              // Έγκριση (επίπεδο έργου)
  FIRST_PAYMENT         // Πληρωμή Α΄ δόσης (ανά δαπάνη, ΠΡΟΑΙΡΕΤΙΚΗ)
  PHASE_A_CERTIFICATION // Πιστοποίηση φυσικού Α΄ φάσης (ανά δαπάνη, μόνο δαπάνες Α΄ φάσης)
  MODIFICATION          // Τροποποίηση δαπάνης (ανά δαπάνη, ΠΡΟΑΙΡΕΤΙΚΗ — δένει με replaceExpense)
  FINAL_PAYMENT         // Πλήρης αποπληρωμή (ανά δαπάνη)
  FULL_CERTIFICATION    // Πιστοποίηση συνόλου φυσικού αντικειμένου (ανά δαπάνη)
  AUTHORITY_AUDIT       // Έλεγχος πιστοποιούσας αρχής (επίπεδο έργου)
}
```
`DELIVERABLE_PHASE_ORDER` σταθερή ακολουθία· `OPTIONAL_PHASES = {FIRST_PAYMENT, MODIFICATION}` (παρακάμψιμες)· `APPLICATION_LEVEL = {ASSESSMENT, APPROVAL, AUTHORITY_AUDIT}` (χωρίς expenseId).

## 3. Μοντέλο (3 επίπεδα + εξαρτήσεις)
```prisma
enum DeliverableStatus { PENDING UPLOADED ACCEPTED REJECTED WAIVED }

model ProgramDeliverableTemplate {           // «τι χρειάζεται» — ανά πρόγραμμα ανά φάση
  id                 String @id @default(cuid())
  programId          String
  program            Program @relation(...Cascade)
  phase              DeliverablePhase
  name               String                   // «Τιμολόγιο», «Extre τράπεζας», «Βεβαίωση καινούργιου», «Screenshots εφαρμογής»…
  description        String?
  mandatory          Boolean @default(true)
  onSiteVerification Boolean @default(false)  // στήλη «ΕΠΙΤΟΠΙΑ ΕΠΑΛΗΘΕΥΣΗ/ΠΙΣΤΟΠΟΙΗΣΗ» του παραρτήματος
  appliesTo          DeliverableScope @default(EXPENSE)  // EXPENSE | APPLICATION
  order              Int @default(0)
  active             Boolean @default(true)
  sourceTemplateId   String?                  // από ποιο template άλλου προγράμματος αντιγράφηκε (reuse)
  @@index([programId]) @@index([programId, phase])
}
enum DeliverableScope { EXPENSE APPLICATION }

model ExpenseDeliverable {                   // instance — ανά έργο (και ανά δαπάνη όταν scope=EXPENSE)
  id            String @id @default(cuid())
  applicationId String
  application   ProgramApplication @relation(...Cascade)
  expenseId     String?                       // null = application-level φάση
  expense       ProgramExpense? @relation(...Cascade)
  templateId    String?
  template      ProgramDeliverableTemplate? @relation(...SetNull)
  phase         DeliverablePhase
  name          String                        // snapshot
  mandatory     Boolean @default(true)
  onSiteVerification Boolean @default(false)
  status        DeliverableStatus @default(PENDING)
  acceptedById  String?  ; acceptedAt DateTime?
  notes         String?
  order         Int @default(0)
  files         DeliverableFile[]
  dependencies  DeliverableDependency[] @relation("Dependent")
  dependents    DeliverableDependency[] @relation("Prerequisite")
  @@unique([applicationId, expenseId, templateId])   // idempotent materialization (σχήμα sourceId όπως C2e)
  @@index([applicationId]) @@index([expenseId]) @@index([applicationId, phase])
}

model DeliverableFile {                      // ΠΟΛΛΑΠΛΑ αρχεία ανά παραδοτέο
  id             String @id @default(cuid())
  deliverableId  String
  deliverable    ExpenseDeliverable @relation(...Cascade)
  name           String
  storageKey     String                       // Bunny private: pm/{applicationId}/deliverables/{deliverableId}/{fileId}.{ext}
  mimeType       String? ; size Int?
  uploadedById   String?                      // null = μέσω magic-link (C2d)
  uploadedAt     DateTime @default(now())
  @@index([deliverableId])
}

model DeliverableDependency {                // ρητό DAG — τροφοδοτεί gating + Gantt βέλη
  id             String @id @default(cuid())
  dependentId    String                       // αυτό ΠΕΡΙΜΕΝΕΙ
  dependent      ExpenseDeliverable @relation("Dependent", ...Cascade)
  prerequisiteId String                       // αυτό πρέπει να γίνει ACCEPTED πρώτα
  prerequisite   ExpenseDeliverable @relation("Prerequisite", ...Cascade)
  auto           Boolean @default(true)       // true = παράχθηκε από τη σειρά φάσεων· false = χειροκίνητο link
  @@unique([dependentId, prerequisiteId])
}
```
**Auto-εξαρτήσεις**: στο materialization, κάθε deliverable φάσης N παίρνει prerequisites όλα τα **mandatory** deliverables της αμέσως προηγούμενης ισχύουσας φάσης (skip των optional που δεν χρησιμοποιούνται) — ανά δαπάνη για expense-scoped, cross σε application-level ορόσημα (π.χ. τα SUBMISSION items περιμένουν το ASSESSMENT). Χειροκίνητα extra links επιτρέπονται (auto=false). Cycle-guard (pure fn) απαγορεύει κύκλους.

**Gating (server-enforced)**: ένα deliverable δεν γίνεται UPLOADED/ACCEPTED αν έχει prerequisite μη-ACCEPTED (και μη-WAIVED) — έλεγχος στο action, όχι μόνο στο UI (μάθημα C2a.2/C2f).

## 4. Απορρόφηση C2a.2
- Migration: για κάθε υπάρχον `ProgramExpenseCertification` με `photoKey/bankStatementKey/newUnusedCertKey`, δημιουργούνται deliverables στις φάσεις πιστοποίησης/πληρωμής με ένα `DeliverableFile` το καθένα (τα υπάρχοντα bunny keys) — μηδενική απώλεια. Τα πεδία μένουν στο μοντέλο (deprecated, δεν γράφονται πλέον) μέχρι το C2g.2 cleanup.
- `certificationComplete` επαναϋλοποιείται πάνω στα deliverables: verified-able ⇔ όλα τα mandatory deliverables των φάσεων FULL_CERTIFICATION (+ PHASE_A όπου ισχύει) είναι ACCEPTED **και** serial/location/μητρώο/paid scalars πλήρη. Το C2f `expenseEligibleForPayment` μένει αναλλοίωτο (διαβάζει `verified`).
- Το tab «Πιστοποίηση» γίνεται ο **φάκελος δαπάνης**: πίνακας δαπανών × φάσεων (progress chips), expand → deliverables της φάσης με multi-upload / accept / reject / waive + scalars.

## 5. Gantt (C2g.2) — συνδεδεμένα tasks
- View «Gantt» στο έργο (και αργότερα στο /pm): οριζόντιος άξονας χρόνου, μία λωρίδα ανά δαπάνη (+ λωρίδα «Έργο» για τα application-level), segments ανά φάση χρωματισμένα κατά status (PENDING γκρι / UPLOADED info / ACCEPTED πράσινο / REJECTED coral), **βέλη εξαρτήσεων** από το `DeliverableDependency` DAG — φαίνεται αμέσως ποιο μπλοκάρει ποιο και το critical path (pure `topoSort`/`criticalPath` fns). Ημερομηνίες: πραγματικές (uploadedAt/acceptedAt) + προβλεπόμενες από προθεσμίες υποχρεώσεων όπου υπάρχουν. Custom SVG (χωρίς νέο dependency) πάνω στο design system.
- Κλικ σε segment → το αντίστοιχο deliverable panel.

## 6. Extraction + reuse (C2g.3)
- Βελτίωση DeepSeek prompt: αναγνώριση «ΠΑΡΑΡΤΗΜΑ … ΠΑΡΑΔΟΤΕΑ ΠΙΣΤΟΠΟΙΗΣΗΣ ΦΥΣΙΚΟΥ/ΟΙΚΟΝΟΜΙΚΟΥ» → δομημένα `deliverableTemplates[]` (phase-guess, name, mandatory, onSiteVerification από τη στήλη ✓, κατηγορία-hint στο description).
- «Αντιστοίχιση με παλαιότερα»: multi-step wizard — (1) extraction βρίσκει items, (2) πρόταση match με library templates άλλων προγραμμάτων (fuzzy name), (3) ο χρήστης επιβεβαιώνει/αντιγράφει (`sourceTemplateId`), (4) commit.

## 7. Actions / ασφάλεια (γνωστά invariants)
Όλα τα application-scoped actions μέσω `requireVisibleApplication` (deliverable/file → φορτώνει parent app πρώτα). Template CRUD gated `programs.manage`. Uploads Bunny private, gated download route (idiom C2a.2/C2d). Το C2d magic-link `DocumentRequest` αποκτά προαιρετικό `deliverableId` → το public upload κουμπώνει στο συγκεκριμένο deliverable (id re-derived από το record, ποτέ client). Gating/`verified`/dependencies enforced server-side. Καμία νέα permission.

## 8. Testing
Pure: phase order/skip-optional εξαρτήσεις builder, cycle-guard, gating predicate, verified-from-deliverables, topoSort/criticalPath (C2g.2). Server: guards + scoping, materialization idempotency (@@unique), gating rejection, migration απορρόφησης (τα παλιά keys γίνονται files). UI: tsc+build.

## 9. Out of scope (v1)
Ρυθμιζόμενες φάσεις ανά πρόγραμμα (σταθερό enum + optional flags αρκεί)· auto-ημερομηνίες Gantt από ML· extraction πινάκων με εικόνες (text-only)· notifications ανά deliverable (καλύπτονται από C2c reminders μέσω υποχρεώσεων).

## 10. Definition of Done (ανά στάδιο)
- **C2g.1**: schema+migration (με απορρόφηση C2a.2 δεδομένων), template tab στο πρόγραμμα, materialization με auto-DAG, gating server-side, φάκελος δαπάνης UI (πίνακας δαπανών×φάσεων, multi-upload/accept/reject), verified→C2f αναλλοίωτο, tests πράσινα.
- **C2g.2**: Gantt view με βέλη εξαρτήσεων + critical path.
- **C2g.3**: extraction παραρτήματος + wizard αντιστοίχισης με παλαιότερα.

---

## ΤΡΟΠΟΠΟΙΗΣΗ Α΄ (2026-07-23, user feedback μετά το T1)

**Δύο επίπεδα + wizard + υποχρέωση Ν αρχείων:**
1. **Παραδοτέο (group)** — `ProgramDeliverableTemplate` γίνεται η ΟΜΑΔΑ: `{programId, name, description, appliesTo, active, sourceTemplateId}` (ΧΩΡΙΣ phase/onSiteVerification — αυτά κατεβαίνουν στα tasks). Ένα παραδοτέο **διατρέχει πολλές φάσεις** μέσω των tasks του.
2. **Task (βήμα)** — ΝΕΟ `ProgramDeliverableTask`: `{templateId, phase, name, description?, mandatory, onSiteVerification, minFiles Int @default(1), order}`. Ένα task **κλείνει μόνο με ≥ minFiles αρχεία** (server-enforced).
3. **Instances** — `ExpenseDeliverable` = instance της ομάδας ανά δαπάνη/έργο (name snapshot· status παράγωγο). ΝΕΟ `ExpenseDeliverableTask`: `{deliverableId, taskTemplateId?, phase, name, mandatory, onSiteVerification, minFiles, status, acceptedById/At, notes, order}`. **Τα `DeliverableFile` και οι `DeliverableDependency` δένονται πλέον σε TASKS** (όχι στην ομάδα).
4. **Κανόνες**: task → ACCEPTED μόνο αν `files ≥ minFiles` ΚΑΙ όχι blocked (DAG). Παραδοτέο "πλήρες" = όλα τα mandatory tasks ACCEPTED/WAIVED. `verifiedFromDeliverables` → πάνω στα tasks των φάσεων πιστοποίησης. Gantt/DAG → επίπεδο task.
5. **Wizard (αντικαθιστά τον flat editor του T7)**: Βήμα 1 στοιχεία παραδοτέου (όνομα, περιγραφή, scope) → Βήμα 2 tasks ανά φάση (add rows: φάση, όνομα, mandatory, επιτόπια, **πλήθος απαιτούμενων αρχείων**) → Βήμα 3 σύνοψη & αποθήκευση. Ο admin το φτιάχνει μία φορά ανά πρόγραμμα («και όλα όσα χρειάζεται») και μετά το χρησιμοποιεί (materialization + βιβλιοθήκη copy).
6. **Migration**: το T1 schema έχει ήδη εφαρμοστεί → πρόσθετο restructuring migration `program_pm_c2g_tasks` (νέοι πίνακες tasks, repoint FKs των files/dependencies σε tasks, μεταφορά τυχόν absorbed γραμμών σε ομάδα «Πιστοποίηση (μεταφορά)» + tasks — ΟΧΙ επεξεργασία εφαρμοσμένων migrations, shared dev DB).
7. **Scope στο wizard (user)**: κάθε παραδοτέο αφορά **δαπάνη Ή το ίδιο το πρόγραμμα/έργο** — το `appliesTo (EXPENSE|APPLICATION)` είναι υποχρεωτική, εμφανής επιλογή στο Βήμα 1 του wizard («Αφορά: Δαπάνη / Το πρόγραμμα»), με εξήγηση: τα EXPENSE υλοποιούνται ανά δαπάνη του έργου, τα APPLICATION μία φορά ανά έργο.
