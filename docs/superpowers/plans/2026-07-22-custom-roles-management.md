# Custom Roles Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Επιτρέπει στον SUPER_ADMIN να δημιουργεί custom ρόλους (με αντιγραφή δικαιωμάτων από υπάρχοντα ρόλο και επιλογή εσωτερικός/B2B) και να τους διαγράφει (μετακινώντας τους χρήστες σε άλλον ρόλο).

**Architecture:** DB-driven RBAC. Προσθέτουμε ένα `Role.b2b` flag· νέες server actions `createRole`/`deleteRole` gated με κοινό `requireSuperAdmin()`· δύο νέα client dialogs στο `/roles`. Το `portalHome` περνά στο JWT/session (ίδιο pattern με `role`/`permissions`) ώστε το post-login redirect να δουλεύει για custom ρόλους.

**Tech Stack:** Next.js 16.2, React 19, Prisma 7 (PostgreSQL), NextAuth v5 (JWT), zod 4, Vitest, base-ui dialogs, shadcn-style components.

---

## File Structure

**Modify:**
- `prisma/schema.prisma` — add `Role.b2b Boolean @default(false)`
- `prisma/seed.ts` — seed `b2b` per role
- `src/lib/rbac-server.ts` — new shared `requireSuperAdmin(permission)`
- `src/app/(app)/costs/actions.ts` — use shared `requireSuperAdmin('costs.view')`
- `src/auth.config.ts` — `AuthUserPayload.portalHome` + map from `role.b2b`
- `src/auth.ts` — carry `portalHome` in jwt (sign-in + refresh) & session
- `src/types/next-auth.d.ts` — `Session.user.portalHome`
- `src/lib/role-home.ts` — `roleHome(role, b2b?)`
- `src/app/(app)/roles/actions.ts` — add `createRole`, `deleteRole`
- `src/app/(app)/roles/page.tsx` — load `system`/`b2b`/`description`, pass `isSuperAdmin`
- `src/app/(app)/roles/roles-matrix.tsx` — `RoleData` fields, create button, delete icons
- `tests/costs-actions.test.ts` — add `requireSuperAdmin` to the rbac-server mock
- `tests/role-home.test.ts` — add `b2b` param cases
- `tests/authorize.test.ts` — assert `portalHome`

**Create:**
- `src/app/(app)/roles/create-role-dialog.tsx`
- `src/app/(app)/roles/delete-role-dialog.tsx`
- `tests/roles-crud-actions.test.ts`

---

### Task 1: Add `Role.b2b` flag (schema + migration + seed)

**Files:**
- Modify: `prisma/schema.prisma:37-44`
- Modify: `prisma/seed.ts:18-31`

- [ ] **Step 1: Add the `b2b` field to the Role model**

In `prisma/schema.prisma`, replace the `Role` model (lines 37-44) with:

```prisma
model Role {
  id          String           @id @default(cuid())
  name        String           @unique
  description String?
  system      Boolean          @default(false) // οι βασικοί ρόλοι δεν διαγράφονται
  b2b         Boolean          @default(false) // true → home /portal (B2B), false → /dashboard
  users       User[]
  permissions RolePermission[]
}
```

- [ ] **Step 2: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Create the migration WITHOUT applying (so we can add the backfill)**

Run: `npx prisma migrate dev --name role_b2b_flag --create-only`
Expected: creates `prisma/migrations/<timestamp>_role_b2b_flag/migration.sql` containing `ALTER TABLE "Role" ADD COLUMN "b2b" BOOLEAN NOT NULL DEFAULT false;`

- [ ] **Step 4: Append the data backfill to the generated migration**

Open the new `prisma/migrations/<timestamp>_role_b2b_flag/migration.sql` and append at the end:

```sql
-- Backfill: οι σημερινοί B2B ρόλοι πάνε στην πύλη (/portal)
UPDATE "Role" SET "b2b" = true WHERE "name" IN ('ARCHITECT', 'CUSTOMER', 'SUPPLIER');
```

- [ ] **Step 5: Apply the migration**

Run: `npx prisma migrate dev`
Expected: `Applying migration ... role_b2b_flag` then `Your database is now in sync with your schema.` and the Prisma Client regenerates.

- [ ] **Step 6: Seed `b2b` for fresh databases**

In `prisma/seed.ts`, add a B2B set after the imports (below line 5) and use it in the role upsert. Replace lines 17-31 with:

