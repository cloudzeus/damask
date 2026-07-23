# C2d — Portal · Magic-Link Document Exchange — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Office requests a specific document → emails a magic-link → customer/accountant uploads it WITHOUT login (stored private, linked to the έργο); plus a Trdr-scoped read-only portal dashboard. Public surface — security is the primary constraint.

**Architecture:** Additive Prisma (`DocumentRequest`, `PortalToken`). A token lib mirroring `password-reset.ts` (raw once, sha256 stored, expiry). Internal gated/scoped actions. Token-authenticated PUBLIC functions that **re-derive all ids server-side**. Two self-contained public pages under `/portal/upload/[token]` + `/portal/access/[token]`. Internal «Αιτήματα εγγράφων» tab + obligation button.

**Tech Stack:** Next.js 16.2 (RSC + server actions + public routes), Prisma 7.8, Bunny private storage, Mailgun mailer, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-program-pm-c2d-portal-design.md`.

**CRITICAL routing note:** `src/app/portal/page.tsx` is an EXISTING auth-gated B2B stub — do NOT modify it and do NOT add `src/app/portal/layout.tsx` (it would wrap the stub). C2d pages live at `src/app/portal/upload/[token]/page.tsx` and `src/app/portal/access/[token]/page.tsx`, each rendering its OWN minimal public shell inline (mirror the self-contained shell style of `portal/page.tsx`: `app-canvas` + `glass`).

**Ground rules:** tests in `tests/`; Prisma 7.8 multi-line enums (edit by hand, revert unrelated reformatting); token/public files are server (`crypto`, prisma) — not pure; every INTERNAL action routes through `requireVisibleApplication`; every PUBLIC function validates the token server-side (hash+expiry+status) and re-derives ids from the record (never trust client ids); don't stage `.planning/HANDOFF.json`/`vitest.config.ts`; ambient `RouteContext` tsc error may appear — ignore.

**Verified facts:**
- Token pattern (`src/lib/password-reset.ts`): `crypto.randomBytes(32).toString('hex')` raw, `crypto.createHash('sha256').update(raw).digest('hex')` stored, `expiresAt`, validate hash→lookup→expiry→used. Mirror it.
- Base URL for links: `process.env.AUTH_URL ?? 'http://localhost:3000'` (as in `forgot-password/actions.ts`).
- `bunnyUploadPrivate({ key, body, contentType })`, `bunnyDownload(key)`; `applicationDocKey(applicationId,id,ext)` (`doc-prep.ts`) → `pm/{applicationId}/{id}.{ext}`.
- `ApplicationDocument { applicationId, obligationId?, name, storageKey, mimeType?, size?, uploadedById?, uploadedAt }`.
- `sendMail({to,subject,html,text?,userId?,refType?,refId?})`, `isMailerConfigured()`, `escapeHtml()` from `@/lib/mailer`.
- `Trdr { EMAIL?, NAME, contacts Contact[] }`; `Contact { name, email?, position? }`.
- `requireVisibleApplication(applicationId)` → `{ session, app }` (app has `trdrId`, `programId`). `ProgramApplication` has `trdr{NAME}`, `program{title}`.
- PM tabs live in `application-hub.tsx` (`TabKey` union + `TABS` + conditional render).

---

## Task 1: Schema — `DocumentRequest` + `PortalToken`

**Files:** `prisma/schema.prisma`; Test `tests/pm-schema-c2d.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-schema-c2d.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Prisma, DocumentRequestStatus } from '@prisma/client'
describe('C2d schema', () => {
  it('DocumentRequestStatus enum', () => { expect(Object.values(DocumentRequestStatus).sort()).toEqual(['CANCELLED', 'EXPIRED', 'FULFILLED', 'PENDING', 'UPLOADED']) })
  it('DocumentRequest fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'DocumentRequest')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['applicationId', 'obligationId', 'trdrId', 'title', 'email', 'tokenHash', 'status', 'expiresAt', 'uploadedDocumentId']) expect(f.has(k), k).toBe(true)
  })
  it('PortalToken fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'PortalToken')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['tokenHash', 'trdrId', 'email', 'expiresAt']) expect(f.has(k), k).toBe(true)
  })
})
```
Run `npm test -- pm-schema-c2d` → FAIL.

- [ ] **Step 2: Edit schema.** Add enum + two models (see spec §3 for the full field list — copy it exactly):
```prisma
enum DocumentRequestStatus {
  PENDING
  UPLOADED
  FULFILLED
  CANCELLED
  EXPIRED
}
```
`model DocumentRequest { … }` and `model PortalToken { … }` exactly as in spec §3. Add the back-relations: `ProgramApplication.documentRequests DocumentRequest[]`, `ApplicationObligation.documentRequests DocumentRequest[]`, `Trdr.documentRequests DocumentRequest[]` + `Trdr.portalTokens PortalToken[]`, `ApplicationDocument.requestUpload DocumentRequest? @relation("RequestUpload")`.

- [ ] **Step 3: Migrate.** `npx prisma migrate dev --name program_pm_c2d` (auto-confirm TTY: `yes |`), `npx prisma generate`. `git diff prisma/schema.prisma` → revert unrelated reformatting. Confirm SQL: `CREATE TYPE "DocumentRequestStatus"`, `CREATE TABLE "DocumentRequest"`, `CREATE TABLE "PortalToken"`, FK behaviours (obligationId SetNull, uploadedDocumentId SetNull @unique, applicationId/trdrId Cascade).
- [ ] **Step 4:** `npm test -- pm-schema-c2d` → PASS; `npx tsc --noEmit` → only known error.
- [ ] **Step 5: Commit** → `feat(pm): C2d schema — DocumentRequest + PortalToken`.

---

## Task 2: Token lib `src/lib/pm/portal-token.ts`

**Files:** Create `src/lib/pm/portal-token.ts`; Test `tests/pm-portal-token.test.ts`.

- [ ] **Step 1: Failing test** `tests/pm-portal-token.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { newToken, hashToken, isExpired } from '@/lib/pm/portal-token'
describe('portal-token', () => {
  it('hashToken deterministic 64-hex', () => {
    const h = hashToken('abc'); expect(h).toMatch(/^[0-9a-f]{64}$/); expect(hashToken('abc')).toBe(h)
  })
  it('newToken raw != hash and hash matches hashToken(raw)', () => {
    const { raw, hash } = newToken(); expect(raw).not.toBe(hash); expect(hash).toBe(hashToken(raw)); expect(raw).toMatch(/^[0-9a-f]{64}$/)
  })
  it('isExpired boundary', () => {
    const now = 1_000_000; expect(isExpired(new Date(now - 1), now)).toBe(true); expect(isExpired(new Date(now + 1), now)).toBe(false)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/pm/portal-token.ts`:
```ts
import crypto from 'crypto'
export function hashToken(raw: string): string { return crypto.createHash('sha256').update(raw).digest('hex') }
export function newToken(): { raw: string; hash: string } { const raw = crypto.randomBytes(32).toString('hex'); return { raw, hash: hashToken(raw) } }
export function isExpired(expiresAt: Date, nowMs: number): boolean { return expiresAt.getTime() < nowMs }
```
Run → PASS. Commit → `feat(pm): C2d — magic-link token lib`.

---

## Task 3: Internal actions (create/list/resend/cancel/fulfil + portal access + contact emails)

**Files:** Modify `src/lib/pm/actions.ts`; Test `tests/pm-c2d-actions-guard.test.ts`.

- [ ] **Step 1: Guard test** `tests/pm-c2d-actions-guard.test.ts` (mirror existing; `requirePermission` rejects → all reject):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
import { requirePermission } from '@/lib/rbac-server'
import { createDocumentRequest, listDocumentRequests, resendDocumentRequest, cancelDocumentRequest, fulfillDocumentRequest, createPortalAccess, listTrdrContactEmails } from '@/lib/pm/actions'
beforeEach(() => { vi.mocked(requirePermission).mockReset(); vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden')) })
describe('C2d internal actions enforce pm access', () => {
  it('createDocumentRequest', async () => { await expect(createDocumentRequest('a1', { title: 't', email: 'x@y.gr' })).rejects.toThrow() })
  it('listDocumentRequests', async () => { await expect(listDocumentRequests('a1')).rejects.toThrow() })
  it('resendDocumentRequest', async () => { await expect(resendDocumentRequest('r1')).rejects.toThrow() })
  it('cancelDocumentRequest', async () => { await expect(cancelDocumentRequest('r1')).rejects.toThrow() })
  it('fulfillDocumentRequest', async () => { await expect(fulfillDocumentRequest('r1')).rejects.toThrow() })
  it('createPortalAccess', async () => { await expect(createPortalAccess('a1', { email: 'x@y.gr' })).rejects.toThrow() })
  it('listTrdrContactEmails', async () => { await expect(listTrdrContactEmails('a1')).rejects.toThrow() })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** in `src/lib/pm/actions.ts`. Import `newToken` from `@/lib/pm/portal-token`, `sendMail`/`isMailerConfigured`/`escapeHtml` from `@/lib/mailer`. Add a helper to load+scope a request by id + the actions:
```ts
const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

async function requireVisibleRequestRow(id: string) {
  const req = await prisma.documentRequest.findUniqueOrThrow({ where: { id }, select: { id: true, applicationId: true, trdrId: true, email: true, title: true, description: true, status: true, expiresAt: true } })
  await requireVisibleApplication(req.applicationId)
  return req
}

export type DocumentRequestItem = { id: string; title: string; description: string | null; email: string; status: string; expiresAt: string; uploadedAt: string | null; obligationId: string | null; uploadedDocumentId: string | null }

export async function listTrdrContactEmails(applicationId: string): Promise<{ label: string; email: string }[]> {
  const { app } = await requireVisibleApplication(applicationId)
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: app.trdrId }, select: { EMAIL: true, NAME: true, contacts: { select: { name: true, email: true, position: true } } } })
  const out: { label: string; email: string }[] = []
  if (trdr.EMAIL) out.push({ label: `${trdr.NAME} (πελάτης)`, email: trdr.EMAIL })
  for (const c of trdr.contacts) if (c.email) out.push({ label: `${c.name}${c.position ? ` — ${c.position}` : ''}`, email: c.email })
  return out
}

async function emailRequestLink(to: string, title: string, url: string, customerName: string): Promise<void> {
  if (!(await isMailerConfigured())) return
  const html = `<p>Καλησπέρα,</p><p>Το γραφείο σας ζητά το εξής έγγραφο για το έργο σας:</p><p><b>${escapeHtml(title)}</b></p><p>Ανεβάστε το εδώ (χωρίς σύνδεση): <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>— ${escapeHtml(customerName)}</p>`
  await sendMail({ to, subject: `Αίτημα εγγράφου: ${title}`, html, refType: 'pm-doc-request' }).catch(() => {})
}

export async function createDocumentRequest(applicationId: string, input: { obligationId?: string | null; title: string; description?: string | null; email: string; expiresInDays?: number }): Promise<{ id: string; url: string }> {
  const { session, app } = await requireVisibleApplication(applicationId)
  const title = input.title.trim(); const email = input.email.trim()
  if (!title) throw new Error('Ο τίτλος του αιτήματος είναι υποχρεωτικός.')
  if (!email) throw new Error('Το email παραλήπτη είναι υποχρεωτικό.')
  if (input.obligationId) { const ob = await prisma.applicationObligation.findUnique({ where: { id: input.obligationId }, select: { applicationId: true } }); if (ob?.applicationId !== applicationId) throw new Error('Η υποχρέωση ανήκει σε άλλο έργο.') }
  const { raw, hash } = newToken()
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 14) * 86_400_000)
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: app.trdrId }, select: { NAME: true } })
  const r = await prisma.documentRequest.create({ data: { applicationId, obligationId: input.obligationId ?? null, trdrId: app.trdrId, title, description: input.description?.trim() || null, email, tokenHash: hash, expiresAt, createdById: session.user.id } })
  const url = `${APP_URL}/portal/upload/${raw}`
  await emailRequestLink(email, title, url, trdr.NAME)
  revalidatePath(`/pm/applications/${applicationId}`)
  return { id: r.id, url }
}

