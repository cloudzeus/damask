# C2a.2 — Budget Compliance · Expense Substitution · Physical-Object Certification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete the expenses side of the PM «έργο»: (1) live budget-plan compliance (spent vs category min/max € & % limits), (2) expense substitution (old→REPLACED, new links back, live recompute), (3) physical-object certification per expense (serial/location/asset-registry/photo/bank-statement/new-unused cert + verified) at the INSPECTION stage.

**Architecture:** Additive Prisma (`ExpenseStatus`, `ProgramExpense` self-relation + certification 1:1, `ProgramExpenseCertification`). A PURE `checkBudgetCompliance` engine + a PURE `certificationComplete` predicate. pm-scoped server actions routed through the existing `requireVisibleApplication` chokepoint. UI: the existing «Δαπάνες» tab becomes «Δαπάνες & Πλάνο» (compliance panel + replace), plus a new «Πιστοποίηση» tab. Gated Bunny-private downloads for certification files.

**Tech Stack:** Next.js 16.2 (server actions + route handlers), Prisma 7.8/Postgres, base-ui, `bunny-storage` (private), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2a-design.md` §2 (model), §3στ (compliance + substitution), §3ζ (certification), §5 (UI). This is the deferred remainder of C2a; C2a.1 already shipped stages/assignments/obligations/assessment/docs and the C3 `ExpenseList` mounted as the «Δαπάνες» tab.

**Ground rules (from prior PM merges — non-negotiable):**
- Test files live in `tests/` (NOT co-located). Run `npm test -- <name>`.
- Prisma 7.8 multi-line enums. After `prisma migrate`/`format`, `git diff prisma/schema.prisma` and REVERT any unrelated reformatting — keep the diff minimal.
- Pure files (`budget-compliance.ts`, `cert-prep.ts`) must NOT import `@/lib/prisma`/react, and must contain NO clock access.
- Every application-scoped action routes through `requireVisibleApplication(applicationId)`. Child entities (expense, certification) load the parent application first, THEN gate. Never trust a client id.
- base-ui Select forbids empty-string item values (use a sentinel).
- Do NOT stage `.planning/HANDOFF.json` or `vitest.config.ts`.
- Known ambient: one pre-existing unrelated tsc error may appear in `src/app/api/import/status/[id]/route.ts` (`RouteContext`) — ignore it; introduce no others.

**Verified facts to build on:**
- `ProgramExpenseCategory` fields: `minAmount`/`maxAmount` (Decimal?), `minPercentage`/`maxPercentage` (Decimal 5,2 ?), `mandatory` (Boolean), `order`. `Program.totalBudget` (Decimal?).
- `ProgramExpense`: `amount` (Decimal), `categoryId?`, `confirmed` (Boolean), plus suggestion fields. Application relation `applicationId`.
- `ProgramExpenseItem` (read DTO, `src/lib/programs/actions.ts`): `{ id, description, amount:number, vatAmount, date, vendor, docNumber, suggestedCategoryId, suggestionReason, suggestionConfidence, categoryId, confirmed }`.
- `ExpenseList` (`src/components/programs/expense-list.tsx`) `props: { applicationId, categories }`, self-fetches via `listApplicationExpenses(applicationId)`, refreshes after each mutation. `suggestAllExpenses`, category-confirm already exist (C3).
- pm `expenses-tab.tsx` wraps `ExpenseList` with `listApplicationExpenseCategories(applicationId)` (pm-scoped). `application-hub.tsx`: `TabKey = 'assessment'|'obligations'|'expenses'|'deliverables'|'opske'`, `TABS` array, `{activeTab === 'x' && <.../>}` render.
- `requireVisibleApplication(applicationId)` returns `{ session, app }` (full app row). `applicationDocKey(applicationId, id, ext)` → `pm/{applicationId}/{id}.{ext}` in `doc-prep.ts`. `bunnyUploadPrivate(key, buffer, mime)` / `bunnyDownload(key)` in `bunny-storage`.

---

## File Structure

- `prisma/schema.prisma` — `ExpenseStatus` enum; `ProgramExpense` +`status`/`replacesExpenseId`(self 1:1)/`certification`; `ProgramExpenseCertification` model; `User.verifiedCertifications` back-relation. Migration `program_pm_c2a2`.
- `src/lib/pm/budget-compliance.ts` (new, PURE) — `checkBudgetCompliance`.
- `src/lib/pm/cert-prep.ts` (new, PURE) — `certificationComplete`, `certFileKey`, `CERT_FILE_KINDS`.
- `src/lib/pm/actions.ts` — `getBudgetCompliance`, `replaceExpense`, `listCertifications`, `upsertCertification`, `uploadCertificationFile`, `certificationDownloadKey`; extend expense read DTO with `status`/`replacesExpenseId`.
- `src/app/(app)/programs/[id]/applications/[appId]/certifications/[expenseId]/[kind]/route.ts` (new) — gated cert-file download.
- `src/components/pm/expenses-tab.tsx` — add compliance panel + pass replace capability; rename tab.
- `src/components/pm/budget-compliance-panel.tsx` (new) — per-category spent vs limits table.
- `src/components/pm/replace-expense-dialog.tsx` (new).
- `src/components/pm/certification-tab.tsx` (new) + `application-hub.tsx` wiring (new `certification` tab).
- Tests: `tests/pm-budget-compliance.test.ts`, `tests/pm-cert-prep.test.ts`, `tests/pm-c2a2-actions-guard.test.ts`, `tests/pm-replace-expense.test.ts`, `tests/pm-schema-c2a2.test.ts`.

---

## Task 1: Schema — ExpenseStatus, substitution self-relation, certification model

**Files:** Modify `prisma/schema.prisma`; Test `tests/pm-schema-c2a2.test.ts`.

- [ ] **Step 1: Failing test** — `tests/pm-schema-c2a2.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Prisma, ExpenseStatus } from '@prisma/client'

