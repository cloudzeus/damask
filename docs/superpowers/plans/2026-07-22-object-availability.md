# Object Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SUPER_ADMIN compose the app from a code-shipped catalog of objects — enabled objects appear in the sidebar and the /roles permission matrix; disabled ones are hidden from the menu and their routes 404.

**Architecture:** One in-code registry (`src/lib/objects.ts`, modules→items, each item declaring its permissions) is the single source of truth. Pure helpers derive the sidebar nav and the roles-matrix permission groups; a `Setting` row (`objects.enabled`) stores the SUPER_ADMIN's per-deployment choice; core items are always effective. This is **Plan 1 of 2** — Plan 2 (SoftOne sync configuration) builds on this registry and the new «Αντικείμενα» tab.

**Tech Stack:** Next.js (App Router, server components), Prisma/Postgres (`Setting` model), NextAuth (session permissions/role), Vitest (`tests/**/*.test.ts`, node env, `@/` alias).

**Spec:** `docs/superpowers/specs/2026-07-22-object-availability-design.md`

---

## File Structure

- **Create** `src/lib/objects.ts` — registry types, `OBJECT_REGISTRY`, and pure derivations (`allItems`, `coreItemKeys`, `effectiveEnabledKeys`, `buildNav`, `groupedPermissionsFor`). No DB imports — unit-testable.
- **Create** `src/lib/objects-server.ts` — DB-touching helpers (`getEnabledObjectKeys`, `isObjectEnabled`, `assertObjectEnabled`, `setEnabledObjectKeys`).
- **Create** `src/app/(app)/settings/objects-tab.tsx` — client toggle UI.
- **Create** `src/app/(app)/settings/objects-actions.ts` — SUPER_ADMIN save action.
- **Create** `tests/objects.test.ts`, `tests/objects-server.test.ts`.
- **Modify** `src/lib/permissions.ts` — derive `PERMISSIONS` from the registry (lossless); keep `ROLE_DEFAULTS`/`ROLE_ORDER`.
- **Modify** `src/components/shell/sidebar.tsx` + `src/app/(app)/layout.tsx` — render server-derived nav; drop hardcoded `NAV`.
- **Modify** `src/app/(app)/roles/page.tsx` — filter matrix groups by enabled set.
- **Modify** `src/app/(app)/settings/settings-tabs.tsx` + `settings/page.tsx` — add SUPER_ADMIN-only «Αντικείμενα» tab.
- **Modify** existing toggle-able route pages — add `assertObjectEnabled(...)` guard.

---

## Task 1: Object registry + pure helpers

**Files:**
- Create: `src/lib/objects.ts`
- Test: `tests/objects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/objects.test.ts
import { describe, it, expect } from 'vitest'
import {
  OBJECT_REGISTRY, allItems, coreItemKeys, effectiveEnabledKeys,
  buildNav, groupedPermissionsFor,
} from '@/lib/objects'

describe('registry integrity', () => {
  it('has unique item keys and unique permission keys', () => {
    const items = allItems()
    const itemKeys = items.map(i => i.key)
    expect(new Set(itemKeys).size).toBe(itemKeys.length)
    const permKeys = items.flatMap(i => i.permissions.map(p => p.key))
    expect(new Set(permKeys).size).toBe(permKeys.length)
  })
  it('every menuPermission that is non-null is owned by some item', () => {
    const owned = new Set(allItems().flatMap(i => i.permissions.map(p => p.key)))
    for (const i of allItems()) {
      if (i.menuPermission) expect(owned.has(i.menuPermission)).toBe(true)
    }
  })
})

describe('effectiveEnabledKeys', () => {
  it('always includes core keys and ignores unknown stored keys', () => {
    const eff = effectiveEnabledKeys(['products', 'bogus'])
    expect(eff.has('products')).toBe(true)
    expect(eff.has('bogus')).toBe(false)
    for (const k of coreItemKeys()) expect(eff.has(k)).toBe(true)
  })
  it('core keys are effective even when stored list is empty', () => {
    const eff = effectiveEnabledKeys([])
    expect(eff.has('dashboard')).toBe(true)
    expect(eff.has('settings')).toBe(true)
    expect(eff.has('products')).toBe(false)
  })
})

describe('buildNav', () => {
  it('hides an item when its object is disabled even if permission is held', () => {
    const nav = buildNav(effectiveEnabledKeys([]), ['product.view'])
    const hrefs = nav.flatMap(m => m.items.map(i => i.href))
    expect(hrefs).not.toContain('/products')
    expect(hrefs).toContain('/dashboard') // core, no permission needed
  })
  it('hides an item when permission is missing even if object is enabled', () => {
    const nav = buildNav(effectiveEnabledKeys(['products']), [])
    const hrefs = nav.flatMap(m => m.items.map(i => i.href))
    expect(hrefs).not.toContain('/products')
  })
  it('shows an enabled+permitted item and omits empty modules', () => {
    const nav = buildNav(effectiveEnabledKeys(['products']), ['product.view'])
    const hrefs = nav.flatMap(m => m.items.map(i => i.href))
    expect(hrefs).toContain('/products')
    expect(nav.every(m => m.items.length > 0)).toBe(true)
  })
})

describe('groupedPermissionsFor', () => {
  it('excludes disabled objects’ permissions and always keeps core (settings)', () => {
    const groups = groupedPermissionsFor(effectiveEnabledKeys([]))
    const keys = groups.flatMap(g => g.items.map(i => i.key))
    expect(keys).not.toContain('product.view')
    expect(keys).toContain('settings.manage')
  })
  it('includes an enabled object’s permissions', () => {
    const groups = groupedPermissionsFor(effectiveEnabledKeys(['products']))
    const keys = groups.flatMap(g => g.items.map(i => i.key))
    expect(keys).toContain('product.view')
    expect(keys).toContain('translation.edit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/objects.test.ts`
