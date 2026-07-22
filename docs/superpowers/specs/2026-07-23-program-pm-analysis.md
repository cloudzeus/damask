# Sub-project C2 — Project Management ΕΣΠΑ · Πλήρης Ανάλυση

**Ημερομηνία:** 2026-07-23
**Κατάσταση:** Ανάλυση προς έγκριση (brainstorming) — ΠΡΙΝ από spec/plan/build
**Βάση:** χτίζει πάνω στα C1 (`Program` + `ProgramApplication` + `ProgramExpense` + `ProgramDeliverable` + `ProgramRequiredForm`) και B (`TaxFormTemplate`).

> Ο χρήστης ζήτησε **πλήρη ανάλυση πριν το build**. Αυτό το έγγραφο είναι η ανάλυση: πεδίο, ρόλοι, workflow, μοντέλο, όψεις, αποδόμηση σε φάσεις, ανοιχτές αποφάσεις. Κανένας κώδικας δεν γράφτηκε.

---

## 1. Τι ζητήθηκε (από τα λόγια του χρήστη)

Ένα σύστημα διαχείρισης έργων ΕΣΠΑ **ανά πελάτη ανά πρόγραμμα**, με:
- **Ρόλους & αναθέσεις**: 3 εσωτερικοί + 1 εξωτερικός. SUPER_ADMIN/ADMIN αναθέτουν έναν **Manager** (για τον συγκεκριμένο πελάτη+πρόγραμμα) και έναν **Διεκπεραιωτή** (φέρνει εις πέρας τις εργασίες ολοκλήρωσης). Εξωτερικός = ο **πελάτης**.
- **Ροή εργασίας (στάδια)**: (1) **αξιολόγηση** πελάτη βάσει κριτηρίων (αν εντάσσεται) → (2) **συγκέντρωση δικαιολογητικών** για υποβολή → (3) **καταχώριση δαπανών & παραδοτέων** → (4) **υποβολή στον ΟΠΣΚΕ** → (5) **δελτία ελέγχου φυσικού αντικειμένου**. **Παράλληλα**: τακτικός έλεγχος αν ο πελάτης ανταποκρίνεται στις υποχρεώσεις του.
- **Παρακολούθηση όλων των υποχρεώσεων** + **αποστολή reminders**.
- **Αναφορές** για manager/διαχειριστή: σύνολο πελατών + εκκρεμότητες.
- **ADMIN**: ελέγχει την αποδελτίωση + τροποποιεί παραδοτέα/έντυπα που δεν έπιασε το DeepSeek *(ήδη υπάρχει — tabs editor του C1)*.
- **Όψεις**: καρτέλα πελάτη με τα προγράμματά του· γενική λίστα υποχρεώσεων ανά πρόγραμμα για όλους τους πελάτες· **Kanban (drag-drop), timelines** και άλλες προβολές για σωστή διαχείριση.

---

## 2. Υπάρχουσα υποδομή (verified — τι ξαναχρησιμοποιούμε)

| Ανάγκη | Υπάρχον στο DAMASK |
|---|---|
| Kanban / drag-drop | **`@dnd-kit/core|sortable|utilities`** ήδη εγκατεστημένα |
| Reminders / scheduled jobs | **`pg-boss`** + `src/server/queue-start.ts` (ήδη τρέχει scheduled dispatcher για SoftOne sync) |
| Email | **`src/lib/mailer.ts`** |
| Χρήστες ↔ Πελάτες | `User.trdrId?` + `User.roleId` (ο εξωτερικός πελάτης = CUSTOMER user δεμένος σε `Trdr`) |
| Ρόλοι | 8-role RBAC (SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, CUSTOMER, …) + `db:sync-permissions` |
| Αρχεία | `bunny-storage` (private zone) |
| Έργο (anchor) | **`ProgramApplication`** (Trdr×Program) — φτιάχτηκε ήδη στο C1 γι' αυτόν τον σκοπό |
| Παραδοτέα / Έντυπα | `ProgramDeliverable`, `ProgramRequiredForm` (→ TaxFormTemplate) |
| Δαπάνες | `ProgramExpense` (C3) |
| Κριτήρια | `ProgramCriterion` (από αποδελτίωση) — τροφοδοτεί το στάδιο «αξιολόγηση» |

**Δεν χρειάζεται νέα εξάρτηση.** Timeline/Gantt: custom (καμία lib — απλό, με CSS grid).

---

## 3. Ρόλοι & αναθέσεις (πρόταση)

**Δύο επίπεδα:** (α) global role (RBAC — τι *μπορεί* να κάνει), (β) **per-έργο ανάθεση** (σε *ποια* έργα έχει πρόσβαση).