export async function listDocumentRequests(applicationId: string): Promise<DocumentRequestItem[]> {
  await requireVisibleApplication(applicationId)
  const rows = await prisma.documentRequest.findMany({ where: { applicationId }, orderBy: { createdAt: 'desc' } })
  return rows.map(r => ({ id: r.id, title: r.title, description: r.description, email: r.email, status: r.status, expiresAt: r.expiresAt.toISOString(), uploadedAt: r.uploadedAt?.toISOString() ?? null, obligationId: r.obligationId, uploadedDocumentId: r.uploadedDocumentId }))
}

export async function resendDocumentRequest(id: string): Promise<{ url: string }> {
  const req = await requireVisibleRequestRow(id)
  if (req.status === 'CANCELLED' || req.status === 'FULFILLED') throw new Error('Το αίτημα έχει κλείσει.')
  const { raw, hash } = newToken()  // rotate token on resend
  const expiresAt = new Date(Date.now() + 14 * 86_400_000)
  await prisma.documentRequest.update({ where: { id }, data: { tokenHash: hash, expiresAt, status: 'PENDING' } })
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: req.trdrId }, select: { NAME: true } })
  const url = `${APP_URL}/portal/upload/${raw}`
  await emailRequestLink(req.email, req.title, url, trdr.NAME)
  revalidatePath(`/pm/applications/${req.applicationId}`)
  return { url }
}

