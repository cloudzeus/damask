# DAMASK PIM — Phase 1 "Θεμέλια" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Λειτουργικός σκελετός του DAMASK PIM: Next.js 16 app με πλήρες Prisma schema στην Postgres, Auth.js v5 login με permission-based RBAC, SoftOne client (win1253, two-step auth, ημερήσιο session cache σε DB), pg-boss job queue, και UI shell με Damask branding.

**Architecture:** Μονόλιθος Next.js (App Router, server components για data fetching). Το pg-boss τρέχει μέσα στο ίδιο process (instrumentation.ts). Auth με Credentials provider + **JWT sessions** (σημ.: το spec έλεγε database sessions, αλλά ο Credentials provider του Auth.js v5 απαιτεί JWT strategy — τα permissions μπαίνουν στο token κατά το login· αλλαγή ρόλου απαιτεί re-login, αποδεκτό για Phase 1). Δεν χρειάζονται πίνακες Account/Session του Auth.js.

**Tech Stack:** Next.js 16.2+, React 19, Tailwind CSS 4.1, shadcn/ui, GSAP, Prisma 6 + PostgreSQL, Auth.js (next-auth v5), pg-boss 10, iconv-lite, bcryptjs, zod, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-15-damask-pim-design.md` (υλοποιούμε ΜΟΝΟ τη Φάση 1 — §15.1)

---

## File Structure (τι δημιουργείται και γιατί)

```
prisma/
  schema.prisma            # πλήρες μοντέλο δεδομένων (όλες οι οντότητες του spec §5)
  seed.ts                  # permissions, ρόλοι, admin user
src/
  lib/
    prisma.ts              # Prisma client singleton
    permissions.ts         # κατάλογος permissions + default ρόλοι (source of truth)
    rbac.ts                # can()/requirePermission() helpers
    softone.ts             # S1 client: s1Fetch, auth flow, session cache σε DB, s1()
    queue.ts               # pg-boss singleton
  auth.ts                  # Auth.js v5 config (Credentials, JWT callbacks)
  middleware.ts            # route protection
  instrumentation.ts       # εκκίνηση pg-boss στο boot
  server/queue-start.ts    # workers registration (health job για Phase 1)
  i18n/ (request.ts)       # next-intl χωρίς routing (EL default, cookie switch)
  messages/el.json, en.json
  app/
    login/page.tsx         # σελίδα login
    (app)/layout.tsx       # shell: sidebar + topbar + GSAP
    (app)/page.tsx         # dashboard placeholder
    api/auth/[...nextauth]/route.ts
  components/shell/        # sidebar.tsx, topbar.tsx, page-transition.tsx
  types/next-auth.d.ts     # session type augmentation
scripts/s1-live-test.ts    # χειροκίνητο live test S1 (θέλει credentials στο .env)
tests/                     # vitest unit tests
e2e/login.spec.ts          # Playwright smoke
Dockerfile
```

Κανόνες: κάθε αρχείο μία ευθύνη· τα S1/queue/rbac είναι καθαρά lib modules ώστε να τεστάρονται χωρίς Next.js runtime.

---

### Task 1: Scaffold Next.js + εργαλεία

**Files:**
- Create: όλο το Next.js scaffold, `vitest.config.ts`, `src/lib/prisma.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Scaffold σε temp φάκελο και συγχώνευση** (ο φάκελος έχει ήδη .git/docs/.env, το create-next-app θέλει άδειο)

```bash
cd /Volumes/EXTERNALSSD/DGSMART/damask
npx create-next-app@latest damask-tmp --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --use-npm --yes
rsync -a damask-tmp/ ./ --exclude .git
rm -rf damask-tmp
```

Expected: `package.json`, `src/app/`, `tsconfig.json` κ.λπ. στο root. `next --version` ≥ 16.2.

- [ ] **Step 2: Εγκατάσταση dependencies**

```bash
npm i @prisma/client next-auth@beta @auth/core pg-boss iconv-lite bcryptjs zod gsap next-intl
npm i -D prisma tsx vitest @vitejs/plugin-react vite-tsconfig-paths @types/bcryptjs @playwright/test
```

- [ ] **Step 3: Vitest config + Prisma singleton**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
```

`src/lib/prisma.ts`:
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

`package.json` scripts (πρόσθεσε/αντικατάστησε):
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "s1:test": "tsx scripts/s1-live-test.ts"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

- [ ] **Step 4: Έλεγχος ότι τρέχει**

Run: `npm run dev` → άνοιξε http://localhost:3000, δες τη default σελίδα, σταμάτα το.
Run: `npm run test` → Expected: "No test files found" (exit 0 με passWithNoTests? αν όχι, `vitest run --passWithNoTests` στο script — άλλαξέ το σε `"test": "vitest run --passWithNoTests"`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js 16 app with tooling (vitest, prisma client, deps)"
```

---

### Task 2: shadcn/ui + βασικά components

**Files:**
- Create: `components.json`, `src/components/ui/*`, `src/lib/utils.ts`

- [ ] **Step 1: Init**

```bash
npx shadcn@latest init -d
```

Expected: δημιουργεί `components.json`, `src/lib/utils.ts`, ενημερώνει globals.css (Tailwind 4 tokens).

- [ ] **Step 2: Προσθήκη components που θα χρειαστεί το shell/login**

```bash
npx shadcn@latest add button input label card badge avatar dropdown-menu separator sonner skeleton alert-dialog dialog progress tooltip table select
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: επιτυχές build.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: add shadcn/ui with base components"
```

---

### Task 3: Prisma schema — πλήρες μοντέλο

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Γράψε το schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── RBAC ─────────────────────────────────────────────
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  passwordHash String
  active       Boolean  @default(true)
  roleId       String
  role         Role     @relation(fields: [roleId], references: [id])
  customerId   String?
  customer     Customer? @relation(fields: [customerId], references: [id])
  architect    ArchitectProfile?
  createdOrders  Order[] @relation("OrderCreatedBy")
  approvedOrders Order[] @relation("OrderApprovedBy")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Role {
  id          String           @id @default(cuid())
  name        String           @unique
  description String?
  system      Boolean          @default(false) // οι 6 βασικοί ρόλοι δεν διαγράφονται
  users       User[]
  permissions RolePermission[]
}