Expected: FAIL — cannot resolve `@/lib/objects`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/objects.ts
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Package, FolderTree, Ruler, Handshake, ClipboardList,
  Container, Settings, Shield, UserCog, Upload, Images, Newspaper, Scale,
  Cookie, CreditCard, ScanText, Coins,
} from 'lucide-react'

export type PermissionDef = { key: string; description: string }

export type ObjectItem = {
  key: string                     // stable id, e.g. 'products'
  href: string
  label: string
  icon: LucideIcon
  menuPermission: string | null   // permission gating the menu entry (null = always for enabled)
  permissions: PermissionDef[]    // permissions OWNED by this item (shown in /roles matrix)
  core?: boolean                  // always enabled, no toggle
  softone?: { object: string }    // informational (Plan 2 sync)
}

export type ObjectModule = { key: string; label: string; items: ObjectItem[] }

export const OBJECT_REGISTRY: ObjectModule[] = [
  { key: 'daily', label: 'Καθημερινά', items: [
    { key: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, menuPermission: null, permissions: [], core: true },
  ] },
  { key: 'catalog', label: 'Προϊόντα & Κατάλογος', items: [
    { key: 'products', href: '/products', label: 'Προϊόντα', icon: Package, menuPermission: 'product.view', softone: { object: 'MTRL' }, permissions: [
      { key: 'product.view', description: 'Προβολή προϊόντων' },
      { key: 'product.edit', description: 'Επεξεργασία προϊόντων' },
      { key: 'product.publish', description: 'Δημοσίευση προϊόντων' },
      { key: 'translation.edit', description: 'Επεξεργασία μεταφράσεων' },
      { key: 'translation.approve', description: 'Έγκριση μεταφράσεων' },
    ] },
    { key: 'categories', href: '/categories', label: 'Κατηγορίες', icon: FolderTree, menuPermission: 'category.manage', permissions: [
      { key: 'category.manage', description: 'Διαχείριση κατηγοριών/ομάδων' },
    ] },
    { key: 'units', href: '/units', label: 'Μονάδες μέτρησης', icon: Ruler, menuPermission: 'unit.manage', permissions: [
      { key: 'unit.manage', description: 'Διαχείριση μονάδων μέτρησης' },
    ] },
  ] },
  { key: 'partners', label: 'Συναλλασσόμενοι', items: [
    { key: 'partners', href: '/partners', label: 'Συναλλασσόμενοι', icon: Handshake, menuPermission: 'customer.view', softone: { object: 'TRDR' }, permissions: [
      { key: 'customer.view', description: 'Προβολή πελατών' },
      { key: 'customer.edit', description: 'Επεξεργασία πελατών/επαφών' },
    ] },
  ] },
  { key: 'orders', label: 'Παραγγελίες & Πωλήσεις', items: [
    { key: 'orders', href: '/orders', label: 'Παραγγελίες', icon: ClipboardList, menuPermission: 'order.view', permissions: [
      { key: 'order.view', description: 'Προβολή παραγγελιών' },
      { key: 'order.create', description: 'Δημιουργία παραγγελιών' },
      { key: 'order.approve', description: 'Έγκριση παραγγελιών' },
      { key: 'order.autoapprove', description: 'Παράκαμψη έγκρισης' },
      { key: 'commission.view', description: 'Προβολή προμηθειών (δικών του)' },
      { key: 'commission.manage', description: 'Διαχείριση προμηθειών' },
      { key: 'portal.access', description: 'Πρόσβαση B2B portal' },
    ] },
  ] },
  { key: 'payments', label: 'Πληρωμές', items: [
    { key: 'payments', href: '/payments', label: 'Πληρωμές', icon: CreditCard, menuPermission: 'payment.view', permissions: [
      { key: 'payment.view', description: 'Προβολή πληρωμών (Viva)' },
      { key: 'payment.manage', description: 'Διαχείριση πληρωμών — δημιουργία, ακύρωση, ρυθμίσεις Viva' },
    ] },
  ] },
  { key: 'logistics', label: 'Logistics', items: [
    { key: 'containers', href: '/containers', label: 'Containers', icon: Container, menuPermission: 'container.manage', permissions: [
      { key: 'container.manage', description: 'Διαχείριση containers & τιμολόγησης' },
    ] },
  ] },
  { key: 'importing', label: 'Εισαγωγή', items: [
    { key: 'import', href: '/import', label: 'Εισαγωγή Excel', icon: Upload, menuPermission: 'import.run', permissions: [
      { key: 'import.run', description: 'Εκτέλεση εισαγωγών Excel' },
    ] },
  ] },
  { key: 'media', label: 'Media', items: [
    { key: 'media', href: '/media', label: 'Media Gallery', icon: Images, menuPermission: 'media.manage', permissions: [
      { key: 'media.manage', description: 'Διαχείριση media' },
    ] },
    // OCR demo reuses media.manage as its gate (owns no new permission — see spec open item).
    { key: 'ocr-demo', href: '/ocr-demo', label: 'OCR (δοκιμή)', icon: ScanText, menuPermission: 'media.manage', permissions: [] },
  ] },
  { key: 'cms', label: 'CMS', items: [
    { key: 'cms-posts', href: '/cms/posts', label: 'Νέα', icon: Newspaper, menuPermission: 'cms.view', permissions: [
      { key: 'cms.view', description: 'Προβολή CMS' },
      { key: 'cms.edit', description: 'Διαχείριση άρθρων/CMS' },
    ] },
    { key: 'cms-legal', href: '/cms/legal', label: 'Νομικά', icon: Scale, menuPermission: 'cms.view', permissions: [] },
    { key: 'cms-consents', href: '/cms/consents', label: 'Συγκαταθέσεις', icon: Cookie, menuPermission: 'cms.view', permissions: [] },
  ] },
  { key: 'admin', label: 'Διαχείριση', items: [
    { key: 'users', href: '/users', label: 'Χρήστες', icon: UserCog, menuPermission: 'user.manage', core: true, permissions: [
      { key: 'user.manage', description: 'Διαχείριση χρηστών/ρόλων' },
    ] },
    { key: 'roles', href: '/roles', label: 'Ρόλοι & Δικαιώματα', icon: Shield, menuPermission: 'user.manage', core: true, permissions: [] },
    { key: 'costs', href: '/costs', label: 'Κόστη', icon: Coins, menuPermission: 'costs.view', core: true, permissions: [
      { key: 'costs.view', description: 'Προβολή κόστους AI/API (SUPER_ADMIN βλέπει markup, ADMIN μόνο το τελικό κόστος)' },
    ] },
    { key: 'settings', href: '/settings', label: 'Ρυθμίσεις', icon: Settings, menuPermission: 'settings.manage', core: true, permissions: [
      { key: 'settings.manage', description: 'Ρυθμίσεις συστήματος' },
      { key: 'sync.run', description: 'Εκτέλεση sync με SoftOne' },
    ] },
  ] },
]

