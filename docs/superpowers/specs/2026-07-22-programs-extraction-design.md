# Sub-project C1+C3 — Αποδελτίωση Προγραμμάτων + Auto-κατηγορία Δαπάνης · Design Spec

**Ημερομηνία:** 2026-07-22
**Κατάσταση:** Εγκεκριμένο design (brainstorming) → έτοιμο για implementation plan
**Sub-project:** C (section 3 του «universal OCR» οράματος), πρώτη επανάληψη = **C1 (αποδελτίωση) + C3 (auto-κατηγορία δαπάνης)**. Μετά το A (ingestion) + B (tax templates), και τα δύο merged.

**Reference:** πιστή προσαρμογή του `cloudzeus/postgres-boilerplate` feature `programs` (μελετήθηκε: models `Program`/`ProgramExpenseCategory`/`ProgramKad`/`ProgramBonus`/`ProgramCriterion`/`ProgramDeadline`/`ProgramPhase`/`PhaseDocumentRequirement`; `lib/programs/extract.ts` DeepSeek pipeline· `lib/programs/templates.ts` prompt) στο DAMASK stack. Clone στο session scratchpad: `<scratchpad>/pb-ref/`.

---

## 0. Πλαίσιο & αποφάσεις

Ο χρήστης θέλει **αποδελτίωση ευρωπαϊκών προγραμμάτων** (ΕΣΠΑ κ.λπ.) δομημένη ώστε να αξιοποιείται **με DeepSeek on-demand**, ΚΑΙ κάθε **καταχώριση παραστατικού δαπάνης** να **προτείνει την κατηγορία** στην οποία ανήκει βάσει των **κατηγοριών δαπανών + ποσοστώσεων** του προγράμματος. Τα παραδοτέα θα γίνουν **υποχρεώσεις** για **project management ανά πελάτη ανά πρόγραμμα** (C2, επόμενο).

### Αποδόμηση του C
- **C1** (ΑΥΤΟ) — αποδελτίωση PDF προγράμματος → structured relational data + `extractedData` JSON.
- **C3** (ΑΥΤΟ) — auto-πρόταση κατηγορίας για κάθε δαπάνη έναντι προγράμματος.
- **C2** (επόμενο) — παρακολούθηση υποχρεώσεων/παραδοτέων ανά `ProgramApplication` (project management).
- **C4** (επόμενο) — DeepSeek query layer πάνω σε όλη την πληροφορία.

### Κλειδωμένες αποφάσεις (brainstorming 2026-07-22)
1. **Full relational τώρα** για το program model (port του reference), όχι μόνο JSON.
2. **Νέο `ProgramExpense`** model (δαπάνη έναντι προγράμματος) — χτίζει επιτέλους το deferred «Έξοδα» του A, δεμένο σε πρόγραμμα.
3. **`ProgramApplication`** (Trdr × Program = «έργο») ως άγκυρα: οι δαπάνες κρέμονται από αυτό ώστε το C2 (PM ανά πελάτη ανά πρόγραμμα) να κουμπώσει καθαρά.
4. **Εταιρεία = `Trdr`** (όπως B). **Text-only PDF** στην v1 (ΕΣΠΑ προσκλήσεις είναι digital, με επιλέξιμο κείμενο)· scanned→OCR follow-up.
5. **Αποδελτίωση με DeepSeek** (`deepseek-chat` primary, `deepseek-reasoner` fallback), text εξαγόμενο **client-side** (pdfjs), όπως το client-only pattern του DAMASK.
6. **ProgramExpense δημιουργείται manual** στην v1· population μέσω OCR/A-ingestion = μελλοντικό hook.

### Reuse από DAMASK (verified)
| Υπάρχον | Χρήση |
|---|---|
| `src/lib/deepseek.ts` — `deepseekChat(messages, opts)`, `generateText(prompt, opts)` | αποδελτίωση + κατηγοριοποίηση |
| `src/lib/bunny-storage.ts` — `bunnyUploadPrivate`, `bunnyDownload` | source PDF προγράμματος (private) |
| `src/lib/ocr/rasterize.ts` — pdfjs getTextContent (επιλέξιμο κείμενο PDF, ήδη client-side) | client text extraction |
| `src/lib/ocr/extract.ts` — `parseJsonLoose` | ανεκτικό JSON parse (+ `jsonrepair` όπως reference) |
| `src/lib/ai/usage.ts` — `logAiUsage` (μέσα στο deepseek.ts), `AiScope` | cost logging |
| `src/lib/ingestion/ocr-cost.ts` — `buildOcrCostViewForSession` (A) | role-gated κόστος αποδελτίωσης |
| `src/lib/objects.ts`, `src/lib/rbac-server.ts`, `src/lib/prisma.ts`, `Trdr` | registry/AuthZ/DB |