model Permission {
  id          String           @id @default(cuid())
  key         String           @unique // π.χ. "product.edit"
  description String
  roles       RolePermission[]
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])
}

// ── SoftOne infra ────────────────────────────────────
model S1Session {
  id       Int    @id @default(1)
  clientId String
  date     String // YYYY-MM-DD — ισχύει για μία μέρα
}

model SyncLog {
  id        String   @id @default(cuid())
  entity    String   // "product" | "customer" | ...
  action    String   // "pull" | "push" | "verify"
  s1Key     String?
  ok        Boolean
  message   String?
  request   Json?
  response  Json?
  createdAt DateTime @default(now())
  @@index([entity, createdAt])
}

enum OutboxStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}

model S1Outbox {
  id         String       @id @default(cuid())
  object     String       // S1 OBJECT π.χ. "ITEM", "CUSTOMER", "SALDOC"
  s1Key      String?      // KEY για update, null για insert
  payload    Json
  status     OutboxStatus @default(PENDING)
  attempts   Int          @default(0)
  lastError  String?
  verifiedAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  @@index([status, createdAt])
}

// ── Ταξινομήσεις & ΜΜ ────────────────────────────────
model Category {
  id       String  @id @default(cuid())
  s1Id     Int     @unique
  name     String
  nameEn   String?
  products Product[]
}

model Group {
  id       String  @id @default(cuid())
  s1Id     Int     @unique
  name     String
  nameEn   String?
  products Product[]
}

model Subgroup {
  id       String  @id @default(cuid())
  s1Id     Int     @unique
  name     String
  nameEn   String?
  products Product[]
}

model Unit {
  id            String    @id @default(cuid())
  s1Id          Int       @unique
  code          String?
  name          String
  purchaseFor   Product[] @relation("PurchaseUnit")
  salesFor      Product[] @relation("SalesUnit")
}

// ── Προϊόντα ─────────────────────────────────────────
enum ProductStatus {
  DRAFT
  COMPLETE
  PUBLISHED
}

enum ReviewStatus {
  NEEDS_REVIEW
  APPROVED
}

model Product {
  id             String        @id @default(cuid())
  mtrl           Int           @unique // S1 id
  code           String        @unique
  isActive       Boolean       @default(true)
  status         ProductStatus @default(DRAFT)
  priceWholesale Decimal?      @db.Decimal(14, 4)
  priceRetail    Decimal?      @db.Decimal(14, 4)
  stock          Decimal?      @db.Decimal(14, 4)
  cbmPerUnit     Decimal?      @db.Decimal(10, 4)
  weightPerUnit  Decimal?      @db.Decimal(10, 3)
  categoryId     String?
  category       Category?     @relation(fields: [categoryId], references: [id])
  groupId        String?
  group          Group?        @relation(fields: [groupId], references: [id])
  subgroupId     String?
  subgroup       Subgroup?     @relation(fields: [subgroupId], references: [id])
  purchaseUnitId String?
  purchaseUnit   Unit?         @relation("PurchaseUnit", fields: [purchaseUnitId], references: [id])
  salesUnitId    String?
  salesUnit      Unit?         @relation("SalesUnit", fields: [salesUnitId], references: [id])
  unitFactor     Decimal?      @db.Decimal(12, 6) // ΜΜ αγοράς → ΜΜ πώλησης
  translations   ProductTranslation[]
  media          MediaAsset[]
  orderLines     OrderLine[]
  priceCache     PriceCache[]
  s1UpdatedAt    DateTime?
  syncedAt       DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  @@index([status])
  @@index([code])
}

model ProductTranslation {
  id                String       @id @default(cuid())
  productId         String
  product           Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  locale            String       // "el" | "en"
  name              String
  shortDescription  String?
  description       String?
  seoTitle          String?
  seoDescription    String?
  machineTranslated Boolean      @default(false)
  reviewStatus      ReviewStatus @default(NEEDS_REVIEW)
  @@unique([productId, locale])
}

enum MediaType {
  IMAGE
  VIDEO
  MODEL_3D
}

model MediaAsset {
  id        String    @id @default(cuid())
  productId String
  product   Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  type      MediaType
  cdnUrl    String
  sortOrder Int       @default(0)
  meta      Json?
  createdAt DateTime  @default(now())
  @@index([productId, sortOrder])
}