export async function cancelDocumentRequest(id: string): Promise<void> {
  const req = await requireVisibleRequestRow(id)
  await prisma.documentRequest.update({ where: { id }, data: { status: 'CANCELLED' } })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function fulfillDocumentRequest(id: string): Promise<void> {
  const req = await requireVisibleRequestRow(id)
  if (req.status !== 'UPLOADED') throw new Error('Δεν υπάρχει ανεβασμένο αρχείο προς επιβεβαίωση.')
  await prisma.documentRequest.update({ where: { id }, data: { status: 'FULFILLED' } })
  revalidatePath(`/pm/applications/${req.applicationId}`)
}

export async function createPortalAccess(applicationId: string, input: { email: string; expiresInDays?: number }): Promise<{ url: string }> {
  const { session, app } = await requireVisibleApplication(applicationId)
  const email = input.email.trim(); if (!email) throw new Error('Το email είναι υποχρεωτικό.')
  const { raw, hash } = newToken()
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 30) * 86_400_000)
  await prisma.portalToken.create({ data: { tokenHash: hash, trdrId: app.trdrId, email, expiresAt, createdById: session.user.id } })
  const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: app.trdrId }, select: { NAME: true } })
  const url = `${APP_URL}/portal/access/${raw}`
  if (await isMailerConfigured()) { const html = `<p>Καλησπέρα,</p><p>Μπορείτε να δείτε την πρόοδο των έργων σας εδώ (χωρίς σύνδεση): <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>— ${escapeHtml(trdr.NAME)}</p>`; await sendMail({ to: email, subject: 'Πρόσβαση στο Portal έργων σας', html, refType: 'pm-portal-access' }).catch(() => {}) }
  return { url }
}
```

- [ ] **Step 3:** `npm test -- pm-c2d-actions-guard pm-` → green. `npx tsc --noEmit` → only known error. Commit → `feat(pm): C2d internal actions — document requests + portal access`.

---

## Task 4: PUBLIC token-authenticated functions (SECURITY-CRITICAL)

**Files:** Create `src/lib/pm/portal-public.ts`; Test `tests/pm-portal-public.test.ts`.

**These are called from unauthenticated routes. They MUST: validate the token (hash+expiry+status) on every call; re-derive applicationId/obligationId/trdrId FROM the record (never from client input); leak nothing on invalid token; cap upload size; scope the dashboard strictly to the token's trdrId.**

- [ ] **Step 1: Failing test** `tests/pm-portal-public.test.ts` (hoisted prisma + bunny + mailer mocks). Cases:
  - `getUploadRequestByToken`: unknown hash → `{ok:false}`; expired → `{ok:false, reason:'expired'}`; CANCELLED → `{ok:false}`; valid PENDING → `{ok:true, request:{title, customerName, programTitle}}` (NO internal ids like applicationId leaked in the returned shape beyond what the page needs — assert `request` has no `applicationId`).
  - `submitDocumentUpload`: with a valid token, it calls `bunnyUploadPrivate` + `applicationDocument.create` with `applicationId`/`obligationId` taken from the DB record (pass a bogus/no client id — the created doc uses the record's applicationId), and updates the request to UPLOADED; oversized base64 → throws/`{ok:false}` before upload; expired/cancelled token → rejected, no upload.
  - `getPortalDashboardByToken`: unknown/expired → `{ok:false}`; valid → returns items scoped to the token's `trdrId` (the prisma `findMany` where includes `trdrId` from the token — assert the where.trdrId equals the token's trdrId).
Model the prisma calls each fn makes (documentRequest.findUnique by tokenHash w/ include application{trdr,program}; documentRequest.update; applicationDocument.create; portalToken.findUnique; programApplication.findMany where trdrId). Keep the security assertions.

- [ ] **Step 2: Implement** `src/lib/pm/portal-public.ts`:
```ts
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { hashToken, isExpired } from '@/lib/pm/portal-token'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export type UploadRequestView = { ok: true; request: { title: string; description: string | null; customerName: string; programTitle: string; status: string; alreadyUploaded: boolean } } | { ok: false; reason: 'invalid' | 'expired' | 'closed' }