```ts
  // 2. Ρόλοι + αναθέσεις
  const B2B_ROLE_NAMES = new Set(['ARCHITECT', 'CUSTOMER', 'SUPPLIER'])
  for (const [name, permKeys] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, system: true, b2b: B2B_ROLE_NAMES.has(name) },
    })
    const perms = await prisma.permission.findMany({ where: { key: { in: permKeys } } })
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
      }),
    ])
  }
```

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations
git commit -m "feat(rbac): add Role.b2b flag + backfill migration"
```

---

### Task 2: Shared `requireSuperAdmin()` guard

Extracts the SUPER_ADMIN gate (today local to `costs/actions.ts`) into `rbac-server.ts` so `roles/actions.ts` can reuse it. Parameterised by the base permission so costs keeps requiring `costs.view` and roles requires `user.manage`.

**Files:**
- Modify: `src/lib/rbac-server.ts`
- Modify: `src/app/(app)/costs/actions.ts:32-38,66,106,127,160`
- Test: `tests/costs-actions.test.ts:5-6`

- [ ] **Step 1: Add `requireSuperAdmin` to rbac-server.ts**

Append to `src/lib/rbac-server.ts` (after `requirePermission`):

```ts
/**
 * Για ενέργειες που απαιτούν ρητά ρόλο SUPER_ADMIN (όχι απλώς ένα permission —
 * π.χ. ο ADMIN έχει user.manage/costs.view αλλά ΔΕΝ είναι super admin). Πρώτα
 * ελέγχει το `permission` (ότι βλέπει καν τη σελίδα), μετά το όνομα ρόλου.
 */
export async function requireSuperAdmin(permission: string): Promise<Session> {
  const session = await requirePermission(permission)
  if (session.user.role !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: απαιτείται ρόλος SUPER_ADMIN')
  }
  return session
}
```

- [ ] **Step 2: Use the shared guard in costs/actions.ts**

In `src/app/(app)/costs/actions.ts`:

1. Update the import on line 5 from:
```ts
import { requirePermission } from '@/lib/rbac-server'
```
to:
```ts
import { requirePermission, requireSuperAdmin } from '@/lib/rbac-server'
```

2. Delete the local `requireSuperAdmin` function (lines 32-38, the block starting `async function requireSuperAdmin() {` through its closing `}`).

3. Replace every call `await requireSuperAdmin()` (4 occurrences: in `saveAiMarkup`, `savePricingOverride`, `deletePricingOverride`, `saveApiCostConfig`) with:
```ts
await requireSuperAdmin('costs.view')
```

- [ ] **Step 3: Fix the costs test mock (module now also exports requireSuperAdmin)**

In `tests/costs-actions.test.ts`, replace lines 5-6:

```ts
const requirePermissionMock = vi.fn()
vi.mock('@/lib/rbac-server', () => ({ requirePermission: (...args: unknown[]) => requirePermissionMock(...args) }))
```

with:

```ts
const requirePermissionMock = vi.fn()
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: (...args: unknown[]) => requirePermissionMock(...args),
  requireSuperAdmin: async (permission: string) => {
    const session = await requirePermissionMock(permission)
    if (session.user.role !== 'SUPER_ADMIN') throw new Error('Forbidden: απαιτείται ρόλος SUPER_ADMIN')
    return session
  },
}))
```

- [ ] **Step 4: Run the costs test to verify the refactor is green**

Run: `npx vitest run tests/costs-actions.test.ts`
Expected: PASS (all `saveAiMarkup`/`savePricingOverride`/`deletePricingOverride`/`saveApiCostConfig` role-gating tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rbac-server.ts src/app/\(app\)/costs/actions.ts tests/costs-actions.test.ts
git commit -m "refactor(rbac): extract shared requireSuperAdmin(permission) guard"
```

---

### Task 3: Carry `portalHome` in the session + `roleHome(role, b2b?)`

**Files:**
- Modify: `src/auth.config.ts:4-11,23-30`
- Modify: `src/auth.ts:27-60`
- Modify: `src/types/next-auth.d.ts:4-11`
- Modify: `src/lib/role-home.ts`
- Modify: `src/app/login/actions.ts:27`, `src/app/login/page.tsx:12`
- Test: `tests/role-home.test.ts`, `tests/authorize.test.ts`

- [ ] **Step 1: Write failing roleHome tests for the b2b param**

In `tests/role-home.test.ts`, add these cases inside the `describe('roleHome()', ...)` block (after the existing `it` blocks, before the closing `})`):

```ts
  it('χρησιμοποιεί το b2b flag όταν δοθεί (υπερισχύει του ονόματος)', () => {
    expect(roleHome('CUSTOM_ROLE', true)).toBe('/portal')
    expect(roleHome('CUSTOM_ROLE', false)).toBe('/dashboard')
  })
  it('χωρίς b2b flag πέφτει πίσω στα γνωστά ονόματα', () => {
    expect(roleHome('ADMIN')).toBe('/dashboard')
    expect(roleHome('CUSTOMER')).toBe('/portal')
    expect(roleHome('CUSTOM_ROLE')).toBe('/login')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/role-home.test.ts`
Expected: FAIL — `roleHome('CUSTOM_ROLE', true)` returns `/login`, not `/portal` (b2b param not yet honoured).

- [ ] **Step 3: Update roleHome to honour the b2b flag**

Replace the whole `src/lib/role-home.ts` with:

```ts
const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'SALESMAN'])
const B2B_ROLES = new Set(['ARCHITECT', 'CUSTOMER', 'SUPPLIER'])

/**
 * Πού προωθείται ένας χρήστης μετά τη σύνδεση. Όταν το `b2b` flag είναι γνωστό
 * (από τη session — δουλεύει και για custom ρόλους) το χρησιμοποιούμε άμεσα·
 * αλλιώς fallback στα γνωστά ονόματα των βασικών ρόλων.
 */
export function roleHome(role: string, b2b?: boolean): string {
  if (b2b === true) return '/portal'
  if (b2b === false) return '/dashboard'
  if (INTERNAL_ROLES.has(role)) return '/dashboard'
  if (B2B_ROLES.has(role)) return '/portal'
  return '/login'
}
```

- [ ] **Step 4: Run to verify roleHome tests pass**

Run: `npx vitest run tests/role-home.test.ts`
Expected: PASS

- [ ] **Step 5: Add `portalHome` to the auth payload**

In `src/auth.config.ts`:

1. Add the field to the type (lines 4-11):
```ts
export type AuthUserPayload = {
  id: string
  email: string
  name: string
  role: string
  permissions: string[]
  trdrId: string | null
  portalHome: boolean
}
```

2. Return it from `verifyCredentials` (the returned object, lines 23-30) — add `portalHome`:
```ts
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: user.role.permissions.map(rp => rp.permission.key),
    trdrId: user.trdrId ?? null,
    portalHome: user.role.b2b ?? false,
  }
```

- [ ] **Step 6: Carry `portalHome` through the jwt + session callbacks**

In `src/auth.ts`:

1. In the `jwt` sign-in branch (inside `if (user) {`), add after `token.trdrId = u.trdrId` (line 32):
```ts
        token.portalHome = u.portalHome
```

2. In the refresh branch, add after `token.trdrId = dbUser.trdrId ?? null` (line 49):
```ts
        token.portalHome = dbUser.role.b2b
```

3. In the `session` callback, add after `session.user.trdrId = ...` (line 58):
```ts
      session.user.portalHome = (token.portalHome as boolean) ?? false
```

- [ ] **Step 7: Declare `portalHome` on the session type**

In `src/types/next-auth.d.ts`, add the field (lines 4-11 block):

```ts
declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: string
      permissions: string[]
      trdrId: string | null
      portalHome: boolean
    }
  }
}
```

- [ ] **Step 8: Pass `portalHome` from the login redirect callers**

1. `src/app/login/actions.ts:27` — replace:
```ts
  redirect(roleHome(session?.user?.role ?? ''))
```
with:
```ts
  redirect(roleHome(session?.user?.role ?? '', session?.user?.portalHome))
```

2. `src/app/login/page.tsx:12` — replace:
```ts
  if (session?.user) redirect(roleHome(session.user.role))
```
with:
```ts
  if (session?.user) redirect(roleHome(session.user.role, session.user.portalHome))
```

- [ ] **Step 9: Update the authorize test to cover portalHome**

In `tests/authorize.test.ts`:

1. Add `b2b: false` to the mock role (line 7):
```ts
  role: { name: 'ADMIN', b2b: false, permissions: [{ permission: { key: 'user.manage' } }] },
```

2. Extend the first assertion (line 18):
```ts
    expect(res).toMatchObject({ id: 'u1', role: 'ADMIN', permissions: ['user.manage'], portalHome: false })
```

- [ ] **Step 10: Run the auth-related tests**

Run: `npx vitest run tests/authorize.test.ts tests/role-home.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/auth.config.ts src/auth.ts src/types/next-auth.d.ts src/lib/role-home.ts src/app/login/actions.ts src/app/login/page.tsx tests/authorize.test.ts tests/role-home.test.ts
git commit -m "feat(rbac): carry portalHome in session so custom roles redirect correctly"
```

---

### Task 4: `createRole` + `deleteRole` server actions

**Files:**
- Modify: `src/app/(app)/roles/actions.ts`
- Test: `tests/roles-crud-actions.test.ts` (new)

- [ ] **Step 1: Write the new failing test file**