// ── Πελάτες / Επαφές / Αρχιτέκτονες ──────────────────
model Customer {
  id        String    @id @default(cuid())
  trdr      Int       @unique
  code      String?
  name      String
  afm       String?
  email     String?
  phone     String?
  address   String?
  city      String?
  zip       String?
  users     User[]
  contacts  Contact[]
  orders    Order[]
  architects ArchitectCustomer[]
  priceCache PriceCache[]
  syncedAt  DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Contact {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  s1Id       Int?
  name       String
  roleTitle  String?
  email      String?
  phone      String?
}

model ArchitectProfile {
  id            String              @id @default(cuid())
  userId        String              @unique
  user          User                @relation(fields: [userId], references: [id])
  commissionPct Decimal             @db.Decimal(5, 2) // default %
  customers     ArchitectCustomer[]
  commissions   CommissionEntry[]
  orders        Order[]
}

model ArchitectCustomer {
  architectId String
  customerId  String
  architect   ArchitectProfile @relation(fields: [architectId], references: [id], onDelete: Cascade)
  customer    Customer         @relation(fields: [customerId], references: [id], onDelete: Cascade)
  @@id([architectId, customerId])
}

// ── Containers & Τιμολόγηση ──────────────────────────
enum ContainerStatus {
  OPEN
  CLOSED
  ORDERED
  SHIPPED
  RECEIVED
}

model Container {
  id           String          @id @default(cuid())
  name         String
  supplierName String?
  capacityCbm  Decimal         @db.Decimal(10, 3)
  freightCost  Decimal         @db.Decimal(14, 2)
  status       ContainerStatus @default(OPEN)
  overrides    Json?           // per-item/σταθερά overrides τιμών
  orderLines   OrderLine[]
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}

model PriceCache {
  customerId String
  productId  String
  price      Decimal  @db.Decimal(14, 4)
  fetchedAt  DateTime @default(now())
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@id([customerId, productId])
}

// ── Παραγγελίες ──────────────────────────────────────
enum OrderStatus {
  DRAFT
  SUBMITTED
  PENDING_APPROVAL
  APPROVED
  REJECTED
  SYNCED_TO_S1
}

model Order {
  id           String      @id @default(cuid())
  customerId   String
  customer     Customer    @relation(fields: [customerId], references: [id])
  createdById  String
  createdBy    User        @relation("OrderCreatedBy", fields: [createdById], references: [id])
  architectId  String?
  architect    ArchitectProfile? @relation(fields: [architectId], references: [id])
  status       OrderStatus @default(DRAFT)
  s1Findoc     Int?
  notes        String?
  approvedById String?
  approvedBy   User?       @relation("OrderApprovedBy", fields: [approvedById], references: [id])
  approvedAt   DateTime?
  rejectReason String?
  lines        OrderLine[]
  commission   CommissionEntry?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([status, createdAt])
}

model OrderLine {
  id           String     @id @default(cuid())
  orderId      String
  order        Order      @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId    String
  product      Product    @relation(fields: [productId], references: [id])
  qty          Decimal    @db.Decimal(14, 4)
  unitPrice    Decimal    @db.Decimal(14, 4) // ΚΛΕΙΔΩΜΕΝΗ τη στιγμή της παραγγελίας
  freightShare Decimal?   @db.Decimal(14, 4)
  cbmReserved  Decimal?   @db.Decimal(10, 3)
  containerId  String?
  container    Container? @relation(fields: [containerId], references: [id])
}

model CommissionEntry {
  id          String           @id @default(cuid())
  orderId     String           @unique
  order       Order            @relation(fields: [orderId], references: [id])
  architectId String
  architect   ArchitectProfile @relation(fields: [architectId], references: [id])
  pct         Decimal          @db.Decimal(5, 2)
  amount      Decimal          @db.Decimal(14, 2)
  createdAt   DateTime         @default(now())
}

// ── Import/Export (οριζόντιο — spec §11α) ────────────
model ImportMapping {
  id        String   @id @default(cuid())
  entity    String   // "product" | "customer" | "order" | ...
  name      String
  columnMap Json     // { "Στήλη Excel": "πεδίο μοντέλου", ... }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([entity, name])
}

model DocumentTemplate {
  id        String   @id @default(cuid())
  type      String   // "offer" | "report"
  name      String
  config    Json     // κείμενα, headers, branding επιλογές
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([type, name])
}
```

- [ ] **Step 2: Migrate**

Run: `npx prisma migrate dev --name init`
Expected: migration applied στην damask DB (100.70.50.43), generated client. Αν αποτύχει η σύνδεση, έλεγξε το DATABASE_URL στο `.env`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: full Prisma schema for PIM domain (products, RBAC, orders, containers, sync infra)"
```

---

### Task 4: Permissions catalog + seed

**Files:**
- Create: `src/lib/permissions.ts`, `prisma/seed.ts`, `tests/permissions.test.ts`

- [ ] **Step 1: Failing test για τον κατάλογο**

`tests/permissions.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PERMISSIONS, ROLE_DEFAULTS } from '@/lib/permissions'

describe('permissions catalog', () => {
  it('has unique keys', () => {
    const keys = PERMISSIONS.map(p => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every role default references existing permissions', () => {
    const keys = new Set(PERMISSIONS.map(p => p.key))
    for (const [role, perms] of Object.entries(ROLE_DEFAULTS)) {
      for (const p of perms) expect(keys.has(p), `${role}: ${p}`).toBe(true)
    }
  })

  it('ADMIN has all permissions', () => {
    expect(ROLE_DEFAULTS.ADMIN.length).toBe(PERMISSIONS.length)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/permissions`.

- [ ] **Step 3: Υλοποίηση καταλόγου**

`src/lib/permissions.ts`:
```ts
export type PermissionDef = { key: string; description: string }

export const PERMISSIONS: PermissionDef[] = [
  { key: 'product.view', description: 'Προβολή προϊόντων' },
  { key: 'product.edit', description: 'Επεξεργασία προϊόντων' },
  { key: 'product.publish', description: 'Δημοσίευση προϊόντων' },
  { key: 'translation.edit', description: 'Επεξεργασία μεταφράσεων' },
  { key: 'translation.approve', description: 'Έγκριση μεταφράσεων' },
  { key: 'media.manage', description: 'Διαχείριση media' },
  { key: 'category.manage', description: 'Διαχείριση κατηγοριών/ομάδων' },
  { key: 'unit.manage', description: 'Διαχείριση μονάδων μέτρησης' },
  { key: 'customer.view', description: 'Προβολή πελατών' },
  { key: 'customer.edit', description: 'Επεξεργασία πελατών/επαφών' },
  { key: 'order.view', description: 'Προβολή παραγγελιών' },
  { key: 'order.create', description: 'Δημιουργία παραγγελιών' },
  { key: 'order.approve', description: 'Έγκριση παραγγελιών' },
  { key: 'order.autoapprove', description: 'Παράκαμψη έγκρισης' },
  { key: 'container.manage', description: 'Διαχείριση containers & τιμολόγησης' },
  { key: 'commission.view', description: 'Προβολή προμηθειών (δικών του)' },
  { key: 'commission.manage', description: 'Διαχείριση προμηθειών' },
  { key: 'portal.access', description: 'Πρόσβαση B2B portal' },
  { key: 'sync.run', description: 'Εκτέλεση sync με SoftOne' },
  { key: 'user.manage', description: 'Διαχείριση χρηστών/ρόλων' },
  { key: 'settings.manage', description: 'Ρυθμίσεις συστήματος' },
]

const ALL = PERMISSIONS.map(p => p.key)

export const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: ALL,
  PURCHASING: [
    'product.view', 'unit.manage', 'container.manage',
    'order.view', 'sync.run', 'commission.manage',
  ],
  PRODUCT_MANAGER: [
    'product.view', 'product.edit', 'product.publish',
    'translation.edit', 'translation.approve', 'media.manage',
    'category.manage', 'unit.manage', 'sync.run',
  ],
  SALES: [
    'product.view', 'customer.view', 'customer.edit',
    'order.view', 'order.create', 'order.approve', 'order.autoapprove',
  ],
  ARCHITECT: ['portal.access', 'order.create', 'order.view', 'commission.view'],
  CUSTOMER: ['portal.access', 'order.create', 'order.view'],
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test` → Expected: 3 passed.

- [ ] **Step 5: Seed script**

`prisma/seed.ts`:
```ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { PERMISSIONS, ROLE_DEFAULTS } from '../src/lib/permissions'

const prisma = new PrismaClient()

async function main() {
  // 1. Permissions — upsert ώστε το seed να είναι επανεκτελέσιμο
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: p,
    })
  }

  // 2. Ρόλοι + αναθέσεις
  for (const [name, permKeys] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, system: true },
    })
    const perms = await prisma.permission.findMany({ where: { key: { in: permKeys } } })
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    await prisma.rolePermission.createMany({
      data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
    })
  }

  // 3. Admin user
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026'
  await prisma.user.upsert({
    where: { email: 'gkozyris@i4ria.com' },
    update: {},
    create: {
      email: 'gkozyris@i4ria.com',
      name: 'Giannis Kozyris',
      passwordHash: await bcrypt.hash(password, 12),
      roleId: adminRole.id,
    },
  })
  console.log('Seed ολοκληρώθηκε. Admin: gkozyris@i4ria.com')
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 6: Τρέξε το seed**

Run: `npm run db:seed`
Expected: "Seed ολοκληρώθηκε". Επαλήθευση: `npx prisma studio` → πίνακες Role (6), Permission (21), User (1).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: permissions catalog, role defaults and seed (roles + admin user)"
```

---

### Task 5: SoftOne client (win1253, two-step auth, DB session cache)

**Files:**
- Create: `src/lib/softone.ts`, `tests/softone.test.ts`, `scripts/s1-live-test.ts`

- [ ] **Step 1: Failing tests**

`tests/softone.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import iconv from 'iconv-lite'

// Mock prisma ΠΡΙΝ το import του client
const mem: { session: { clientId: string; date: string } | null } = { session: null }
vi.mock('@/lib/prisma', () => ({
  prisma: {
    s1Session: {
      findUnique: vi.fn(async () => mem.session ? { id: 1, ...mem.session } : null),
      upsert: vi.fn(async ({ create }: any) => {
        mem.session = { clientId: create.clientId, date: create.date }
        return { id: 1, ...mem.session }
      }),
      deleteMany: vi.fn(async () => { mem.session = null; return { count: 1 } }),
    },
  },
}))

import { s1, __resetForTests } from '@/lib/softone'

function s1Response(obj: unknown): Response {
  const buf = iconv.encode(JSON.stringify(obj), 'win1253')
  return new Response(new Uint8Array(buf))
}

const fetchMock = vi.fn()

beforeEach(() => {
  mem.session = null
  __resetForTests()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.S1_SERIAL = 'test'
  process.env.S1_APP_ID = '1001'
})
afterEach(() => vi.unstubAllGlobals())

describe('softone client', () => {
  it('authenticates two-step and decodes win1253 Greek', async () => {
    fetchMock
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'temp1' }))       // Login
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'sess1' }))       // authenticate
      .mockResolvedValueOnce(s1Response({ success: true, rows: [{ NAME: 'Καλημέρα' }] })) // service

    const res = await s1('GetTable', { TABLE: 'MTRL' })
    expect(res.rows[0].NAME).toBe('Καλημέρα')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const loginBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(loginBody.SERVICE).toBe('Login')
    const authBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(authBody.service).toBe('authenticate')
    expect(authBody.clientID).toBe('temp1')
  })

  it('reuses cached session for the same day', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mem.session = { clientId: 'cached', date: today }
    fetchMock.mockResolvedValueOnce(s1Response({ success: true, rows: [] }))

    await s1('GetTable', { TABLE: 'MTRL' })
    expect(fetchMock).toHaveBeenCalledTimes(1) // κανένα Login/authenticate
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.clientID).toBe('cached')
  })

  it('re-authenticates on errorcode -101 and retries once', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mem.session = { clientId: 'stale', date: today }
    fetchMock
      .mockResolvedValueOnce(s1Response({ success: false, errorcode: -101 }))  // expired
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'temp2' })) // Login
      .mockResolvedValueOnce(s1Response({ success: true, clientID: 'fresh' })) // authenticate
      .mockResolvedValueOnce(s1Response({ success: true, rows: [{ ok: 1 }] })) // retry

    const res = await s1('GetTable', { TABLE: 'MTRL' })
    expect(res.rows[0].ok).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test` → Expected: FAIL — `@/lib/softone` δεν υπάρχει.

- [ ] **Step 3: Υλοποίηση**

`src/lib/softone.ts`:
```ts
import iconv from 'iconv-lite'
import { prisma } from '@/lib/prisma'

function baseUrl() {
  return `https://${process.env.S1_SERIAL}.oncloud.gr/s1services`
}
function appId() {
  return process.env.S1_APP_ID!
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

// serialize του auth ώστε παράλληλες κλήσεις να μην κάνουν διπλό login
let authPromise: Promise<string> | null = null

export function __resetForTests() {
  authPromise = null
}

async function s1Fetch(body: object): Promise<any> {
  const res = await fetch(baseUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const buffer = await res.arrayBuffer()
  return JSON.parse(iconv.decode(Buffer.from(buffer), 'win1253'))
}

async function loadSession(): Promise<string | null> {
  const s = await prisma.s1Session.findUnique({ where: { id: 1 } })
  return s && s.date === today() ? s.clientId : null
}

async function saveSession(clientId: string): Promise<void> {
  await prisma.s1Session.upsert({
    where: { id: 1 },
    update: { clientId, date: today() },
    create: { id: 1, clientId, date: today() },
  })
}

async function clearSession(): Promise<void> {
  await prisma.s1Session.deleteMany({ where: { id: 1 } })
}

async function authenticate(): Promise<string> {
  const login = await s1Fetch({
    SERVICE: 'Login',
    USERNAME: process.env.S1_USERNAME,
    PASSWORD: process.env.S1_PASSWORD,
    APPID: appId(),
    VERSION: '2',
  })
  if (!login.success) throw new Error(`S1 Login: ${login.error ?? login.errorcode}`)
  const auth = await s1Fetch({
    service: 'authenticate',
    clientID: login.clientID,
    COMPANY: process.env.S1_COMPANY,
    BRANCH: process.env.S1_BRANCH,
    MODULE: process.env.S1_MODULE,
    REFID: process.env.S1_REFID,
    VERSION: '2',
  })
  if (!auth.success) throw new Error(`S1 Auth: ${auth.error ?? auth.errorcode}`)
  await saveSession(auth.clientID)
  return auth.clientID
}

async function getClientId(): Promise<string> {
  const cached = await loadSession()
  if (cached) return cached
  authPromise ??= authenticate().finally(() => { authPromise = null })
  return authPromise
}

/** Κλήση επίσημου S1 service με αυτόματο session & re-auth σε -100/-101. */
export async function s1(service: string, params: Record<string, unknown> = {}): Promise<any> {
  const clientID = await getClientId()
  const data = await s1Fetch({ service, clientID, appId: appId(), VERSION: '2', ...params })
  if (!data.success && (data.errorcode === -101 || data.errorcode === -100)) {
    await clearSession()
    const fresh = await getClientId()
    return s1Fetch({ service, clientID: fresh, appId: appId(), VERSION: '2', ...params })
  }
  return data
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test` → Expected: όλα pass (permissions + softone).

- [ ] **Step 5: Live test script** (τρέχει μόνο χειροκίνητα, θέλει S1 creds στο `.env`)

`scripts/s1-live-test.ts`:
```ts
import 'dotenv/config'
import { s1 } from '../src/lib/softone'

async function main() {
  if (!process.env.S1_SERIAL || !process.env.S1_USERNAME) {
    console.error('Λείπουν S1_* μεταβλητές από το .env — συμπλήρωσέ τες πρώτα.')
    process.exit(1)
  }
  const res = await s1('GetTable', { TABLE: 'MTRL', FIELDS: 'MTRL,CODE,NAME', FILTER: '' })
  console.log('success:', res.success)
  console.log('πρώτες 3 γραμμές:', JSON.stringify(res.rows?.slice(0, 3) ?? res, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
```

Επίσης: `npm i -D dotenv` (για το script μόνο).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: SoftOne client with win1253 decoding, two-step auth, DB session cache and re-auth"
```

---

### Task 6: Auth.js v5 — login + JWT sessions

**Files:**
- Create: `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/types/next-auth.d.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `tests/authorize.test.ts`
- Modify: `.env` (AUTH_SECRET)

- [ ] **Step 1: AUTH_SECRET**

Run: `openssl rand -base64 32` → βάλε την τιμή στο `.env` ως `AUTH_SECRET=...`

- [ ] **Step 2: Failing test για το credentials check**

Η λογική επαλήθευσης μπαίνει σε καθαρή συνάρτηση `verifyCredentials` ώστε να τεστάρεται χωρίς NextAuth runtime.

`tests/authorize.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'

const user = {
  id: 'u1', email: 'a@b.gr', name: 'A', active: true,
  passwordHash: bcrypt.hashSync('secret123', 4),
  role: { name: 'ADMIN', permissions: [{ permission: { key: 'user.manage' } }] },
}
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(async ({ where }: any) => (where.email === 'a@b.gr' ? user : null)) } },
}))

import { verifyCredentials } from '@/auth.config'

describe('verifyCredentials', () => {
  it('returns user payload with role & permissions on valid creds', async () => {
    const res = await verifyCredentials('a@b.gr', 'secret123')
    expect(res).toMatchObject({ id: 'u1', role: 'ADMIN', permissions: ['user.manage'] })
  })
  it('returns null on wrong password', async () => {
    expect(await verifyCredentials('a@b.gr', 'nope')).toBeNull()
  })
  it('returns null on unknown email', async () => {
    expect(await verifyCredentials('x@x.gr', 'secret123')).toBeNull()
  })
  it('returns null on inactive user', async () => {
    user.active = false
    expect(await verifyCredentials('a@b.gr', 'secret123')).toBeNull()
    user.active = true
  })
})
```

- [ ] **Step 3: Run — verify FAIL**

Run: `npm test` → FAIL: `@/auth.config` δεν υπάρχει.

- [ ] **Step 4: Υλοποίηση auth**

`src/auth.config.ts` (καθαρό, χωρίς NextAuth imports — τεστάρεται):
```ts
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export type AuthUserPayload = {
  id: string
  email: string
  name: string
  role: string
  permissions: string[]
  customerId: string | null
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUserPayload | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })
  if (!user || !user.active) return null
  if (!(await bcrypt.compare(password, user.passwordHash))) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: user.role.permissions.map(rp => rp.permission.key),
    customerId: user.customerId ?? null,
  }
}
```

`src/auth.ts`:
```ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verifyCredentials } from '@/auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        if (typeof creds?.email !== 'string' || typeof creds?.password !== 'string') return null
        return verifyCredentials(creds.email, creds.password)
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as import('@/auth.config').AuthUserPayload
        token.role = u.role
        token.permissions = u.permissions
        token.customerId = u.customerId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub!
      session.user.role = token.role as string
      session.user.permissions = (token.permissions as string[]) ?? []
      session.user.customerId = (token.customerId as string | null) ?? null
      return session
    },
  },
})
```

`src/types/next-auth.d.ts`:
```ts
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: string
      permissions: string[]
      customerId: string | null
    }
  }
}
```

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

`src/middleware.ts`:
```ts
export { auth as middleware } from '@/auth'

