# C2d — Customer/Accountant Portal · Magic-Link Document Exchange — Design Spec

**Date:** 2026-07-23
**Sub-project:** C2d (final phase of C2 — ΕΣΠΑ Project Management). Builds on C2a.1 (`ProgramApplication`, `ApplicationObligation`, `ApplicationDocument`), C2f (`PaymentRequest`), the token pattern of `src/lib/password-reset.ts`, Bunny private storage, and the Mailgun mailer.
**Status:** Approved design (brainstorming 2026-07-23) → ready for plan.

---

## 0. Locked decisions (brainstorming)
1. **One unified C2d** — magic-link single-document upload **and** a customer/accountant portal dashboard, together.
2. **Token lifecycle** — SHA-256 hash stored (raw returned once, mirror `password-reset.ts`), valid until **fulfilled OR expiry** (default **14 days**); re-upload allowed while the request is still open.
3. **Recipient** — a **free email** the office types, with a prefill dropdown from `Trdr.EMAIL` + the customer's `Contact`s (e.g. the accountant).
4. **Internal management** — **both**: a «Ζήτησε από πελάτη» button on an obligation/document, **and** a dedicated «Αιτήματα εγγράφων» tab on the έργο.

## 1. Goal
Close the loop with the outside world: the office requests a specific document (or invoice) from a customer/accountant, who uploads it via an emailed magic-link **without logging in**; and a customer/accountant can open a scoped, read-only **portal** to see their έργο's progress and fulfil any open document requests. Everything the recipient touches is strictly scoped to their own Trdr — a public surface, so security is the primary design constraint.

## 2. Security model (the core constraint — public routes)
- **Tokens**: `crypto.randomBytes(32).toString('hex')` raw (returned once, emailed); DB stores only `sha256(raw)` as `tokenHash @unique`. Validation on **every** request (page load AND every action): hash → lookup → not expired → status open. Mirror `verifyResetToken`/`consumeResetToken`.
- **Server-side re-derivation**: public actions NEVER trust client-supplied ids. The upload action re-loads the `DocumentRequest` from the token and derives `applicationId`/`obligationId`/`trdrId` from it. The portal dashboard queries strictly by the token's `trdrId`.
- **No enumeration / no leak**: invalid/expired/used token → a generic «Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει» page (no hint whether it existed). Public views expose ONLY the requested item / the token's own Trdr — never other customers, never internal notes/assessment/expenses beyond what the portal explicitly shows.
- **Upload hardening**: server-side size cap (e.g. ≤ 25 MB), extension sanitised, stored to **Bunny private** (never public pull-zone). The recipient can never read another request's file (downloads on the public side are limited to the file they just uploaded, streamed through a token-scoped route).
- **Scope of mutation from public side**: ONLY (a) uploading a file for an open `DocumentRequest`, (b) implicitly touching that request's status. No obligation/expense/stage mutation. The portal dashboard is **read-only** except for surfacing its Trdr's open requests (which route back through (a)).
- **Base URL**: `process.env.AUTH_URL ?? 'http://localhost:3000'` (same as password-reset / user-invite emails).

## 3. Data model (additive)
```prisma
enum DocumentRequestStatus { PENDING UPLOADED FULFILLED CANCELLED EXPIRED }

model DocumentRequest {
  id                 String   @id @default(cuid())
  applicationId      String
  application        ProgramApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  obligationId       String?
  obligation         ApplicationObligation? @relation(fields: [obligationId], references: [id], onDelete: SetNull)
  trdrId             String
  trdr               Trdr @relation(fields: [trdrId], references: [id], onDelete: Cascade)
  title              String                    // what is requested
  description        String?
  email              String                    // recipient
  tokenHash          String   @unique          // sha256(raw magic-link token)
  status             DocumentRequestStatus @default(PENDING)
  expiresAt          DateTime
  uploadedDocumentId String?  @unique
  uploadedDocument   ApplicationDocument? @relation("RequestUpload", fields: [uploadedDocumentId], references: [id], onDelete: SetNull)
  uploadedAt         DateTime?
  createdById        String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([applicationId]) @@index([trdrId]) @@index([status])
}

model PortalToken {                            // Trdr-scoped read dashboard access
  id            String   @id @default(cuid())
  tokenHash     String   @unique
  trdrId        String
  trdr          Trdr @relation(fields: [trdrId], references: [id], onDelete: Cascade)
  email         String
  expiresAt     DateTime
  lastAccessAt  DateTime?
  createdById   String?
  createdAt     DateTime @default(now())

  @@index([trdrId])
}
```
`ProgramApplication` gets `documentRequests DocumentRequest[]`; `ApplicationObligation` gets `documentRequests DocumentRequest[]`; `Trdr` gets `documentRequests` + `portalTokens`; `ApplicationDocument` gets the inverse `requestUpload DocumentRequest? @relation("RequestUpload")`. Migration additive. No new permission.