export function allItems(): ObjectItem[] {
  return OBJECT_REGISTRY.flatMap(m => m.items)
}

export function coreItemKeys(): string[] {
  return allItems().filter(i => i.core).map(i => i.key)
}

export function itemByKey(key: string): ObjectItem | undefined {
  return allItems().find(i => i.key === key)
}

/** Effective enabled item keys = (stored ∩ known) ∪ core. */
export function effectiveEnabledKeys(stored: string[]): Set<string> {
  const known = new Set(allItems().map(i => i.key))
  const eff = new Set(stored.filter(k => known.has(k)))
  for (const k of coreItemKeys()) eff.add(k)
  return eff
}

export type NavModule = { group: string; items: { href: string; label: string; icon: LucideIcon }[] }

/** Sidebar nav: modules→items filtered by (enabled OR core) AND permission; empty modules dropped. */
export function buildNav(effective: Set<string>, permissions: string[]): NavModule[] {
  return OBJECT_REGISTRY.map(m => ({
    group: m.label,
    items: m.items
      .filter(i => (i.core || effective.has(i.key)) && (i.menuPermission === null || permissions.includes(i.menuPermission)))
      .map(i => ({ href: i.href, label: i.label, icon: i.icon })),
  })).filter(m => m.items.length > 0)
}