export const config = {
  // προστάτευσε τα πάντα εκτός από login, auth api, static
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|logo).*)'],
}
```

Στο `src/auth.ts` πρόσθεσε το authorized callback ώστε το middleware να κάνει redirect:
```ts
    authorized({ auth }) {
      return !!auth?.user
    },
```
(μέσα στο αντικείμενο `callbacks`, μαζί με τα jwt/session.)

- [ ] **Step 5: Login page + server action**

`src/app/login/actions.ts`:
```ts
'use server'

import { signIn } from '@/auth'
import { AuthError } from 'next-auth'

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    })
    return {}
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Λάθος email ή κωδικός.' }
    throw e // τα redirects του Next περνούν από εδώ — πρέπει να ξαναπεταχτούν
  }
}
```

`src/app/login/page.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { loginAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, {})
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-semibold tracking-[0.18em]">DAMASK</CardTitle>
          <p className="text-center text-sm text-muted-foreground">Product Information Management</p>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Κωδικός</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Σύνδεση…' : 'Σύνδεση'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 6: Run tests — verify PASS**

Run: `npm test` → Expected: όλα pass.

- [ ] **Step 7: Χειροκίνητος έλεγχος login**

Run: `npm run dev` → http://localhost:3000 → redirect στο /login → σύνδεση με `gkozyris@i4ria.com` / `damask!2026` → προσγείωση στο `/`.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: Auth.js v5 credentials login with JWT sessions carrying role+permissions"
```

---

### Task 7: RBAC helpers

**Files:**
- Create: `src/lib/rbac.ts`, `tests/rbac.test.ts`

- [ ] **Step 1: Failing test**

`tests/rbac.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

