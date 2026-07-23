# C2c — Reminders (daily digest) · Overview Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A daily 08:00 (Europe/Athens) pg-boss job emails each user a digest of their overdue / due-≤3-days obligations; a `ReminderLog` records every send; a new «Επισκόπηση» view aggregates the open load.

**Architecture:** PURE select/group/email builders + PURE overview summarizer; a server `runPmReminders` (mailer-gated, idempotent, never-throws); one new pg-boss scheduled queue; a client «Επισκόπηση» view reusing the workspace obligations. One additive model (`ReminderLog`). No new permission.

**Tech Stack:** Next.js 16.2, Prisma 7.8, pg-boss (`src/lib/queue.ts` + `src/server/queue-start.ts`), Mailgun mailer (`src/lib/mailer.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2c-reminders-design.md`.

**Ground rules:** tests in `tests/`; Prisma 7.8 multi-line enums (don't run `prisma format`, edit by hand; revert unrelated reformatting after migrate); pure files (`reminders.ts`, `reports.ts`) NO prisma/react/**clock** (`todayMs`/`nowMs` passed in); the pg-boss worker **never throws to boss** (swallow+log, like the S1 sync dispatcher); don't stage `.planning/HANDOFF.json`/`vitest.config.ts`; ambient tsc `RouteContext` error may appear — ignore.

**Verified facts:**
- `sendMail({ to, subject, html, text?, userId?, refType?, refId? }) → { ok:true } | { ok:false, error }`; `isMailerConfigured(): Promise<boolean>` (`src/lib/mailer.ts`). `escapeHtml` there is server-module — do NOT import into pure files; inline a small escape in `reminders.ts`.
- pg-boss wiring pattern (`src/server/queue-start.ts`): `await boss.createQueue(NAME); await boss.work(NAME, handler); await boss.schedule(NAME, cron, null, { tz: 'Europe/Athens' })`. See the `QUEUE_S1_REF_SYNC` block for the never-throw idiom.
- `ObligationStatusStr` = PENDING|IN_PROGRESS|SUBMITTED|APPROVED|REJECTED|WAIVED (terminal for deadlines = APPROVED/WAIVED; non-terminal-open = PENDING/IN_PROGRESS/SUBMITTED). `stageLabel` in types.
- `User { id, email @unique, name }`. `ApplicationObligation { status, dueDate:DateTime?, assigneeId?, application → trdr{NAME}, program{title}, assignee{name} }`.
- Workspace already fetches `listVisibleObligations(): BoardObligation[]` and renders `pm-workspace.tsx` (views Έργα/Πίνακας/Προθεσμίες). `BoardObligation` carries `{id,name,status,dueDate,assigneeId,assigneeName,customerName,programTitle,programId,applicationId,stage,kind,...}`.

---

## Task 1: Schema — `ReminderLog`

**Files:** `prisma/schema.prisma`; Test `tests/pm-schema-c2c.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-schema-c2c.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Prisma, ReminderStatus } from '@prisma/client'
describe('C2c schema', () => {
  it('ReminderStatus enum', () => { expect(Object.values(ReminderStatus).sort()).toEqual(['FAILED', 'SENT', 'SKIPPED']) })
  it('ReminderLog fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ReminderLog')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['userId', 'email', 'dueSoonCount', 'overdueCount', 'status', 'sentAt']) expect(f.has(k), k).toBe(true)
  })
})
```
Run `npm test -- pm-schema-c2c` → FAIL.

- [ ] **Step 2: Edit schema.** Enum + model + `User.reminders` back-relation:
```prisma
enum ReminderStatus {
  SENT
  FAILED
  SKIPPED
}

model ReminderLog {
  id           String   @id @default(cuid())
  userId       String?
  user         User?    @relation("UserReminders", fields: [userId], references: [id], onDelete: SetNull)
  email        String
  dueSoonCount Int      @default(0)
  overdueCount Int      @default(0)
  status       ReminderStatus @default(SENT)
  error        String?
  sentAt       DateTime @default(now())

  @@index([userId])
  @@index([sentAt])
}
```
In `model User` add: `reminders ReminderLog[] @relation("UserReminders")`.

- [ ] **Step 3: Migrate.** `npx prisma migrate dev --name program_pm_c2c` (auto-confirm the TTY prompt, e.g. `yes |`), `npx prisma generate`. `git diff prisma/schema.prisma` → revert unrelated reformatting. Confirm SQL: `CREATE TYPE "ReminderStatus"`, `CREATE TABLE "ReminderLog"`.
- [ ] **Step 4:** `npm test -- pm-schema-c2c` → PASS; `npx tsc --noEmit` → only known error.
- [ ] **Step 5: Commit** `git add prisma/schema.prisma prisma/migrations tests/pm-schema-c2c.test.ts` → `feat(pm): C2c schema — ReminderLog`.

---

## Task 2: PURE — reminders (select/group/email) + reports (summarize)

**Files:** Create `src/lib/pm/reminders.ts`, `src/lib/pm/reports.ts`; Tests `tests/pm-reminders.test.ts`, `tests/pm-reports.test.ts`.

- [ ] **Step 1: Failing tests.**

`tests/pm-reminders.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { selectReminderObligations, groupRemindersByAssignee, buildReminderEmail, type ReminderObligation } from '@/lib/pm/reminders'

const TODAY = Date.UTC(2026, 2, 10) // 2026-03-10
const o = (p: Partial<ReminderObligation>): ReminderObligation => ({ id: 'x', name: 'Έντυπο', status: 'PENDING', dueDate: null, assigneeId: 'u1', customerName: 'ΑΦΟΙ Α', programTitle: 'Πρ.', ...p })

describe('selectReminderObligations', () => {
  it('keeps overdue + due≤3d non-terminal with assignee', () => {
    const r = selectReminderObligations([
      o({ id: 'over', dueDate: '2026-03-01' }),
      o({ id: 'soon', dueDate: '2026-03-12' }),
      o({ id: 'far', dueDate: '2026-03-20' }),
      o({ id: 'done', status: 'APPROVED', dueDate: '2026-03-01' }),
      o({ id: 'noass', assigneeId: null, dueDate: '2026-03-01' }),
      o({ id: 'nodate', dueDate: null }),
    ], TODAY, 3)
    expect(r.map(x => x.id).sort()).toEqual(['over', 'soon'])
  })
})
describe('groupRemindersByAssignee', () => {
  it('splits overdue vs dueSoon per assignee, excludes empty', () => {
    const sel = selectReminderObligations([
      o({ id: 'a', assigneeId: 'u1', dueDate: '2026-03-01' }),
      o({ id: 'b', assigneeId: 'u1', dueDate: '2026-03-11' }),
      o({ id: 'c', assigneeId: 'u2', dueDate: '2026-03-12' }),
    ], TODAY, 3)
    const g = groupRemindersByAssignee(sel, TODAY)
    const u1 = g.find(x => x.assigneeId === 'u1')!
    expect(u1.overdue.map(x => x.id)).toEqual(['a']); expect(u1.dueSoon.map(x => x.id)).toEqual(['b'])
    expect(g.find(x => x.assigneeId === 'u2')!.overdue).toEqual([])
  })
})
describe('buildReminderEmail', () => {
  it('subject counts + escapes html', () => {
    const g = { assigneeId: 'u1', overdue: [o({ id: 'a', name: '<b>X</b>', dueDate: '2026-03-01' })], dueSoon: [o({ id: 'b', dueDate: '2026-03-11' })] }
    const m = buildReminderEmail('Νίκος', g, '10/03/2026')
    expect(m.subject).toContain('1'); expect(m.html).toContain('&lt;b&gt;X&lt;/b&gt;'); expect(m.html).not.toContain('<b>X</b>')
    expect(m.text.length).toBeGreaterThan(0)
  })
})
```

`tests/pm-reports.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { summarizeObligations, type ReportObligation } from '@/lib/pm/reports'

const TODAY = Date.UTC(2026, 2, 10)
const o = (p: Partial<ReportObligation>): ReportObligation => ({ id: 'x', status: 'PENDING', dueDate: null, assigneeId: 'u1', assigneeName: 'Νίκος', programTitle: 'Πρ.Α', ...p })

describe('summarizeObligations', () => {
  it('counts open/overdue/dueThisWeek and breaks down', () => {
    const s = summarizeObligations([
      o({ id: '1', dueDate: '2026-03-01' }),                    // overdue, open
      o({ id: '2', dueDate: '2026-03-12' }),                    // this week, open
      o({ id: '3', status: 'APPROVED', dueDate: '2026-03-01' }),// not open, excluded from overdue
      o({ id: '4', dueDate: null }),                            // open, no date
      o({ id: '5', dueDate: '2026-03-12', programTitle: 'Πρ.Β', assigneeId: 'u2', assigneeName: 'Άννα' }),
    ], TODAY)
    expect(s.open).toBe(4)         // 1,2,4,5 (3 is APPROVED)
    expect(s.overdue).toBe(1)      // 1
    expect(s.dueThisWeek).toBe(2)  // 2,5
    expect(s.byProgram.find(p => p.programTitle === 'Πρ.Α')!.open).toBe(3)
    expect(s.byAssignee.find(a => a.assigneeId === 'u2')!.dueThisWeek).toBe(1)
  })
})
```
Run both → FAIL.

- [ ] **Step 2: Implement `src/lib/pm/reminders.ts`:**
```ts
import type { ObligationStatusStr } from '@/lib/pm/types'

export type ReminderObligation = { id: string; name: string; status: ObligationStatusStr; dueDate: string | null; assigneeId: string | null; customerName: string; programTitle: string }
export type AssigneeDigest = { assigneeId: string; overdue: ReminderObligation[]; dueSoon: ReminderObligation[] }

const OPEN: ObligationStatusStr[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED']
const DAY = 86_400_000
function dueMs(d: string): number { return Date.parse(d.slice(0, 10) + 'T00:00:00Z') }

export function selectReminderObligations(items: ReminderObligation[], todayMs: number, windowDays = 3): ReminderObligation[] {
  const horizon = todayMs + windowDays * DAY
  return items.filter(it => {
    if (!OPEN.includes(it.status) || !it.assigneeId || !it.dueDate) return false
    const d = dueMs(it.dueDate); if (Number.isNaN(d)) return false
    return d < todayMs || d <= horizon // overdue OR within window (today..+windowDays)
  })
}

export function groupRemindersByAssignee(selected: ReminderObligation[], todayMs: number): AssigneeDigest[] {
  const by = new Map<string, AssigneeDigest>()
  const byDate = (a: ReminderObligation, b: ReminderObligation) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  for (const it of selected) {
    const key = it.assigneeId!; if (!by.has(key)) by.set(key, { assigneeId: key, overdue: [], dueSoon: [] })
    ;(dueMs(it.dueDate!) < todayMs ? by.get(key)!.overdue : by.get(key)!.dueSoon).push(it)
  }
  const lanes = [...by.values()].filter(d => d.overdue.length + d.dueSoon.length > 0)
  for (const d of lanes) { d.overdue.sort(byDate); d.dueSoon.sort(byDate) }
  return lanes
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
function row(o: ReminderObligation): string { return `<li>${esc(o.name)} — ${esc(o.customerName)} · ${esc(o.programTitle)} — προθεσμία ${esc(o.dueDate ?? '')}</li>` }

export function buildReminderEmail(name: string, d: AssigneeDigest, todayLabel: string): { subject: string; html: string; text: string } {
  const subject = `Εκκρεμότητες έργων — ${d.overdue.length} εκπρόθεσμες, ${d.dueSoon.length} λήγουν σύντομα`
  const sec = (title: string, list: ReminderObligation[]) => list.length ? `<h3>${esc(title)}</h3><ul>${list.map(row).join('')}</ul>` : ''
  const html = `<p>Καλημέρα ${esc(name)},</p><p>Οι εκκρεμότητες των έργων σου (${esc(todayLabel)}):</p>` +
    sec('Εκπρόθεσμες', d.overdue) + sec('Λήγουν σε ≤3 ημέρες', d.dueSoon) +
    `<p>— Σύστημα Διαχείρισης Προγραμμάτων</p>`
  const text = [`Καλημέρα ${name},`, ...d.overdue.map(o => `[ΕΚΠΡΟΘΕΣΜΟ] ${o.name} — ${o.customerName} · ${o.programTitle} — ${o.dueDate}`), ...d.dueSoon.map(o => `[ΛΗΓΕΙ] ${o.name} — ${o.customerName} · ${o.programTitle} — ${o.dueDate}`)].join('\n')
  return { subject, html, text }
}
```

- [ ] **Step 3: Implement `src/lib/pm/reports.ts`:**
```ts
import type { ObligationStatusStr } from '@/lib/pm/types'

export type ReportObligation = { id: string; status: ObligationStatusStr; dueDate: string | null; assigneeId: string | null; assigneeName: string | null; programTitle: string }
type Counts = { open: number; overdue: number; dueThisWeek: number }
export type ObligationSummary = Counts & { total: number
  byProgram: ({ programTitle: string } & Counts)[]
  byAssignee: ({ assigneeId: string; assigneeName: string } & Counts)[]
}

const OPEN: ObligationStatusStr[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED']
const DAY = 86_400_000

export function summarizeObligations(items: ReportObligation[], todayMs: number): ObligationSummary {
  const weekEnd = todayMs + 7 * DAY
  const blank = (): Counts => ({ open: 0, overdue: 0, dueThisWeek: 0 })
  const total = { ...blank(), total: 0 } as any
  const progs = new Map<string, Counts>(); const asgs = new Map<string, { assigneeName: string } & Counts>()
  let open = 0, overdue = 0, dueThisWeek = 0
  for (const it of items) {
    const isOpen = OPEN.includes(it.status)
    let od = false, wk = false
    if (isOpen && it.dueDate) {
      const d = Date.parse(it.dueDate.slice(0, 10) + 'T00:00:00Z')
      if (!Number.isNaN(d)) { if (d < todayMs) od = true; else if (d < weekEnd) wk = true }
    }
    if (isOpen) open++; if (od) overdue++; if (wk) dueThisWeek++
    if (!progs.has(it.programTitle)) progs.set(it.programTitle, blank())
    const p = progs.get(it.programTitle)!; if (isOpen) p.open++; if (od) p.overdue++; if (wk) p.dueThisWeek++
    if (it.assigneeId) {
      if (!asgs.has(it.assigneeId)) asgs.set(it.assigneeId, { assigneeName: it.assigneeName ?? '—', ...blank() })
      const a = asgs.get(it.assigneeId)!; if (isOpen) a.open++; if (od) a.overdue++; if (wk) a.dueThisWeek++
    }
  }
  const bySeverity = (a: Counts, b: Counts) => b.overdue - a.overdue || b.open - a.open
  return {
    total: items.length, open, overdue, dueThisWeek,
    byProgram: [...progs.entries()].map(([programTitle, c]) => ({ programTitle, ...c })).sort(bySeverity),
    byAssignee: [...asgs.entries()].map(([assigneeId, c]) => ({ assigneeId, ...c })).sort(bySeverity),
  }
}
```
Run both tests → PASS.

- [ ] **Step 4:** `npx tsc --noEmit` → only known error; confirm both files import only a `type` (no prisma/react/clock). Commit → `feat(pm): C2c pure — reminder digest builders + overview summarizer`.

---

## Task 3: Server `runPmReminders` + pg-boss wiring

**Files:** Create `src/lib/pm/reminders-run.ts`; Modify `src/server/queue-start.ts`; Test `tests/pm-reminders-run.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-reminders-run.test.ts` (hoisted mocks for prisma + mailer + the pure module is real). Cases: (a) `isMailerConfigured→false` → returns `{sent:0}`, no `sendMail`, no `ReminderLog`; (b) one assignee with a due-soon + overdue and an email, no prior SENT log today → `sendMail` called once + one `ReminderLog.create` with SENT + correct counts; (c) assignee with no email → SKIPPED log, no sendMail; (d) idempotency: a prior SENT `ReminderLog` for that user since midnight → skipped (no second send). Model the prisma calls the run uses: `applicationObligation.findMany` (obligations+assignee+application), `reminderLog.findFirst` (idempotency), `reminderLog.create`. Keep assertions on send-count + log status/counts.
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const h = vi.hoisted(() => ({ db: {} as any, sendMail: vi.fn(), isMailerConfigured: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/mailer', () => ({ sendMail: h.sendMail, isMailerConfigured: h.isMailerConfigured }))
import { runPmReminders } from '@/lib/pm/reminders-run'
const NOW = Date.UTC(2026, 2, 10, 9, 0) // 2026-03-10 09:00
beforeEach(() => {
  h.sendMail.mockReset().mockResolvedValue({ ok: true, id: 'm1' })
  h.isMailerConfigured.mockReset().mockResolvedValue(true)
  h.db.applicationObligation = { findMany: vi.fn().mockResolvedValue([
    { id: 'a', name: 'Έντυπο', status: 'PENDING', dueDate: new Date('2026-03-01'), assigneeId: 'u1', assignee: { id: 'u1', email: 'n@x.gr', name: 'Νίκος' }, application: { trdr: { NAME: 'ΑΦΟΙ' }, program: { title: 'Πρ' } } },
    { id: 'b', name: 'Παραδοτέο', status: 'IN_PROGRESS', dueDate: new Date('2026-03-11'), assigneeId: 'u1', assignee: { id: 'u1', email: 'n@x.gr', name: 'Νίκος' }, application: { trdr: { NAME: 'ΑΦΟΙ' }, program: { title: 'Πρ' } } },
  ]) }
  h.db.reminderLog = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) }
})
describe('runPmReminders', () => {
  it('no-op when mailer not configured', async () => {
    h.isMailerConfigured.mockResolvedValue(false)
    const r = await runPmReminders(NOW)
    expect(h.sendMail).not.toHaveBeenCalled(); expect(r.sent).toBe(0)
  })
  it('sends one digest + logs SENT with counts', async () => {
    const r = await runPmReminders(NOW)
    expect(h.sendMail).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
    const logArg = h.db.reminderLog.create.mock.calls[0][0].data
    expect(logArg).toMatchObject({ status: 'SENT', overdueCount: 1, dueSoonCount: 1, email: 'n@x.gr' })
  })
  it('skips when a SENT log exists today (idempotent)', async () => {
    h.db.reminderLog.findFirst.mockResolvedValue({ id: 'prev' })
    const r = await runPmReminders(NOW)
    expect(h.sendMail).not.toHaveBeenCalled(); expect(r.skipped).toBeGreaterThanOrEqual(1)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement `src/lib/pm/reminders-run.ts`:**
```ts
import { prisma } from '@/lib/prisma'
import { isMailerConfigured, sendMail } from '@/lib/mailer'
import { selectReminderObligations, groupRemindersByAssignee, buildReminderEmail, type ReminderObligation } from '@/lib/pm/reminders'
import type { ObligationStatusStr } from '@/lib/pm/types'

function startOfDayUtc(nowMs: number): number { const d = new Date(nowMs); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }

export async function runPmReminders(nowMs: number): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!(await isMailerConfigured())) { console.log('[pm-reminders] mailer not configured — skip'); return { sent: 0, skipped: 0, failed: 0 } }
  const todayMs = startOfDayUtc(nowMs)
  const rows = await prisma.applicationObligation.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS', 'SUBMITTED'] }, dueDate: { not: null }, assigneeId: { not: null } },
    include: { assignee: { select: { id: true, email: true, name: true } }, application: { select: { trdr: { select: { NAME: true } }, program: { select: { title: true } } } } },
  })
  const items: ReminderObligation[] = rows.map(r => ({
    id: r.id, name: r.name, status: r.status as ObligationStatusStr, dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    assigneeId: r.assigneeId, customerName: r.application?.trdr?.NAME ?? '—', programTitle: r.application?.program?.title ?? '—',
  }))
  const emailByAssignee = new Map<string, { email: string | null; name: string }>()
  for (const r of rows) if (r.assigneeId && !emailByAssignee.has(r.assigneeId)) emailByAssignee.set(r.assigneeId, { email: r.assignee?.email ?? null, name: r.assignee?.name ?? '' })

  const digests = groupRemindersByAssignee(selectReminderObligations(items, todayMs, 3), todayMs)
  const todayLabel = new Date(todayMs).toLocaleDateString('el-GR')
  let sent = 0, skipped = 0, failed = 0
  for (const d of digests) {
    const who = emailByAssignee.get(d.assigneeId)
    if (!who?.email) { skipped++; await prisma.reminderLog.create({ data: { userId: d.assigneeId, email: '', dueSoonCount: d.dueSoon.length, overdueCount: d.overdue.length, status: 'SKIPPED', error: 'no email' } }).catch(() => {}); continue }
    const already = await prisma.reminderLog.findFirst({ where: { userId: d.assigneeId, status: 'SENT', sentAt: { gte: new Date(todayMs) } } })
    if (already) { skipped++; continue }
    const mail = buildReminderEmail(who.name, d, todayLabel)
    const res = await sendMail({ to: who.email, subject: mail.subject, html: mail.html, text: mail.text, userId: d.assigneeId, refType: 'pm-reminder' })
    if (res.ok) { sent++; await prisma.reminderLog.create({ data: { userId: d.assigneeId, email: who.email, dueSoonCount: d.dueSoon.length, overdueCount: d.overdue.length, status: 'SENT' } }).catch(() => {}) }
    else { failed++; await prisma.reminderLog.create({ data: { userId: d.assigneeId, email: who.email, dueSoonCount: d.dueSoon.length, overdueCount: d.overdue.length, status: 'FAILED', error: res.error } }).catch(() => {}) }
  }
  console.log(`[pm-reminders] sent=${sent} skipped=${skipped} failed=${failed}`)
  return { sent, skipped, failed }
}
```

- [ ] **Step 3: Wire pg-boss** in `src/server/queue-start.ts`: add `export const QUEUE_PM_REMINDERS = 'pm-reminders'`; inside `startQueue`, after the S1 sync block:
```ts
await boss.createQueue(QUEUE_PM_REMINDERS)
await boss.work(QUEUE_PM_REMINDERS, async () => {
  try { const { runPmReminders } = await import('@/lib/pm/reminders-run'); await runPmReminders(Date.now()) }
  catch (err) { console.error('[pg-boss] pm-reminders dispatcher απέτυχε', err) } // never rethrow — scheduled tick
})
await boss.schedule(QUEUE_PM_REMINDERS, '0 8 * * *', null, { tz: 'Europe/Athens' })
```

- [ ] **Step 4:** `npm test -- pm-reminders-run pm-` → green. `npx tsc --noEmit` → only known error. Commit → `feat(pm): C2c — runPmReminders (mailer-gated, idempotent) + daily 08:00 schedule`.

---

## Task 4: UI — «Επισκόπηση» view

**Files:** Create `src/components/pm/pm-overview.tsx`; Modify `src/components/pm/pm-workspace.tsx`.

- [ ] **Step 1: `pm-overview.tsx`** (`'use client'`): `export function PmOverview({ obligations }: { obligations: BoardObligation[] })`. Map `obligations` → `ReportObligation[]` (`{ id, status, dueDate, assigneeId, assigneeName, programTitle }`), compute `const t=new Date(); const todayMs=Date.UTC(t.getFullYear(),t.getMonth(),t.getDate()); const s=summarizeObligations(mapped, todayMs)`. Render:
  - Three stat cards: «Ανοιχτές» (s.open), «Εκπρόθεσμες» (s.overdue, coral), «Λήγουν αυτή την εβδομάδα» (s.dueThisWeek). Use `glass` cards.
  - «Ανά πρόγραμμα» table: πρόγραμμα · ανοιχτές · εκπρόθεσμες (coral when >0) · εβδομάδα (rows = `s.byProgram`).
  - «Ανά υπεύθυνο» table (render ONLY when `s.byAssignee.length > 1`): υπεύθυνος · ανοιχτές · εκπρόθεσμες · εβδομάδα.
  - Empty state when `obligations.length === 0`. Greek, base-ui, existing classes.
- [ ] **Step 2: Wire `pm-workspace.tsx`:** add a 4th view «Επισκόπηση» to the switcher → `<PmOverview obligations={obligations} />` (place it first or after «Προθεσμίες» — your call; first («Επισκόπηση») reads well as a landing view, but keep «Έργα» default to avoid changing default behaviour). Import `PmOverview`.
- [ ] **Step 3:** `npx tsc --noEmit` (only known error) + `npm run build` + `npm test` → green. Commit → `feat(pm): C2c UI — Επισκόπηση view (stat cards + per-program/assignee)`.

---

## Task 5: Final verification + holistic review

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build` → green.
- [ ] **Step 2: Holistic review** over `git diff master...HEAD`: the pg-boss worker never rethrows (retry-storm safety); `runPmReminders` no-ops when mailer unconfigured; idempotency guard prevents duplicate daily digests; a user only ever receives their OWN obligations (query filters `assigneeId`, digest grouped by assignee — no cross-leak); HTML-escaping in the email (no injection via obligation name/customer); pure purity + clock-free (`reminders.ts`/`reports.ts`); `summarizeObligations`/`selectReminderObligations` boundary correctness (overdue/window/terminal exclusion); overview reuses scoped obligations (no new data path); migration additive; spec coverage; no new permission.
- [ ] **Step 3:** Fix CRITICAL/IMPORTANT; then superpowers:finishing-a-development-branch. **No new permission → no `db:sync-permissions`.**

---

## Self-Review Notes
- **Spec coverage:** §3 schema → T1; §4α/β pure → T2; §4γ/δ server+queue → T3; §5 UI → T4. Covered.
- **Type consistency:** `ReminderObligation`/`ReportObligation` shared pure↔run/UI; `selectReminderObligations`/`groupRemindersByAssignee`/`buildReminderEmail`/`summarizeObligations` signatures identical across tasks. `ReminderStatus` 'SENT'|'FAILED'|'SKIPPED' identical schema/run.
- **Safety:** worker never throws to boss; mailer-gated; idempotent; clock passed in; email HTML-escaped; no new permission/schema-permission.