export async function getUploadRequestByToken(raw: string): Promise<UploadRequestView> {
  const rec = await prisma.documentRequest.findUnique({ where: { tokenHash: hashToken(raw) }, include: { application: { select: { trdr: { select: { NAME: true } }, program: { select: { title: true } } } } } })
  if (!rec) return { ok: false, reason: 'invalid' }
  if (rec.status === 'CANCELLED' || rec.status === 'FULFILLED') return { ok: false, reason: 'closed' }
  if (isExpired(rec.expiresAt, Date.now())) return { ok: false, reason: 'expired' }
  return { ok: true, request: { title: rec.title, description: rec.description, customerName: rec.application.trdr?.NAME ?? '', programTitle: rec.application.program?.title ?? '', status: rec.status, alreadyUploaded: rec.status === 'UPLOADED' } }
}

export async function submitDocumentUpload(raw: string, file: { filename: string; base64: string; mimeType: string }): Promise<{ ok: boolean; reason?: string }> {
  const rec = await prisma.documentRequest.findUnique({ where: { tokenHash: hashToken(raw) }, select: { id: true, applicationId: true, obligationId: true, status: true, expiresAt: true, uploadedDocumentId: true } })
  if (!rec) return { ok: false, reason: 'invalid' }
  if (rec.status === 'CANCELLED' || rec.status === 'FULFILLED') return { ok: false, reason: 'closed' }
  if (isExpired(rec.expiresAt, Date.now())) return { ok: false, reason: 'expired' }
  const body = Buffer.from(file.base64, 'base64')
  if (body.length === 0) return { ok: false, reason: 'empty' }
  if (body.length > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_large' }
  const ext = (file.filename.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
  const key = `portal/${rec.applicationId}/${rec.id}.${ext}`   // ids from the RECORD, never client
  await bunnyUploadPrivate({ key, body, contentType: file.mimeType })
  const name = file.filename.slice(0, 200)
  const doc = rec.uploadedDocumentId
    ? await prisma.applicationDocument.update({ where: { id: rec.uploadedDocumentId }, data: { name, storageKey: key, mimeType: file.mimeType, size: body.length } })
    : await prisma.applicationDocument.create({ data: { applicationId: rec.applicationId, obligationId: rec.obligationId, name, storageKey: key, mimeType: file.mimeType, size: body.length, uploadedById: null } })
  await prisma.documentRequest.update({ where: { id: rec.id }, data: { status: 'UPLOADED', uploadedDocumentId: doc.id, uploadedAt: new Date() } })
  return { ok: true }
}

export type PortalDashboard = { ok: true; customerName: string; applications: { programTitle: string; stage: string; openObligations: number; overdueObligations: number; openRequests: { title: string; status: string }[] }[] } | { ok: false }

export async function getPortalDashboardByToken(raw: string): Promise<PortalDashboard> {
  const tok = await prisma.portalToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { trdr: { select: { NAME: true } } } })
  if (!tok || isExpired(tok.expiresAt, Date.now())) return { ok: false }
  await prisma.portalToken.update({ where: { id: tok.id }, data: { lastAccessAt: new Date() } }).catch(() => {})
  const apps = await prisma.programApplication.findMany({
    where: { trdrId: tok.trdrId },   // scoped strictly to the token's trdr
    select: { stage: true, program: { select: { title: true } }, obligations: { select: { status: true, dueDate: true } }, documentRequests: { where: { status: { in: ['PENDING', 'UPLOADED'] } }, select: { title: true, status: true } } },
  })
  const { stageLabel } = await import('@/lib/pm/types')
  const todayMs = Date.now()
  const applications = apps.map(a => {
    const open = a.obligations.filter(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'SUBMITTED')
    const overdue = open.filter(o => o.dueDate && o.dueDate.getTime() < todayMs)
    return { programTitle: a.program?.title ?? '—', stage: stageLabel(a.stage as any), openObligations: open.length, overdueObligations: overdue.length, openRequests: a.documentRequests.map(r => ({ title: r.title, status: r.status })) }
  })
  return { ok: true, customerName: tok.trdr?.NAME ?? '', applications }
}
```
> `stageLabel` import is dynamic to keep this server file lean; a static `import { stageLabel } from '@/lib/pm/types'` is equally fine (types.ts is pure/iso). Implementer's choice.

- [ ] **Step 3:** `npm test -- pm-portal-public pm-` → green. `npx tsc --noEmit` → only known error. Commit → `feat(pm): C2d public — token-authenticated upload + scoped dashboard`.

---

## Task 5: Public routes + portal components

**Files:** Create `src/app/portal/upload/[token]/page.tsx`, `src/app/portal/access/[token]/page.tsx`, `src/components/portal/portal-upload-form.tsx`, `src/components/portal/portal-invalid.tsx` (+ dashboard rendered inline or a small component). Do NOT add `src/app/portal/layout.tsx`. Do NOT modify `src/app/portal/page.tsx`.

- [ ] **Step 1: `portal-invalid.tsx`** — a small self-contained «Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει» page shell (mirror the `app-canvas`/`glass` centered card from `src/app/portal/page.tsx`).
- [ ] **Step 2: `portal-upload-form.tsx`** (`'use client'`): props `{ token, title }`. A file input → read to base64 (mirror `application-documents.tsx` base64 approach) → call a **public server action** `submitDocumentUpload(token, {filename,base64,mimeType})` (import from `@/lib/pm/portal-public` — it's already a server module; wrap in a tiny `'use server'` action file `src/app/portal/upload/[token]/actions.ts` that re-exports a server action calling `submitDocumentUpload`, since client components can't import server-lib functions directly). Show uploading/success/error states in Greek. Allow re-upload.
- [ ] **Step 3: `portal/upload/[token]/page.tsx`** (RSC, self-contained shell): `const v = await getUploadRequestByToken(params.token)`; if `!v.ok` → `<PortalInvalid/>`; else render the request (title/description/customer/program) + `<PortalUploadForm token={params.token} title={v.request.title}/>`. `export const dynamic = 'force-dynamic'` (token-based, no caching).
- [ ] **Step 4: `portal/access/[token]/page.tsx`** (RSC, self-contained shell): `const d = await getPortalDashboardByToken(params.token)`; if `!d.ok` → `<PortalInvalid/>`; else render a read-only dashboard: customer name header, one card per έργο (programTitle, stage badge, open/overdue counts, open requests each linking to `/portal/upload/…` — but the dashboard only has request titles/status, not their upload tokens; SO: list open requests as status only, OR extend `getPortalDashboardByToken` to include each open request's own raw upload token — SECURITY: do NOT expose other tokens; instead show request status and instruct the customer to use the email link. Keep v1: show open-request titles + status, no inline upload link). `force-dynamic`.
- [ ] **Step 5:** `npx tsc --noEmit` (only known error) + `npm run build` (the public routes compile) + `npm test` → green. Manually reason about: an invalid token renders the invalid page (no crash, no leak). Commit → `feat(pm): C2d public routes — upload page + portal dashboard`.

> **Note for the reviewer/implementer:** the dashboard must NOT print another request's magic-link token. Open requests are shown as title + status only; the customer uploads via the per-request email link. (A future enhancement could mint per-request child tokens, out of scope.)

---

## Task 6: Internal UI — «Αιτήματα εγγράφων» tab + obligation button + portal-access action

**Files:** Create `src/components/pm/document-requests-tab.tsx` (+ a shared `new-document-request-dialog.tsx`); Modify `src/components/pm/application-hub.tsx` + `src/components/pm/obligations-tab.tsx`.

- [ ] **Step 1: `new-document-request-dialog.tsx`** (`'use client'`): props `{ applicationId, obligationId?, defaultTitle?, onCreated }`. base-ui Dialog: title (default from `defaultTitle`), description, email (a base-ui Select/combobox prefilled from `listTrdrContactEmails(applicationId)` but also allowing a free-typed email — simplest: a Select of suggestions + a free text input, or a datalist). Submit → `createDocumentRequest(applicationId, {obligationId, title, description, email})` → toast + show the returned `url` with a «Αντιγραφή συνδέσμου» button → `onCreated()`.
- [ ] **Step 2: `document-requests-tab.tsx`** (`'use client'`): self-fetch `listDocumentRequests(applicationId)`. Table: title, recipient email, status badge (PENDING muted / UPLOADED info / FULFILLED ok / CANCELLED coral / EXPIRED muted), expiry, uploaded-file indicator. «Νέο αίτημα» → the dialog. Per-row actions: «Επαναποστολή» (`resendDocumentRequest` → show new link), «Ακύρωση» (`cancelDocumentRequest`), «Επιβεβαίωση» (`fulfillDocumentRequest`, enabled only when UPLOADED). Reload after each.
- [ ] **Step 3: Wire `application-hub.tsx`:** add `'documents'` (or `'docrequests'`) to `TabKey`; `{ key, label: 'Αιτήματα εγγράφων' }` to `TABS` (after «Πιστοποίηση» or near documents); render `<DocumentRequestsTab applicationId={app.id}/>`. Also add a «Πρόσβαση Portal» button in the hub header → a small dialog (email prefill) → `createPortalAccess(app.id, {email})` → show/copy link.
- [ ] **Step 4: obligations-tab button:** add a «Ζήτησε από πελάτη» icon-button per obligation row → opens `<NewDocumentRequestDialog applicationId obligationId={o.id} defaultTitle={o.name} onCreated={reload}/>`.
- [ ] **Step 5:** `npx tsc --noEmit` (only known error) + `npm run build` + `npm test` → green. Commit → `feat(pm): C2d internal UI — Αιτήματα εγγράφων tab + obligation request + portal access`.

---

## Task 7: Final verification + holistic review

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build` → green.
- [ ] **Step 2: Holistic review** over `git diff master...HEAD`, SECURITY-FIRST (public surface): every public fn validates token (hash+expiry+status) and **re-derives ids from the record** (upload cannot be aimed at another application/obligation via client input); invalid token leaks nothing + no enumeration; dashboard strictly scoped to the token's trdrId (no other customer's data; no assessment/expense internals); upload size-capped + private storage + ext sanitised; the dashboard never prints another token; internal actions all gated via `requireVisibleApplication` (incl. obligation-belongs-to-app check); token stored as hash only (raw never persisted/logged); mailer-gated email sends non-fatal; migration additive; no new permission; spec coverage; no scope creep. Also check the B2B `portal/page.tsx` stub is untouched and no `portal/layout.tsx` was added.
- [ ] **Step 3:** Fix CRITICAL/IMPORTANT; then superpowers:finishing-a-development-branch. **No new permission → no `db:sync-permissions`.**

---

## Self-Review Notes
- **Spec coverage:** §2 security → enforced in T4/T5; §3 model → T1; §4α token → T2; §4β internal → T3; §4γ public → T4; §4δ routes → T5; §5 internal UI → T6. Covered.
- **Type consistency:** `hashToken`/`newToken`/`isExpired` shared T2↔T3↔T4; `DocumentRequestStatus` values identical schema/actions/public; the upload key `portal/{applicationId}/{requestId}.{ext}` uses record-derived ids in T4.
- **Security invariants (mirroring prior CRITICAL lessons):** public actions re-derive ids server-side (never trust client — like the C2f eligibility + C2a.2 certification lessons); token = hash-only; strict trdr scoping; no token leak on the dashboard.
- **No new permission; B2B stub untouched; no shared portal layout.**
