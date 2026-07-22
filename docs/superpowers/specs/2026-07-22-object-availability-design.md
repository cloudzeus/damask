# Object Availability — Design Spec

**Date:** 2026-07-22
**Status:** Approved (brainstorming) → ready for implementation plan
**Author:** brainstorming session (ARCHITECT)

## Problem

DAMASK is a **boilerplate** reused across many applications. Not every deployment
uses every domain — one app needs Products + Orders, another only Partners + CMS,
another wires everything to SoftOne. Today the menu (`NAV`) and the permission
catalog (`PERMISSIONS`) are hardcoded, so every deployment ships every object and
must be trimmed by hand.

We want the **SUPER_ADMIN** to compose the app from a catalog of objects via a
Settings screen. An object that is not enabled must not appear in the menu, must
not be reachable by URL, and must not clutter the roles permission matrix.

## Goals

- SUPER_ADMIN enables/disables **objects** from a new Settings tab.
- Enabling an object makes it appear in: (a) the sidebar menu, (b) the /roles
  permission matrix (so each role can be granted rights per object).
- Disabling an object hides it from the menu **and** blocks its route (404).
- Adding a new object to the boilerplate is a **single-place** declaration that
  auto-wires menu + roles + route guard.

## Non-Goals

- No runtime/DB-editable object catalog. The catalog is defined by shipped code.
- No multi-tenant / per-user object sets. One global config per deployment.
- No change to the runtime auth pipeline (JWT/session/`can()`).
- No hard dependency on SoftOne configuration (see SoftOne section).
- Not building every entity's field-level bidirectional merge engine now — v1 wires
  the existing reference-table pull + outbox push behind the new config (see §7).

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Object granularity | **Two levels: module → items.** A module (domain) contains individually toggle-able items. |
| 2 | Registry location | **In code** (Approach A — unified registry). Catalog = shipped code, not admin data. |
| 3 | Disabled behavior | **Block route (404) + hide from menu.** |
| 4 | Core (always-on) modules | **Dashboard + Διαχείριση** (Users, Roles, Settings, Costs) — never toggle-able, so SUPER_ADMIN can't lock themselves out. |
| 5 | Who controls it | **SUPER_ADMIN only.** |
| 6 | SoftOne-dependent objects | Object is modeled per SoftOne field structure (using the `softone` skill) but **works standalone on our own Postgres**. The SoftOne badge is **informational** (indicates sync availability when the integration is configured) — it never blocks enabling. |
| 7 | Permission grants on disable | **Non-destructive.** `RolePermission` rows persist; re-enabling restores prior grants. |
| 8 | Per-table sync direction | **3 options + master:** `pull` (S1→local), `push` (local→S1), `bidirectional`. For bidirectional the SUPER_ADMIN picks the **master side** (`softone`\|`local`) as conflict winner. |
| 9 | Sync frequency | **Presets:** Χειροκίνητα / 15′ / 1ώρα / 6ώρες / Ημερήσια. Scheduler maps presets → cron/interval. |
| 10 | When sync config is shown | **Only on active connection:** SoftOne configured **and** last «Δοκιμή σύνδεσης» (`_lastCheck.ok`) succeeded. |
| 11 | Sync config UI location | **In the object row** — expandable per SoftOne-backed object inside the «Αντικείμενα» tab. |

## Architecture (Approach A — unified object registry)

### 1. Object registry — `src/lib/objects.ts`

Single source of truth. Each item is declared once and drives three consumers.

```ts
import type { LucideIcon } from 'lucide-react'
import type { PermissionDef } from '@/lib/permissions'

export type ObjectItem = {
  key: string                    // stable id, e.g. 'products'
  href: string                   // '/products'
  label: string
  icon: LucideIcon
  permissions: PermissionDef[]   // this item's permissions (moved from permissions.ts)
  core?: boolean                 // always enabled, no toggle
  softone?: { object: string }   // e.g. 'MTRL' — informational (sync capability) only
}

export type ObjectModule = {
  key: string                    // 'catalog'
  label: string                  // sidebar section heading + roles-matrix group label
  items: ObjectItem[]
}

export const OBJECT_REGISTRY: ObjectModule[] = [ /* ... */ ]
```

