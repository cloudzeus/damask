# W2 — ΓΕΜΗ/ΑΑΔΕ/Geo στους Συναλλασσόμενους — Design Spec

**Date:** 2026-07-23 · **Wave:** W2 (μετά το W1 Μητρώα `836e8e6`). Πιστή μεταφορά από ref `pb-ref` (χάρτης: Company/ΓΕΜΗ area) προσαρμοσμένη στο DAMASK `Trdr`/`/partners`.
**Status:** Approved (user: «ναι προχώρα»).

## 0. Αποφάσεις
1. **Trdr επεκτάσεις** στο υπάρχον app-extras block (ΟΧΙ νέα lat/lng — **reuse `appLat/appLng`**): `arGemi String? @unique`, `gemiOffice`, `gemiStatus`, `gemiObjective String?`, `gemiIsBranch Boolean?`, `gemiAutoRegistered Boolean?`, `gemiLastStatusChange DateTime?`, `gemiSyncedAt DateTime?`, `gemiData Json?`, `foundingDate DateTime?`, `aadeStatus String?`, `aadeFirmKind String?`, `aadeSyncedAt DateTime?`, `geocodedAt DateTime?`, `geocodedAddress String?`, `regionCode String?` → `Region` (SetNull) + back-relation `Region.trdrs`.
2. **`TrdrKad`** (mirror ref CompanyActivity): trdrId Cascade, code (dotted), codeWithoutDots, codeAade, description, `kind ActivityKind (PRIMARY|SECONDARY)`, order, `@@unique([trdrId, code])`. Γράφεται ΜΟΝΟ μέσω resolve (`resolveKadForActivity` W1) — ο **πρωτεύων ΚΑΔ** = kind PRIMARY.
3. **`TrdrDocument`** (mirror ref CompanyDocument): trdrId Cascade, `source DocumentSource (GEMI|MANUAL)`, `docKind TrdrDocumentKind (DECISION|PUBLICATION|OTHER)`, title, kak, assembly/summary/decisionSubject, dateAssemblyDecided/dateAnnounced/dateRegistrated, applicationStatus, sourceUrl, storageKey (Bunny private), mimeType, sizeBytes, metadata Json, `@@unique([trdrId, kak])`.
4. **ΓΕΜΗ metadata refs** (5 models, ids από ΓΕΜΗ): `LegalType(id Int PK, descr)`, `GemiOfficeRef(id, descr, address?, city?, zip?, phone?, fax?, url?)`, `CompanyStatusRef(id, descr, isActive Boolean?)`, `PrefectureRef(id, descr)`, `MunicipalityRef(id, descr, prefectureId → PrefectureRef SetNull)`. Refresh action από `/metadata/*`. (Ονόματα `PrefectureRef/MunicipalityRef` για να μη συγκρουστούν μελλοντικά με Region.)
5. **ΓΕΜΗ client** (`src/lib/trdr/gemi.ts`, port ref `lib/gemi.ts`): base `https://opendata-api.businessportal.gr/api/opendata/v1`, header `api_key` — **κλειδί από `getIntegration('gemi')` (Settings→Διασυνδέσεις), ΟΧΙ env**. Νέο IntegrationName `'gemi'` + settings card (apiKey + «Δοκιμή σύνδεσης» = legalTypes call) — mirror mailgun/maps card. `mapGemiCompany` → Trdr shape (address street+number, foundingDate=incorporationDate, activities→ensurePrimaryActivity, type '1'→PRIMARY).
6. **ΑΑΔΕ lookup** (`src/lib/trdr/aade.ts`): `POST https://vat.wwa.gr/afm2info` `{afm}` (9 ψηφία, χωρίς key) → mapped στοιχεία + activities (firm_act_kind '1' PRIMARY). Preview — persist στο apply.
7. **Actions** (`src/lib/trdr/enrich-actions.ts`, gate = τα υπάρχοντα partners permissions — δες objects.ts, reuse, ΚΑΝΕΝΑ νέο permission):
   - `aadeLookupTrdr(afm)` preview · `gemiLookupTrdr({afm?|arGemi?})` preview (search→getCompany+documents counts).
   - `applyAadeToTrdr(trdrId)` — γράφει τα ΑΑΔΕ πεδία + **TrdrKad replace** (resolve, dedupe PRIMARY-preferred) + aadeSyncedAt.
   - `gemiSyncTrdr(trdrId, {arGemi?, syncDocuments=true})` — resolve arGemi (given→stored→search by AFM), update Trdr (gemi* πεδία, gemiData raw, foundingDate, appLegalForm), TrdrKad replace, έγγραφα: download via api_key → **Bunny private** `trdr/{trdrId}/gemi/{kak}.{ext}` → upsert TrdrDocument (unique trdrId+kak). Επιστρέφει counts.
   - `refreshGemiMetadata()` — τα 5 ref tables (municipalities τελευταία).
   - `matchTrdrRegion(trdrId)` — W1 `matchRegion` (municipalityDescr/prefectureDescr από gemiData αν υπάρχουν, address/city/district, coords appLat/appLng) → γράφει regionCode· `bulkMatchTrdrRegions()` — όλα τα Trdr με regionCode null (returns tallies by confidence).
   - `listTrdrGemiDocuments(trdrId)` on-demand (live από ΓΕΜΗ, χωρίς αποθήκευση) + `saveTrdrGemiDocument(trdrId, kak/url…)` αποθήκευση ενός + `listTrdrDocuments(trdrId)` (saved) + gated download route `.../partners/[id]/documents/[docId]`.
8. **UI**: (α) `/partners` table — row actions «ΑΑΔΕ», «ΓΕΜΗ sync», «Εντοπισμός Περιφέρειας» + στήλη Περιφέρεια badge + toolbar «Μαζικός εντοπισμός περιφερειών»· (β) καρτέλα `/partners/[id]` — sections: «ΓΕΜΗ & ΑΑΔΕ» (πεδία, sync buttons, gemiSyncedAt/aadeSyncedAt), «ΚΑΔ» (TrdrKad list, PRIMARY badge, «Απαιτεί άδεια» flag από W1 KadLicenseRequirement), «Έγγραφα» (saved TrdrDocuments + «Προβολή εγγράφων ΓΕΜΗ» on-demand λίστα με «Αποθήκευση» ανά έγγραφο)· ο υπάρχων χάρτης δείχνει και το region· (γ) Settings→Διασυνδέσεις: κάρτα ΓΕΜΗ.
9. Μετά το merge: το GEMI_API_KEY (δόθηκε από user) καταχωρείται στο DB setting `integration.gemi` (one-off, εκτός repo).

## Testing
Pure: mapGemiCompany mapping, aade parsing (s() nil-coercion), kak/ext sanitise. Server: action guards (υπάρχοντα partners perms), gemiSync mock flow (update+kad replace+doc upsert), matchTrdrRegion writes regionCode, bulk tallies. tsc/build/full suite.

## Εκτός scope
W3 matching/newsletter· W4 OCR· χάρτης cluster όλων των Trdr (μελλοντικό)· ΓΕΜΗ webhooks.
