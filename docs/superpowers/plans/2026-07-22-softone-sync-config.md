# SoftOne Sync Configuration Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SUPER_ADMIN configure, per SoftOne sync target, the direction (pull/push/bidirectional + master side) and frequency (presets), gated on an active SoftOne connection; run due targets on a pg-boss schedule, wiring the one real engine (reference-table pull) and marking targets without an engine as "pending".

**Architecture:** A **`SYNC_TARGETS` registry decoupled from the menu `OBJECT_REGISTRY`** (reference tables aren't menu objects). Per-target config is stored in one `Setting` (`objects.sync`). A pure due-calculation drives a pg-boss dispatcher tick (`QUEUE_S1_REF_SYNC`, currently unscheduled) that routes each due, enabled target to an **engine registry**; only the reference-pull engine exists — products/partners resolve to an `EnginePendingError`. UI is a SUPER_ADMIN, connection-gated «Συγχρονισμός SoftOne» panel.

**Tech Stack:** Next.js (server components + server actions), Prisma/Postgres (`Setting`, `SyncLog`), pg-boss 12 (`boss.schedule`, cron + tz), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-object-availability-design.md` §7 (corrected scope note).

**Depends on:** Plan 1 (merged). Reuses `src/lib/settings.ts` (`getSetting`/`setSetting`), `src/lib/s1-sync.ts` (`syncAllReferences`, `SyncResult`), `src/lib/rbac-server.ts` (`requireSuperAdmin`), `src/server/queue-start.ts` (`QUEUE_S1_REF_SYNC`), `prisma` `SyncLog` model (`entity, action, ok, message, s1Key?, request?, response?`).

---

## Scope (from user decision "infra + reference pull now")

- BUILD: config model + `objects.sync` Setting, `isSoftOneConnected()`, the sync-config UI, the pg-boss dispatcher, and the reference-pull engine binding.
- DO NOT BUILD: MTRL/TRDR pull engines, any push/`S1Outbox` drain, or field-level bidirectional merge. products/partners are sync targets whose config is stored but whose engine is "pending" (dispatcher/sync-now no-op with a clear pending status, logged).

## File Structure

- **Create** `src/lib/sync-targets.ts` — `SYNC_TARGETS` registry + config types + pure helpers (`FREQUENCY_MINUTES`, `defaultSyncConfig`, `isDue`, `dueTargetKeys`). No DB — unit-testable.
- **Create** `src/lib/sync-config-server.ts` — `objects.sync` Setting helpers (`getSyncConfigs`, `setSyncConfig`, `updateLastRun`) + `isSoftOneConnected()`.
- **Create** `src/lib/sync-engines.ts` — engine registry + `EnginePendingError` + `runSyncTarget(key)` (routes to engine, writes `SyncLog`, updates `lastRunAt`).
- **Create** `src/app/(app)/settings/sync-tab.tsx` (client UI) + `src/app/(app)/settings/sync-actions.ts` (SUPER_ADMIN save + manual "sync now").
- **Create** `tests/sync-targets.test.ts`, `tests/sync-config-server.test.ts`, `tests/sync-engines.test.ts`.
- **Modify** `src/server/queue-start.ts` — schedule `QUEUE_S1_REF_SYNC` as the dispatcher tick.
- **Modify** `src/app/(app)/settings/settings-tabs.tsx` + `settings/page.tsx` — add SUPER_ADMIN «Συγχρονισμός» tab (connection-gated).

---

## Task 1: Sync-targets registry + pure helpers

**Files:** Create `src/lib/sync-targets.ts`; Test `tests/sync-targets.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sync-targets.test.ts
import { describe, it, expect } from 'vitest'
import {
  SYNC_TARGETS, FREQUENCY_MINUTES, defaultSyncConfig, isDue, dueTargetKeys,
  type ObjectSyncConfig,
} from '@/lib/sync-targets'

describe('SYNC_TARGETS', () => {
  it('has unique keys and exactly one engine-backed target (s1-references)', () => {
    const keys = SYNC_TARGETS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(SYNC_TARGETS.filter(t => t.hasEngine).map(t => t.key)).toEqual(['s1-references'])
  })
  it('reference target supports only pull; object targets support all three', () => {
    const ref = SYNC_TARGETS.find(t => t.key === 's1-references')!
    expect(ref.supportedDirections).toEqual(['pull'])
    const products = SYNC_TARGETS.find(t => t.key === 'products')!
    expect(products.supportedDirections).toEqual(['pull', 'push', 'bidirectional'])
    expect(products.s1Object).toBe('MTRL')
  })
})

describe('defaultSyncConfig', () => {
  it('is disabled/manual/pull/softone by default', () => {
    expect(defaultSyncConfig()).toEqual({
      syncEnabled: false, direction: 'pull', master: 'softone', frequency: 'manual',
    })
  })
})

describe('isDue', () => {
  const now = Date.parse('2026-07-22T12:00:00.000Z')
  const base: ObjectSyncConfig = { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '1h' }
  it('is false when disabled', () => {
    expect(isDue({ ...base, syncEnabled: false }, now)).toBe(false)
  })
  it('is false when frequency is manual', () => {
    expect(isDue({ ...base, frequency: 'manual' }, now)).toBe(false)
  })
  it('is true when enabled+scheduled and never run', () => {
    expect(isDue(base, now)).toBe(true)
  })
  it('is false when the interval has not elapsed', () => {
    expect(isDue({ ...base, lastRunAt: '2026-07-22T11:30:00.000Z' }, now)).toBe(false) // 30m < 60m
  })
  it('is true when the interval has elapsed', () => {
    expect(isDue({ ...base, lastRunAt: '2026-07-22T10:30:00.000Z' }, now)).toBe(true) // 90m >= 60m
  })
})

describe('dueTargetKeys', () => {
  it('returns only enabled+due target keys', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z')
    const configs = {
      's1-references': { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '15m' } as ObjectSyncConfig,
      products: { syncEnabled: false, direction: 'pull', master: 'softone', frequency: '15m' } as ObjectSyncConfig,
    }
    expect(dueTargetKeys(configs, now)).toEqual(['s1-references'])
  })
})