Module mapping (unifies sidebar grouping **and** the roles-matrix permission
grouping, which are misaligned today):

| Module (label) | Items (key → href) | SoftOne | core |
|----------------|--------------------|---------|------|
| Καθημερινά (core anchor) | dashboard → /dashboard | — | ✅ |
| Προϊόντα & Κατάλογος | products → /products; categories → /categories; units → /units | MTRL | — |
| Συναλλασσόμενοι | partners → /partners | TRDR | — |
| Παραγγελίες | orders → /orders | — | — |
| Πληρωμές | payments → /payments | — | — |
| Logistics | containers → /containers | — | — |
| Media | media → /media; ocr-demo → /ocr-demo | — | — |
| Εισαγωγή | import → /import | — | — |
| CMS | cms-posts → /cms/posts; cms-legal → /cms/legal; cms-consents → /cms/consents | — | — |
| Διαχείριση | users → /users; roles → /roles; costs → /costs; settings → /settings | — | ✅ |

> Item-to-permission mapping mirrors today's `permissions.ts` groupings (e.g.
> `products` owns `product.view/edit/publish`; `partners` owns
> `customer.view/edit`, etc.). Exact assignment is finalized in the plan; it must
> be a lossless move of the current `PERMISSIONS` list.

**UX note (visible change):** the sidebar splits from today's 3 groups
(Καθημερινά / CMS / Διαχείριση) into the domain modules above (~7 sections).
Accepted during brainstorming.

### 2. Storage & server helpers — `src/lib/objects-server.ts`

- Enabled set stored as a single `Setting` row: key `objects.enabled`, value
  `string[]` of enabled **item** keys.
- `getEnabledObjectKeys(): Promise<Set<string>>` — reads the setting, **unions
  with all `core` item keys** (core is always effective).
- `isObjectEnabled(key: string): Promise<boolean>`.
- `assertObjectEnabled(key: string): Promise<void>` — calls `notFound()` when the
  key is not in the effective enabled set. Used as a page guard.
- `setEnabledObjectKeys(keys: string[]): Promise<void>` — persists via
  `setSetting`; SUPER_ADMIN-only (wrapped by the save action with
  `requireSuperAdmin`). Strips core keys before storing (they are implicit) and
  ignores unknown keys.

Uses the existing `getSetting`/`setSetting` in `src/lib/settings.ts`; no schema
migration (the generic `Setting` model already exists).

### 3. Consumers derive from the registry

**Sidebar** (`src/components/shell/sidebar.tsx` + app layout):
- Remove the hardcoded `NAV`.
- The app layout (server) computes the visible nav server-side:
  `registry items` filtered by `effectiveEnabled ∩ userPermissions`, grouped by
  module. Empty modules are omitted.
- The resolved, already-filtered nav structure is passed to `Sidebar` as a prop.
  `Sidebar` stays a client component but no longer owns the catalog or the
  filtering rules.

**/roles matrix** (`src/lib/permissions.ts` + `src/app/(app)/roles/page.tsx`):
- `groupedPermissions()` → `groupedPermissions(enabledKeys: Set<string>)`.
- Returns only the permissions belonging to enabled items (core items always
  included), grouped by module label.
- `roles/page.tsx` calls `getEnabledObjectKeys()` and passes the filtered groups
  to `RolesMatrix` (its props already accept `groups`).

**Route guards** (each toggle-able `page.tsx`):
- Add `await assertObjectEnabled('<item-key>')` at the top of each toggle-able
  route's server component. Disabled → `notFound()`.
- Core routes need no guard.

### 4. Settings UI — new tab «Αντικείμενα» (SUPER_ADMIN only)

