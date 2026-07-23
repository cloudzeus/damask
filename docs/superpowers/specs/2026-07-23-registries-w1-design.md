# W1 — Μητρώα: Περιφέρειες (Καλλικράτης) & ΚΑΔ — Design Spec

**Date:** 2026-07-23 · **Wave:** W1 of the SoftOne-uniform data wave (W1 μητρώα → W2 ΓΕΜΗ/Trdr → W3 δυνητικοί πελάτες → W4 OCR workflows).
**Status:** Approved (user: «ναι ξεκίνα»). Faithful transfer from `cloudzeus/postgres-boilerplate` (ref mapped in full) **+ data copy from the espa DB** (όχι seed αρχεία).

## 0. Αποφάσεις
1. **Πιστή μεταφορά** των ref models `Region`, `KadCode`, `KadLicenseRequirement`, `KadImportLog` (στήλες επαληθευμένα ταυτόσημες με την πηγή espa DB: Region 415 · KadCode 10.751 · KadLicenseRequirement 5.990 rows).
2. **Δεδομένα με απευθείας αντιγραφή DB→DB** μέσω repeatable script (`REGISTRY_SOURCE_DATABASE_URL`), όχι committed dumps. Τρέχει τώρα για το dev· ξανατρέχει για prod.
3. **SoftOne-uniformity αρχή**: τα μητρώα είναι ελληνικά registries (όχι S1 tables) — κρατούν την ref ονοματολογία· η αρχή εφαρμόζεται στα W2+ models.
4. Λειτουργικότητα ref που μεταφέρεται: tree viewers (lazy, με counts), decoders (code/όνομα→ιεραρχία), **matchRegion** (ΓΕΜΗ ids → όνομα → geo-nearest ≤50km fallback), **resolveKadForActivity** (ΑΑΔΕ/ΓΕΜΗ κωδικός → κανονικός ΚΑΔ), license-requirement flags. Το match/resolve είναι το θεμέλιο του W2.

## 1. Μοντέλα (πιστά από ref — βλ. χάρτη)
`Region` (code PK, nameEL/EN, level 3/4/5, parentCode self-FK SetNull, path, latitude/longitude, isActive) · `KadCode` (code PK dotted, codeWithoutDots unique, description, title, level 1..7, sector/sectorLetter, parentCode self-FK, path, category, isActive) · `KadLicenseRequirement` (code→KadCode Cascade, licenseType enum OPERATING_LICENSE, inherited, sourceParentCode, source, notes, @@unique[code,licenseType]) · `KadImportLog` (totalCodes, importedAt, sourceVersion, status, notes). Indexes ως ref. **Χωρίς** σύνδεση σε Trdr σε αυτό το κύμα (το `Trdr.regionCode`/`TrdrKad` είναι W2).

## 2. Data copy
`scripts/copy-registries.ts` (`npm run copy:registries`): διαβάζει `REGISTRY_SOURCE_DATABASE_URL` (env/param), αντιγράφει Region (parents-first by level), KadCode (parents-first), KadLicenseRequirement, KadImportLog σε batches με upsert (idempotent — ξανατρέξιμο). Επαλήθευση counts στο τέλος. Credentials ΔΕΝ γράφονται σε repo/settings.

## 3. Libs (μεταφορά ref → `src/lib/registries/`)
- `regions/tree.ts` (pure): buildBreadcrumb, deriveHierarchy. `regions/decoder.ts` (server): decodeRegion. `regions/match.ts` (server): matchRegion με hybrid priority ΓΕΜΗ-ids→name→geo (geo fallback ΜΟΝΟ αν υπάρχει geocoding διαθέσιμο στο DAMASK — έλεγχος για υπάρχον maps/geocode lib, αλλιώς το geo σκέλος επιστρέφει null χωρίς crash). Pure helpers (normalizeGreek, coreName, haversineKm, nearestNode) σε ξεχωριστό pure αρχείο για tests.
- `kad/resolve.ts`: stripKadDots/formatKadDots (pure) + resolveKadForActivity (server). `kad/decoder.ts` (server): decodeKADCode.
- Ports προσαρμόζονται σε DAMASK idioms (prisma singleton, χωρίς ref RBAC helpers).

## 4. Actions & σελίδες
Server actions (όχι API routes — DAMASK idiom): `regionChildren(parentCode?)`, `regionDecode(input)`, `regionMatch(input)` · `kadChildren(parentCode?)`, `kadDecode(input)`, `kadSearch(q, limit)`. Gate: νέο permission ζεύγος ανά μητρώο.
Σελίδες: **«Περιφέρειες»** (`/regions`) — σύνολο, decoder search, lazy tree με counts + badge επιπέδου + συντεταγμένες. **«ΚΑΔ»** (`/kad`) — σύνολο + last import, decoder, search table, lazy tree, badge «Απαιτεί άδεια λειτουργίας» όπου υπάρχει KadLicenseRequirement. Read-only viewers (τα δεδομένα είναι μητρώα)· Steel & Frost, Ελληνικά.

## 5. Objects / permissions
Νέο group «**Μητρώα**» (PERMISSION_GROUP_LABELS `registries`)· items «Περιφέρειες» (`regions`, `/regions`, menuPermission `regions.view`) και «ΚΑΔ» (`kad`, `/kad`, `kad.view`). ROLE_DEFAULTS: view→ADMIN(ALL)+MANAGER+EMPLOYEE. Μετά το merge: `npm run db:sync-permissions` + logout/login (γνωστό pattern).

## 6. Testing
Pure: tree/breadcrumb, normalizeGreek/coreName/haversine/nearestNode, strip/formatKadDots (port τα ref tests όπου υπάρχουν). Server: action guards. Copy script: dry validation (mock pg). tsc/build/full suite πράσινα.

## 7. Εκτός scope (W2+)
Trdr.regionCode/TrdrKad, ΓΕΜΗ/ΑΑΔΕ clients, backfill-regions για Trdr, matching engine, newsletter.