export type PermGroup = { label: string; items: PermissionDef[] }

/** Roles-matrix groups: one per module, containing owned permissions of enabled (or core) items only. */
export function groupedPermissionsFor(effective: Set<string>): PermGroup[] {
  return OBJECT_REGISTRY.map(m => ({
    label: m.label,
    items: m.items
      .filter(i => i.core || effective.has(i.key))
      .flatMap(i => i.permissions),
  })).filter(g => g.items.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/objects.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects.ts tests/objects.test.ts
git commit -m "feat(objects): in-code object registry + pure nav/permission derivations"
```

---

## Task 2: Derive `PERMISSIONS` from the registry (lossless)

**Files:**
- Modify: `src/lib/permissions.ts`
- Test: `tests/objects.test.ts` (add a lossless-migration assertion)

- [ ] **Step 1: Write the failing test**

Append to `tests/objects.test.ts`:

```ts
import { PERMISSIONS as CATALOG } from '@/lib/permissions'

describe('permissions.ts derives losslessly from the registry', () => {
  const EXPECTED_KEYS = [
    'product.view','product.edit','product.publish','import.run','translation.edit',
    'translation.approve','media.manage','category.manage','unit.manage','customer.view',
    'customer.edit','order.view','order.create','order.approve','order.autoapprove',
    'container.manage','payment.view','payment.manage','commission.view','commission.manage',
    'portal.access','sync.run','user.manage','settings.manage','cms.view','cms.edit','costs.view',
  ]
  it('exposes exactly the original 27 permission keys', () => {
    expect(new Set(CATALOG.map(p => p.key))).toEqual(new Set(EXPECTED_KEYS))
    expect(CATALOG.length).toBe(EXPECTED_KEYS.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/objects.test.ts -t 'derives losslessly'`
Expected: FAIL — `PERMISSIONS` still hardcoded but should match; if any key moved/renamed the set differs. (If it accidentally passes before the edit, still proceed — the edit removes duplication.)

- [ ] **Step 3: Edit `src/lib/permissions.ts`**

Replace the hardcoded `PERMISSIONS` array (lines 1–31) and re-point the type. Keep `ROLE_DEFAULTS`, `ROLE_ORDER`, and `groupedPermissions` below unchanged **except** `groupedPermissions` is no longer used by the roles page (Task 5) — leave it for back-compat.

```ts
// src/lib/permissions.ts  (top of file)
import { allItems, type PermissionDef } from '@/lib/objects'

export type { PermissionDef }

/** Full permission catalog — derived from the object registry (single source of truth). */
export const PERMISSIONS: PermissionDef[] = allItems().flatMap(i => i.permissions)

const ALL = PERMISSIONS.map(p => p.key)
```

Leave the rest of the file (`ROLE_DEFAULTS`, `ROLE_ORDER`, `PERMISSION_GROUP_LABELS`, `groupedPermissions`, `PermissionGroup`) exactly as-is.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/objects.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors. There is no import cycle: `PermissionDef` is **defined in** `objects.ts`; `permissions.ts` imports `allItems` + `PermissionDef` from `objects.ts`, and `objects.ts` imports nothing from `permissions.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts tests/objects.test.ts
git commit -m "refactor(permissions): derive PERMISSIONS from object registry (lossless)"
```

---

## Task 3: Server helpers (`objects-server.ts`)

**Files:**
- Create: `src/lib/objects-server.ts`
- Test: `tests/objects-server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/objects-server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSetting = vi.fn()
const setSetting = vi.fn()
vi.mock('@/lib/settings', () => ({ getSetting, setSetting }))
const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
vi.mock('next/navigation', () => ({ notFound }))

import {
  getEnabledObjectKeys, isObjectEnabled, assertObjectEnabled, setEnabledObjectKeys,
} from '@/lib/objects-server'

beforeEach(() => { getSetting.mockReset(); setSetting.mockReset(); notFound.mockClear() })

describe('getEnabledObjectKeys', () => {
  it('unions stored keys with core and drops unknowns', async () => {
    getSetting.mockResolvedValue(['products', 'bogus'])
    const eff = await getEnabledObjectKeys()
    expect(eff.has('products')).toBe(true)
    expect(eff.has('bogus')).toBe(false)
    expect(eff.has('settings')).toBe(true) // core
  })
  it('treats a missing setting as empty (core still present)', async () => {
    getSetting.mockResolvedValue(null)
    const eff = await getEnabledObjectKeys()
    expect(eff.has('dashboard')).toBe(true)
    expect(eff.has('products')).toBe(false)
  })
})

describe('assertObjectEnabled', () => {
  it('calls notFound() for a disabled object', async () => {
    getSetting.mockResolvedValue([])
    await expect(assertObjectEnabled('products')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })
  it('passes for an enabled object', async () => {
    getSetting.mockResolvedValue(['products'])
    await expect(assertObjectEnabled('products')).resolves.toBeUndefined()
  })
  it('passes for a core object regardless of storage', async () => {
    getSetting.mockResolvedValue([])
    await expect(assertObjectEnabled('settings')).resolves.toBeUndefined()
  })
})

describe('setEnabledObjectKeys', () => {
  it('persists only known non-core keys under objects.enabled', async () => {
    getSetting.mockResolvedValue([])
    await setEnabledObjectKeys(['products', 'settings', 'bogus'])
    expect(setSetting).toHaveBeenCalledWith('objects.enabled', ['products'])
  })
})

describe('isObjectEnabled', () => {
  it('is true for enabled and core, false otherwise', async () => {
    getSetting.mockResolvedValue(['products'])
    expect(await isObjectEnabled('products')).toBe(true)
    expect(await isObjectEnabled('settings')).toBe(true)
    expect(await isObjectEnabled('orders')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/objects-server.test.ts`
Expected: FAIL — cannot resolve `@/lib/objects-server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/objects-server.ts
import { notFound } from 'next/navigation'
import { getSetting, setSetting } from '@/lib/settings'
import { allItems, coreItemKeys, effectiveEnabledKeys } from '@/lib/objects'

const SETTING_KEY = 'objects.enabled'

/** Effective enabled item keys (stored ∪ core), read from the Setting store. */
export async function getEnabledObjectKeys(): Promise<Set<string>> {
  const stored = (await getSetting<string[]>(SETTING_KEY)) ?? []
  return effectiveEnabledKeys(stored)
}

export async function isObjectEnabled(key: string): Promise<boolean> {
  return (await getEnabledObjectKeys()).has(key)
}

/** Page guard — 404 when the object is not in the effective enabled set. */
export async function assertObjectEnabled(key: string): Promise<void> {
  if (!(await isObjectEnabled(key))) notFound()
}

/** Persist the SUPER_ADMIN choice: keep only known, non-core keys (core is implicit). */
export async function setEnabledObjectKeys(keys: string[]): Promise<void> {
  const known = new Set(allItems().map(i => i.key))
  const core = new Set(coreItemKeys())
  const toStore = [...new Set(keys)].filter(k => known.has(k) && !core.has(k))
  await setSetting(SETTING_KEY, toStore)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/objects-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects-server.ts tests/objects-server.test.ts
git commit -m "feat(objects): server helpers for enabled-set read/write + route guard"
```

---

## Task 4: Sidebar renders server-derived nav

**Files:**
- Modify: `src/components/shell/sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Change the layout to derive nav server-side**

Replace the full contents of `src/app/(app)/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'
import { PageTransition } from '@/components/shell/page-transition'
import { buildNav } from '@/lib/objects'
import { getEnabledObjectKeys } from '@/lib/objects-server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const enabled = await getEnabledObjectKeys()
  const nav = buildNav(enabled, session.user.permissions)

  return (
    <div className="app-canvas">
      <div className="flex">
        <Sidebar nav={nav} userName={session.user.name ?? ''} userRole={session.user.role} />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-3.5 pb-16">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </div>
  )
}
```

> `nav` carries the Lucide icon **components** (`NavModule.items[].icon: LucideIcon`)
> straight through to `Sidebar`, which renders them as `<item.icon />` (Task 4 Step 2).

- [ ] **Step 2: Change `Sidebar` to accept `nav` and drop the hardcoded catalog**

Edit `src/components/shell/sidebar.tsx`: remove the `NAV` const and the per-item permission filtering; render the passed `nav`. The component stays `'use client'` (uses `usePathname`). Replace the props and the render loop:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { NavModule } from '@/lib/objects'

export function Sidebar({
  nav,
  userName,
  userRole,
}: {
  nav: NavModule[]
  userName: string
  userRole: string
}) {
  const pathname = usePathname()
  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <aside
      className="glass sticky top-3.5 flex h-[calc(100vh-28px)] w-56 shrink-0 flex-col rounded-[26px] p-2.5"
      style={{ margin: '14px 0 14px 14px' }}
    >
      <Link href="/dashboard" className="wordmark px-3 pt-3 pb-4 text-[15px] text-foreground">
        DAMASK
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {nav.map(section => (
          <div key={section.group}>
            <div className="dotted-leader px-3 pt-3 pb-1.5 text-[10px] font-extrabold tracking-[0.11em] text-muted-foreground uppercase">
              {section.group}
            </div>
            {section.items.map(item => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_6px_18px_rgb(22_50_63_/_25%)]'
                      : 'text-muted-foreground hover:bg-[var(--glass-strong)] hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-[18px] border border-[var(--glass-border)] bg-[var(--glass-strong)] px-3 py-2.5">
        <span className="avatar-ring size-8 text-[11px]">{initials}</span>
        <span className="min-w-0">
          <b className="block truncate text-[12.5px] leading-tight">{userName}</b>
          <small className="block text-[10.5px] text-muted-foreground">{userRole}</small>
        </span>
        <span
          className="status-dot pulse ml-auto"
          style={{ background: 'var(--success)', color: 'var(--success)' }}
          aria-hidden
        />
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`NavModule.items[].icon` is a `LucideIcon`, rendered as `<item.icon />`.)

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, log in, confirm the sidebar still lists the same items for your role (nothing disabled yet → identical to before, but grouped by the new module labels).
Expected: Dashboard + all permitted items visible under the new section headers.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/sidebar.tsx 'src/app/(app)/layout.tsx'
git commit -m "refactor(sidebar): render server-derived nav from object registry"
```

---

## Task 5: Roles matrix filtered by enabled set

**Files:**
- Modify: `src/app/(app)/roles/page.tsx`

- [ ] **Step 1: Swap the group source**

Edit `src/app/(app)/roles/page.tsx`: replace the `groupedPermissions` import/call with the enabled-filtered version.

Change the import line:

```ts
import { ROLE_ORDER } from '@/lib/permissions'
import { groupedPermissionsFor } from '@/lib/objects'
import { getEnabledObjectKeys } from '@/lib/objects-server'
```

Replace `const groups = groupedPermissions()` with:

```ts
  const groups = groupedPermissionsFor(await getEnabledObjectKeys())
```

Everything else (roles fetch, `RolesMatrix` props) is unchanged — `groupedPermissionsFor` returns `{ label, items: {key, description}[] }[]`, structurally identical to the `PermGroup[]` `RolesMatrix` already expects.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual check**

Run dev, open `/roles`. With nothing disabled, the matrix shows all permission groups (now labeled by module). After Task 7, disabling an object removes its columns/rows here.
Expected: matrix renders; core groups (Διαχείριση) always present.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(app)/roles/page.tsx'
git commit -m "feat(roles): matrix shows only enabled objects' permissions"
```

---

## Task 6: Route guards on existing toggle-able pages

**Files (each `page.tsx`, add one line after the existing `requirePermission`):**
- Modify: `src/app/(app)/partners/page.tsx` → `assertObjectEnabled('partners')`
- Modify: `src/app/(app)/payments/page.tsx` → `assertObjectEnabled('payments')`
- Modify: `src/app/(app)/import/page.tsx` → `assertObjectEnabled('import')`
- Modify: `src/app/(app)/media/page.tsx` → `assertObjectEnabled('media')`
- Modify: `src/app/(app)/ocr-demo/page.tsx` → `assertObjectEnabled('ocr-demo')`
- Modify: `src/app/(app)/cms/posts/page.tsx` → `assertObjectEnabled('cms-posts')`
- Modify: `src/app/(app)/cms/legal/page.tsx` → `assertObjectEnabled('cms-legal')`
- Modify: `src/app/(app)/cms/consents/page.tsx` → `assertObjectEnabled('cms-consents')`

> Core routes (dashboard, users, roles, costs, settings) get NO guard. Future
> pages (products/categories/units/orders/containers) don't exist yet — add the
> guard when each page is created.

- [ ] **Step 1: Add the import + guard to each page**

For every file above, add the import near the other `@/lib` imports:

```ts
import { assertObjectEnabled } from '@/lib/objects-server'
```

and add the guard immediately after the existing `await requirePermission(...)` call. Example (`partners/page.tsx`):

```ts
export default async function PartnersPage() {
  await requirePermission('customer.view')
  await assertObjectEnabled('partners')
  // ...unchanged...
}
```

Apply the same two-line pattern to the other seven pages, using each file's own object key from the list above. Preserve each page's existing `requirePermission` argument.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual check (after Task 7 exists you can toggle; for now verify no regression)**

Run dev, visit `/partners`, `/media`, `/cms/posts` — all still load (nothing disabled yet).
Expected: pages render normally.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(app)/partners/page.tsx' 'src/app/(app)/payments/page.tsx' 'src/app/(app)/import/page.tsx' 'src/app/(app)/media/page.tsx' 'src/app/(app)/ocr-demo/page.tsx' 'src/app/(app)/cms/posts/page.tsx' 'src/app/(app)/cms/legal/page.tsx' 'src/app/(app)/cms/consents/page.tsx'
git commit -m "feat(objects): 404 disabled object routes via assertObjectEnabled guard"
```

---

## Task 7: «Αντικείμενα» settings tab (SUPER_ADMIN only)

**Files:**
- Create: `src/app/(app)/settings/objects-actions.ts`
- Create: `src/app/(app)/settings/objects-tab.tsx`
- Modify: `src/app/(app)/settings/settings-tabs.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Save action**

```ts
// src/app/(app)/settings/objects-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/rbac-server'
import { setEnabledObjectKeys } from '@/lib/objects-server'
import type { ActionResult } from './actions'

/** Persist the SUPER_ADMIN's enabled-object selection. Core keys are implicit. */
export async function saveEnabledObjects(keys: string[]): Promise<ActionResult> {
  await requireSuperAdmin('settings.manage')
  await setEnabledObjectKeys(keys)
  revalidatePath('/', 'layout') // refresh sidebar (app layout) + /roles + /settings
  return { ok: true, message: 'Οι διαθέσιμες οντότητες αποθηκεύτηκαν.' }
}
```

> Confirm `ActionResult` is exported from `src/app/(app)/settings/actions.ts` (it is used by `s1-sync-actions.ts`). If its shape differs, mirror that type here.

- [ ] **Step 2: Client tab**

```tsx
// src/app/(app)/settings/objects-tab.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { OBJECT_REGISTRY } from '@/lib/objects'
import { saveEnabledObjects } from './objects-actions'
import { Button } from '@/components/ui/button'

/** `enabled` = stored non-core keys currently on. Core items render locked/always-on. */
export function ObjectsTab({ enabled }: { enabled: string[] }) {
  const [on, setOn] = useState<Set<string>>(() => new Set(enabled))
  const [pending, start] = useTransition()

  function toggle(key: string) {
    setOn(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function save() {
    start(async () => {
      const res = await saveEnabledObjects([...on])
      res.ok ? toast.success(res.message) : toast.error(res.message)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted-foreground">
        Επίλεξε ποιες οντότητες είναι διαθέσιμες σε αυτή την εγκατάσταση. Οι απενεργοποιημένες
        κρύβονται από το μενού και τα δικαιώματά τους από τους ρόλους. Τα βασικά (🔒) είναι πάντα ενεργά.
      </p>
      {OBJECT_REGISTRY.map(module => (
        <div key={module.key} className="rounded-2xl border border-[var(--glass-border)] p-3">
          <div className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            {module.label}
          </div>
          <div className="flex flex-col gap-1.5">
            {module.items.map(item => {
              const isCore = !!item.core
              const checked = isCore || on.has(item.key)
              return (
                <label
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-[var(--glass-strong)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isCore || pending}
                    onChange={() => toggle(item.key)}
                  />
                  <item.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="font-semibold">{item.label}</span>
                  {item.softone && (
                    <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] text-muted-foreground">
                      SoftOne {item.softone.object}
                    </span>
                  )}
                  {isCore && <Lock className="ml-auto size-3.5 text-muted-foreground" aria-label="Πάντα ενεργό" />}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the tab into `settings-tabs.tsx` (SUPER_ADMIN only)**

Edit `src/app/(app)/settings/settings-tabs.tsx`: add an optional `objects` panel + tab that only appears when provided.

- Add `Boxes` to the `lucide-react` import.
- Change the `TABS` const to a function of a flag, or append conditionally. Minimal approach — accept an optional `objects` child and, when present, include the tab:

```tsx
import { Building2, Plug, Search, Boxes } from 'lucide-react'
// ...
export function SettingsTabs({
  company, integrations, seo, backups, objects,
}: {
  company: React.ReactNode
  integrations: React.ReactNode
  seo: React.ReactNode
  backups: React.ReactNode
  objects?: React.ReactNode
}) {
  const tabs = [
    { key: 'company', label: 'Εταιρεία', icon: Building2 },
    { key: 'integrations', label: 'Διασυνδέσεις', icon: Plug },
    { key: 'seo', label: 'SEO & Analytics', icon: Search },
    { key: 'backups', label: 'Backups', icon: LuDatabaseBackup },
    ...(objects ? [{ key: 'objects', label: 'Αντικείμενα', icon: Boxes } as const] : []),
  ] as const
  const [active, setActive] = useState<(typeof tabs)[number]['key']>('company')
  // ...render tabs from `tabs` (unchanged pattern)...
  // add after the backups panel:
  //   {objects && (
  //     <div id="settings-panel-objects" role="tabpanel" aria-labelledby="settings-tab-objects" hidden={active !== 'objects'}>
  //       {objects}
  //     </div>
  //   )}
}
```

Keep the existing `TabKey`/`role="tablist"` rendering; just iterate the new `tabs` array and add the conditional `objects` panel block shown in the comment.

- [ ] **Step 4: Provide the panel from `page.tsx` for SUPER_ADMIN**

Edit `src/app/(app)/settings/page.tsx`:

```tsx
import { requireSuperAdmin, requirePermission } from '@/lib/rbac-server'
import { getSetting } from '@/lib/settings'
import { ObjectsTab } from './objects-tab'
// ...existing imports...

export default async function SettingsPage() {
  const session = await requirePermission('settings.manage')
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
  const enabledObjects = isSuperAdmin ? ((await getSetting<string[]>('objects.enabled')) ?? []) : []

  return (
    <div>
      {/* ...unchanged header... */}
      <SettingsTabs
        company={<CompanyTab />}
        integrations={<IntegrationsTab />}
        seo={<SeoTab />}
        backups={<BackupsTab />}
        objects={isSuperAdmin ? <ObjectsTab enabled={enabledObjects} /> : undefined}
      />
    </div>
  )
}
```

> `requireSuperAdmin` is imported for symmetry but the page itself stays gated by
> `requirePermission('settings.manage')`; the tab is the SUPER_ADMIN-only surface.
> The write path is protected server-side by `requireSuperAdmin` in the action.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual end-to-end check**

Run dev as SUPER_ADMIN → `/settings` → «Αντικείμενα» tab. Disable "Πληρωμές", save. Verify: (a) Πληρωμές disappears from the sidebar, (b) its permissions vanish from `/roles`, (c) visiting `/payments` returns 404. Re-enable → all return, and prior role grants are intact. Log in as ADMIN → «Αντικείμενα» tab is absent.
Expected: all behaviors as described.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(app)/settings/objects-actions.ts' 'src/app/(app)/settings/objects-tab.tsx' 'src/app/(app)/settings/settings-tabs.tsx' 'src/app/(app)/settings/page.tsx'
git commit -m "feat(settings): SUPER_ADMIN «Αντικείμενα» tab to toggle object availability"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole suite + typecheck + lint + build**

Run:
```bash
npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all green. (`npm run build` compiles all routes including the guarded pages.)

- [ ] **Step 2: Commit any lint/type fixups**

```bash
git add -A
git commit -m "chore(objects): verification fixups" || echo "nothing to fix"
```

---

## Self-Review notes (author)

- **Spec coverage:** registry §1 → Task 1; storage/helpers §2 → Task 3; sidebar §3 → Task 4; roles §3 → Task 5; route guard §3 → Task 6; settings tab §4 → Task 7; non-destructive permissions §5 → covered (disabling only edits the `objects.enabled` Setting; `RolePermission` rows untouched — verified manually in Task 7 Step 6); runtime auth untouched §6 → no JWT/session changes anywhere. **Sync §7 is intentionally out of scope — Plan 2.**
- **Lossless permissions:** Task 2 asserts the exact original 27 keys.
- **Type consistency:** `NavModule`/`PermGroup`/`PermissionDef` defined in Task 1 are the types consumed in Tasks 2/4/5; `groupedPermissionsFor` returns the shape `RolesMatrix` already accepts.
- **No import cycle:** `PermissionDef` is defined in `objects.ts`; `permissions.ts` imports from `objects.ts`, never the reverse. Fully one-directional.