const session = (perms: string[]) =>
  ({ user: { id: 'u', role: 'X', permissions: perms, customerId: null } }) as any

describe('can()', () => {
  it('true όταν υπάρχει το permission', () => {
    expect(can(session(['product.edit']), 'product.edit')).toBe(true)
  })
  it('false όταν λείπει', () => {
    expect(can(session(['product.view']), 'product.edit')).toBe(false)
  })
  it('false για null session', () => {
    expect(can(null, 'product.edit')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — FAIL** (`@/lib/rbac` δεν υπάρχει)

- [ ] **Step 3: Υλοποίηση**

`src/lib/rbac.ts`:
```ts
import type { Session } from 'next-auth'
import { auth } from '@/auth'

export function can(session: Session | null, permission: string): boolean {
  return !!session?.user?.permissions?.includes(permission)
}

/** Για server components/actions: επιστρέφει session ή πετάει. */
export async function requirePermission(permission: string): Promise<Session> {
  const session = await auth()
  if (!can(session, permission)) {
    throw new Error(`Forbidden: απαιτείται ${permission}`)
  }
  return session!
}
```

- [ ] **Step 4: Run — PASS** (`npm test`)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: RBAC helpers can() and requirePermission()"
```

---

### Task 8: pg-boss queue + instrumentation

**Files:**
- Create: `src/lib/queue.ts`, `src/server/queue-start.ts`, `src/instrumentation.ts`

- [ ] **Step 1: Queue singleton**

`src/lib/queue.ts`:
```ts
import PgBoss from 'pg-boss'

const globalForBoss = globalThis as unknown as { boss?: PgBoss; bossStarted?: boolean }

export function getBoss(): PgBoss {
  globalForBoss.boss ??= new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: 'pgboss',
  })
  return globalForBoss.boss
}

export async function startBoss(): Promise<PgBoss> {
  const boss = getBoss()
  if (!globalForBoss.bossStarted) {
    await boss.start()
    globalForBoss.bossStarted = true
  }
  return boss
}
```

- [ ] **Step 2: Workers registration + health job**

`src/server/queue-start.ts`:
```ts
import { startBoss } from '@/lib/queue'

export const QUEUE_HEALTH = 'health'

export async function startQueue(): Promise<void> {
  const boss = await startBoss()

  await boss.createQueue(QUEUE_HEALTH)
  await boss.work(QUEUE_HEALTH, async () => {
    console.log('[pg-boss] health ok', new Date().toISOString())
  })
  // κάθε ώρα — αποδεικνύει ότι cron scheduling δουλεύει· τα sync jobs έρχονται στη Φάση 2
  await boss.schedule(QUEUE_HEALTH, '0 * * * *')

  console.log('[pg-boss] started')
}
```

`src/instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startQueue } = await import('@/server/queue-start')
    await startQueue()
  }
}
```

- [ ] **Step 3: Έλεγχος**

Run: `npm run dev` → στο console: `[pg-boss] started`.
Run: `psql "$DATABASE_URL" -c '\dt pgboss.*'` ή Prisma Studio → υπάρχει schema `pgboss` με πίνακες.
Άμεση δοκιμή job: πρόσθεσε προσωρινά στο `startQueue()` τη γραμμή `await boss.send(QUEUE_HEALTH, {})`, δες το "[pg-boss] health ok" στο console, και αφαίρεσέ την.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: pg-boss queue bootstrapped via instrumentation with health job"
```