describe('C2a.2 schema', () => {
  it('ExpenseStatus enum has ACTIVE/REPLACED', () => {
    expect(Object.values(ExpenseStatus).sort()).toEqual(['ACTIVE', 'REPLACED'])
  })
  it('ProgramExpense has status + replacesExpenseId', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramExpense')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('status')).toBe(true)
    expect(f.has('replacesExpenseId')).toBe(true)
  })
  it('ProgramExpenseCertification model exists with expected fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramExpenseCertification')
    expect(m).toBeTruthy()
    const f = new Set(m!.fields.map(x => x.name))
    for (const k of ['expenseId', 'serialNumber', 'location', 'assetRegistryRef', 'photoKey', 'bankStatementKey', 'newUnusedCertKey', 'paid', 'verified']) {
      expect(f.has(k), `missing ${k}`).toBe(true)
    }
  })
})
```
Run `npm test -- pm-schema-c2a2` → FAIL.

- [ ] **Step 2: Edit schema.**

Add enum (near the other PM enums):
```prisma
enum ExpenseStatus {
  ACTIVE
  REPLACED
}
```
In `model ProgramExpense`, add (after `confirmed`):
```prisma
  status              ExpenseStatus @default(ACTIVE)
  replacesExpenseId   String?       @unique
  replaces            ProgramExpense?  @relation("ExpenseReplacement", fields: [replacesExpenseId], references: [id], onDelete: SetNull)
  replacedBy          ProgramExpense?  @relation("ExpenseReplacement")
  certification       ProgramExpenseCertification?
```
Add index: `@@index([status])` to its index block.

Add new model:
```prisma
model ProgramExpenseCertification {
  id                String   @id @default(cuid())
  expenseId         String   @unique
  expense           ProgramExpense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  serialNumber      String?
  location          String?
  assetRegistryRef  String?
  assetRegistryDate DateTime?
  photoKey          String?
  bankStatementKey  String?
  newUnusedCertKey  String?
  paid              Boolean  @default(false)
  verified          Boolean  @default(false)
  verifiedById      String?
  verifiedBy        User?    @relation("CertVerifier", fields: [verifiedById], references: [id], onDelete: SetNull)
  notes             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([expenseId])
}
```
In `model User`, add back-relation: `verifiedCertifications ProgramExpenseCertification[] @relation("CertVerifier")`.

- [ ] **Step 3: Migrate.** `npx prisma migrate dev --name program_pm_c2a2` then `npx prisma generate`. `git diff prisma/schema.prisma` → revert any unrelated reformatting. Confirm migration SQL has `CREATE TYPE "ExpenseStatus"`, `CREATE TABLE "ProgramExpenseCertification"`, `ALTER TABLE "ProgramExpense" ADD COLUMN "status"` + `"replacesExpenseId"`.

- [ ] **Step 4:** `npm test -- pm-schema-c2a2` → PASS. `npx tsc --noEmit` → only known RouteContext error.

- [ ] **Step 5: Commit** `git add prisma/schema.prisma prisma/migrations tests/pm-schema-c2a2.test.ts` → `feat(pm): C2a.2 schema — ExpenseStatus + substitution + ProgramExpenseCertification`.

---

## Task 2: Pure — `checkBudgetCompliance`

**Files:** Create `src/lib/pm/budget-compliance.ts`; Test `tests/pm-budget-compliance.test.ts`.

Contract: caller passes ONLY active expenses. Per-category `spent` = Σ amount of expenses that are `confirmed` AND `categoryId === cat.id`. `pct` = totalBudget ? spent/totalBudget*100 : null. Status:
- `OVER` if `(maxAmount != null && spent > maxAmount)` OR `(maxPercentage != null && pct != null && pct > maxPercentage)`.
- `UNDER` if `mandatory` AND `(minAmount != null && spent < minAmount)` OR `(mandatory && minPercentage != null && pct != null && pct < minPercentage)`.
- else `OK`.
`uncategorized` = Σ amount of active expenses with no `categoryId` OR not `confirmed`. `totalSpent` = Σ amount of all active expenses. `ok` = no category OVER/UNDER.

- [ ] **Step 1: Failing test** — `tests/pm-budget-compliance.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { checkBudgetCompliance, type ComplianceExpense, type ComplianceCategory } from '@/lib/pm/budget-compliance'