- **SUPER_ADMIN / ADMIN**: πλήρης πρόσβαση· αναθέτουν manager+διεκπεραιωτή· ελέγχουν αποδελτίωση.
- **MANAGER** (global role): επιβλέπει τα έργα *όπου είναι assigned ως manager*· reports.
- **Διεκπεραιωτής**: εκτελεί τις εργασίες *στα assigned έργα*. → **Απόφαση**: νέος role «ΔΙΕΚΠΕΡΑΙΩΤΗΣ» ή ανάθεση οποιουδήποτε εσωτερικού User; (βλ. §9).
- **Πελάτης (εξωτερικός)**: CUSTOMER user δεμένος σε `Trdr` — βλέπει/ανεβάζει δικαιολογητικά μόνο για τα δικά του έργα (μελλοντικό portal — μπορεί να μπει αργότερα).

**Μοντέλο ανάθεσης:** `ProgramApplication.managerId` (User) + `ProgramApplication.processorId` (User). **Access scoping**: manager/processor βλέπουν ΜΟΝΟ τα assigned· admin/super όλα. (Cross-cutting — υλοποιείται στα server actions με φίλτρο.)

---

## 4. Ο κύκλος ζωής ενός έργου (state machine / Kanban columns)

`ProgramApplication.stage` (enum), με ορισμένες μεταβάσεις:

1. **ΑΞΙΟΛΟΓΗΣΗ** — έλεγχος επιλεξιμότητας βάσει `ProgramCriterion` + thresholds (ΕΜΕ/έτη/ΚΑΔ). Αποτέλεσμα: εντάσσεται / δεν εντάσσεται.
2. **ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ** — συγκέντρωση όλων των απαιτούμενων εντύπων/δικαιολογητικών (από `ProgramRequiredForm` → υποχρεώσεις + upload).
3. **ΔΑΠΑΝΕΣ & ΠΑΡΑΔΟΤΕΑ** — καταχώριση `ProgramExpense` (C3) + fulfillment `ProgramDeliverable`.
4. **ΥΠΟΒΟΛΗ ΟΠΣΚΕ** — καταγραφή υποβολής (ημ/νία, αρ. πρωτοκόλλου, status). *(Όχι API — καταγραφή κατάστασης· βλ. §9.)*
5. **ΔΕΛΤΙΑ ΕΛΕΓΧΟΥ** — ετοιμασία δελτίων ελέγχου φυσικού αντικειμένου.
6. **ΟΛΟΚΛΗΡΩΣΗ / ΠΑΡΑΚΟΛΟΥΘΗΣΗ** — post-completion περιοδικός έλεγχος συμμόρφωσης.

Κάθε στάδιο έχει **υποχρεώσεις (obligations)**· η ολοκλήρωσή τους «ξεκλειδώνει» το επόμενο. Το **Kanban** = τα έργα ως κάρτες στις στήλες-στάδια, drag-drop για προαγωγή.

---

## 5. Υποχρεώσεις & Δικαιολογητικά (το «tracking»)