---

### Task 9: UI shell — sidebar, topbar, branding, GSAP

**Files:**
- Create: `src/components/shell/sidebar.tsx`, `src/components/shell/topbar.tsx`, `src/components/shell/page-transition.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`
- Delete: `src/app/page.tsx` (default scaffold)
- Modify: `src/app/layout.tsx` (fonts/metadata), `src/app/globals.css` (brand tokens)

- [ ] **Step 1: Brand tokens & fonts** (πηγή: `design-system/damask-pim/MASTER.md` — «Λινό & Μπρούντζος»)

Στο `src/app/globals.css` αντικατάστησε τα shadcn default tokens του `:root`/`.dark` με τα Damask (μορφή oklch/hex όπως τα έχει στήσει το shadcn init — κράτα τη δομή, άλλαξε τιμές):
```css
:root {
  --radius: 0.625rem;
  --background: #FAF7F2;      /* ζεστό λινό */
  --foreground: #292524;      /* μελάνι */
  --card: #FFFFFF;
  --card-foreground: #292524;
  --primary: #292524;
  --primary-foreground: #FFFFFF;
  --muted: #F1EDE6;
  --muted-foreground: #78716C;
  --accent: #F1EDE6;          /* hover επιφανειών */
  --accent-foreground: #292524;
  --border: #E7E0D8;
  --input: #E7E0D8;
  --ring: #A16207;            /* μπρούντζος */
  --destructive: #B91C1C;
  --sidebar: #F4EFE7;
  --sidebar-foreground: #292524;
  --sidebar-primary: #A16207;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #EAE3D8;
  --sidebar-accent-foreground: #292524;
  --sidebar-border: #E7E0D8;
  --sidebar-ring: #A16207;
  /* Damask extras */
  --brass: #A16207;
  --success: #15803D;
  --warning: #B45309;
  --info: #0369A1;
}
.dark {
  --background: #0C0A09;      /* ζεστό σκοτάδι — όχι μπλε-μαύρο */
  --foreground: #E7E5E4;
  --card: #1C1917;
  --card-foreground: #E7E5E4;
  --primary: #E7E5E4;
  --primary-foreground: #1C1917;
  --muted: #292524;
  --muted-foreground: #A8A29E;
  --accent: #292524;
  --accent-foreground: #E7E5E4;
  --border: #292524;
  --input: #292524;
  --ring: #C89B3C;
  --destructive: #EF4444;
  --sidebar: #12100E;
  --sidebar-foreground: #E7E5E4;
  --sidebar-primary: #C89B3C;
  --sidebar-primary-foreground: #12100E;
  --sidebar-accent: #292524;
  --sidebar-accent-foreground: #E7E5E4;
  --sidebar-border: #292524;
  --sidebar-ring: #C89B3C;
  --brass: #C89B3C;
  --success: #4ADE80;
  --warning: #FBBF24;
  --info: #38BDF8;
}
```