---

## 1. Μοντέλο δεδομένων (νέα Prisma models + enums)

```prisma
enum ProgramStatus { DRAFT ACTIVE CLOSED }
enum ProgramExtractStatus { PENDING RUNNING DONE FAILED }
enum ProgramBonusKind { SPEED INNOVATION GREEN EMPLOYMENT OTHER }
enum ExpenseSuggestSource { AI MANUAL }

model Program {
  id              String   @id @default(cuid())
  title           String
  summary         String?
  referenceCode   String?                          // ΕΣΠΑ code
  sourceFileName  String?
  storageKey      String?  @unique                 // Bunny private
  mimeType        String?
  size            Int?
  publicationDate DateTime?
  submissionStart DateTime?
  submissionEnd   DateTime?
  totalBudget     Decimal? @db.Decimal(18, 2)
  fundingRate     Decimal? @db.Decimal(5, 2)       // subsidy %
  durationMonths  Int?
  minEmployeesFte     Decimal? @db.Decimal(10, 2)
  minOperationalYears Decimal? @db.Decimal(5, 2)
  eligibilityNote     String?
  status          ProgramStatus @default(DRAFT)
  extractStatus   ProgramExtractStatus @default(PENDING)
  extractedData   Json?                            // πλήρες αποδελτιωμένο payload (DeepSeek-ready)
  model           String?
  tokensUsed      Int?
  errorMessage    String?
  notes           String?
  createdById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  expenseCats  ProgramExpenseCategory[]
  kads         ProgramKad[]
  bonuses      ProgramBonus[]
  criteria     ProgramCriterion[]
  deadlines    ProgramDeadline[]
  phases       ProgramPhase[]
  deliverables ProgramDeliverable[]
  regions      ProgramRegion[]
  legalForms   ProgramEligibleLegalForm[]
  applications ProgramApplication[]
  @@index([status]) @@index([extractStatus]) @@index([submissionEnd])
}

model ProgramExpenseCategory {
  id            String  @id @default(cuid())
  programId     String
  program       Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  name          String
  minAmount     Decimal? @db.Decimal(18, 2)
  maxAmount     Decimal? @db.Decimal(18, 2)
  minPercentage Decimal? @db.Decimal(5, 2)
  maxPercentage Decimal? @db.Decimal(5, 2)
  mandatory     Boolean @default(false)
  notes         String?
  order         Int     @default(0)
  expenses      ProgramExpense[]
  @@index([programId])
}

model ProgramKad {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  code String
  description String?
  @@index([programId])
}
model ProgramBonus {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  kind ProgramBonusKind @default(OTHER)
  name String
  condition String?
  bonusRate Decimal? @db.Decimal(5, 2)
  bonusAmount Decimal? @db.Decimal(18, 2)
  order Int @default(0)
  @@index([programId])
}
model ProgramCriterion {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  name String
  weight Decimal? @db.Decimal(5, 2)
  notes String?
  order Int @default(0)
  @@index([programId])
}
model ProgramDeadline {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  name String
  date DateTime?
  notes String?
  order Int @default(0)
  @@index([programId])
}
model ProgramPhase {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  name String
  order Int @default(0)
  deliverables ProgramDeliverable[]
  @@index([programId])
}
model ProgramDeliverable {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  phaseId String?
  phase   ProgramPhase? @relation(fields: [phaseId], references: [id], onDelete: SetNull)
  name String
  description String?
  mandatory Boolean @default(true)
  order Int @default(0)
  @@index([programId])
}
model ProgramRegion {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  name String
  @@index([programId])
}
model ProgramEligibleLegalForm {
  id String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  name String
  @@index([programId])
}

// ── C2 anchor: μια εταιρεία (Trdr) σε ένα πρόγραμμα = «έργο» ──
model ProgramApplication {
  id String @id @default(cuid())
  trdrId String
  trdr   Trdr @relation(fields: [trdrId], references: [id], onDelete: Cascade)
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  status String @default("ACTIVE")
  notes String?
  createdById String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  expenses ProgramExpense[]
  @@unique([trdrId, programId])
  @@index([trdrId]) @@index([programId])
}

// ── C3: δαπάνη έναντι προγράμματος με προτεινόμενη κατηγορία ──
model ProgramExpense {
  id String @id @default(cuid())
  applicationId String
  application   ProgramApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  description String
  amount     Decimal @db.Decimal(18, 2)
  vatAmount  Decimal? @db.Decimal(18, 2)
  date       DateTime?
  vendor     String?
  vendorAfm  String?
  docNumber  String?
  // C3 suggestion
  suggestedCategoryId String?
  suggestionReason    String?
  suggestionConfidence Float?
  suggestionSource    ExpenseSuggestSource?
  // confirmed
  categoryId String?
  category   ProgramExpenseCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  confirmed  Boolean @default(false)
  createdById String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([applicationId]) @@index([categoryId])
}
```
`Trdr` παίρνει `programApplications ProgramApplication[]`. Νέα migration. (`suggestedCategoryId` κρατιέται ως plain string για ευελιξία· το confirmed `categoryId` έχει FK.)