Create `tests/roles-crud-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

type FakeRole = { id: string; name: string; description: string | null; system: boolean; b2b: boolean }
type FakeRolePermission = { roleId: string; permissionId: string }
type FakeUser = { id: string; roleId: string }

const store: { roles: FakeRole[]; rolePermissions: FakeRolePermission[]; users: FakeUser[] } = {
  roles: [], rolePermissions: [], users: [],
}

let currentRole = 'SUPER_ADMIN'
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(),
  requireSuperAdmin: vi.fn(async () => {
    if (currentRole !== 'SUPER_ADMIN') throw new Error('Forbidden: απαιτείται ρόλος SUPER_ADMIN')
    return { user: { id: 'sa-1', role: currentRole, permissions: [], trdrId: null } }
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const role = store.roles.find(r => (where.id ? r.id === where.id : r.name === where.name)) ?? null
        if (!role) return null
        const out: any = { ...role }
        if (include?.permissions) out.permissions = store.rolePermissions.filter(rp => rp.roleId === role.id)
        if (include?._count?.select?.users) out._count = { users: store.users.filter(u => u.roleId === role.id).length }
        return out
      }),
      create: vi.fn(async ({ data }: any) => {
        if (store.roles.some(r => r.name === data.name)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'x' })
        }
        const role: FakeRole = { id: `role-${data.name}`, name: data.name, description: data.description ?? null, system: data.system, b2b: data.b2b }
        store.roles.push(role)
        for (const p of data.permissions?.create ?? []) store.rolePermissions.push({ roleId: role.id, permissionId: p.permissionId })
        return role
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = store.roles.findIndex(r => r.id === where.id)
        const [removed] = store.roles.splice(idx, 1)
        store.rolePermissions = store.rolePermissions.filter(rp => rp.roleId !== where.id)
        return removed
      }),
    },
    user: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0
        for (const u of store.users) if (u.roleId === where.roleId) { u.roleId = data.roleId; count++ }
        return { count }
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { createRole, deleteRole } from '@/app/(app)/roles/actions'

beforeEach(() => {
  currentRole = 'SUPER_ADMIN'
  store.roles = [
    { id: 'role-super-admin', name: 'SUPER_ADMIN', description: null, system: true, b2b: false },
    { id: 'role-manager', name: 'MANAGER', description: null, system: true, b2b: false },
    { id: 'role-customer', name: 'CUSTOMER', description: null, system: true, b2b: true },
  ]
  store.rolePermissions = [
    { roleId: 'role-manager', permissionId: 'perm-a' },
    { roleId: 'role-manager', permissionId: 'perm-b' },
  ]
  store.users = []
})

describe('createRole()', () => {
  it('δημιουργεί ρόλο και αντιγράφει δικαιώματα από τον ρόλο-πηγή', async () => {
    const res = await createRole({ name: 'shop lead', description: 'Υπεύθυνος καταστήματος', b2b: false, copyFromRoleId: 'role-manager' })
    expect(res.ok).toBe(true)
    const created = store.roles.find(r => r.name === 'SHOP_LEAD')
    expect(created).toMatchObject({ system: false, b2b: false, description: 'Υπεύθυνος καταστήματος' })
    expect(store.rolePermissions.filter(rp => rp.roleId === created!.id).map(rp => rp.permissionId).sort()).toEqual(['perm-a', 'perm-b'])
  })

  it('δημιουργεί κενό ρόλο χωρίς copyFromRoleId', async () => {
    const res = await createRole({ name: 'AUDITOR', b2b: true, copyFromRoleId: '' })
    expect(res.ok).toBe(true)
    const created = store.roles.find(r => r.name === 'AUDITOR')
    expect(created).toMatchObject({ b2b: true })
    expect(store.rolePermissions.filter(rp => rp.roleId === created!.id)).toHaveLength(0)
  })

  it('απορρίπτει μη-SUPER_ADMIN', async () => {
    currentRole = 'ADMIN'
    await expect(createRole({ name: 'X', b2b: false })).rejects.toThrow(/SUPER_ADMIN/)
  })

  it('απορρίπτει διπλότυπο όνομα με φιλικό μήνυμα', async () => {
    const res = await createRole({ name: 'MANAGER', b2b: false })
    expect(res.ok).toBe(false)
  })

  it('απορρίπτει μη έγκυρο όνομα', async () => {
    const res = await createRole({ name: '1', b2b: false })
    expect(res.ok).toBe(false)
  })
})

describe('deleteRole()', () => {
  it('διαγράφει custom ρόλο χωρίς χρήστες', async () => {
    store.roles.push({ id: 'role-x', name: 'X', description: null, system: false, b2b: false })
    const res = await deleteRole('role-x')
    expect(res.ok).toBe(true)
    expect(store.roles.some(r => r.id === 'role-x')).toBe(false)
  })

  it('αρνείται να διαγράψει system ρόλο', async () => {
    const res = await deleteRole('role-manager')
    expect(res.ok).toBe(false)
    expect(store.roles.some(r => r.id === 'role-manager')).toBe(true)
  })

  it('χωρίς reassignToRoleId όταν ο ρόλος έχει χρήστες → απόρριψη', async () => {
    store.roles.push({ id: 'role-x', name: 'X', description: null, system: false, b2b: false })
    store.users.push({ id: 'u1', roleId: 'role-x' })
    const res = await deleteRole('role-x')
    expect(res.ok).toBe(false)
    expect(store.roles.some(r => r.id === 'role-x')).toBe(true)
  })

  it('μετακινεί χρήστες στον αντικαταστάτη και μετά διαγράφει', async () => {
    store.roles.push({ id: 'role-x', name: 'X', description: null, system: false, b2b: false })
    store.users.push({ id: 'u1', roleId: 'role-x' }, { id: 'u2', roleId: 'role-x' })
    const res = await deleteRole('role-x', 'role-manager')
    expect(res.ok).toBe(true)
    expect(store.users.every(u => u.roleId === 'role-manager')).toBe(true)
    expect(store.roles.some(r => r.id === 'role-x')).toBe(false)
  })

  it('απορρίπτει μη-SUPER_ADMIN', async () => {
    currentRole = 'ADMIN'
    await expect(deleteRole('role-manager')).rejects.toThrow(/SUPER_ADMIN/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/roles-crud-actions.test.ts`