describe('FREQUENCY_MINUTES', () => {
  it('maps presets to minutes, manual to null', () => {
    expect(FREQUENCY_MINUTES).toEqual({ manual: null, '15m': 15, '1h': 60, '6h': 360, daily: 1440 })
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**

Run: `npx vitest run tests/sync-targets.test.ts` → FAIL (cannot resolve `@/lib/sync-targets`).

- [ ] **Step 3: Implement**

```ts
// src/lib/sync-targets.ts
export type SyncDirection = 'pull' | 'push' | 'bidirectional'
export type SyncMaster = 'softone' | 'local'
export type SyncFrequency = 'manual' | '15m' | '1h' | '6h' | 'daily'

export type ObjectSyncConfig = {
  syncEnabled: boolean
  direction: SyncDirection
  master: SyncMaster
  frequency: SyncFrequency
  lastRunAt?: string // ISO
}

export type SyncTarget = {
  key: string
  label: string
  s1Object?: string            // informational
  supportedDirections: SyncDirection[]
  hasEngine: boolean           // false → "engine pending"
}

/** Decoupled from the menu OBJECT_REGISTRY: reference/lookup tables are not menu objects. */
export const SYNC_TARGETS: SyncTarget[] = [
  { key: 's1-references', label: 'Βοηθητικοί πίνακες SoftOne', supportedDirections: ['pull'], hasEngine: true },
  { key: 'products', label: 'Προϊόντα', s1Object: 'MTRL', supportedDirections: ['pull', 'push', 'bidirectional'], hasEngine: false },
  { key: 'partners', label: 'Συναλλασσόμενοι', s1Object: 'TRDR', supportedDirections: ['pull', 'push', 'bidirectional'], hasEngine: false },
]

export const FREQUENCY_MINUTES: Record<SyncFrequency, number | null> = {
  manual: null, '15m': 15, '1h': 60, '6h': 360, daily: 1440,
}

export function defaultSyncConfig(): ObjectSyncConfig {
  return { syncEnabled: false, direction: 'pull', master: 'softone', frequency: 'manual' }
}

/** Pure: is this config due to run at nowMs? (enabled, non-manual, and interval elapsed since lastRunAt). */
export function isDue(config: ObjectSyncConfig, nowMs: number): boolean {
  if (!config.syncEnabled) return false
  const mins = FREQUENCY_MINUTES[config.frequency]
  if (mins === null) return false
  if (!config.lastRunAt) return true
  const last = Date.parse(config.lastRunAt)
  if (Number.isNaN(last)) return true
  return nowMs - last >= mins * 60_000
}

export function dueTargetKeys(configs: Record<string, ObjectSyncConfig>, nowMs: number): string[] {
  return Object.entries(configs).filter(([, c]) => isDue(c, nowMs)).map(([k]) => k)
}
```

- [ ] **Step 4: Run — confirm PASS**

Run: `npx vitest run tests/sync-targets.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync-targets.ts tests/sync-targets.test.ts
git commit -m "feat(sync): SYNC_TARGETS registry + pure due-calculation helpers"
```

---

## Task 2: Config store helpers + connection gate

**Files:** Create `src/lib/sync-config-server.ts`; Test `tests/sync-config-server.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sync-config-server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSetting, setSetting, getIntegration } = vi.hoisted(() => ({
  getSetting: vi.fn(), setSetting: vi.fn(), getIntegration: vi.fn(),
}))
vi.mock('@/lib/settings', () => ({
  getSetting, setSetting, getIntegration,
  isIntegrationConfigured: (_n: string, m: Record<string, unknown>) =>
    ['serial', 'username', 'password', 'appId'].every(k => String(m[k] ?? '').trim() !== ''),
}))

import { getSyncConfigs, setSyncConfig, updateLastRun, isSoftOneConnected } from '@/lib/sync-config-server'

beforeEach(() => { getSetting.mockReset(); setSetting.mockReset(); getIntegration.mockReset() })

describe('getSyncConfigs', () => {
  it('returns defaults for every target, merged over stored values', async () => {
    getSetting.mockResolvedValue({ 's1-references': { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '1h' } })
    const cfg = await getSyncConfigs()
    expect(cfg['s1-references'].syncEnabled).toBe(true)
    expect(cfg['products']).toEqual({ syncEnabled: false, direction: 'pull', master: 'softone', frequency: 'manual' })
  })
})

describe('setSyncConfig', () => {
  it('merges a partial patch into the stored target config', async () => {
    getSetting.mockResolvedValue({})
    await setSyncConfig('s1-references', { syncEnabled: true, frequency: '15m' })
    const [, written] = setSetting.mock.calls[0]
    expect(written['s1-references']).toMatchObject({ syncEnabled: true, frequency: '15m', direction: 'pull' })
  })
  it('rejects an unknown target key', async () => {
    getSetting.mockResolvedValue({})
    await expect(setSyncConfig('bogus', { syncEnabled: true })).rejects.toThrow()
    expect(setSetting).not.toHaveBeenCalled()
  })
})

describe('updateLastRun', () => {
  it('writes only lastRunAt for the target, preserving other fields', async () => {
    getSetting.mockResolvedValue({ 's1-references': { syncEnabled: true, direction: 'pull', master: 'softone', frequency: '1h' } })
    await updateLastRun('s1-references', '2026-07-22T12:00:00.000Z')
    const [, written] = setSetting.mock.calls[0]
    expect(written['s1-references'].lastRunAt).toBe('2026-07-22T12:00:00.000Z')
    expect(written['s1-references'].frequency).toBe('1h')
  })
})

describe('isSoftOneConnected', () => {
  it('is false when not configured', async () => {
    getIntegration.mockResolvedValue({})
    expect(await isSoftOneConnected()).toBe(false)
  })
  it('is false when configured but last check failed/absent', async () => {
    getIntegration.mockResolvedValue({ serial: 's', username: 'u', password: 'p', appId: '1' })
    expect(await isSoftOneConnected()).toBe(false)
  })
  it('is true when configured and last check ok', async () => {
    getIntegration.mockResolvedValue({ serial: 's', username: 'u', password: 'p', appId: '1', _lastCheck: { ok: true, message: '', at: 'x' } })
    expect(await isSoftOneConnected()).toBe(true)
  })
})
```

- [ ] **Step 2: Run — confirm FAIL** (`npx vitest run tests/sync-config-server.test.ts`).

- [ ] **Step 3: Implement**

```ts
// src/lib/sync-config-server.ts
import { getSetting, setSetting, getIntegration, isIntegrationConfigured } from '@/lib/settings'
import { SYNC_TARGETS, defaultSyncConfig, type ObjectSyncConfig } from '@/lib/sync-targets'

const KEY = 'objects.sync'

type Stored = Record<string, Partial<ObjectSyncConfig>>

/** All targets, defaults merged under any stored overrides. */
export async function getSyncConfigs(): Promise<Record<string, ObjectSyncConfig>> {
  const stored = (await getSetting<Stored>(KEY)) ?? {}
  const out: Record<string, ObjectSyncConfig> = {}
  for (const t of SYNC_TARGETS) out[t.key] = { ...defaultSyncConfig(), ...stored[t.key] }
  return out
}

function assertKnown(key: string): void {
  if (!SYNC_TARGETS.some(t => t.key === key)) throw new Error(`Άγνωστος sync target: ${key}`)
}

/** Merge a partial patch into one target's config (read-before-write, other targets untouched). */
export async function setSyncConfig(key: string, patch: Partial<ObjectSyncConfig>): Promise<void> {
  assertKnown(key)
  const stored = (await getSetting<Stored>(KEY)) ?? {}
  const next: Stored = { ...stored, [key]: { ...defaultSyncConfig(), ...stored[key], ...patch } }
  await setSetting(KEY, next)
}

export async function updateLastRun(key: string, iso: string): Promise<void> {
  await setSyncConfig(key, { lastRunAt: iso })
}

/** Active connection = SoftOne credentials present AND last «Δοκιμή σύνδεσης» ok. */
export async function isSoftOneConnected(): Promise<boolean> {
  const s = await getIntegration<Record<string, unknown>>('softone')
  if (!isIntegrationConfigured('softone', s)) return false
  const check = s._lastCheck as { ok?: boolean } | undefined
  return check?.ok === true
}
```

- [ ] **Step 4: Run — confirm PASS.** Also `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync-config-server.ts tests/sync-config-server.test.ts
git commit -m "feat(sync): objects.sync config store helpers + isSoftOneConnected gate"
```

---

## Task 3: Engine registry + runSyncTarget

**Files:** Create `src/lib/sync-engines.ts`; Test `tests/sync-engines.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sync-engines.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { syncAllReferences } = vi.hoisted(() => ({ syncAllReferences: vi.fn() }))
vi.mock('@/lib/s1-sync', () => ({ syncAllReferences }))
const { updateLastRun } = vi.hoisted(() => ({ updateLastRun: vi.fn() }))
vi.mock('@/lib/sync-config-server', () => ({ updateLastRun }))
const { syncLogCreate } = vi.hoisted(() => ({ syncLogCreate: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { syncLog: { create: syncLogCreate } } }))

import { runSyncTarget } from '@/lib/sync-engines'

beforeEach(() => { syncAllReferences.mockReset(); updateLastRun.mockReset(); syncLogCreate.mockReset() })

describe('runSyncTarget', () => {
  it('runs the reference engine, updates lastRunAt, and writes a SyncLog on success', async () => {
    syncAllReferences.mockResolvedValue([{ table: 'VAT', ok: true, count: 3 }, { table: 'PAYMENT', ok: true, count: 2 }])
    const res = await runSyncTarget('s1-references', () => '2026-07-22T12:00:00.000Z')
    expect(res.ok).toBe(true)
    expect(res.pending).toBeFalsy()
    expect(res.count).toBe(5)
    expect(updateLastRun).toHaveBeenCalledWith('s1-references', '2026-07-22T12:00:00.000Z')
    expect(syncLogCreate).toHaveBeenCalled()
  })
  it('returns a pending result (no engine) for products — no lastRun, no throw', async () => {
    const res = await runSyncTarget('products', () => '2026-07-22T12:00:00.000Z')
    expect(res.pending).toBe(true)
    expect(res.ok).toBe(false)
    expect(updateLastRun).not.toHaveBeenCalled()
    expect(syncAllReferences).not.toHaveBeenCalled()
  })
  it('marks the run failed (still logs) when the engine throws', async () => {
    syncAllReferences.mockRejectedValue(new Error('S1 down'))
    const res = await runSyncTarget('s1-references', () => '2026-07-22T12:00:00.000Z')
    expect(res.ok).toBe(false)
    expect(res.pending).toBeFalsy()
    expect(syncLogCreate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — confirm FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/sync-engines.ts
import { prisma } from '@/lib/prisma'
import { syncAllReferences } from '@/lib/s1-sync'
import { updateLastRun } from '@/lib/sync-config-server'
import { SYNC_TARGETS } from '@/lib/sync-targets'

export type SyncRunResult = { ok: boolean; pending?: boolean; count: number; message: string }

/** engine returns {count,message}; throwing means a failed run (still logged). */
type Engine = () => Promise<{ count: number; message: string }>

const ENGINES: Record<string, Engine> = {
  's1-references': async () => {
    const results = await syncAllReferences()
    const failed = results.filter(r => !r.ok)
    const count = results.reduce((s, r) => s + r.count, 0)
    if (failed.length) {
      return { count, message: `Ολοκληρώθηκε με σφάλματα: ${failed.map(f => f.table).join(', ')}.` }
    }
    return { count, message: `Συγχρονίστηκαν ${count} εγγραφές σε ${results.length} πίνακες.` }
  },
}

/** now: injected clock (ISO) so the scheduler/tests control timestamps. */
export async function runSyncTarget(key: string, now: () => string): Promise<SyncRunResult> {
  const target = SYNC_TARGETS.find(t => t.key === key)
  if (!target) return { ok: false, count: 0, message: `Άγνωστος target: ${key}` }
  const engine = ENGINES[key]
  if (!engine) {
    return { ok: false, pending: true, count: 0, message: 'Ο μηχανισμός συγχρονισμού δεν έχει υλοποιηθεί ακόμη.' }
  }
  try {
    const { count, message } = await engine()
    const ts = now()
    await updateLastRun(key, ts)
    await prisma.syncLog.create({ data: { entity: key, action: 'pull', ok: true, message } })
    return { ok: true, count, message }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Το sync απέτυχε.'
    await prisma.syncLog.create({ data: { entity: key, action: 'pull', ok: false, message } })
    return { ok: false, count: 0, message }
  }
}
```

- [ ] **Step 4: Run — confirm PASS.** Also `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync-engines.ts tests/sync-engines.test.ts
git commit -m "feat(sync): engine registry + runSyncTarget (reference pull real, objects pending)"
```

---

## Task 4: Schedule the dispatcher tick

**Files:** Modify `src/server/queue-start.ts`.

- [ ] **Step 1: Add a scheduled worker for the existing `QUEUE_S1_REF_SYNC`**

READ `src/server/queue-start.ts` first. Currently it `createQueue(QUEUE_S1_REF_SYNC)` + `work(...)` calls `syncAllReferences()` directly but has NO `boss.schedule(...)` for it. Replace that worker body with a **dispatcher** and add a schedule.

Replace the existing `QUEUE_S1_REF_SYNC` `createQueue`/`work` block with:

```ts
  await boss.createQueue(QUEUE_S1_REF_SYNC)
  // Dispatcher tick: κάθε 5′ διαβάζει το objects.sync, βρίσκει ποια targets είναι due
  // (enabled + non-manual + πέρασε το interval) και τρέχει το engine τους. Μόνο το
  // 's1-references' έχει engine· products/partners επιστρέφουν "pending" (no-op).
  await boss.work(QUEUE_S1_REF_SYNC, async () => {
    const { getSyncConfigs } = await import('@/lib/sync-config-server')
    const { dueTargetKeys } = await import('@/lib/sync-targets')
    const { runSyncTarget } = await import('@/lib/sync-engines')
    const configs = await getSyncConfigs()
    const due = dueTargetKeys(configs, Date.now())
    for (const key of due) {
      const res = await runSyncTarget(key, () => new Date().toISOString())
      if (!res.ok && !res.pending) console.warn('[pg-boss] s1 sync target απέτυχε', key, res.message)
    }
  })
  await boss.schedule(QUEUE_S1_REF_SYNC, '*/5 * * * *', null, { tz: 'Europe/Athens' })
```

(The dynamic `import()`s keep `queue-start` free of app-layer static deps, matching the existing lazy-import idiom in `s1-sync.ts`. `Date.now()`/`new Date()` are fine here — this is app runtime, not a Workflow script.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (clean) and `npx vitest run` (still 714+ green — no test targets this file directly; the due logic is covered by Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/server/queue-start.ts
git commit -m "feat(sync): schedule QUEUE_S1_REF_SYNC as a 5-minute due-target dispatcher"
```

---

## Task 5: SUPER_ADMIN sync save + manual-run actions

**Files:** Create `src/app/(app)/settings/sync-actions.ts`.

- [ ] **Step 1: Implement the server actions**

```ts
// src/app/(app)/settings/sync-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/rbac-server'
import { setSyncConfig, isSoftOneConnected } from '@/lib/sync-config-server'
import { runSyncTarget } from '@/lib/sync-engines'
import type { ObjectSyncConfig } from '@/lib/sync-targets'
import type { ActionResult } from './actions'

/** Persist a partial sync-config patch for one target (SUPER_ADMIN only). */
export async function saveSyncConfig(key: string, patch: Partial<ObjectSyncConfig>): Promise<ActionResult> {
  await requireSuperAdmin('settings.manage')
  if (!(await isSoftOneConnected())) return { ok: false, message: 'Δεν υπάρχει ενεργή σύνδεση SoftOne.' }
  await setSyncConfig(key, patch)
  revalidatePath('/settings')
  return { ok: true, message: 'Οι ρυθμίσεις συγχρονισμού αποθηκεύτηκαν.' }
}

/** Manual «Sync τώρα» for one target (SUPER_ADMIN only). */
export async function runSyncNow(key: string): Promise<ActionResult> {
  await requireSuperAdmin('settings.manage')
  if (!(await isSoftOneConnected())) return { ok: false, message: 'Δεν υπάρχει ενεργή σύνδεση SoftOne.' }
  const res = await runSyncTarget(key, () => new Date().toISOString())
  revalidatePath('/settings')
  return { ok: res.ok, message: res.message }
}
```

> Confirm the `ActionResult` shape in `./actions.ts` and match it (same as Plan 1's `objects-actions.ts`).

- [ ] **Step 2: Verify** `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(app)/settings/sync-actions.ts'
git commit -m "feat(sync): SUPER_ADMIN save-config + run-now actions (connection-gated)"
```

---

## Task 6: «Συγχρονισμός SoftOne» tab (SUPER_ADMIN + connection-gated)

**Files:** Create `src/app/(app)/settings/sync-tab.tsx`; Modify `settings-tabs.tsx` + `settings/page.tsx`.

> Design note (supersedes the spec's earlier "in the object row" placement): reference
> tables are not menu objects, so the sync UI is its own SUPER_ADMIN tab «Συγχρονισμός»,
> shown only when `isSoftOneConnected()`. Flag this at spec-review if you prefer it under
> the SoftOne integration card instead.

- [ ] **Step 1: Build the client tab**

```tsx
// src/app/(app)/settings/sync-tab.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SYNC_TARGETS, type ObjectSyncConfig, type SyncDirection, type SyncFrequency } from '@/lib/sync-targets'
import { saveSyncConfig, runSyncNow } from './sync-actions'
import { Button } from '@/components/ui/button'

const FREQ_LABELS: Record<SyncFrequency, string> = {
  manual: 'Χειροκίνητα', '15m': 'Κάθε 15′', '1h': 'Κάθε ώρα', '6h': 'Κάθε 6 ώρες', daily: 'Ημερήσια',
}
const DIR_LABELS: Record<SyncDirection, string> = { pull: 'SoftOne → Τοπικά', push: 'Τοπικά → SoftOne', bidirectional: 'Αμφίδρομο' }

export function SyncTab({ configs }: { configs: Record<string, ObjectSyncConfig> }) {
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-muted-foreground">
        Ανά αντικείμενο SoftOne: κατεύθυνση, πλευρά-πηγή (για αμφίδρομο) και συχνότητα. Τρέχει
        αυτόματα κάθε 5′ όσα είναι due. Αντικείμενα χωρίς μηχανισμό εμφανίζονται ως «σε εκκρεμότητα».
      </p>
      {SYNC_TARGETS.map(target => {
        const cfg = configs[target.key]
        return (
          <TargetRow key={target.key} target={target} cfg={cfg} pending={pending} start={start} />
        )
      })}
    </div>
  )
}

function TargetRow({
  target, cfg, pending, start,
}: {
  target: (typeof SYNC_TARGETS)[number]
  cfg: ObjectSyncConfig
  pending: boolean
  start: (cb: () => void) => void
}) {
  const [local, setLocal] = useState(cfg)
  const patch = (p: Partial<ObjectSyncConfig>) => setLocal(prev => ({ ...prev, ...p }))

  function save() {
    start(async () => {
      const res = await saveSyncConfig(target.key, local)
      res.ok ? toast.success(res.message) : toast.error(res.message)
    })
  }
  function syncNow() {
    start(async () => {
      const res = await runSyncNow(target.key)
      res.ok ? toast.success(res.message) : toast.error(res.message)
    })
  }

  return (
    <div className="rounded-2xl border border-[var(--glass-border)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <b className="text-[13px]">{target.label}</b>
        {target.s1Object && <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] text-muted-foreground">SoftOne {target.s1Object}</span>}
        {!target.hasEngine && <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] text-muted-foreground">σε εκκρεμότητα</span>}
        {local.lastRunAt && <span className="ml-auto text-[10.5px] text-muted-foreground">Τελευταίο: {new Date(local.lastRunAt).toLocaleString('el-GR')}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={local.syncEnabled} disabled={pending} onChange={e => patch({ syncEnabled: e.target.checked })} />
          Ενεργό
        </label>
        <select className="rounded-lg border border-[var(--glass-border)] bg-transparent px-2 py-1" value={local.direction} disabled={pending} onChange={e => patch({ direction: e.target.value as SyncDirection })}>
          {target.supportedDirections.map(d => <option key={d} value={d}>{DIR_LABELS[d]}</option>)}
        </select>
        {local.direction === 'bidirectional' && (
          <select className="rounded-lg border border-[var(--glass-border)] bg-transparent px-2 py-1" value={local.master} disabled={pending} onChange={e => patch({ master: e.target.value as ObjectSyncConfig['master'] })}>
            <option value="softone">Master: SoftOne</option>
            <option value="local">Master: Τοπικά</option>
          </select>
        )}
        <select className="rounded-lg border border-[var(--glass-border)] bg-transparent px-2 py-1" value={local.frequency} disabled={pending} onChange={e => patch({ frequency: e.target.value as SyncFrequency })}>
          {(Object.keys(FREQ_LABELS) as SyncFrequency[]).map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
        </select>
        <Button onClick={save} disabled={pending}>Αποθήκευση</Button>
        <Button variant="outline" onClick={syncNow} disabled={pending}>Sync τώρα</Button>
      </div>
    </div>
  )
}
```

> Confirm `Button` supports a `variant="outline"` prop in `@/components/ui/button`; if not, drop the prop.

- [ ] **Step 2: Wire into `settings-tabs.tsx`** — same optional-tab pattern Plan 1 used for «Αντικείμενα». Add a `sync?: React.ReactNode` prop; when provided, append a tab keyed `sync` labeled «Συγχρονισμός» (use the `RefreshCw` icon from lucide-react) and a matching panel after the objects panel. Keep the existing a11y id pattern.

- [ ] **Step 3: Wire into `settings/page.tsx`** — for SUPER_ADMIN AND when connected, pass the sync panel:

```tsx
import { isSoftOneConnected, getSyncConfigs } from '@/lib/sync-config-server'
import { SyncTab } from './sync-tab'
// ...
  const connected = isSuperAdmin ? await isSoftOneConnected() : false
  const syncConfigs = connected ? await getSyncConfigs() : null
// ...
      <SettingsTabs
        company={<CompanyTab />}
        integrations={<IntegrationsTab />}
        seo={<SeoTab />}
        backups={<BackupsTab />}
        objects={isSuperAdmin ? <ObjectsTab enabled={enabledObjects} /> : undefined}
        sync={syncConfigs ? <SyncTab configs={syncConfigs} /> : undefined}
      />
```

- [ ] **Step 4: Verify** `npx tsc --noEmit` clean; `npx eslint` scoped to the new/changed settings files clean; `npx vitest run` green.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(app)/settings/sync-tab.tsx' 'src/app/(app)/settings/settings-tabs.tsx' 'src/app/(app)/settings/page.tsx'
git commit -m "feat(settings): SUPER_ADMIN «Συγχρονισμός SoftOne» tab (connection-gated)"
```

---

## Task 7: Full verification + runtime check

- [ ] **Step 1: Automated gates**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```
Expect: all green; build compiles (new tab is behind a server gate, so build won't exercise the connected branch — that's fine).

- [ ] **Step 2: Runtime check (REQUIRED — Plan 1 taught us build+tests miss RSC/runtime issues).**

The `SyncTab` is a client component receiving a plain `configs` object (no functions/icons crossing the boundary — verify no `LucideIcon` or function is passed as a prop from the server page). Then a human must, as SUPER_ADMIN with SoftOne configured + a passing connection test: open /settings → «Συγχρονισμός» tab, toggle a target, Save, click «Sync τώρα» on «Βοηθητικοί πίνακες SoftOne», and confirm a toast + a `SyncLog` row. Confirm the tab is ABSENT when not connected or not SUPER_ADMIN.

- [ ] **Step 3: Commit any fixups.**

---

## Self-Review notes (author)

- **Spec coverage:** config model §7 → T1/T2; connection gate → T2; engine + reference pull + pending → T3; scheduler dispatch → T4; actions → T5; UI → T6.
- **RSC boundary:** `SyncTab` receives only a plain `configs` object (serializable); `SYNC_TARGETS` (with any future icons) is imported client-side, never passed as a prop — the Plan 1 icon-serialization trap is avoided by construction (verified in T7 Step 2).
- **No push / no MTRL-TRDR engine built** — products/partners are visibly "pending"; the only engine is reference pull.
- **Type consistency:** `ObjectSyncConfig`/`SyncDirection`/`SyncFrequency`/`SyncTarget` defined in T1 are consumed by T2/T3/T5/T6; `runSyncTarget(key, now)` signature is identical in T3, T4, T5.
- **Clock injection:** `runSyncTarget` takes a `now: () => string` so tests are deterministic and `Date` stays out of the pure layer (T1 `isDue` takes `nowMs`).