- Add a tab to `settings-tabs.tsx`, rendered **only** when the user is
  SUPER_ADMIN (the tab and its panel are omitted otherwise; the settings page is
  already gated behind `settings.manage`, held only by SUPER_ADMIN today, but the
  tab is explicitly SUPER_ADMIN-gated for defense in depth).
- Panel lists modules; each item is a toggle (Switch). Core items render as
  locked/greyed with a 🔒 and no toggle. SoftOne items show an informational
  badge; when the `integration.softone` is not configured the badge reads
  «απαιτεί SoftOne για sync» (still enabled/toggle-able).
- Save via a server action (`setEnabledObjectKeys` behind `requireSuperAdmin`)
  followed by `revalidatePath`/tag so the sidebar and /roles reflect immediately.

### 5. Permission catalog migration (non-destructive)

- `PERMISSIONS` in `src/lib/permissions.ts` is **derived** by flattening
  `OBJECT_REGISTRY` item permissions (plus core items). `ROLE_DEFAULTS`, seed,
  and the `Permission`/`RolePermission` seeding continue to enumerate **all**
  keys — enabling/disabling only filters display/menu/route, never DB rows.
- Disabling an object removes its permissions from the matrix, menu, and route,
  but leaves granted `RolePermission` rows intact. Re-enabling restores them.

### 6. Runtime auth untouched

`can()`, JWT, and session are unchanged. The route guard (`assertObjectEnabled`)
enforces availability regardless of a user's cached permissions, and the menu is
filtered by both availability and permission. No re-login required after toggling.

### 7. Per-table SoftOne sync configuration

Builds on the existing machinery: `syncAllReferences()` (pull, `REF_CONFIGS`),
`S1Outbox` (push), `SyncLog` (audit), and the currently-unscheduled pg-boss
`QUEUE_S1_REF_SYNC` worker in `src/server/queue-start.ts`.

**Config model** (per SoftOne-backed object item only):

```ts
export type SyncDirection = 'pull' | 'push' | 'bidirectional'
export type SyncMaster = 'softone' | 'local'   // conflict winner (bidirectional)
export type SyncFrequency = 'manual' | '15m' | '1h' | '6h' | 'daily'

export type ObjectSyncConfig = {
  syncEnabled: boolean       // sync on/off — INDEPENDENT of object availability
  direction: SyncDirection
  master: SyncMaster         // meaningful for bidirectional; stored always
  frequency: SyncFrequency
  lastRunAt?: string         // ISO — written by the scheduler for "due" calc
}
```

Stored as one `Setting` row: key `objects.sync` → `Record<itemKey, ObjectSyncConfig>`.
Only items with a `softone` mapping have an entry. Defaults on first sight:
`{ syncEnabled: false, direction: 'pull', master: 'softone', frequency: 'manual' }`.

**Active-connection gate.** All sync UI + actions are gated behind
`isSoftOneConnected()` — a new helper reading `getIntegration('softone')`,
requiring both `isIntegrationConfigured('softone', …)` **and**
`_lastCheck.ok === true`. When not connected, the object row shows only the
informational badge «απαιτεί SoftOne για sync» (no config controls).

**UI** — inside the «Αντικείμενα» tab, each SoftOne-backed object row is
expandable (smart-DataTable expand idiom). The expansion renders:
- direction radios (Pull / Push / Bidirectional),
- master radios (SoftOne / Τοπικά) — shown only when direction = bidirectional,
- frequency select (the 5 presets),
- a sync on/off switch,
- «Sync τώρα» button, and last-run / last-result read from `SyncLog`.

Save via a SUPER_ADMIN server action writing `objects.sync`.

**Scheduler wiring.** `QUEUE_S1_REF_SYNC` becomes a **scheduled dispatcher tick**
(default `*/5 * * * *`, `tz: 'Europe/Athens'`). Each tick reads `objects.sync` and,
for every item whose interval has elapsed since `lastRunAt` and whose
`syncEnabled` is true, runs the configured direction:
- `pull` → the item's S1→local pull (reference tables reuse the
  `syncAllReferences`/`REF_CONFIGS` path; entity pulls land per object),