`src/app/layout.tsx` — metadata + font (Inter ΠΑΝΤΟΥ — όχι serif σε dashboard UI, απόφαση χρήστη· serif μόνο στο SVG λογότυπο). Βάση 14px: πρόσθεσε στο globals.css `html { font-size: 14px; }` — όλη η rem κλίμακα γίνεται συμπαγής:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'greek'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'DAMASK PIM',
  description: 'Product Information Management — Damask',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

Σημείωση branding: το wordmark αποδίδεται ως κείμενο "DAMASK" (Inter 600, tracking 0.18em) προσωρινά. Όταν ο χρήστης δώσει το SVG/PNG λογότυπο, μπαίνει στο `public/logo.svg` και αντικαθιστά το κείμενο στο sidebar.

- [ ] **Step 2: Sidebar**

`src/components/shell/sidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Package, FolderTree, Ruler, Users, ClipboardList, Container, Settings, Shield,
} from 'lucide-react'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: null },
  { href: '/products', label: 'Προϊόντα', icon: Package, permission: 'product.view' },
  { href: '/categories', label: 'Κατηγορίες', icon: FolderTree, permission: 'category.manage' },
  { href: '/units', label: 'Μονάδες μέτρησης', icon: Ruler, permission: 'unit.manage' },
  { href: '/customers', label: 'Πελάτες', icon: Users, permission: 'customer.view' },
  { href: '/orders', label: 'Παραγγελίες', icon: ClipboardList, permission: 'order.view' },
  { href: '/containers', label: 'Containers', icon: Container, permission: 'container.manage' },
  { href: '/users', label: 'Χρήστες & Ρόλοι', icon: Shield, permission: 'user.manage' },
  { href: '/settings', label: 'Ρυθμίσεις', icon: Settings, permission: 'settings.manage' },
] as const

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname()
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="text-xl font-semibold tracking-[0.18em]">
          DAMASK
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.filter(i => !i.permission || permissions.includes(i.permission)).map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname === item.href
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="px-6 py-4 text-xs text-muted-foreground">DAMASK PIM · v0.1</div>
    </aside>
  )
}
```

(Τα /products, /categories κ.λπ. θα γίνουν 404 μέχρι τις επόμενες φάσεις — αποδεκτό: το nav είναι το skeleton.)

- [ ] **Step 3: Topbar με user menu**

`src/components/shell/topbar.tsx`:
```tsx
import { auth, signOut } from '@/auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export async function Topbar() {
  const session = await auth()
  const name = session?.user?.name ?? ''
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <header className="flex h-16 items-center justify-end border-b px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2">
            <Avatar className="size-8"><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <span className="text-sm">{name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{session?.user?.role}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">Αποσύνδεση</button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
```

- [ ] **Step 4: GSAP page transition**

`src/components/shell/page-transition.tsx`:
```tsx
'use client'

import { useRef } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  useGSAP(() => {
    gsap.fromTo(ref.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' })
  }, { dependencies: [pathname], scope: ref })
  return <div ref={ref}>{children}</div>
}
```

Επίσης: `npm i @gsap/react`

- [ ] **Step 5: App layout + dashboard placeholder**

Διάγραψε το `src/app/page.tsx` του scaffold.

`src/app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'
import { PageTransition } from '@/components/shell/page-transition'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return (
    <div className="flex">
      <Sidebar permissions={session.user.permissions} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  )
}
```

`src/app/(app)/page.tsx`:
```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  const cards = [
    { title: 'Προϊόντα', value: '—', hint: 'Sync στη Φάση 2' },
    { title: 'Εκκρεμείς μεταφράσεις', value: '—', hint: 'Φάση 3' },
    { title: 'Ανοιχτά containers', value: '—', hint: 'Φάση 7' },
    { title: 'Παραγγελίες', value: '—', hint: 'Φάση 6' },
  ]
  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{c.value}</div>
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Έλεγχος**

Run: `npm run dev` → login → βλέπεις sidebar "DAMASK", topbar με όνομα/ρόλο, dashboard cards με fade-in. Αποσύνδεση → /login.
Run: `npm run build` → Expected: επιτυχές.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: app shell with sidebar/topbar, Damask branding, GSAP page transitions and dashboard placeholder"
```

