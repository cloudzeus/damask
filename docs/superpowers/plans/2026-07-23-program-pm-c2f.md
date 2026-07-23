# C2f — Payment Requests / Partial Payment (δόσεις) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a customer's «έργο» claim partial payment in installments (δόσεις). Each `PaymentRequest` bundles a subset of certified expenses, tracks DRAFT→SUBMITTED→APPROVED→PAID/REJECTED, and no expense is ever claimed twice.

**Architecture:** Additive Prisma (`PaymentRequestStatus`, `PaymentRequest`, `ProgramExpense.paymentRequestId`). PURE eligibility/total/transition engine. pm-scoped actions through `requireVisibleApplication`, with **server-side** eligibility + DRAFT-lock (never trust the client — lesson from C2a.2). New «Αποπληρωμές» tab.

**Tech Stack:** Next.js 16.2 (server actions), Prisma 7.8/Postgres, base-ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2f-payment-requests-design.md`.

**Ground rules (from prior PM merges):**
- Tests in `tests/`. Prisma 7.8 multi-line enums; do NOT run `prisma format` (edit by hand); after migrate, `git diff prisma/schema.prisma` → revert unrelated reformatting.
- Pure `payment.ts` must NOT import prisma/react/clock.
- Every application-scoped action routes through `requireVisibleApplication`; child actions load the parent app first. **Eligibility + DRAFT-lock enforced in the action**, not just UI.
- base-ui Select forbids empty-string values.
- Don't stage `.planning/HANDOFF.json`/`vitest.config.ts`. Known ambient tsc error in `src/app/api/import/status/[id]/route.ts` (RouteContext) may appear — ignore, introduce no others.

**Verified facts:**
- `ProgramExpense`: `amount` (Decimal), `confirmed` (Boolean), `status` (ExpenseStatus 'ACTIVE'|'REPLACED'), `categoryId?`, `applicationId`, `description`, `certification` (1:1 relation → `ProgramExpenseCertification { verified }`).
- `requireVisibleApplication(applicationId)` → `{ session, app }` (full app row); uses `requirePmAccess` (pm.work→pm.manage).
- `application-hub.tsx`: `TabKey` union currently includes `'assessment'|'obligations'|'expenses'|'deliverables'|'certification'|'opske'`; `TABS` array; `{activeTab === 'x' && <.../>}`. `app.id`/`app.programId` available.
- `revalidatePath` used with `/pm/applications/${applicationId}` elsewhere.

---

## Task 1: Schema — PaymentRequest + ProgramExpense.paymentRequestId

**Files:** `prisma/schema.prisma`; Test `tests/pm-schema-c2f.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-schema-c2f.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Prisma, PaymentRequestStatus } from '@prisma/client'
describe('C2f schema', () => {
  it('PaymentRequestStatus enum', () => {
    expect(Object.values(PaymentRequestStatus).sort()).toEqual(['APPROVED', 'DRAFT', 'PAID', 'REJECTED', 'SUBMITTED'])
  })
  it('PaymentRequest model fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'PaymentRequest')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['applicationId', 'ordinal', 'title', 'targetAmount', 'status', 'paidAmount', 'expenses']) expect(f.has(k), k).toBe(true)
  })
  it('ProgramExpense has paymentRequestId', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramExpense')!
    expect(m.fields.some(x => x.name === 'paymentRequestId')).toBe(true)
  })
})
```
Run `npm test -- pm-schema-c2f` → FAIL.

- [ ] **Step 2: Edit schema.** Add enum:
```prisma
enum PaymentRequestStatus {
  DRAFT
  SUBMITTED
  APPROVED
  PAID
  REJECTED
}
```
Add model:
```prisma
model PaymentRequest {
  id            String   @id @default(cuid())
  applicationId String
  application   ProgramApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  ordinal       Int
  title         String?
  targetAmount  Decimal? @db.Decimal(18, 2)
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
```
In `model ProgramExpense` add:
```prisma
  paymentRequestId String?
  paymentRequest   PaymentRequest? @relation(fields: [paymentRequestId], references: [id], onDelete: SetNull)
```
and `@@index([paymentRequestId])`. In `model ProgramApplication` add `paymentRequests PaymentRequest[]`.

- [ ] **Step 3: Migrate.** `npx prisma migrate dev --name program_pm_c2f` (auto-confirm if it needs a TTY), `npx prisma generate`. `git diff prisma/schema.prisma` → revert unrelated reformatting. Confirm migration SQL: `CREATE TYPE "PaymentRequestStatus"`, `CREATE TABLE "PaymentRequest"`, `ALTER TABLE "ProgramExpense" ADD COLUMN "paymentRequestId"`, FK SET NULL.
- [ ] **Step 4:** `npm test -- pm-schema-c2f` → PASS; `npx tsc --noEmit` → only known error.
- [ ] **Step 5: Commit** `git add prisma/schema.prisma prisma/migrations tests/pm-schema-c2f.test.ts` → `feat(pm): C2f schema — PaymentRequest + expense.paymentRequestId`.

---

## Task 2: Pure — eligibility · total · transitions

**Files:** Create `src/lib/pm/payment.ts`; Test `tests/pm-payment.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-payment.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { expenseEligibleForPayment, paymentRequestTotal, canTransition, type PaymentEligibilityInput } from '@/lib/pm/payment'

const e = (o: Partial<PaymentEligibilityInput> = {}): PaymentEligibilityInput => ({ status: 'ACTIVE', confirmed: true, verified: true, paymentRequestId: null, ...o })

describe('expenseEligibleForPayment', () => {
  it('eligible when active+confirmed+verified+unassigned', () => {
    expect(expenseEligibleForPayment(e())).toEqual({ eligible: true, reason: null })
  })
  it('REPLACED → not eligible', () => { expect(expenseEligibleForPayment(e({ status: 'REPLACED' })).eligible).toBe(false) })
  it('not confirmed → not eligible', () => { expect(expenseEligibleForPayment(e({ confirmed: false })).reason).toBeTruthy() })
  it('not verified → not eligible', () => { expect(expenseEligibleForPayment(e({ verified: false })).reason).toBeTruthy() })
  it('in another request → not eligible', () => { expect(expenseEligibleForPayment(e({ paymentRequestId: 'other' })).eligible).toBe(false) })
  it('in THIS request → eligible', () => { expect(expenseEligibleForPayment(e({ paymentRequestId: 'r1' }), 'r1').eligible).toBe(true) })
})
describe('paymentRequestTotal', () => {
  it('sums', () => { expect(paymentRequestTotal([100, 50.5, 0])).toBeCloseTo(150.5) })
  it('empty → 0', () => { expect(paymentRequestTotal([])).toBe(0) })
})
describe('canTransition', () => {
  it('valid edges', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true)
    expect(canTransition('SUBMITTED', 'APPROVED')).toBe(true)
    expect(canTransition('SUBMITTED', 'REJECTED')).toBe(true)
    expect(canTransition('APPROVED', 'PAID')).toBe(true)
    expect(canTransition('REJECTED', 'DRAFT')).toBe(true)
  })
  it('invalid edges', () => {
    expect(canTransition('DRAFT', 'PAID')).toBe(false)
    expect(canTransition('PAID', 'DRAFT')).toBe(false)
    expect(canTransition('APPROVED', 'SUBMITTED')).toBe(false)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/pm/payment.ts`:
```ts
export type PaymentStatusStr = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'REJECTED'
export type PaymentEligibilityInput = { status: 'ACTIVE' | 'REPLACED'; confirmed: boolean; verified: boolean; paymentRequestId: string | null }

export function expenseEligibleForPayment(e: PaymentEligibilityInput, currentRequestId: string | null = null): { eligible: boolean; reason: string | null } {
  if (e.status === 'REPLACED') return { eligible: false, reason: 'αντικαταστάθηκε' }
  if (!e.confirmed) return { eligible: false, reason: 'μη επιβεβαιωμένη κατηγορία' }
  if (!e.verified) return { eligible: false, reason: 'λείπει πιστοποίηση' }
  if (e.paymentRequestId != null && e.paymentRequestId !== currentRequestId) return { eligible: false, reason: 'σε άλλη δόση' }
  return { eligible: true, reason: null }
}

export function paymentRequestTotal(amounts: number[]): number {
  return amounts.reduce((s, a) => s + a, 0)
}

const TRANSITIONS: Record<PaymentStatusStr, PaymentStatusStr[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  PAID: [],
  REJECTED: ['DRAFT'],
}
export function canTransition(from: PaymentStatusStr, to: PaymentStatusStr): boolean {
  return TRANSITIONS[from].includes(to)
}

const STATUS_LABELS: Record<PaymentStatusStr, string> = {
  DRAFT: 'Πρόχειρη', SUBMITTED: 'Υποβλήθηκε', APPROVED: 'Εγκρίθηκε', PAID: 'Πληρώθηκε', REJECTED: 'Απορρίφθηκε',
}
export const paymentStatusLabel = (s: PaymentStatusStr) => STATUS_LABELS[s]
export const nextPaymentStatuses = (s: PaymentStatusStr): PaymentStatusStr[] => TRANSITIONS[s]
```
Run → PASS. Commit `git add src/lib/pm/payment.ts tests/pm-payment.test.ts` → `feat(pm): C2f pure — payment eligibility/total/transitions`.

---

## Task 3: Server actions — payment requests + expense assignment

**Files:** Modify `src/lib/pm/actions.ts`; Tests `tests/pm-c2f-actions-guard.test.ts`, `tests/pm-payment-eligibility.test.ts`.

- [ ] **Step 1: Guard test** `tests/pm-c2f-actions-guard.test.ts` (mirror existing guard tests; `requirePermission` rejects → all reject):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
import { requirePermission } from '@/lib/rbac-server'
import { listPaymentRequests, createPaymentRequest, updatePaymentRequest, deletePaymentRequest, setPaymentRequestStatus, listPaymentEligibleExpenses, addExpenseToRequest, removeExpenseFromRequest } from '@/lib/pm/actions'
beforeEach(() => { vi.mocked(requirePermission).mockReset(); vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden')) })
describe('C2f actions enforce pm access', () => {
  it('listPaymentRequests', async () => { await expect(listPaymentRequests('a1')).rejects.toThrow() })
  it('createPaymentRequest', async () => { await expect(createPaymentRequest('a1', {})).rejects.toThrow() })
  it('updatePaymentRequest', async () => { await expect(updatePaymentRequest('r1', { title: 'x' })).rejects.toThrow() })
  it('deletePaymentRequest', async () => { await expect(deletePaymentRequest('r1')).rejects.toThrow() })
  it('setPaymentRequestStatus', async () => { await expect(setPaymentRequestStatus('r1', 'SUBMITTED')).rejects.toThrow() })
  it('listPaymentEligibleExpenses', async () => { await expect(listPaymentEligibleExpenses('a1')).rejects.toThrow() })
  it('addExpenseToRequest', async () => { await expect(addExpenseToRequest('r1', 'e1')).rejects.toThrow() })
  it('removeExpenseFromRequest', async () => { await expect(removeExpenseFromRequest('e1')).rejects.toThrow() })
})
```
> For actions that load a row before gating (`update`/`delete`/`setStatus`/`add`/`remove` via a request or expense id), the `prisma` `{}` mock makes the pre-load throw, which still satisfies "rejects". Fine. Run → FAIL.

- [ ] **Step 2: Implement** in `src/lib/pm/actions.ts`. Import: `import { expenseEligibleForPayment, paymentRequestTotal, canTransition, type PaymentStatusStr } from '@/lib/pm/payment'`.

Helper to scope a request by its application:
```ts
async function requireVisibleRequest(requestId: string) {
  const req = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: requestId }, select: { id: true, applicationId: true, status: true } })
  await requireVisibleApplication(req.applicationId)
  return req
}
```

Actions:
```ts
export type PaymentRequestItem = {
  id: string; ordinal: number; title: string | null; status: PaymentStatusStr
  targetAmount: number | null; total: number; expenseCount: number
  submittedAt: string | null; approvedAt: string | null; paidAt: string | null; paidAmount: number | null
}

export async function listPaymentRequests(applicationId: string): Promise<PaymentRequestItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.paymentRequest.findMany({
    where: { applicationId },
    orderBy: { ordinal: 'asc' },
    include: { expenses: { select: { amount: true } } },
  })
  return rows.map(r => ({
    id: r.id, ordinal: r.ordinal, title: r.title, status: r.status as PaymentStatusStr,
    targetAmount: r.targetAmount != null ? Number(r.targetAmount) : null,
    total: paymentRequestTotal(r.expenses.map(e => Number(e.amount))),
    expenseCount: r.expenses.length,
    submittedAt: r.submittedAt?.toISOString() ?? null, approvedAt: r.approvedAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null, paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
  }))
}

export async function createPaymentRequest(applicationId: string, input: { title?: string | null; targetAmount?: number | null }): Promise<{ id: string }> {
  const { session } = await requireVisibleApplication(applicationId)
  const max = await prisma.paymentRequest.aggregate({ where: { applicationId }, _max: { ordinal: true } })
  const r = await prisma.paymentRequest.create({
    data: { applicationId, ordinal: (max._max.ordinal ?? 0) + 1, title: input.title?.trim() || null, targetAmount: input.targetAmount ?? null, createdById: session.user.id },
  })
  revalidatePath(`/pm/applications/${applicationId}`)
  return { id: r.id }
}

export async function updatePaymentRequest(id: string, patch: { title?: string | null; targetAmount?: number | null; notes?: string | null }): Promise<void> {
  const req = await requireVisibleRequest(id)
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) data.title = patch.title?.trim() || null
  if (patch.targetAmount !== undefined) data.targetAmount = patch.targetAmount
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null
  await prisma.paymentRequest.update({ where: { id }, data })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function deletePaymentRequest(id: string): Promise<void> {
  const req = await requireVisibleRequest(id)
  if (req.status !== 'DRAFT') throw new Error('Μόνο πρόχειρες δόσεις διαγράφονται.')
  await prisma.paymentRequest.delete({ where: { id } })  // expenses.paymentRequestId → SET NULL
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function setPaymentRequestStatus(id: string, to: PaymentStatusStr, opts?: { paidAmount?: number | null }): Promise<void> {
  const req = await prisma.paymentRequest.findUniqueOrThrow({ where: { id }, select: { applicationId: true, status: true, _count: { select: { expenses: true } } } })
  await requireVisibleApplication(req.applicationId)
  const from = req.status as PaymentStatusStr
  if (!canTransition(from, to)) throw new Error('Μη έγκυρη μετάβαση κατάστασης.')
  if (to === 'SUBMITTED' && req._count.expenses === 0) throw new Error('Η δόση δεν έχει δαπάνες.')
  const data: Record<string, unknown> = { status: to }
  if (to === 'SUBMITTED') data.submittedAt = new Date()
  if (to === 'APPROVED') data.approvedAt = new Date()
  if (to === 'PAID') {
    data.paidAt = new Date()
    if (opts?.paidAmount != null) data.paidAmount = opts.paidAmount
    else {
      const sum = await prisma.programExpense.aggregate({ where: { paymentRequestId: id }, _sum: { amount: true } })
      data.paidAmount = sum._sum.amount != null ? Number(sum._sum.amount) : 0
    }
  }
  if (to === 'DRAFT') { data.submittedAt = null; data.approvedAt = null }
  await prisma.paymentRequest.update({ where: { id }, data })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export type PaymentEligibleExpenseItem = { id: string; description: string; amount: number; eligible: boolean; reason: string | null; inThisRequest: boolean }

export async function listPaymentEligibleExpenses(applicationId: string, requestId?: string | null): Promise<PaymentEligibleExpenseItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: { id: true, description: true, amount: true, confirmed: true, status: true, paymentRequestId: true, certification: { select: { verified: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(r => {
    const { eligible, reason } = expenseEligibleForPayment(
      { status: r.status as 'ACTIVE' | 'REPLACED', confirmed: r.confirmed, verified: r.certification?.verified ?? false, paymentRequestId: r.paymentRequestId },
      requestId ?? null,
    )
    return { id: r.id, description: r.description, amount: Number(r.amount), eligible, reason, inThisRequest: !!requestId && r.paymentRequestId === requestId }
  })
}

export async function addExpenseToRequest(requestId: string, expenseId: string): Promise<void> {
  const req = await requireVisibleRequest(requestId)
  if (req.status !== 'DRAFT') throw new Error('Η δόση δεν είναι πρόχειρη — δεν προστίθενται δαπάνες.')
  const exp = await prisma.programExpense.findUniqueOrThrow({
    where: { id: expenseId },
    select: { id: true, applicationId: true, confirmed: true, status: true, paymentRequestId: true, certification: { select: { verified: true } } },
  })
  if (exp.applicationId !== req.applicationId) throw new Error('Η δαπάνη ανήκει σε άλλο έργο.')
  const { eligible, reason } = expenseEligibleForPayment(
    { status: exp.status as 'ACTIVE' | 'REPLACED', confirmed: exp.confirmed, verified: exp.certification?.verified ?? false, paymentRequestId: exp.paymentRequestId },
    requestId,
  )
  if (!eligible) throw new Error(`Μη επιλέξιμη δαπάνη: ${reason}.`)
  await prisma.programExpense.update({ where: { id: expenseId }, data: { paymentRequestId: requestId } })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function removeExpenseFromRequest(expenseId: string): Promise<void> {
  const exp = await prisma.programExpense.findUniqueOrThrow({ where: { id: expenseId }, select: { id: true, applicationId: true, paymentRequestId: true } })
  await requireVisibleApplication(exp.applicationId)
  if (exp.paymentRequestId) {
    const req = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: exp.paymentRequestId }, select: { status: true } })
    if (req.status !== 'DRAFT') throw new Error('Η δόση δεν είναι πρόχειρη — δεν αφαιρούνται δαπάνες.')
  }
  await prisma.programExpense.update({ where: { id: expenseId }, data: { paymentRequestId: null } })
  revalidatePath(`/pm/applications/${exp.applicationId}`)
}
```

- [ ] **Step 3: Eligibility server-gate test** `tests/pm-payment-eligibility.test.ts` (hoisted prisma mock; rbac passes). Assert `addExpenseToRequest` REJECTS when: (a) request not DRAFT; (b) expense not verified (`certification.verified=false`/null); (c) expense REPLACED; (d) expense already in another request; and SUCCEEDS + calls `programExpense.update({data:{paymentRequestId:requestId}})` when eligible. Model `requireVisibleRequest`'s `prisma.paymentRequest.findUniqueOrThrow`, `requireVisibleApplication`'s `prisma.programApplication.findFirst`, and `prisma.programExpense.findUniqueOrThrow`. Keep assertions on the reject reasons + the successful update call.

- [ ] **Step 4:** `npm test -- pm-c2f-actions-guard pm-payment-eligibility pm-` → green. `npx tsc --noEmit` → only known error. Commit → `feat(pm): C2f actions — payment requests + server-gated expense assignment`.

---

## Task 4: UI — «Αποπληρωμές» tab

**Files:** Create `src/components/pm/payments-tab.tsx` (+ small subcomponents if useful); Modify `application-hub.tsx`.

- [ ] **Step 1: `payments-tab.tsx`** (`'use client'`, `export function PaymentsTab({ applicationId }: { applicationId: string })`). Self-fetch `listPaymentRequests(applicationId)`; loading/error/empty («Δεν υπάρχουν δόσεις.») states mirroring `expenses-tab`/`certification-tab`. Render:
  - «+ Νέα δόση» → `createPaymentRequest(applicationId, { title?, targetAmount? })` (small inline form or dialog), reload.
  - A card per δόση: «{ordinal}η δόση» + `title`, status badge (`paymentStatusLabel`; DRAFT muted / SUBMITTED info / APPROVED ok / PAID green / REJECTED coral), claimed total € + expenseCount + target (if set, show total-vs-target, coral if over target).
  - **Transition buttons**: use `nextPaymentStatuses(status)` (import from `@/lib/pm/payment`) to render only valid next states; each calls `setPaymentRequestStatus(id, to)` (for PAID, prompt/confirm paidAmount defaulting to total). Reload after.
  - **Expense management** (only when `status === 'DRAFT'`): an expandable section calling `listPaymentEligibleExpenses(applicationId, requestId)` — assigned expenses (`inThisRequest`) with a «Αφαίρεση» button (`removeExpenseFromRequest`), and eligible unassigned ones with «Προσθήκη» (`addExpenseToRequest`). Ineligible expenses render greyed with a `badge-pill` showing `reason`. After add/remove, reload the picker + the request list.
  - Non-DRAFT: expense set read-only with a «Κλειδωμένη» note.
  - Greek, base-ui, `toLocaleString('el-GR')`, existing badge/coral classes.
- [ ] **Step 2: Wire `application-hub.tsx`:** add `'payments'` to `TabKey`; `{ key: 'payments', label: 'Αποπληρωμές' }` after `certification`; `{activeTab === 'payments' && <PaymentsTab applicationId={app.id} />}`; import.
- [ ] **Step 3:** `npx tsc --noEmit` (only known error) + `npm run build` + `npm test` → green.
- [ ] **Step 4: Commit** → `feat(pm): C2f UI — Αποπληρωμές tab (δόσεις + eligible-only picker)`.

---

## Task 5: Final verification + holistic review

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build` → all green.
- [ ] **Step 2: Holistic review** over `git diff master...HEAD`: security (all 8 actions gate via `requireVisibleApplication`/`requireVisibleRequest`; child actions load parent first; no IDOR on requestId/expenseId), **server-side eligibility + DRAFT-lock cannot be bypassed** (crucial — mirror the C2a.2 lesson: `addExpenseToRequest` re-checks live verified/status/assignment, doesn't trust client), `canTransition` guards enforced server-side (not just hidden buttons), an expense never in >1 δόση (assignment overwrites only when eligible; SET NULL on delete), Decimal→Number coercion, pure purity, migration additivity, spec coverage, no scope creep.
- [ ] **Step 3:** Fix CRITICAL/IMPORTANT; then superpowers:finishing-a-development-branch. **No new permissions → no `db:sync-permissions`.**

---

## Self-Review Notes
- **Spec coverage:** §2 model → T1; §3α pure → T2; §3β actions → T3; §4 UI → T4. All covered.
- **Type consistency:** `PaymentStatusStr` shared (pure + actions + UI); `expenseEligibleForPayment` signature identical in T2 pure + T3 `listPaymentEligibleExpenses`/`addExpenseToRequest`. `canTransition`/`nextPaymentStatuses` shared T2↔T3↔T4.
- **Security lesson applied:** eligibility + DRAFT-lock + transition validity all enforced in the action, never trusting the client (per C2a.2 CRITICAL finding).
- **No new permissions.** No `db:sync-permissions`.
