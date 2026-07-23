# C2f — Payment Requests / Μερική Αποπληρωμή (δόσεις) — Design Spec

**Date:** 2026-07-23
**Sub-project:** C2f (part of C2 — ΕΣΠΑ Project Management). Builds on C2a.1 (`ProgramApplication`, stages), C3 (`ProgramExpense`), and **C2a.2** (`ExpenseStatus`, `ProgramExpenseCertification.verified`).
**Status:** Approved design (brainstorming 2026-07-23) → ready for implementation plan.

---

## 0. Locked decisions (brainstorming)
1. **Bundle + certification gate** (from C2e brainstorm): a `PaymentRequest` bundles a subset of expenses; an expense joins a δόση only if eligible.
2. **Eligibility** = `status === ACTIVE` **AND** `confirmed` **AND** `certification.verified === true` **AND** not already in another payment request. Per-expense, enforced server-side.
3. **Amount** = auto Σ of the bundled expenses' `amount`; plus an optional `targetAmount` (reference, e.g. «1η δόση = 40%»).
4. **Status flow** = `DRAFT → SUBMITTED → APPROVED → PAID` (+ `REJECTED`), changed by anyone with pm access to the (assigned) application, with **guards**: expenses can be added/removed **only while DRAFT**.

## 1. Goal
Let each customer request partial payment in installments (δόσεις). Each αίτημα αποπληρωμής marks which certified, compliant expenses it claims, tracks its lifecycle, and shows the claimed total vs an optional target — so the office can manage staged disbursement without an expense ever being double-claimed.

## 2. Data model (additive Prisma)

```prisma
enum PaymentRequestStatus {
  DRAFT
  SUBMITTED
  APPROVED
  PAID
  REJECTED
}

model PaymentRequest {
  id            String   @id @default(cuid())
  applicationId String
  application   ProgramApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  ordinal       Int                          // δόση # (1η, 2η…), auto = max+1 per application
  title         String?
  targetAmount  Decimal? @db.Decimal(18, 2)  // optional reference target
  status        PaymentRequestStatus @default(DRAFT)
  notes         String?
  submittedAt   DateTime?
  approvedAt    DateTime?
  paidAt        DateTime?
  paidAmount    Decimal? @db.Decimal(18, 2)
  createdById   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  expenses      ProgramExpense[]

  @@index([applicationId])
}

// ── ProgramExpense: additive ──
// paymentRequestId String?
// paymentRequest   PaymentRequest? @relation(fields:[paymentRequestId], references:[id], onDelete:SetNull)
// @@index([paymentRequestId])
```
`ProgramApplication` gets `paymentRequests PaymentRequest[]`. Migration additive. `onDelete: SetNull` on the expense side so deleting a δόση frees its expenses (does not delete them).

## 3. Logic

### 3α. Eligibility (PURE)
`src/lib/pm/payment.ts`:
```ts
export type PaymentEligibilityInput = { status: 'ACTIVE' | 'REPLACED'; confirmed: boolean; verified: boolean; paymentRequestId: string | null }
export function expenseEligibleForPayment(e, currentRequestId = null): { eligible: boolean; reason: string | null }
```
Eligible when `status==='ACTIVE' && confirmed && verified && (paymentRequestId == null || paymentRequestId === currentRequestId)`. Else `reason` ∈ «αντικαταστάθηκε» / «μη επιβεβαιωμένη κατηγορία» / «λείπει πιστοποίηση» / «σε άλλη δόση». Also PURE `paymentRequestTotal(amounts: number[])` and a `canTransition(from, to)` guard map.

### 3β. Actions (`src/lib/pm/actions.ts`, all pm-scoped via `requireVisibleApplication`)
- `listPaymentRequests(applicationId)` → each: `{ id, ordinal, title, status, targetAmount, total (Σ expenses), expenseCount, submittedAt/approvedAt/paidAt, paidAmount }`.
- `createPaymentRequest(applicationId, { title?, targetAmount? })` → `ordinal = (max ordinal on app)+1`, status DRAFT.
- `updatePaymentRequest(id, { title?, targetAmount?, notes? })` — editable anytime; scoped via the request's application.
- `deletePaymentRequest(id)` — **only when DRAFT**; frees (unassigns) its expenses.
- `setPaymentRequestStatus(id, status)` — validate via `canTransition`; `SUBMITTED` requires ≥1 expense; entering `PAID` stamps `paidAt` + defaults `paidAmount = total` (overridable); stamps `submittedAt`/`approvedAt` on those transitions; `REJECTED → DRAFT` reopen allowed. **Expense add/remove blocked unless DRAFT.**
- `listPaymentEligibleExpenses(applicationId, requestId?)` → all ACTIVE expenses with `{ id, description, amount, eligible, reason, inThisRequest }` (joins `confirmed`, `certification.verified`, `paymentRequestId`) so the picker can show eligible selectable + ineligible greyed-with-reason.
- `addExpenseToRequest(requestId, expenseId)` — load request (must be DRAFT) + expense (same application, **eligible** per the pure fn using live `verified`/`confirmed`/`status`/`paymentRequestId`); reject otherwise. **Server-side gate — never trust the client** (lesson from C2a.2 certification). Sets `expense.paymentRequestId`.
- `removeExpenseFromRequest(expenseId)` — request must be DRAFT; clears `paymentRequestId`.

