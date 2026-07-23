# C2c — Reminders (daily digest email) · Reports/Overview — Design Spec

**Date:** 2026-07-23
**Sub-project:** C2c (part of C2 — ΕΣΠΑ Project Management). Builds on the unified `ApplicationObligation` (C2a.1/C2e) + the deadline model, the existing pg-boss queue, and the Mailgun mailer.
**Status:** Approved design (brainstorming 2026-07-23) → ready for plan.

---

## 0. Locked decisions (brainstorming)
1. **Recipients** = a daily **digest per assignee** (one email listing that user's own due-soon + overdue obligations).
2. **Window/cadence** = obligations that are **overdue OR due within ≤3 days**, sent **daily 08:00 Europe/Athens** — hardcoded sensible default (no settings knob in v1).
3. **Reports** = a new **«Επισκόπηση»** view in the `/pm` workspace (counts + per-program breakdown + per-assignee for managers), client-side aggregation over the already-fetched obligations.
4. **Audit** = a new **`ReminderLog`** model (who / when / how many due-soon+overdue / ok|failed) — proof of diligence in an ΕΣΠΑ context.

## 1. Goal
Turn the deadline radar into action: every morning each user gets a digest of their obligations that are overdue or due within 3 days, so nothing slips silently. Managers get an at-a-glance «Επισκόπηση» of the open load across their έργα. Reuses existing pg-boss + mailer infra; the only new persistence is an audit log.

## 2. Infrastructure (verified — reuse)
- **pg-boss** (`src/lib/queue.ts` `startBoss`, `src/server/queue-start.ts` `startQueue`): add a queue via `boss.createQueue(name)` + `boss.work(name, handler)` + `boss.schedule(name, cron, null, { tz: 'Europe/Athens' })`. **The worker MUST never throw to pg-boss** (swallow + `console.error`, like the S1 sync dispatcher) — an infra failure must not cause a retry storm on a scheduled tick.
- **mailer** (`src/lib/mailer.ts`): `sendMail({ to, subject, html, text?, userId?, refType?, refId? }) → { ok } | { ok:false, error }`; `isMailerConfigured()`; `escapeHtml(value)`. If Mailgun is not configured, the job no-ops (logs a skip) — never errors.
- `User { id, email @unique, name }`. `ApplicationObligation { status, dueDate, assigneeId, application → trdr{NAME}, program{title} }`.

## 3. Data model (additive)
```prisma
enum ReminderStatus { SENT FAILED SKIPPED }

model ReminderLog {
  id            String   @id @default(cuid())
  userId        String?                        // assignee (SetNull if user deleted)
  user          User?    @relation("UserReminders", fields: [userId], references: [id], onDelete: SetNull)
  email         String                         // snapshot of the address the digest went to
  dueSoonCount  Int      @default(0)
  overdueCount  Int      @default(0)
  status        ReminderStatus @default(SENT)
  error         String?
  sentAt        DateTime @default(now())

  @@index([userId])
  @@index([sentAt])
}
```
`User` gets `reminders ReminderLog[] @relation("UserReminders")`. Migration additive. No new permission.

## 4. Logic

### 4α. PURE `src/lib/pm/reminders.ts` (no prisma/react/clock — `todayMs` passed in)
```ts
export type ReminderObligation = { id: string; name: string; status: ObligationStatusStr; dueDate: string | null; assigneeId: string | null; customerName: string; programTitle: string }
export type AssigneeDigest = { assigneeId: string; overdue: ReminderObligation[]; dueSoon: ReminderObligation[] }
```
- `selectReminderObligations(items, todayMs, windowDays = 3)` → keeps only non-terminal (`status ∈ {PENDING,IN_PROGRESS,SUBMITTED}`) with a `dueDate` that is `< today` (overdue) or `today ≤ due ≤ today+windowDays` (due-soon), and `assigneeId != null`.
- `groupRemindersByAssignee(selected, todayMs)` → `AssigneeDigest[]` (per assignee, split overdue vs dueSoon, each sorted by dueDate). Empty digests excluded.
- `buildReminderEmail(name, digest, todayLabel)` → `{ subject, html, text }` — pure template (own inline HTML-escape, since `mailer.escapeHtml` lives in a server module). Subject e.g. «Εκκρεμότητες έργων — {overdueCount} εκπρόθεσμες, {dueSoonCount} λήγουν σύντομα». HTML: two sections (Εκπρόθεσμες / Λήγουν σε ≤3 ημέρες), each a list «{name} — {customer} · {program} — προθεσμία {date}».

### 4β. PURE `src/lib/pm/reports.ts` (overview aggregation — `todayMs` passed in)
- `summarizeObligations(items, todayMs)` → `{ total, open, overdue, dueThisWeek, byProgram: {programTitle, open, overdue, dueThisWeek}[], byAssignee: {assigneeId, assigneeName, open, overdue, dueThisWeek}[] }`. «open» = non-terminal; APPROVED/WAIVED excluded from overdue/dueThisWeek (reuse the deadline semantics from `board.ts`). Sorted: byProgram/byAssignee by overdue desc then open desc.

### 4γ. Server `src/lib/pm/reminders-run.ts` — `runPmReminders(nowMs): Promise<{ sent: number; skipped: number; failed: number }>`
- `if (!(await isMailerConfigured())) → log + return {skipped:0,...}` (no-op).
- Query non-terminal obligations with `dueDate != null` and `assigneeId != null`, include `application{trdr{NAME},program{title}}` + `assignee{id,email,name}`. Map → `ReminderObligation[]` (+ carry assignee email/name in a parallel map).
- `selectReminderObligations` + `groupRemindersByAssignee` (todayMs = start-of-day from `nowMs`).
- For each digest: resolve email/name; **idempotency guard** — skip if a `ReminderLog{status:SENT}` already exists for this `userId` since today-midnight (safe re-runs). Else `buildReminderEmail` → `sendMail({to,subject,html,text, userId, refType:'pm-reminder'})` → insert `ReminderLog` (SENT or FAILED with error). Missing email → `SKIPPED`.
- Never throws; returns counts.

### 4δ. Queue wiring (`src/server/queue-start.ts`)
`export const QUEUE_PM_REMINDERS = 'pm-reminders'`. `createQueue` + `work` (calls `runPmReminders(Date.now())`, wrapped in try/catch → console.error, never rethrow) + `boss.schedule(QUEUE_PM_REMINDERS, '0 8 * * *', null, { tz: 'Europe/Athens' })`.

## 5. UI — «Επισκόπηση» view (`/pm` workspace)
Add a 4th view to `pm-workspace.tsx` (after Έργα/Πίνακας/Προθεσμίες): **«Επισκόπηση»** → `<PmOverview obligations={obligations} />` (new `src/components/pm/pm-overview.tsx`, client). Computes `summarizeObligations(obligations, todayMs)` (client passes today). Renders:
- **Stat cards**: Ανοιχτές · Εκπρόθεσμες (coral) · Λήγουν αυτή την εβδομάδα.
- **Ανά πρόγραμμα** table: πρόγραμμα, ανοιχτές, εκπρόθεσμες (coral), εβδομάδα.
- **Ανά υπεύθυνο** table (rendered only when >1 distinct assignee — i.e. useful for pm.manage): υπεύθυνος, ανοιχτές, εκπρόθεσμες, εβδομάδα.
Greek, base-ui, existing classes. No new fetch (reuses the workspace obligations).

## 6. File structure
- `prisma/schema.prisma` — `ReminderStatus`, `ReminderLog`, `User.reminders`. Migration `program_pm_c2c`.
- `src/lib/pm/reminders.ts` (new, PURE) — select/group/buildEmail.
- `src/lib/pm/reports.ts` (new, PURE) — summarizeObligations.
- `src/lib/pm/reminders-run.ts` (new, server) — `runPmReminders`.
- `src/server/queue-start.ts` — QUEUE_PM_REMINDERS wiring.
- `src/components/pm/pm-overview.tsx` (new) + `pm-workspace.tsx` (add view).
- Tests: `tests/pm-reminders.test.ts` (pure select/group/email), `tests/pm-reports.test.ts` (summarize), `tests/pm-reminders-run.test.ts` (mailer-not-configured no-op; groups→sends→logs; idempotency skip; missing-email SKIPPED). Schema test `tests/pm-schema-c2c.test.ts`.

## 7. Security & safety
- No new permission. The reminder job is server-scheduled (not user-invokable) and only emails a user their OWN assigned obligations. The overview reuses the already-scoped `listVisibleObligations`. Mailer gated by `isMailerConfigured()`. Worker never throws to pg-boss. Idempotency guard prevents duplicate digests on re-run.

## 8. Out of scope
- Configurable thresholds/opt-out (v1 hardcoded). Manager roll-up email (assignee-only). In-app notification center. SMS/push. Per-obligation "snooze". Customer-facing reminders (C2d portal).

## 9. Definition of Done
`ReminderLog` model + migration; pure select/group/email + summarize (tested); `runPmReminders` (mailer-gated, idempotent, never-throws); daily 08:00 Athens pg-boss schedule; «Επισκόπηση» view with stat cards + per-program (+ per-assignee) tables. Pure/server tests green; tsc clean; build OK; Greek. No new permission → no `db:sync-permissions`.