- `push` → drain `S1Outbox` for that S1 object,
- `bidirectional` → pull + push, with `master` deciding the conflict winner.

Preset→interval map: `15m`→15, `1h`→60, `6h`→360, `daily`→1440, `manual`→never
(button only). After each run the dispatcher writes `lastRunAt` and a `SyncLog` row.

**Scope honesty (v1).** Only reference-table **pull** and outbox **push** exist
today. This feature builds the **config surface + scheduler dispatch** and wires
the *existing* pull/push. Full per-entity bidirectional engines (products,
customers, orders…) are delivered as each object's sync is implemented — the plan
must scope v1 to config + dispatch + the already-built flows, not to writing every
entity's field-level merge.

## Data flow

```
SUPER_ADMIN toggles item in Settings → save action (requireSuperAdmin)
  → setEnabledObjectKeys() writes Setting 'objects.enabled'
  → revalidate
       ├─ app layout recomputes sidebar nav (enabled ∩ permission)
       ├─ /roles matrix shows only enabled items' permissions
       └─ direct URL to a disabled item → assertObjectEnabled → notFound()
```

## Testing

- `objects-server` unit tests: effective set = stored ∪ core; unknown keys
  ignored; core keys never removable; `assertObjectEnabled` throws for disabled.
- `groupedPermissions(enabledKeys)`: returns core always; excludes disabled
  items' permissions; grouping labels correct.
- Sidebar nav derivation: item hidden when disabled OR permission missing; module
  omitted when empty; core always present.
- Route guard: disabled item route returns 404; enabled passes.
- Settings save: non-SUPER_ADMIN rejected; core keys stripped before persist;
  re-enabling restores prior `RolePermission` grants (integration test).
- Sync config: `isSoftOneConnected()` false when not configured or `_lastCheck.ok`
  falsy → no sync controls; defaults applied for unseen items; save rejected for
  non-SUPER_ADMIN.
- Scheduler dispatch: preset→interval «due» calc against `lastRunAt`; only
  `syncEnabled` items run; direction routes to pull/push/both; `SyncLog` written.

## Affected files

- **New:** `src/lib/objects.ts`, `src/lib/objects-server.ts`,
  `src/app/(app)/settings/objects-tab.tsx`, objects availability + sync save
  actions, `objects.sync` config helpers (`getObjectSyncConfig`,
  `setObjectSyncConfig`, `isSoftOneConnected`), sync dispatcher in
  `src/lib/s1-sync.ts` (or a new `s1-sync-dispatch.ts`).
- **Changed:** `src/lib/permissions.ts` (derive `PERMISSIONS` from registry;
  `groupedPermissions(enabledKeys)`), `src/components/shell/sidebar.tsx` +
  app layout (server-side nav derivation), `src/app/(app)/roles/page.tsx`
  (filter groups), `src/app/(app)/settings/settings-tabs.tsx` (+ page.tsx) for
  the new tab, each toggle-able `page.tsx` (add `assertObjectEnabled`), and
  `src/server/queue-start.ts` (schedule `QUEUE_S1_REF_SYNC` as the dispatcher tick).

## Open items for the plan

- Finalize exact item→permission assignment as a lossless move from the current
  `PERMISSIONS` list.
- Decide whether ocr-demo/media-demo remain items or are dropped.
- Confirm `import` belongs to its own module vs. Καθημερινά.
- List which registry objects are SoftOne-backed for v1 (reference tables already
  in `REF_CONFIGS`; which entity objects — products/customers — get pull engines
  in this milestone vs. later).
- Decide dispatcher tick storage for `lastRunAt` (inside `objects.sync` Setting vs.
  derived from `SyncLog.createdAt`) — spec assumes the former.
- Confirm bidirectional field-level conflict semantics per entity (master overwrites
  vs. field-wise last-writer) when those engines are built.