Expected: FAIL — `createRole`/`deleteRole` are not exported from `@/app/(app)/roles/actions`.

- [ ] **Step 3: Implement createRole + deleteRole**

In `src/app/(app)/roles/actions.ts`:

1. Replace the imports (lines 1-5) with:
```ts
'use server'

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission, requireSuperAdmin } from '@/lib/rbac-server'
```

2. Append at the end of the file:
```ts
// ── Δημιουργία / Διαγραφή ρόλων (SUPER_ADMIN μόνο) ────────────────────────────

const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Δώσε όνομα (≥2 χαρακτήρες).').max(40, 'Πολύ μεγάλο όνομα.'),
  description: z.string().trim().max(120, 'Πολύ μεγάλη περιγραφή.').optional(),
  b2b: z.boolean(),
  copyFromRoleId: z.string().optional(),
})

export type CreateRoleInput = {
  name: string
  description?: string
  b2b: boolean
  copyFromRoleId?: string
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** Κανονικοποίηση ονόματος ρόλου: TRIM → κενά σε _ → κεφαλαία. */
function normalizeRoleName(raw: string): string {
  return raw.trim().replace(/\s+/g, '_').toUpperCase()
}

/**
 * Δημιουργεί custom ρόλο (SUPER_ADMIN μόνο). Προαιρετική αντιγραφή δικαιωμάτων
 * από υπάρχοντα ρόλο (copyFromRoleId). Τα custom ρόλοι έχουν πάντα system=false.
 */
export async function createRole(input: CreateRoleInput): Promise<ActionResult> {
  await requireSuperAdmin('user.manage')

  const parsed = createRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία του ρόλου.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const name = normalizeRoleName(data.name)
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    return { ok: false, message: 'Μη έγκυρο όνομα ρόλου.', fieldErrors: { name: 'Λατινικά κεφαλαία, αριθμοί και _ (ξεκινά με γράμμα).' } }
  }

  let permissionIds: string[] = []
  if (data.copyFromRoleId) {
    const source = await prisma.role.findUnique({
      where: { id: data.copyFromRoleId },
      include: { permissions: true },
    })
    if (!source) {
      return { ok: false, message: 'Ο ρόλος-πηγή δεν βρέθηκε.', fieldErrors: { copyFromRoleId: 'Επίλεξε έγκυρο ρόλο.' } }
    }
    permissionIds = source.permissions.map(rp => rp.permissionId)
  }

  try {
    await prisma.role.create({
      data: {
        name,
        description: data.description && data.description.length > 0 ? data.description : null,
        system: false,
        b2b: data.b2b,
        permissions: { create: permissionIds.map(permissionId => ({ permissionId })) },
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: 'Υπάρχει ήδη ρόλος με αυτό το όνομα.', fieldErrors: { name: 'Υπάρχει ήδη ρόλος με αυτό το όνομα.' } }
    }
    throw e
  }

  revalidatePath('/roles')
  return { ok: true, message: `Ο ρόλος ${name} δημιουργήθηκε.` }
}

/**
 * Διαγράφει custom ρόλο (SUPER_ADMIN μόνο). Οι system ρόλοι δεν διαγράφονται και
 * δεν διαγράφεις τον δικό σου. Αν ο ρόλος έχει χρήστες, απαιτείται reassignToRoleId
 * (έγκυρος, διαφορετικός) — οι χρήστες μετακινούνται πρώτα, μετά διαγράφεται ο
 * ρόλος (τα RolePermission φεύγουν με cascade).
 */
export async function deleteRole(roleId: string, reassignToRoleId?: string): Promise<ActionResult> {
  const session = await requireSuperAdmin('user.manage')

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  })
  if (!role) return { ok: false, message: 'Ο ρόλος δεν βρέθηκε.' }
  if (role.system) return { ok: false, message: 'Οι βασικοί ρόλοι δεν διαγράφονται.' }
  if (role.name === session.user.role) return { ok: false, message: 'Δεν μπορείς να διαγράψεις τον δικό σου ρόλο.' }

  const userCount = role._count.users
  if (userCount > 0) {
    if (!reassignToRoleId) {
      return { ok: false, message: `Ο ρόλος έχει ${userCount} χρήστες — επίλεξε ρόλο μετακίνησης.` }
    }
    if (reassignToRoleId === roleId) {
      return { ok: false, message: 'Επίλεξε διαφορετικό ρόλο μετακίνησης.' }
    }
    const target = await prisma.role.findUnique({ where: { id: reassignToRoleId } })
    if (!target) return { ok: false, message: 'Ο ρόλος μετακίνησης δεν βρέθηκε.' }

    await prisma.$transaction([
      prisma.user.updateMany({ where: { roleId }, data: { roleId: reassignToRoleId } }),
      prisma.role.delete({ where: { id: roleId } }),
    ])
    revalidatePath('/roles')
    revalidatePath('/users')
    return { ok: true, message: `${userCount} χρήστες μετακινήθηκαν στον ${target.name} και ο ρόλος ${role.name} διαγράφηκε.` }
  }

  await prisma.role.delete({ where: { id: roleId } })
  revalidatePath('/roles')
  revalidatePath('/users')
  return { ok: true, message: `Ο ρόλος ${role.name} διαγράφηκε.` }
}
```