---

### Task 10: next-intl (EL default, cookie switch)

**Files:**
- Create: `src/i18n/request.ts`, `messages/el.json`, `messages/en.json`
- Modify: `next.config.ts`, `src/app/layout.tsx`

- [ ] **Step 1: Config**

`src/i18n/request.ts` (χωρίς locale routing — cookie-based, EL default):
```ts
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export default getRequestConfig(async () => {
  const store = await cookies()
  const locale = store.get('locale')?.value === 'en' ? 'en' : 'el'
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default withNextIntl(nextConfig)
```

`messages/el.json`:
```json
{
  "nav": {
    "dashboard": "Dashboard",
    "products": "Προϊόντα",
    "customers": "Πελάτες",
    "orders": "Παραγγελίες"
  },
  "auth": { "signOut": "Αποσύνδεση" }
}
```

`messages/en.json`:
```json
{
  "nav": {
    "dashboard": "Dashboard",
    "products": "Products",
    "customers": "Customers",
    "orders": "Orders"
  },
  "auth": { "signOut": "Sign out" }
}
```

Στο `src/app/layout.tsx` τύλιξε τα children:
```tsx
import { NextIntlClientProvider } from 'next-intl'
// ...μέσα στο body:
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
```

(Η πλήρης μετάβαση των strings του shell σε `useTranslations` γίνεται σταδιακά — για τη Φάση 1 αρκεί η υποδομή + τα messages αρχεία. Τα ελληνικά strings του sidebar μένουν inline μέχρι τη Φάση 2.)

- [ ] **Step 2: Έλεγχος**

Run: `npm run build` → Expected: επιτυχές. `npm run dev` → η εφαρμογή δουλεύει όπως πριν.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: next-intl infrastructure with EL default and cookie-based locale"
```

---

### Task 11: Playwright smoke test (login flow)

**Files:**
- Create: `playwright.config.ts`, `e2e/login.spec.ts`

- [ ] **Step 1: Config**

```bash
npx playwright install chromium
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

- [ ] **Step 2: Smoke test**

`e2e/login.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('redirects anonymous to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('logs in and sees dashboard, then signs out', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('DAMASK')).toBeVisible()
})

test('rejects wrong password', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', 'wrong-password')
  await page.click('button[type=submit]')
  await expect(page.getByText('Λάθος email ή κωδικός.')).toBeVisible()
})
```

- [ ] **Step 3: Run**

Run: `npm run test:e2e`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: Playwright smoke tests for auth flow"
```

---

### Task 12: Dockerfile + τεκμηρίωση

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `README.md`

- [ ] **Step 1: Dockerfile** (standalone output — ορίστηκε στο next.config.ts στο Task 10)

`Dockerfile`:
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

`.dockerignore`:
```
node_modules
.next
.git
.env
docs
e2e
tests
```

- [ ] **Step 2: README**

`README.md` — αντικατάστησε το περιεχόμενο:
```markdown
# DAMASK PIM

PIM + B2B portal για την Damask με αμφίδρομη διασύνδεση SoftOne ERP.

- **Spec:** docs/superpowers/specs/2026-07-15-damask-pim-design.md
- **Stack:** Next.js 16, Prisma/PostgreSQL, Auth.js v5, pg-boss, Tailwind 4, shadcn/ui, GSAP

## Setup

1. `cp .env.example .env` και συμπλήρωσε τις τιμές
2. `npm install`
3. `npm run db:migrate && npm run db:seed`
4. `npm run dev`

## Δοκιμές

- `npm test` — unit (Vitest)
- `npm run test:e2e` — Playwright
- `npm run s1:test` — live έλεγχος SoftOne (θέλει S1_* creds)

## Deploy

Docker: `docker build -t damask-pim .` — τρέχει με `DATABASE_URL` + λοιπά env vars.
Migrations σε production: `npx prisma migrate deploy` πριν το start.
```

- [ ] **Step 3: Docker build check** (προαιρετικό αν υπάρχει Docker τοπικά)

Run: `docker build -t damask-pim .`
Expected: επιτυχές image.

- [ ] **Step 4: Commit & push**

```bash
git add -A && git commit -m "chore: production Dockerfile and README"
git push
```

---

### Task 13: Live έλεγχος SoftOne (BLOCKED μέχρι να δοθούν credentials)

**Prerequisite:** Ο χρήστης πρέπει να συμπληρώσει στο `.env`: `S1_SERIAL`, `S1_USERNAME`, `S1_PASSWORD`, `S1_APP_ID`, `S1_COMPANY`, `S1_BRANCH`, `S1_MODULE`, `S1_REFID`.

- [ ] **Step 1: Τρέξε το live test**

Run: `npm run s1:test`
Expected: `success: true` + 3 πρώτες γραμμές MTRL με σωστά ελληνικά (όχι garbled — αν βγουν λάθος χαρακτήρες, το decoding έχει πρόβλημα).

- [ ] **Step 2: Επαλήθευση session cache**

Run: `npm run s1:test` ξανά → η δεύτερη εκτέλεση πρέπει να ΜΗΝ κάνει Login (δες στο Prisma Studio ότι το S1Session.date είναι σημερινό και το clientId ίδιο).

- [ ] **Step 3: Commit τυχόν διορθώσεων**

```bash
git add -A && git commit -m "fix: adjustments from live SoftOne verification"
```

---

## Definition of Done — Phase 1

- [ ] `npm test` πράσινο (permissions, softone, authorize, rbac)
- [ ] `npm run test:e2e` πράσινο (redirect, login, wrong password)
- [ ] `npm run build` επιτυχές
- [ ] Login ως admin λειτουργεί, sidebar φιλτράρεται με permissions
- [ ] pg-boss ξεκινά στο boot (log "[pg-boss] started", schema pgboss στην DB)
- [ ] Prisma schema migrated στην damask DB, seed με 6 ρόλους/21 permissions/1 admin
- [ ] `npm run s1:test` επιτυχές με σωστά ελληνικά (μόλις δοθούν τα creds)
- [ ] Pushed στο GitHub
```
