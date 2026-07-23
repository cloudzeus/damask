# W1 — Μητρώα (Περιφέρειες + ΚΑΔ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Transfer the Region/KAD registries (models, tree/decoder/match/resolve libs, viewer pages) from the reference repo into DAMASK, and copy the live data from the espa source DB.

**Spec:** `docs/superpowers/specs/2026-07-23-registries-w1-design.md`. **Reference repo (READ the actual files):** `/private/tmp/claude-501/-Volumes-EXTERNALSSD-DGSMART-damask/5f092e05-2323-408e-849a-70d57b13a320/scratchpad/pb-ref` — `prisma/schema.prisma` (Region ~554, KadCode ~620, KadLicenseRequirement ~671, KadImportLog ~689), `lib/regions/{tree,decoder,match}.ts` (+`__tests__`), `lib/kad/{decoder,resolve}.ts`, `app/admin/regions/*`, `app/admin/kad-codes/*`, `app/api/{regions,kad}/*`.

**Ground rules (DAMASK):** tests in `tests/`; Prisma 7.8 multi-line enums, hand-edit (no `prisma format`), revert unrelated reformatting, `yes | npx prisma migrate dev`; pure libs no prisma/react/clock; server actions gated via `requirePermission`; base-ui/Steel&Frost/Greek; don't stage `.planning/HANDOFF.json`/`vitest.config.ts`; ambient RouteContext tsc error — ignore. Source DB URL comes ONLY from env `REGISTRY_SOURCE_DATABASE_URL` — never hardcoded/committed.

## Task 1: Schema (4 models) + migration
Port the 4 models verbatim from ref schema (adapt: keep names/fields/indexes; enum `KadLicenseType { OPERATING_LICENSE }` multi-line). NO relations to existing DAMASK models. TDD: `tests/registries-schema.test.ts` (dmmf field assertions, runtime enum). Migration `registries_w1`. Commit.

## Task 2: Copy script + run
`scripts/copy-registries.ts` + package.json `"copy:registries": "tsx scripts/copy-registries.ts"` (check how other scripts run — mirror `prisma/sync-permissions.ts` invocation style). Uses `pg` (already a dep via adapter) with TWO connections: source = `process.env.REGISTRY_SOURCE_DATABASE_URL` (throw with clear Greek message if unset), target = `DATABASE_URL`. Copies: Region ORDER BY level,code; KadCode ORDER BY level NULLS FIRST,code; KadLicenseRequirement; KadImportLog — batched upserts (ON CONFLICT DO UPDATE) 500/batch, parents-first so self-FKs resolve. Prints per-table source/target counts at end; exits non-zero on mismatch. TDD-light: `tests/registries-copy.test.ts` for any pure helper (batching/ordering fn) — keep the DB I/O thin. THEN RUN IT against dev (`REGISTRY_SOURCE_DATABASE_URL='<from controller>' npm run copy:registries`) — the controller will supply the URL at dispatch time via the prompt env line; verify counts 415/10751/5990/2. Commit (script only — no data files).

## Task 3: Libs (port from ref)
`src/lib/registries/regions-tree.ts` (PURE: RegionBreadcrumb, buildBreadcrumb, deriveHierarchy-shape helpers), `regions-match-pure.ts` (PURE: normalizeGreek, coreName, nameMatchCandidate, haversineKm, nearestNode, constants), `regions.ts` (server: decodeRegion, regionChildren query, matchRegion — hybrid ΓΕΜΗ-ids→name→geo; for geo geocoding CHECK if DAMASK has an existing geocode lib (grep maps/geocode) — if none, accept optional `{latitude,longitude}` input only and skip address-geocoding (leave a TODO for W2)), `kad-pure.ts` (PURE: stripKadDots, formatKadDots, normalizeKad), `kad.ts` (server: decodeKADCode, kadChildren, kadSearch, resolveKadForActivity, ensurePrimaryActivity port). Port the ref `__tests__` for pure parts into `tests/registries-*.test.ts` + add haversine/nearestNode/format cases. TDD. Commit.

## Task 4: Server actions + guards
`src/lib/registries/actions.ts` ('use server'): `regionChildrenAction(parentCode?)`, `regionDecodeAction(input)`, `regionMatchAction(input)` gated `requirePermission('regions.view')`; `kadChildrenAction`, `kadDecodeAction`, `kadSearchAction(q, limit≤100)` gated `kad.view`. Thin wrappers over Task-3 servers. Guard test `tests/registries-actions-guard.test.ts` (mirror pm guard tests). Commit.

## Task 5: Pages + objects/permissions
- `src/lib/objects.ts` + `src/lib/permissions.ts`: new group label `registries: 'Μητρώα'`; items «Περιφέρειες» (`regions`, route `/regions`, menuPermission `regions.view`, permissions [`regions.view`]) and «ΚΑΔ» (`kad`, `/kad`, `kad.view`, [`kad.view`]) — READ how existing items (e.g. «Έργα» pm item) are declared and mirror exactly. ROLE_DEFAULTS: MANAGER/EMPLOYEE += both view perms.
- `src/app/(app)/regions/page.tsx` (RSC gate `regions.view`) → client `src/components/registries/regions-view.tsx`: header + σύνολο, decoder search box (code/όνομα → breadcrumb + children), lazy tree (level-3 roots → expand via action, show level badge Περιφέρεια/Π.Ε./Δήμος + counts + lat/lng μικρό). Mirror ref UX, DAMASK design.
- `src/app/(app)/kad/page.tsx` (gate `kad.view`) → `src/components/registries/kad-view.tsx`: σύνολο + last KadImportLog, decoder, search table (debounced kadSearchAction), lazy tree από sectors, badge «Άδεια λειτουργίας» για codes με requirement (include in children/search payloads).
- tsc/build/full tests. Commit.

## Task 6: Final verification + review + merge prep
Full suite + tsc + build. Holistic review (spec fidelity to ref ports — esp. matchRegion priority order + resolveKadForActivity progressive stripping; copy-script idempotency/no-credential-leak; guards; no unrelated model touch). Fix CRITICAL/IMPORTANT. Then finishing-a-development-branch. **Μετά το merge (main tree): `npm run db:sync-permissions`** (νέα permissions!) + υπενθύμιση logout/login.