### 3γ. Interactions with earlier phases
- Reads C2a.2 `ProgramExpenseCertification.verified` (eligibility) — an expense becomes claimable only once its physical-object certification is complete+verified.
- REPLACED expenses (C2a.2) are never eligible.
- Independent of budget-compliance panel (that stays informational at the application level; the δόση does not re-check category limits — decided: certification gate only).

## 4. UI (Steel & Frost, Greek)
New tab **«Αποπληρωμές»** in `application-hub.tsx` (after «Πιστοποίηση», reflecting the disbursement phase):
- **List** of δόσεων: ordinal («1η δόση»), status badge (DRAFT muted · SUBMITTED info · APPROVED ok · PAID green · REJECTED coral), claimed total €, expense count, target (if set). «+ Νέα δόση».
- **Δόση detail** (expand/dialog): header with status + transition buttons (guarded — only valid next states shown; PAID prompts for paidAmount defaulting to total), title/target/notes edit (DRAFT), and the **expense picker**: its assigned expenses (removable while DRAFT) + an «Προσθήκη δαπανών» list of eligible ACTIVE expenses (selectable), with ineligible ones greyed showing the reason badge («λείπει πιστοποίηση» etc.). Total vs target with coral when over/under target (informational).
- Once past DRAFT, the expense set is read-only (locked) with a note.
- base-ui, react-icons/lu, €-format `toLocaleString('el-GR')`.

## 5. File structure
- `prisma/schema.prisma` — `PaymentRequestStatus`, `PaymentRequest`, `ProgramExpense.paymentRequestId`, `ProgramApplication.paymentRequests`. Migration `program_pm_c2f`.
- `src/lib/pm/payment.ts` (new, PURE) — `expenseEligibleForPayment`, `paymentRequestTotal`, `canTransition`, `PAYMENT_STATUS` labels.
- `src/lib/pm/actions.ts` — the 8 actions above.
- `src/components/pm/payments-tab.tsx` (new) + `payment-request-card.tsx` / `payment-expense-picker.tsx` as needed; wire new tab into `application-hub.tsx`.
- Tests: `tests/pm-payment.test.ts` (pure), `tests/pm-c2f-actions-guard.test.ts`, `tests/pm-payment-eligibility.test.ts` (add-expense server gate: rejects non-verified / REPLACED / already-in-request / non-DRAFT).

## 6. Permissions & security
- **No new permissions** — reuses `pm.work`/`pm.manage` via `requireVisibleApplication`. No `db:sync-permissions`.
- Every action routes through the visibility chokepoint (child actions load the parent application first). Eligibility + DRAFT-lock enforced **server-side**, not just UI.

## 7. Testing (TDD)
- **Pure:** `expenseEligibleForPayment` (each reason branch; current-request allowance), `paymentRequestTotal`, `canTransition` (valid + invalid edges).
- **Server:** action guards + scoping; `addExpenseToRequest` rejects non-verified/REPLACED/already-claimed/non-DRAFT; `setPaymentRequestStatus` guard (SUBMITTED needs expenses; PAID stamps paidAmount); `deletePaymentRequest` only DRAFT + frees expenses.
- Green unit suite; tsc clean; build OK. (e2e = known `:3000` footgun, not a merge gate.)

## 8. Out of scope
- Reminders/exports of δόσεων (C2c). Customer-portal view of δόση status (C2d). Auto budget-compliance re-check per δόση (decided against — certification gate only). Multi-currency.

## 9. Definition of Done
Migration + models; the 8 pm-scoped actions with server-side eligibility + DRAFT-lock; «Αποπληρωμές» tab (list + create + status flow + eligible-only expense picker with ineligibility reasons); an expense never in >1 δόση; REPLACED/non-verified never claimable. Pure/server tests green; tsc clean; build OK; Steel & Frost + Greek.