---

## 2. Δομή αρχείων

```
src/lib/programs/
  types.ts          # ISOMORPHIC: ExtractedProgram shape (κατηγορίες/παραδοτέα/ΚΑΔ/…), helpers
  extract-prompt.ts # ISOMORPHIC: PROGRAM_SYSTEM_PROMPT + JSON shape (port του templates.ts)
  extract.ts        # SERVER: text → deepseek (chat→reasoner fallback) → parseJsonLoose+jsonrepair → ExtractedProgram
  persist.ts        # SERVER: ExtractedProgram → upsert relational tables (pure mapping helper unit-tested)
  categorize.ts     # SERVER: {expense, categories[]} → deepseek → { categoryId, reason, confidence }
  category-prompt.ts# ISOMORPHIC: buildCategorizePrompt(categories, expense) (pure, testable)
  actions.ts        # 'use server': program CRUD, uploadSource, extractProgram, application CRUD,
                    #   createExpense, suggestExpenseCategory, confirmExpenseCategory
src/lib/programs/pdf-text.ts   # CLIENT: File → extracted text (pdfjs getTextContent), char-capped
src/app/(app)/programs/{page.tsx (λίστα), [id]/page.tsx (detail/editor)}
src/components/programs/{new-program-dialog, program-editor, expense-list, expense-suggest-row, applications-panel}
```
Isomorphic rule: `types/extract-prompt/category-prompt/persist(pure part)` δεν κάνουν import prisma/react.

---

## 3. Ροές

### 3α. Αποδελτίωση (C1)
1. **Νέο πρόγραμμα** (`/programs`): «Νέο πρόγραμμα» → dialog: upload PDF. Client: `pdf-text.ts` εξάγει κείμενο (pdfjs, cap ~360k chars). Server `createProgram` → `bunnyUploadPrivate(pdf)` + Program (extractStatus PENDING).
2. **Αποδελτίωση**: server action `extractProgram(programId, text)` → `extract.ts`: DeepSeek (`deepseek-chat`, fallback `deepseek-reasoner` σε missing-required/parse fail) με `PROGRAM_SYSTEM_PROMPT` → `parseJsonLoose`+`jsonrepair` → `ExtractedProgram`. `persist.ts` κάνει upsert τα relational (expenseCats/kads/bonuses/criteria/deadlines/phases/deliverables/regions/legalForms) + Program scalars + `extractedData` JSON + model/tokens. extractStatus DONE/FAILED. Role-gated κόστος panel (reuse A).
3. **Detail/editor** `/programs/[id]`: sections για core (τίτλος/budget/fundingRate/dates), **κατηγορίες δαπανών** (name+min/max%+mandatory), παραδοτέα, φάσεις, ΚΑΔ, επιλεξιμότητα — όλα editable μετά την αποδελτίωση (ο χρήστης διορθώνει).

### 3β. Auto-κατηγορία δαπάνης (C3)
1. **Εφαρμογή** (`ProgramApplication`): από την καρτέλα `Trdr` ή το πρόγραμμα, «Σύνδεση εταιρείας με πρόγραμμα» → application.
2. **Δαπάνες** (view ανά application): «Νέα δαπάνη» → form (description/amount/vat/date/vendor/docNumber) → `createExpense`.
3. **Πρόταση**: `suggestExpenseCategory(expenseId)` → `categorize.ts`: `buildCategorizePrompt(program.expenseCats, expense)` → `deepseekChat` → `{ categoryId, reason, confidence }` → αποθήκευση `suggested*` (source AI). Το UI δείχνει την πρόταση + reason· ο χρήστης **επιβεβαιώνει/αλλάζει** → `confirmExpenseCategory(expenseId, categoryId)` (confirmed=true).
4. Batch: «Πρόταση για όλες» τρέχει το suggest για μη-confirmed δαπάνες.

---