**`ApplicationObligation`** — ένα trackable item ανά έργο:
- `applicationId`, `stage` (σε ποιο στάδιο ανήκει), `kind` (DELIVERABLE | FORM | CRITERION | TASK | CUSTOM), `sourceId?` (link πίσω σε deliverable/requiredForm/criterion — **snapshot** ώστε αλλαγές στο πρόγραμμα να μην αλλοιώνουν υπάρχοντα έργα), `name`, `mandatory`, `status` (PENDING | IN_PROGRESS | SUBMITTED | APPROVED | REJECTED | WAIVED), `dueDate?`, `assigneeId?` (User), `notes`, `order`.
- **Auto-generation** (απόφαση #1 = auto-snapshot): κατά τη σύνδεση/με κουμπί, τα deliverables + requiredForms + criteria του προγράμματος γίνονται obligations στα κατάλληλα στάδια. + manual add/waive + resync.

**`ApplicationDocument`** — αρχείο (δικαιολογητικό/βεβαίωση) σε Bunny, δεμένο σε obligation (ή στο έργο): `applicationId`, `obligationId?`, `name`, `storageKey`, `mimeType`, `size`, `uploadedById`, `uploadedAt`.

**ΟΠΣΚΕ υποβολή**: `ProgramApplication.opskeStatus/opskeRef/opskeSubmittedAt` (scalar πεδία, όχι ξεχωριστό model).

---

## 6. Reminders & Notifications

- **pg-boss scheduled job** (νέο queue, όπως το `QUEUE_S1_REF_SYNC`): σαρώνει καθημερινά τις obligations με `dueDate` που πλησιάζει/έληξε + έργα σε στάδιο «ΠΑΡΑΚΟΛΟΥΘΗΣΗ» για περιοδικό έλεγχο → στέλνει email (`mailer.ts`) στον manager/processor (και μελλοντικά στον πελάτη).
- In-app «Ειδοποιήσεις/Εκκρεμότητες» (topbar notification center — υπάρχει ήδη το concept από τον import/sync).
- Ρυθμίσεις reminder (πόσες μέρες πριν, συχνότητα) σε `Setting`.

---

## 7. Όψεις (views)

- **Καρτέλα πελάτη (`Trdr`)** → tab «Προγράμματα/Έργα»: λίστα `ProgramApplication` του πελάτη με στάδιο + πρόοδο.
- **Σελίδα έργου (hub)** `/programs/[id]/applications/[appId]`: στάδιο + αναθέσεις + tabs (Αξιολόγηση, Υποχρεώσεις/Δικαιολογητικά, Δαπάνες [C3], Παραδοτέα, ΟΠΣΚΕ, Δελτία ελέγχου) + timeline.
- **Γενική διαχείριση** `/pm` (ή «Έργα»):
  - **Kanban** — έργα ανά στάδιο, drag-drop (dnd-kit), φίλτρα (πρόγραμμα/manager/πελάτης).
  - **Timeline** — έργα/προθεσμίες σε άξονα χρόνου.
  - **Λίστα υποχρεώσεων ανά πρόγραμμα** — για όλους τους πελάτες, με φίλτρα/status.
  - **Reports/Εκκρεμότητες** — ανά manager: έργα, καθυστερήσεις, επόμενες προθεσμίες.

---

## 8. Προτεινόμενη ΑΠΟΔΟΜΗΣΗ σε φάσεις (κρίσιμο — δεν χτίζεται μονομιάς)

| Φάση | Περιεχόμενο | Παραδοτέο |
|---|---|---|
| **C2a — Θεμέλιο PM** | `stage` enum + `managerId/processorId` στο ProgramApplication· `ApplicationObligation` + `ApplicationDocument`· auto-generation obligations από deliverables/forms/criteria· access scoping· **σελίδα έργου (hub)** με υποχρεώσεις/δικαιολογητικά/δαπάνες/ανάθεση· tab «Έργα» στην καρτέλα πελάτη. | Λειτουργικό tracking end-to-end ανά έργο. |
| **C2b — Kanban & Timeline** | Global `/pm` board (dnd-kit, drag-drop stage transitions) + timeline + λίστα υποχρεώσεων ανά πρόγραμμα + φίλτρα. | Οι «πολλές προβολές». |
| **C2c — Reminders & Reports** | pg-boss reminder job + email + notification center· dashboards/reports εκκρεμοτήτων ανά manager. | Ειδοποιήσεις + αναφορές. |
| **C2d (προαιρετικό) — Portal πελάτη** | Ο εξωτερικός πελάτης (CUSTOMER) ανεβάζει δικαιολογητικά / βλέπει status. | Εξωτερική συμμετοχή. |

**Σύσταση:** χτίζουμε **C2a πρώτα** (θεμέλιο), μετά C2b (όψεις), μετά C2c (reminders/reports). Κάθε φάση = δικό της spec→plan→build (όπως A/B/C1).

---

## 9. Ανοιχτές αποφάσεις (χρειάζομαι απαντήσεις πριν το spec του C2a)

1. **Διεκπεραιωτής**: νέος global role «ΔΙΕΚΠΕΡΑΙΩΤΗΣ», ή ανάθεση οποιουδήποτε εσωτερικού User ως processor (χωρίς νέο role); *(Πρόταση: νέος role ΔΙΕΚΠΕΡΑΙΩΤΗΣ για καθαρά permissions + ανάθεση per-έργο.)*
2. **Στάδια**: επιβεβαίωση των 6 (ΑΞΙΟΛΟΓΗΣΗ / ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ / ΔΑΠΑΝΕΣ & ΠΑΡΑΔΟΤΕΑ / ΥΠΟΒΟΛΗ ΟΠΣΚΕ / ΔΕΛΤΙΑ ΕΛΕΓΧΟΥ / ΠΑΡΑΚΟΛΟΥΘΗΣΗ). Θες περισσότερα/λιγότερα;
3. **ΟΠΣΚΕ**: μόνο καταγραφή κατάστασης/ημ/νίας/πρωτοκόλλου (όχι σύνδεση με το πραγματικό ΟΠΣΚΕ API), σωστά;
4. **Access scoping**: ο manager/processor βλέπει ΜΟΝΟ τα assigned έργα του (ναι/όχι);
5. **Αξιολόγηση (στάδιο 1)**: checklist έναντι των `ProgramCriterion` (ναι/όχι ανά κριτήριο + σημείωση), ή scored φόρμα με βαθμολογία;
6. **Ξεκινάμε από C2a** (θεμέλιο), σωστά;

---

## 10. Τι ΔΕΝ αλλάζει / υπάρχει ήδη
Η αποδελτίωση + επεξεργασία προγράμματος (C1, tabs editor), οι δαπάνες + auto-κατηγορία (C3), τα έντυπα→οδηγοί (B link) — όλα έτοιμα και ενσωματώνονται στη σελίδα έργου του C2a.