Note: `ActionResult` is already exported at the top of this file (line 7) — reuse it (it has an optional `fieldErrors` variant? No — extend it). Update the existing `ActionResult` (line 7) to include field errors:
```ts
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }
```

- [ ] **Step 4: Run to verify the new tests pass**

Run: `npx vitest run tests/roles-crud-actions.test.ts tests/roles-actions.test.ts`
Expected: PASS (both the new CRUD tests and the existing togglePermission tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/roles/actions.ts tests/roles-crud-actions.test.ts
git commit -m "feat(rbac): createRole (copy-from-role) + deleteRole (reassign users) actions"
```

---

### Task 5: Load role metadata in the page + extend `RoleData`

**Files:**
- Modify: `src/app/(app)/roles/page.tsx:6-30,48`
- Modify: `src/app/(app)/roles/roles-matrix.tsx:9-14,21,36-57`

- [ ] **Step 1: Load `system`/`b2b`/`description` and capture the session**

In `src/app/(app)/roles/page.tsx`, replace lines 6-30 with:

```ts
export default async function RolesPage() {
  const session = await requirePermission('user.manage')
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'

  const roles = await prisma.role.findMany({
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  })

  const rolesData: RoleData[] = roles
    .map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      system: r.system,
      b2b: r.b2b,
      userCount: r._count.users,
      grantedKeys: r.permissions.map(p => p.permission.key),
    }))
    .sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a.name)
      const ib = ROLE_ORDER.indexOf(b.name)
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
```

- [ ] **Step 2: Pass `isSuperAdmin` to the matrix**

In `src/app/(app)/roles/page.tsx`, replace line 48:
```tsx
      <RolesMatrix roles={rolesData} groups={groups} />
```
with:
```tsx
      <RolesMatrix roles={rolesData} groups={groups} isSuperAdmin={isSuperAdmin} />
```

- [ ] **Step 3: Extend the `RoleData` type + card description**

In `src/app/(app)/roles/roles-matrix.tsx`:

1. Replace the `RoleData` type (lines 9-14):
```ts
export type RoleData = {
  id: string
  name: string
  description: string | null
  system: boolean
  b2b: boolean
  userCount: number
  grantedKeys: string[]
}
```

2. Change the card description line (line 50) from:
```tsx
              <div className="c">{ROLE_DESCRIPTIONS[role.name] ?? '—'}</div>
```
to:
```tsx
              <div className="c">{role.description || ROLE_DESCRIPTIONS[role.name] || '—'}</div>
```

- [ ] **Step 4: Verify the type compiles (matrix wiring happens in Task 8)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors ONLY about `RolesMatrix` missing the `isSuperAdmin` prop are acceptable at this point if not yet added — but since page.tsx passes it and the component prop is added in Task 8, expect a prop mismatch error here. Proceed; it is resolved in Task 8. (If you prefer green-at-every-step, do Task 8 before re-running tsc.)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/roles/page.tsx src/app/\(app\)/roles/roles-matrix.tsx
git commit -m "feat(rbac): load role system/b2b/description + pass isSuperAdmin to matrix"
```

---

### Task 6: `CreateRoleDialog` component

**Files:**
- Create: `src/app/(app)/roles/create-role-dialog.tsx`

- [ ] **Step 1: Create the dialog**

Create `src/app/(app)/roles/create-role-dialog.tsx`:

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createRole } from './actions'
import type { RoleData } from './roles-matrix'

const NO_COPY = '__none__'