## 4. Logic

### 4α. Token lib `src/lib/pm/portal-token.ts` (server)
- `newToken(): { raw: string; hash: string }` (`randomBytes(32).hex` + sha256). `hashToken(raw): string`. `isExpired(expiresAt, nowMs)`. (Deterministic hash → testable; `newToken` random → test that raw≠hash and hash is 64-hex.)

### 4β. Internal actions (`src/lib/pm/actions.ts`, gated + scoped)
- `listTrdrContactEmails(applicationId)` → `{ label, email }[]` prefill options (Trdr.EMAIL + contacts with email) — via `requireVisibleApplication`.
- `createDocumentRequest(applicationId, { obligationId?, title, description?, email, expiresInDays=14 })` → `requireVisibleApplication`; validate `obligationId` belongs to the app if given; make token; create `DocumentRequest` (trdrId from the app); email the recipient a link `${AUTH_URL}/portal/upload/${raw}` (guarded by `isMailerConfigured` — if not configured, still create the request and return the raw link so the office can copy it). Returns `{ id, url }`.
- `listDocumentRequests(applicationId)` → for the tab + obligation display (status, email, expiresAt, uploaded doc). Scoped.
- `resendDocumentRequest(id)` (re-email; if expired, rotate token + new expiry), `cancelDocumentRequest(id)` (→ CANCELLED), `fulfillDocumentRequest(id)` (office confirms the file is acceptable → FULFILLED). All load the request → parent application → `requireVisibleApplication`.
- `createPortalAccess(applicationId, { email, expiresInDays=30 })` → `requireVisibleApplication`; make token; `PortalToken` (trdrId from the app); email `${AUTH_URL}/portal/${raw}`; returns `{ url }`. (Issued from an έργο so visibility is checked via the application; the token is Trdr-scoped so the dashboard shows all that customer's έργα.)

### 4γ. Public (no-auth) surface — `src/lib/pm/portal-public.ts` (server, token-authenticated)
- `getUploadRequestByToken(raw)` → validate → `{ ok, request?: { title, description, customerName, programTitle, status, alreadyUploaded } }` or `{ ok:false, reason }`. No internal ids leaked beyond what the page renders.
- `submitDocumentUpload(raw, { filename, base64, mimeType })` → re-validate token (must be PENDING/UPLOADED, not expired); size cap; `bunnyUploadPrivate` to a token-scoped key `portal/{applicationId}/{requestId}.{ext}`; create/replace `ApplicationDocument` (application+obligation from the request, `name` from filename, `uploadedById: null`); set request `uploadedDocumentId`/`uploadedAt`/`status=UPLOADED`. Idempotent replace while open. Returns `{ ok }`.
- `getPortalDashboardByToken(raw)` → validate `PortalToken`; stamp `lastAccessAt`; return that Trdr's applications as **read-only progress**: per έργο → programTitle, stage (label), obligation counts (open/overdue/done), δόσεις status summary, and its **open DocumentRequests** `{ title, status, uploadToken? }`. Scoped strictly to `trdrId`. NO assessment scores, NO internal notes, NO expense figures beyond δόση totals (keep it customer-appropriate).
- A token-scoped download for a just-uploaded file is **not** exposed publicly in v1 (the office reviews internally); the portal shows status only.

### 4δ. Public routes (`src/app/portal/…` — outside the `(app)` auth group)
- `src/app/portal/upload/[token]/page.tsx` (RSC) → `getUploadRequestByToken` → renders the request (title/description/customer/program) + a client `<PortalUploadForm token>` (file input → base64 → `submitDocumentUpload`), or the generic invalid/expired page. Success state «Το αρχείο παραλήφθηκε».
- `src/app/portal/[token]/page.tsx` (RSC) → `getPortalDashboardByToken` → renders the read-only progress dashboard + open requests (each links to its `/portal/upload/{uploadToken}`), or invalid/expired page.
- These live under the existing `src/app/portal/` (already present) with a minimal public layout (company name, no app chrome/nav).

## 5. Internal UI
- **«Αιτήματα εγγράφων» tab** on `application-hub.tsx` (`document-requests-tab.tsx`): list of the έργο's `DocumentRequest`s (title, recipient email, status badge, expiry, uploaded-file link when present) + «Νέο αίτημα» dialog (title/description, email with prefill dropdown from `listTrdrContactEmails`) + per-row resend/cancel/fulfil. After create, show/copy the link.
- **«Ζήτησε από πελάτη» button** on an obligation row (in `obligations-tab.tsx`): opens the same dialog pre-filled with the obligation as the request title + `obligationId` set, so the uploaded file lands on that obligation.
- **«Πρόσβαση Portal» action** (issue a dashboard link): a button on the application hub header (or the Trdr «Έργα» tab) → dialog (email + prefill) → `createPortalAccess` → show/copy link.
- Greek, base-ui, existing classes.

## 6. File structure
- `prisma/schema.prisma` — `DocumentRequestStatus`, `DocumentRequest`, `PortalToken`, relations. Migration `program_pm_c2d`.
- `src/lib/pm/portal-token.ts` (server) — token gen/hash/expiry.
- `src/lib/pm/actions.ts` — internal actions (create/list/resend/cancel/fulfil request, createPortalAccess, listTrdrContactEmails).
- `src/lib/pm/portal-public.ts` (server) — token-authenticated public functions.
- `src/app/portal/upload/[token]/page.tsx` + `src/app/portal/[token]/page.tsx` + `src/app/portal/layout.tsx` (minimal public shell) + `src/components/portal/*` (upload form, dashboard view, invalid page).
- `src/components/pm/document-requests-tab.tsx` + dialog; obligations-tab button; hub wiring.
- Tests: `tests/pm-portal-token.test.ts` (hash/expiry), `tests/pm-c2d-actions-guard.test.ts` (internal actions gated), `tests/pm-portal-public.test.ts` (token validation: expired/used/wrong → reject; upload re-derives ids server-side; dashboard scoped to trdr), `tests/pm-schema-c2d.test.ts`.

## 7. Testing (TDD)
- **Token:** `hashToken` deterministic + 64-hex; `newToken` raw≠hash; `isExpired` boundary.
- **Public (security-critical):** `getUploadRequestByToken`/`submitDocumentUpload`/`getPortalDashboardByToken` reject expired/cancelled/unknown tokens; upload ignores any client-supplied applicationId/obligationId (derives from token); dashboard returns ONLY the token's trdr data; size-cap rejects oversized base64.
- **Internal:** action guards (`requireVisibleApplication`); `createDocumentRequest` validates obligation belongs to app; `expiresInDays` → correct expiry.
- Green unit suite; tsc clean; build OK. e2e (public routes) = manual/known-footgun, not a merge gate.

## 8. Out of scope
- Persistent customer accounts / self-registration. In-portal messaging/comments. Public download of uploaded files (office reviews internally). Rate-limiting/captcha (note as a hardening follow-up). Per-accountant granular permissions (accountant = same read view). Real-time updates.

## 9. Definition of Done
Migration + models; token lib; internal create/list/resend/cancel/fulfil + portal-access issuance (scoped/gated); public token-authenticated upload (server re-derives ids, Bunny private, links ApplicationDocument, re-uploadable while open) + read-only Trdr-scoped dashboard; invalid/expired handling with no leak; «Αιτήματα εγγράφων» tab + obligation button + portal-access action. Security tests (token validation, id re-derivation, trdr scoping, size cap) green; tsc clean; build OK; Greek. No new permission → no `db:sync-permissions`.