const cat = (o: Partial<ComplianceCategory> & { id: string; name: string }): ComplianceCategory => ({
  minAmount: null, maxAmount: null, minPercentage: null, maxPercentage: null, mandatory: false, ...o,
})
const exp = (amount: number, categoryId: string | null, confirmed = true): ComplianceExpense => ({ amount, categoryId, confirmed })

describe('checkBudgetCompliance', () => {
  it('sums confirmed categorized expenses per category', () => {
    const r = checkBudgetCompliance([exp(100, 'a'), exp(50, 'a'), exp(30, 'b')], [cat({ id: 'a', name: 'A' }), cat({ id: 'b', name: 'B' })], 1000)
    expect(r.categories.find(c => c.id === 'a')!.spent).toBe(150)
    expect(r.categories.find(c => c.id === 'a')!.pct).toBeCloseTo(15)
    expect(r.totalSpent).toBe(180)
  })
  it('flags OVER on maxAmount', () => {
    const r = checkBudgetCompliance([exp(500, 'a')], [cat({ id: 'a', name: 'A', maxAmount: 400 })], 1000)
    expect(r.categories[0].status).toBe('OVER')
    expect(r.ok).toBe(false)
  })
  it('flags UNDER only when mandatory + below minAmount', () => {
    const under = checkBudgetCompliance([exp(100, 'a')], [cat({ id: 'a', name: 'A', minAmount: 300, mandatory: true })], 1000)
    expect(under.categories[0].status).toBe('UNDER')
    const notMandatory = checkBudgetCompliance([exp(100, 'a')], [cat({ id: 'a', name: 'A', minAmount: 300, mandatory: false })], 1000)
    expect(notMandatory.categories[0].status).toBe('OK')
  })
  it('percentage limits use totalBudget', () => {
    const r = checkBudgetCompliance([exp(600, 'a')], [cat({ id: 'a', name: 'A', maxPercentage: 50 })], 1000)
    expect(r.categories[0].status).toBe('OVER') // 60% > 50%
  })
  it('pct is null when no budget', () => {
    const r = checkBudgetCompliance([exp(100, 'a')], [cat({ id: 'a', name: 'A', maxPercentage: 50 })], null)
    expect(r.categories[0].pct).toBeNull()
    expect(r.categories[0].status).toBe('OK') // can't evaluate % without budget
  })
  it('uncategorized = active without category or unconfirmed', () => {
    const r = checkBudgetCompliance([exp(40, null), exp(60, 'a', false)], [cat({ id: 'a', name: 'A' })], 1000)
    expect(r.uncategorized).toBe(100)
    expect(r.categories[0].spent).toBe(0)
  })
  it('empty → ok', () => {
    expect(checkBudgetCompliance([], [], 1000).ok).toBe(true)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/pm/budget-compliance.ts`:
```ts
export type ComplianceExpense = { amount: number; categoryId: string | null; confirmed: boolean }
export type ComplianceCategory = {
  id: string; name: string
  minAmount: number | null; maxAmount: number | null
  minPercentage: number | null; maxPercentage: number | null
  mandatory: boolean
}
export type ComplianceStatus = 'OK' | 'UNDER' | 'OVER'
export type CategoryCompliance = ComplianceCategory & { spent: number; pct: number | null; status: ComplianceStatus }
export type BudgetCompliance = {
  categories: CategoryCompliance[]
  uncategorized: number
  totalSpent: number
  totalBudget: number | null
  ok: boolean
  violations: { categoryId: string; name: string; type: 'UNDER' | 'OVER' }[]
}

export function checkBudgetCompliance(
  activeExpenses: ComplianceExpense[],
  categories: ComplianceCategory[],
  totalBudget: number | null,
): BudgetCompliance {
  const totalSpent = activeExpenses.reduce((s, e) => s + e.amount, 0)
  const uncategorized = activeExpenses
    .filter(e => !e.categoryId || !e.confirmed)
    .reduce((s, e) => s + e.amount, 0)

  const cats = categories.map<CategoryCompliance>(c => {
    const spent = activeExpenses
      .filter(e => e.confirmed && e.categoryId === c.id)
      .reduce((s, e) => s + e.amount, 0)
    const pct = totalBudget && totalBudget > 0 ? (spent / totalBudget) * 100 : null
    let status: ComplianceStatus = 'OK'
    const over = (c.maxAmount != null && spent > c.maxAmount) || (c.maxPercentage != null && pct != null && pct > c.maxPercentage)
    const under = c.mandatory && ((c.minAmount != null && spent < c.minAmount) || (c.minPercentage != null && pct != null && pct < c.minPercentage))
    if (over) status = 'OVER'
    else if (under) status = 'UNDER'
    return { ...c, spent, pct, status }
  })

  const violations = cats.filter(c => c.status !== 'OK').map(c => ({ categoryId: c.id, name: c.name, type: c.status as 'UNDER' | 'OVER' }))
  return { categories: cats, uncategorized, totalSpent, totalBudget, ok: violations.length === 0, violations }
}
```

- [ ] **Step 3:** `npm test -- pm-budget-compliance` → PASS. Commit `git add src/lib/pm/budget-compliance.ts tests/pm-budget-compliance.test.ts` → `feat(pm): C2a.2 pure — checkBudgetCompliance`.

---

## Task 3: Pure — certification completeness + file-kind mapping

**Files:** Create `src/lib/pm/cert-prep.ts`; Test `tests/pm-cert-prep.test.ts`.

- [ ] **Step 1: Failing test** — `tests/pm-cert-prep.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { certificationComplete, certFileKey, CERT_FILE_KINDS, type CertState } from '@/lib/pm/cert-prep'

const full: CertState = {
  serialNumber: 'SN1', location: 'Αθήνα', assetRegistryRef: 'MP-1',
  photoKey: 'k1', bankStatementKey: 'k2', newUnusedCertKey: 'k3', paid: true,
}

describe('certificationComplete', () => {
  it('true when all mandatory pieces present', () => {
    expect(certificationComplete(full)).toBe(true)
  })
  it('false when photo missing', () => {
    expect(certificationComplete({ ...full, photoKey: null })).toBe(false)
  })
  it('false when not paid', () => {
    expect(certificationComplete({ ...full, paid: false })).toBe(false)
  })
  it('false when serial and location both missing', () => {
    expect(certificationComplete({ ...full, serialNumber: null, location: null })).toBe(false)
  })
})

describe('certFileKey', () => {
  it('maps kind → deterministic bunny key', () => {
    expect(certFileKey('app1', 'exp1', 'photo', 'jpg')).toBe('pm/app1/cert/exp1/photo.jpg')
  })
  it('CERT_FILE_KINDS lists the three file slots', () => {
    expect(CERT_FILE_KINDS.slice().sort()).toEqual(['bankStatement', 'newUnusedCert', 'photo'])
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/pm/cert-prep.ts`:
```ts
export const CERT_FILE_KINDS = ['photo', 'bankStatement', 'newUnusedCert'] as const
export type CertFileKind = (typeof CERT_FILE_KINDS)[number]

export type CertState = {
  serialNumber: string | null
  location: string | null
  assetRegistryRef: string | null
  photoKey: string | null
  bankStatementKey: string | null
  newUnusedCertKey: string | null
  paid: boolean
}

// Physical-object certification is complete only when: identified (serial OR location),
// registered in the asset registry, photographed, paid (with bank statement), and the
// new-and-unused certificate is on file. Mirrors spec §3ζ.
export function certificationComplete(c: CertState): boolean {
  const identified = !!(c.serialNumber || c.location)
  return identified
    && !!c.assetRegistryRef
    && !!c.photoKey
    && c.paid
    && !!c.bankStatementKey
    && !!c.newUnusedCertKey
}

const KEY_FIELD: Record<CertFileKind, string> = { photo: 'photoKey', bankStatement: 'bankStatementKey', newUnusedCert: 'newUnusedCertKey' }
export const certKeyField = (k: CertFileKind) => KEY_FIELD[k]

export function certFileKey(applicationId: string, expenseId: string, kind: CertFileKind, ext: string): string {
  return `pm/${applicationId}/cert/${expenseId}/${kind}.${ext}`
}
```

- [ ] **Step 3:** `npm test -- pm-cert-prep` → PASS. Commit `git add src/lib/pm/cert-prep.ts tests/pm-cert-prep.test.ts` → `feat(pm): C2a.2 pure — certification completeness + file keys`.

---

## Task 4: Server actions — budget compliance read + expense replacement

**Files:** Modify `src/lib/pm/actions.ts`; Tests `tests/pm-c2a2-actions-guard.test.ts`, `tests/pm-replace-expense.test.ts`.

- [ ] **Step 1: Read** the existing `generateObligations` / `listApplicationExpenseCategories` / any expense read in `src/lib/pm/actions.ts` and the C3 `suggestExpenseCategory` in `src/lib/programs/actions.ts` (for the auto-suggest on the new expense). Note how `requireVisibleApplication` and the category loader work.

- [ ] **Step 2: Guard test** — `tests/pm-c2a2-actions-guard.test.ts` (mirror `tests/pm-actions-guard.test.ts`: mock `@/lib/rbac-server` so `requirePermission` rejects both `pm.work` and `pm.manage`, mock prisma minimally, assert each new action rejects):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
import { requirePermission } from '@/lib/rbac-server'
import { getBudgetCompliance, replaceExpense, listCertifications, upsertCertification, uploadCertificationFile } from '@/lib/pm/actions'
beforeEach(() => { vi.mocked(requirePermission).mockReset(); vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden')) })
describe('C2a.2 actions enforce pm access', () => {
  it('getBudgetCompliance', async () => { await expect(getBudgetCompliance('a1')).rejects.toThrow() })
  it('replaceExpense', async () => { await expect(replaceExpense('e1', { description: 'x', amount: 1 })).rejects.toThrow() })
  it('listCertifications', async () => { await expect(listCertifications('a1')).rejects.toThrow() })
  it('upsertCertification', async () => { await expect(upsertCertification('e1', {})).rejects.toThrow() })
  it('uploadCertificationFile', async () => { await expect(uploadCertificationFile('e1', 'photo', { base64: '', mimeType: 'image/jpeg', ext: 'jpg' })).rejects.toThrow() })
})
```
> NOTE: `requirePmAccess` (used by `requireVisibleApplication`) tries `pm.work` then `pm.manage`. Mocking `requirePermission` to always reject makes both fail → the actions throw. Verify against the real `requirePmAccess` implementation and align if needed. Run → FAIL.

- [ ] **Step 3: Implement** in `src/lib/pm/actions.ts`.

`getBudgetCompliance` (pm-scoped):
```ts
import { checkBudgetCompliance, type ComplianceExpense } from '@/lib/pm/budget-compliance'
// ...
export async function getBudgetCompliance(applicationId: string) {
  const { app } = await requireVisibleApplication(applicationId)
  const [expenses, program] = await Promise.all([
    prisma.programExpense.findMany({ where: { applicationId, status: 'ACTIVE' }, select: { amount: true, categoryId: true, confirmed: true } }),
    prisma.program.findUniqueOrThrow({ where: { id: app.programId }, select: { totalBudget: true, expenseCats: { orderBy: { order: 'asc' } } } }),
  ])
  const active: ComplianceExpense[] = expenses.map(e => ({ amount: Number(e.amount), categoryId: e.categoryId, confirmed: e.confirmed }))
  const categories = program.expenseCats.map(c => ({
    id: c.id, name: c.name,
    minAmount: c.minAmount != null ? Number(c.minAmount) : null,
    maxAmount: c.maxAmount != null ? Number(c.maxAmount) : null,
    minPercentage: c.minPercentage != null ? Number(c.minPercentage) : null,
    maxPercentage: c.maxPercentage != null ? Number(c.maxPercentage) : null,
    mandatory: c.mandatory,
  }))
  return checkBudgetCompliance(active, categories, program.totalBudget != null ? Number(program.totalBudget) : null)
}
```
> Confirm the `Program` relation field name for categories — it is `expenseCategories` per the C1 schema (`ProgramExpenseCategory[]`). Verify in schema; adjust the `include`/`select` name if different.

`replaceExpense` (pm-scoped via the OLD expense's application):
```ts
export async function replaceExpense(oldExpenseId: string, input: { description: string; amount: number; vatAmount?: number | null; date?: string | null; vendor?: string | null; docNumber?: string | null }): Promise<{ id: string }> {
  const old = await prisma.programExpense.findUniqueOrThrow({ where: { id: oldExpenseId }, select: { applicationId: true, status: true } })
  await requireVisibleApplication(old.applicationId)
  if (old.status === 'REPLACED') throw new Error('Η δαπάνη έχει ήδη αντικατασταθεί.')
  const created = await prisma.$transaction(async tx => {
    const neo = await tx.programExpense.create({
      data: {
        applicationId: old.applicationId,
        description: input.description.trim(),
        amount: input.amount,
        vatAmount: input.vatAmount ?? null,
        date: input.date ? new Date(input.date) : null,
        vendor: input.vendor ?? null,
        docNumber: input.docNumber ?? null,
        status: 'ACTIVE',
        replacesExpenseId: oldExpenseId,
      },
    })
    await tx.programExpense.update({ where: { id: oldExpenseId }, data: { status: 'REPLACED' } })
    return neo
  })
  // best-effort auto category suggestion (C3) — non-fatal
  try { const { suggestExpenseCategory } = await import('@/lib/programs/actions'); await suggestExpenseCategory(created.id) } catch (e) { console.error('[replaceExpense] suggest failed', e) }
  revalidatePath(`/pm/applications/${old.applicationId}`)
  return { id: created.id }
}
```
> Verify `suggestExpenseCategory`'s real name/signature in `src/lib/programs/actions.ts` (C3). If it takes different args, adapt. If it doesn't exist per-expense, skip the suggestion call and leave a comment.

Also **extend the expense read DTO** so the UI can mark/hide REPLACED and show lineage: add `status: 'ACTIVE' | 'REPLACED'` and `replacesExpenseId: string | null` to `ProgramExpenseItem` (in `src/lib/programs/actions.ts`) and its `listApplicationExpenses` mapping/select. Default the C3 list to still show all; the UI decides styling. (If `listApplicationExpenses` currently returns all statuses, that's fine — just surface `status`.)

- [ ] **Step 4: `replaceExpense` logic test** — `tests/pm-replace-expense.test.ts` (mock prisma + rbac so access passes; assert: new expense created ACTIVE with `replacesExpenseId=old`, old updated to REPLACED, and replacing an already-REPLACED throws). Model `prisma.$transaction` as `async fn => fn(tx)` with a tx stub capturing create/update. Keep assertions on the create data + the update-to-REPLACED.

- [ ] **Step 5:** `npm test -- pm-c2a2-actions-guard pm-replace-expense` → PASS. `npm test -- pm-` → all green. Commit → `feat(pm): C2a.2 actions — budget compliance read + expense replacement`.

---

## Task 5: Server actions — certification CRUD + gated download route

**Files:** Modify `src/lib/pm/actions.ts`; Create the download route; extend the guard test from Task 4 if needed.

- [ ] **Step 1: Implement certification actions** in `src/lib/pm/actions.ts` (all pm-scoped via the expense's application):
```ts
import { certificationComplete, certFileKey, certKeyField, CERT_FILE_KINDS, type CertFileKind } from '@/lib/pm/cert-prep'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'

async function requireVisibleExpense(expenseId: string) {
  const exp = await prisma.programExpense.findUniqueOrThrow({ where: { id: expenseId }, select: { id: true, applicationId: true } })
  const { session } = await requireVisibleApplication(exp.applicationId)
  return { session, expense: exp }
}

export type CertificationItem = {
  expenseId: string; expenseDescription: string; amount: number
  serialNumber: string | null; location: string | null; assetRegistryRef: string | null; assetRegistryDate: string | null
  photoKey: string | null; bankStatementKey: string | null; newUnusedCertKey: string | null
  paid: boolean; verified: boolean; complete: boolean
}

export async function listCertifications(applicationId: string): Promise<CertificationItem[]> {
  await requireVisibleApplication(applicationId)
  const expenses = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    select: { id: true, description: true, amount: true, certification: true },
    orderBy: { createdAt: 'asc' },
  })
  return expenses.map(e => {
    const c = e.certification
    const state = { serialNumber: c?.serialNumber ?? null, location: c?.location ?? null, assetRegistryRef: c?.assetRegistryRef ?? null, photoKey: c?.photoKey ?? null, bankStatementKey: c?.bankStatementKey ?? null, newUnusedCertKey: c?.newUnusedCertKey ?? null, paid: c?.paid ?? false }
    return {
      expenseId: e.id, expenseDescription: e.description, amount: Number(e.amount),
      serialNumber: state.serialNumber, location: state.location, assetRegistryRef: state.assetRegistryRef,
      assetRegistryDate: c?.assetRegistryDate ? c.assetRegistryDate.toISOString() : null,
      photoKey: state.photoKey, bankStatementKey: state.bankStatementKey, newUnusedCertKey: state.newUnusedCertKey,
      paid: state.paid, verified: c?.verified ?? false, complete: certificationComplete(state),
    }
  })
}

export async function upsertCertification(expenseId: string, patch: { serialNumber?: string | null; location?: string | null; assetRegistryRef?: string | null; assetRegistryDate?: string | null; paid?: boolean; verified?: boolean; notes?: string | null }): Promise<void> {
  const { session, expense } = await requireVisibleExpense(expenseId)
  const data: Record<string, unknown> = {}
  if (patch.serialNumber !== undefined) data.serialNumber = patch.serialNumber?.trim() || null
  if (patch.location !== undefined) data.location = patch.location?.trim() || null
  if (patch.assetRegistryRef !== undefined) data.assetRegistryRef = patch.assetRegistryRef?.trim() || null
  if (patch.assetRegistryDate !== undefined) data.assetRegistryDate = patch.assetRegistryDate ? new Date(patch.assetRegistryDate) : null
  if (patch.paid !== undefined) data.paid = patch.paid
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null
  if (patch.verified !== undefined) { data.verified = patch.verified; data.verifiedById = patch.verified ? session.user.id : null }
  await prisma.programExpenseCertification.upsert({
    where: { expenseId },
    create: { expenseId, ...data },
    update: data,
  })
  revalidatePath(`/pm/applications/${expense.applicationId}`)
}

export async function uploadCertificationFile(expenseId: string, kind: CertFileKind, file: { base64: string; mimeType: string; ext: string }): Promise<void> {
  const { expense } = await requireVisibleExpense(expenseId)
  if (!CERT_FILE_KINDS.includes(kind)) throw new Error('Άγνωστος τύπος αρχείου.')
  const key = certFileKey(expense.applicationId, expenseId, kind, file.ext.replace(/[^a-z0-9]/gi, '') || 'bin')
  const body = Buffer.from(file.base64, 'base64')
  await bunnyUploadPrivate({ key, body, contentType: file.mimeType })  // object arg — matches uploadApplicationDocument
  await prisma.programExpenseCertification.upsert({
    where: { expenseId },
    create: { expenseId, [certKeyField(kind)]: key },
    update: { [certKeyField(kind)]: key },
  })
  revalidatePath(`/pm/applications/${expense.applicationId}`)
}

// Returns the bunny key for a cert file IF the caller may see this expense (used by the download route).
export async function certificationDownloadKey(expenseId: string, kind: CertFileKind): Promise<string | null> {
  await requireVisibleExpense(expenseId)
  const c = await prisma.programExpenseCertification.findUnique({ where: { expenseId }, select: { photoKey: true, bankStatementKey: true, newUnusedCertKey: true } })
  if (!c) return null
  const map: Record<CertFileKind, string | null> = { photo: c.photoKey, bankStatement: c.bankStatementKey, newUnusedCert: c.newUnusedCertKey }
  return map[kind]
}
```
> `bunnyUploadPrivate` takes an OBJECT: `bunnyUploadPrivate({ key, body, contentType })` (confirmed at `src/lib/pm/actions.ts:482`). `bunnyDownload(key)` → `Buffer`. Program→categories relation is `expenseCats` (confirmed). `suggestExpenseCategory(expenseId)` exists (C3).

- [ ] **Step 2: Download route** — `src/app/(app)/programs/[id]/applications/[appId]/certifications/[expenseId]/[kind]/route.ts`. Mirror the existing gated document download route (`.../documents/[docId]/route.ts`): parse params, call `certificationDownloadKey(expenseId, kind)` (which gates + scopes), 404 if null, then `bunnyDownload(key)` and stream with the right content-type. On any thrown scope error return 404/403 (match the existing route's error posture — no raw errors).

- [ ] **Step 3: Extend the guard test** (Task 4's file already covers `listCertifications`/`upsertCertification`/`uploadCertificationFile`). Add a case for `certificationDownloadKey` rejecting without access if you exported it. Run guard test → PASS.

- [ ] **Step 4:** `npm test -- pm-` → green. `npx tsc --noEmit` → only known RouteContext error. Commit → `feat(pm): C2a.2 actions — certification CRUD + gated file download`.

---

## Task 6: UI — «Δαπάνες & Πλάνο» tab (compliance panel + replacement)

**Files:** Create `src/components/pm/budget-compliance-panel.tsx`, `src/components/pm/replace-expense-dialog.tsx`; Modify `src/components/pm/expenses-tab.tsx` + `application-hub.tsx` (tab label).

- [ ] **Step 1: `budget-compliance-panel.tsx`** — `'use client'`, `export function BudgetCompliancePanel({ applicationId }: { applicationId: string })`. Self-fetch `getBudgetCompliance(applicationId)`; expose an imperative `refresh` (or accept a `refreshKey` prop the parent bumps after mutations). Render a table: per category → name, δαπανηθέν (€), % π/υ, όρια (min–max € and/or %), status badge (OK muted / UNDER warn / OVER coral). Show `uncategorized`, `totalSpent`, and `totalBudget` in a footer, and a top summary badge «Εντός πλάνου»/«Παραβιάσεις: N» (coral when `!ok`). Greek, base-ui, existing `badge-pill`/coral classes. Loading/error states like `expenses-tab`.

- [ ] **Step 2: `replace-expense-dialog.tsx`** — base-ui Dialog opened per-expense; fields description/amount/vatAmount/date/vendor/docNumber (mirror the C3 `new-expense-dialog.tsx` if present). On submit call `replaceExpense(oldId, input)`, toast, then trigger parent refresh (expense list + compliance panel).

- [ ] **Step 3: Wire into `expenses-tab.tsx`.** Keep the `ExpenseList`. Add the `BudgetCompliancePanel` above or below it. Add a «Αντικατάσταση» affordance per expense row — simplest: since `ExpenseList` is a shared C3 component, do NOT fork it; instead render the replacement entry-point in the pm `expenses-tab` (e.g. a section listing ACTIVE expenses with a replace button, or pass an optional `onReplace` render-prop to `ExpenseList` only if trivially additive). Prefer: keep `ExpenseList` untouched; add a compact «Δαπάνες προς αντικατάσταση» control in the pm tab that opens the dialog for a chosen expense. After any replace, bump a `refreshKey` so both `ExpenseList` (via key remount) and the compliance panel reload. REPLACED expenses render struck-through/dimmed with a «Αντικαταστάθηκε» pill wherever the pm tab lists them.
  - Update the `application-hub.tsx` `TABS` label for `expenses` from «Δαπάνες» → «Δαπάνες & Πλάνο».

- [ ] **Step 4:** `npx tsc --noEmit` (only known error) + `npm run build` + `npm test` → green. Commit → `feat(pm): C2a.2 UI — Δαπάνες & Πλάνο (compliance panel + expense replacement)`.

---

## Task 7: UI — «Πιστοποίηση» tab (INSPECTION)

**Files:** Create `src/components/pm/certification-tab.tsx`; Modify `application-hub.tsx` (new tab).

- [ ] **Step 1: `certification-tab.tsx`** — `'use client'`, `export function CertificationTab({ applicationId }: { applicationId: string })`. Self-fetch `listCertifications(applicationId)`. Render one card per ACTIVE expense: header = description + amount + a «Πιστοποιημένο» badge (green) when `complete`. Form fields: `serialNumber`, `location`, `assetRegistryRef`, `assetRegistryDate` (date), `paid` (Switch), `notes` (textarea), and a `verified` Switch (only enable-to-true when `complete`; if `!complete`, disable the verified toggle with a hint listing what's missing). Persist via `upsertCertification(expenseId, patch)` on blur/change (debounce or on-blur like obligations-tab). Three file slots (photo / εξτρέ τράπεζας / βεβαίωση καινούργιου-αμεταχείριστου): each shows current file (download link → the cert route `/programs/{programId}/applications/{applicationId}/certifications/{expenseId}/{kind}`) + an upload control that reads the file to base64 and calls `uploadCertificationFile(expenseId, kind, { base64, mimeType, ext })`, then reloads. Mirror the upload/base64 approach used by `application-documents.tsx` (C2a.1). Greek, base-ui, coral for incomplete, green for verified.
  - The `programId` is available on the hub; pass it into the tab for building the download URL, or build the URL from `applicationId` + a programId prop.

- [ ] **Step 2: Wire into `application-hub.tsx`:** add `'certification'` to `TabKey`, add `{ key: 'certification', label: 'Πιστοποίηση' }` to `TABS` (place after `deliverables`, reflecting the INSPECTION stage), add `{activeTab === 'certification' && <CertificationTab applicationId={app.id} programId={app.programId} />}`, and import it.

- [ ] **Step 3:** `npx tsc --noEmit` (only known error) + `npm run build` + `npm test` → green. Commit → `feat(pm): C2a.2 UI — Πιστοποίηση φυσικού αντικειμένου tab`.

---

## Task 8: Final verification + holistic review

- [ ] **Step 1:** `npm test` (all green), `npx tsc --noEmit` (only known RouteContext error), `npm run build` (succeeds).
- [ ] **Step 2: Holistic review** (dispatch a final reviewer over `git diff master...HEAD`) focused on: security (every new action + the download route gate via `requireVisibleApplication`/`requireVisibleExpense`; no IDOR on expenseId/kind; cert file download scoped), correctness of `checkBudgetCompliance` (%-vs-budget, mandatory UNDER only, REPLACED excluded because the read filters `status:'ACTIVE'`), `replaceExpense` atomicity (transaction; already-REPLACED guard) + non-fatal suggestion, certification `verified` gating on `complete`, isomorphic purity of `budget-compliance.ts`/`cert-prep.ts`, migration additivity, spec §3στ/§3ζ coverage, no scope creep.
- [ ] **Step 3:** Address any CRITICAL/IMPORTANT findings; then use superpowers:finishing-a-development-branch. **No new permissions** (reuses `pm.work`/`pm.manage` via `requireVisibleApplication`, and `programs.manage` is not needed) → **no `db:sync-permissions`**.

---

## Self-Review Notes

- **Spec coverage:** §2 model → T1; §3στ compliance+substitution → T2/T4/T6; §3ζ certification → T3/T5/T7; §5 UI → T6/T7. All covered.
- **Type consistency:** `ComplianceExpense/Category` used in T2 pure + T4 action mapping; `CertFileKind`/`CERT_FILE_KINDS`/`certKeyField`/`certFileKey` shared across T3 pure + T5 actions + T7 UI + download route. `ExpenseStatus` `'ACTIVE'|'REPLACED'` identical in schema/actions/DTO.
- **Security:** every new action routes through `requireVisibleApplication` (directly or via `requireVisibleExpense` which loads the parent app first); download route gates through `certificationDownloadKey`. No new permission keys.
- **Isomorphic:** date/Number/Decimal coercion + bunny IO stay in `actions.ts`; `budget-compliance.ts` + `cert-prep.ts` are pure (no prisma/react/clock).
- **YAGNI:** `ExpenseList` (C3) is NOT forked; replacement is an additive pm-tab affordance. Certification files are keys on the cert row (no ApplicationDocument rows), downloaded via one gated route.