export function CreateRoleDialog({
  roles,
  open,
  onOpenChange,
}: {
  roles: RoleData[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [b2b, setB2b] = useState(false)
  const [copyFrom, setCopyFrom] = useState<string>(NO_COPY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createRole({
        name,
        description,
        b2b,
        copyFromRoleId: copyFrom === NO_COPY ? '' : copyFrom,
      })
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass w-full max-w-[calc(100%-2rem)] sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Νέος ρόλος</DialogTitle>
          <DialogDescription>Δημιούργησε custom ρόλο και όρισε τα δικαιώματά του.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="create-role-name">Όνομα*</label>
            <div className="inwrap">
              <input
                id="create-role-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="π.χ. SHOP_LEAD"
                required
              />
            </div>
            <div className="help">Λατινικά κεφαλαία/αριθμοί/_ — τα κενά γίνονται _ αυτόματα.</div>
            {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
          </div>

          <div className="field">
            <label htmlFor="create-role-desc">Περιγραφή</label>
            <div className="inwrap">
              <input
                id="create-role-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="π.χ. Υπεύθυνος καταστήματος"
              />
            </div>
            {fieldErrors.description && <div className="error">{fieldErrors.description}</div>}
          </div>

          <div className="field">
            <label htmlFor="create-role-type">Τύπος*</label>
            <Select value={b2b ? 'b2b' : 'internal'} onValueChange={v => setB2b(v === 'b2b')}>
              <SelectTrigger id="create-role-type" aria-label="Τύπος" className="h-11 w-full rounded-full border-border bg-card px-4">
                <SelectValue>{(v: string) => (v === 'b2b' ? 'B2B — πύλη πελατών (/portal)' : 'Εσωτερικός — πίνακας (/dashboard)')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Εσωτερικός — πίνακας (/dashboard)</SelectItem>
                <SelectItem value="b2b">B2B — πύλη πελατών (/portal)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="field">
            <label htmlFor="create-role-copy">Αντιγραφή δικαιωμάτων από</label>
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger id="create-role-copy" aria-label="Αντιγραφή δικαιωμάτων από" className="h-11 w-full rounded-full border-border bg-card px-4">
                <SelectValue>
                  {(v: string) => (v === NO_COPY ? 'Κανένα (κενός ρόλος)' : roles.find(r => r.id === v)?.name ?? '—')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COPY}>Κανένα (κενός ρόλος)</SelectItem>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.copyFromRoleId && <div className="error">{fieldErrors.copyFromRoleId}</div>}
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending}>{pending ? 'Δημιουργία…' : 'Δημιουργία'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(app\)/roles/create-role-dialog.tsx
git commit -m "feat(rbac): CreateRoleDialog (name, type, copy-from-role)"
```

---

### Task 7: `DeleteRoleDialog` component

**Files:**
- Create: `src/app/(app)/roles/delete-role-dialog.tsx`

- [ ] **Step 1: Create the dialog**

Create `src/app/(app)/roles/delete-role-dialog.tsx`:

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { deleteRole } from './actions'
import type { RoleData } from './roles-matrix'

export function DeleteRoleDialog({
  role,
  roles,
  open,
  onOpenChange,
}: {
  role: RoleData
  roles: RoleData[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reassignTo, setReassignTo] = useState<string>('')
  const [pending, startTransition] = useTransition()

  const otherRoles = roles.filter(r => r.id !== role.id)
  const needsReassign = role.userCount > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (needsReassign && !reassignTo) {
      toast.error('Επίλεξε ρόλο μετακίνησης.')
      return
    }
    startTransition(async () => {
      const res = await deleteRole(role.id, needsReassign ? reassignTo : undefined)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass w-full max-w-[calc(100%-2rem)] sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Διαγραφή ρόλου — {role.name}</DialogTitle>
          <DialogDescription>
            {needsReassign
              ? `Ο ρόλος έχει ${role.userCount} ${role.userCount === 1 ? 'χρήστη' : 'χρήστες'}. Επίλεξε πού μετακινούνται πριν τη διαγραφή.`
              : 'Ο ρόλος δεν έχει χρήστες και θα διαγραφεί οριστικά.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {needsReassign && (
            <div className="field">
              <label htmlFor="delete-role-reassign">Μετακίνηση χρηστών σε*</label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger id="delete-role-reassign" aria-label="Μετακίνηση χρηστών σε" className="h-11 w-full rounded-full border-border bg-card px-4">
                  <SelectValue>
                    {(v: string) => otherRoles.find(r => r.id === v)?.name ?? 'Επίλεξε ρόλο…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {otherRoles.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Note: if `variant="destructive"` is not a valid Button variant in this project, use `variant="outline"` instead. Verify with: `grep -n "variant" src/components/ui/button.tsx`.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(app\)/roles/delete-role-dialog.tsx
git commit -m "feat(rbac): DeleteRoleDialog with user-reassignment"
```

---

### Task 8: Wire dialogs into `RolesMatrix`

**Files:**
- Modify: `src/app/(app)/roles/roles-matrix.tsx`

- [ ] **Step 1: Import the dialogs + Trash icon and accept `isSuperAdmin`**

In `src/app/(app)/roles/roles-matrix.tsx`:

1. Update the imports at the top (after line 5) — add:
```tsx
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateRoleDialog } from './create-role-dialog'
import { DeleteRoleDialog } from './delete-role-dialog'
```

2. Change the component signature (line 21) from:
```tsx
export function RolesMatrix({ roles, groups }: { roles: RoleData[]; groups: PermGroup[] }) {
```
to:
```tsx
export function RolesMatrix({ roles, groups, isSuperAdmin }: { roles: RoleData[]; groups: PermGroup[]; isSuperAdmin: boolean }) {
```

3. Add dialog state after line 23 (`const [pending, startTransition] = useTransition()`):
```tsx
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleData | null>(null)
```

- [ ] **Step 2: Add the "Νέος ρόλος" toolbar + per-card delete affordance**

Replace the roles-row block (lines 35-58) with:

```tsx
      {isSuperAdmin && (
        <div className="mb-3 flex justify-end">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus width={15} height={15} strokeWidth={2} aria-hidden /> Νέος ρόλος
          </Button>
        </div>
      )}

      <div className="roles-row stagger">
        {roles.map(role => {
          const on = selectedRole === role.name
          const canDelete = isSuperAdmin && !role.system
          return (
            <div key={role.id} className={`role-card glass lift${on ? ' on' : ''}`} style={{ position: 'relative' }}>
              {canDelete && (
                <button
                  type="button"
                  className="role-card-del"
                  aria-label={`Διαγραφή ρόλου ${role.name}`}
                  title="Διαγραφή ρόλου"
                  style={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={e => { e.stopPropagation(); setDeleteRoleTarget(role) }}
                >
                  <Trash2 width={14} height={14} strokeWidth={1.8} aria-hidden />
                </button>
              )}
              <button
                type="button"
                className="role-card-body"
                aria-pressed={on}
                style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
                onClick={() => setSelectedRole(prev => (prev === role.name ? null : role.name))}
              >
                <div className="n">
                  <span className="status-dot" style={{ background: roleColorVar(role.name) }} aria-hidden />
                  {role.name}
                </div>
                <div className="c">{role.description || ROLE_DESCRIPTIONS[role.name] || '—'}</div>
                <div className="cnt">
                  {role.userCount}
                  <small>{role.userCount === 1 ? 'χρήστης' : 'χρήστες'}</small>
                </div>
              </button>
            </div>
          )
        })}
      </div>
```

- [ ] **Step 3: Render the dialogs at the end of the fragment**

Just before the closing `</>` of the component's returned JSX (after the `table-card` `</div>`, line ~134), add:

```tsx
      {isSuperAdmin && (
        <CreateRoleDialog roles={roles} open={createOpen} onOpenChange={setCreateOpen} />
      )}
      {deleteRoleTarget && (
        <DeleteRoleDialog
          role={deleteRoleTarget}
          roles={roles}
          open={deleteRoleTarget !== null}
          onOpenChange={openState => { if (!openState) setDeleteRoleTarget(null) }}
        />
      )}
```

- [ ] **Step 4: Typecheck the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Lint the changed files**

Run: `npx eslint src/app/\(app\)/roles`
Expected: no errors. (If `role-card-body { all: unset }` triggers a jsx-a11y rule, keep the button semantics — the rule should be satisfied by `type="button"` + `aria-pressed`.)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/roles/roles-matrix.tsx
git commit -m "feat(rbac): wire create/delete role dialogs into /roles matrix"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit-test suite**

Run: `npx vitest run`
Expected: PASS. Pay attention to `roles-crud-actions`, `roles-actions`, `costs-actions`, `authorize`, `role-home`, `rbac`, `permissions`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (pre-existing warnings in unrelated files, if any, are out of scope).

- [ ] **Step 4: Production build (Next.js also type-checks routes)**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke test (optional, needs a running dev DB)**

Run: `npm run dev`, log in as `gkozyris@i4ria.com` (SUPER_ADMIN), open `/roles`:
1. Click «Νέος ρόλος» → create `SHOP_LEAD`, type Εσωτερικός, copy from `MANAGER` → the new card appears with MANAGER's permissions ticked in the matrix.
2. Assign a test user to `SHOP_LEAD` from `/users`, then delete `SHOP_LEAD` from `/roles` → dialog forces «Μετακίνηση χρηστών σε», pick `EMPLOYEE` → role gone, user now EMPLOYEE.
3. Confirm no delete icon appears on system roles, and the button/icons are absent when logged in as ADMIN.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(rbac): verification fixes for custom roles management"
```

---

## Self-Review Notes

- **Spec coverage:** schema `b2b` (Task 1) · SUPER_ADMIN-only guard (Task 2) · `createRole` copy-from-role + `deleteRole` reassign (Task 4) · type choice in modal + `portalHome` redirect (Tasks 3, 6) · custom roles auto-editable in existing matrix (unchanged `togglePermission`) · metadata fallbacks (Task 5) · double guard server+UI (Tasks 4, 8). All spec sections mapped.
- **Type consistency:** `RoleData` (with `description`/`system`/`b2b`) defined in Task 5 and consumed by both dialogs (Tasks 6-7) and the matrix (Task 8). `ActionResult` with `fieldErrors` used by `createRole`. `requireSuperAdmin(permission)` signature consistent across rbac-server, costs, roles, and both test mocks.
- **Out of scope (per spec):** role rename, per-user permission overrides.