## 4. Extraction & categorization engines

- `extract.ts` (server): port του reference `program-extract` σε `deepseek.ts`. `PROGRAM_SYSTEM_PROMPT` ζητά αυστηρό JSON με: title, summary, referenceCode, dates, totalBudget, fundingRate, durationMonths, eligibility (minEmployeesFte/minOperationalYears/note), `expenseCategories:[{name,minPercentage,maxPercentage,minAmount,maxAmount,mandatory}]`, `deliverables:[{name,description,phase,mandatory}]`, `phases`, `kads`, `bonuses`, `criteria`, `deadlines`, `regions`, `legalForms`. REQUIRED_FIELDS = title/summary/submissionEnd/totalBudget → σε missing≥2 ή parse fail, retry με `deepseek-reasoner`. `MAX_TEXT_CHARS≈360k`.
- `categorize.ts` (server): `buildCategorizePrompt` παραθέτει τις κατηγορίες (name + όρια % + mandatory) + τα στοιχεία δαπάνης (description/amount/vendor) και ζητά JSON `{ categoryId, reason, confidence }` (categoryId ∈ list ή null). `deepseekChat` → parse.

---

## 5. UI (Steel & Frost, §4β/§6)
- **Λίστα «Προγράμματα»**: DataTable §4α (τίτλος, referenceCode, budget, submissionEnd, status badge, extractStatus badge) + primary «Νέο πρόγραμμα».
- **Program detail/editor**: glass sections, editable κατηγορίες/παραδοτέα/…, «Επαναποδελτίωση» κουμπί, cost panel role-gated.
- **Δαπάνες**: πίνακας ανά application· κάθε γραμμή δείχνει προτεινόμενη κατηγορία (chip + reason tooltip, χαμηλό confidence = coral), «Επιβεβαίωση» inline. «Νέα δαπάνη» dialog. «Πρόταση για όλες».
- react-icons/lu, base-ui, Ελληνικά, πραγματικό progress στην αποδελτίωση (όχι bare spinner — μπορεί να πάρει λεπτά).

---

## 6. Security & cost
- Κάθε action gated `requirePermission('programs.manage')` (πρόγραμμα/δαπάνες). PDF σε **private** Bunny. Κόστος DeepSeek role-gated (reuse `buildOcrCostViewForSession`, provider deepseek). AiUsage logging. Ελληνικά μηνύματα, καμία raw error.

## 7. Object registry + permissions
Νέο item: `{ key:'programs', href:'/programs', label:'Προγράμματα', icon: Landmark (lucide-react), menuPermission:'programs.manage', permissions:[{ key:'programs.manage', description:'Διαχείριση προγραμμάτων & δαπανών' }] }`. (Ενημέρωση των permission-derivation tests όπως στο B/Task 10.)

## 8. Testing (TDD)
- **Pure/iso units**: `buildCategorizePrompt` (παραθέτει κατηγορίες/όρια), `extract-prompt` shape, `types.ts` helpers, `persist.ts` pure mapping (ExtractedProgram→write-data: κατηγορίες με %/mandatory, deliverables, dates coercion), `pdf-text` cap.
- **Server**: `extract.ts`/`categorize.ts` με mocked `deepseekChat` (parse+fallback path)· action guards.
- **e2e** (όπου εφικτό, βλ. env footgun): create program happy path.

## 9. Εκτός scope (v1 του C1+C3)
- **C2**: παρακολούθηση υποχρεώσεων/παραδοτέων ανά application (upload δικαιολογητικών/βεβαιώσεων, fulfillment status, PM dashboards).
- **C4**: DeepSeek query/RAG layer πάνω στα δεδομένα προγράμματος.
- **Scanned PDF OCR** (Gemini vision πριν το DeepSeek) — v1 = text-only.
- ProgramExpense population μέσω OCR (section 1) / A-ingestion.
- Σύνδεση `ProgramRequiredField`→`TaxFormTemplate` (B integration) — C2/C4.

## 10. Definition of Done
- Migration + models (Program + 9 related + ProgramApplication + ProgramExpense) + enums· `Trdr.programApplications`.
- Menu «Προγράμματα»: λίστα + upload PDF → **αποδελτίωση με DeepSeek** → structured relational + `extractedData` JSON, editable.
- Application (Trdr×Program) + δαπάνες: **DeepSeek προτείνει κατηγορία** ανά δαπάνη βάσει κατηγοριών+ποσοστώσεων, με επιβεβαίωση· role-gated κόστος.
- Pure/server tests πράσινα· `tsc` clean· build ΟΚ· Steel & Frost + Ελληνικά.
