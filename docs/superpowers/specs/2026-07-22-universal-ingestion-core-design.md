# Universal Ingestion — Core (A) · Design Spec

**Ημερομηνία:** 2026-07-22
**Κατάσταση:** Εγκεκριμένο design (brainstorming) → έτοιμο για implementation plan
**Sub-project:** A (θεμέλιο) από την αποδόμηση του «universal OCR/data-entry» οράματος

---

## 0. Πλαίσιο & αποδόμηση

Το ευρύτερο αίτημα («κάθε model/table να καταχωρεί περιεχόμενο μέσω Excel / OCR / API, με τα 4 OCR sections») είναι framework με πολλά ανεξάρτητα υποσυστήματα. Αποδομήθηκε σε:

| # | Sub-project | Τι είναι | Εξάρτηση |
|---|---|---|---|
| **A** | **Ingestion core** (ΑΥΤΟ το spec) | Per-object «Καταχώριση από…» με 3 adapters (Excel/OCR/API) + κοινό staging→map→validate→commit + κόστος&μοντέλο role-gated | κανένα |
| **B** | OCR template/region designer | Section 4: σχεδίαση περιοχών σε έντυπο → variables → δυναμικό JSON schema + ανάγνωση πινάκων (multi-row) | A |
| **C** | Doc profiles | Section 1 (παραστατικά+τύπος→πίνακας), 2 (λογαριασμοί+ενδείξεις μετρητών), 3 (ευρωπαϊκά+παραδοτέα) | A + B |

Κάθε sub-project παίρνει δικό του spec → plan → build. Αυτό το spec καλύπτει **μόνο το A**.

### Κλειδωμένες αποφάσεις (brainstorming 2026-07-22)

1. **Commit target:** μόνο τοπική Postgres (Prisma). Ο συγχρονισμός με SoftOne μένει ευθύνη του υπάρχοντος sync engine — **όχι** του ingestion.
2. **Ορισμός object:** curated registry (`INGESTION_TARGETS`) που γενικεύει το υπάρχον `ImportTargetDef`. Κανένα generic auto-reflection write.
3. **API adapter:** ad-hoc URL (primitive) **και** saved presets ανά target (προ-συμπληρώνουν το ad-hoc).
4. **Cardinality v1:** μόνο flat (1 source record → 1 entity row). Master-detail (header+γραμμές) μένει για τα doc-profiles (C).
5. **Κόστος & role:** μετά από κάθε OCR run, inline panel «κόστος + μοντέλο», role-gated με την υπάρχουσα λογική του `/costs`.
6. **v1 entities:** framework + **Products** (υπάρχον target) + **Συναλλασσόμενοι** (Trdr). Τα **Έξοδα** deferred — δεν υπάρχει Prisma model· θα σχεδιαστεί σωστά μαζί με τα sections 1/2.

---

## 1. Επισκόπηση αρχιτεκτονικής

**Αρχή:** 3 πηγές → ένα κοινό contract (`NormalizedBatch`) → ένα κοινό pipeline (`map → validate → commit`).

```
                       ┌── ExcelSource ──┐
  upload / scan / url ─┼── OcrSource   ──┼─► NormalizedBatch ─► map ─► validate ─► commit ─► Postgres
                       └── ApiSource   ──┘        (κοινό)       (pure)  (pure)   (server)
```

Επειδή και οι 3 adapters παράγουν το **ίδιο** `NormalizedBatch`, τα map/validate/commit γράφονται **μία** φορά και είναι source-agnostic. Το UI είναι ένα drawer που εναλλάσσει **μόνο** το acquisition panel ανά πηγή.

### Επαναχρήση υπαρχόντων

| Υπάρχον | Πώς αξιοποιείται |
|---|---|
| `lib/import/targets.ts` (`ImportTargetDef`, field builders, `parseGreekNumber`) | βάση για `IngestionTarget` + `IngestionFieldDef`· lift field builders |
| `lib/import/product-upsert.ts` | commit για target `product` (chunked, bulk existence, uniqueBy `code`) |
| `lib/import/xlsx-parse` + `import/step-upload`/`step-sheet`/`step-mapping`/`step-validate` | ExcelSource + βήματα map/validate UI |
| `lib/ocr/extract.ts` (`extractDocument`) | OcrSource |
| `lib/ocr/customer-actions.ts` + ΑΦΜ lookup (`vat.wwa.gr/afm2info`) | partner commit (Trdr + Contact) |
| `lib/ai/markup.ts`, `lib/ai/pricing.ts`, `lib/ai/usage.ts`, `/costs` role gating | panel κόστους OCR |
| `lib/objects.ts` (`OBJECT_REGISTRY`) | σύνδεση target→object (permission/menu/href) |
| pg-boss + `ImportJob` + notification center | async commit μεγάλων batches |
| import-wizard chrome (`glass rounded-2xl`, αριθμημένα βήματα, navy connectors) | wizard chrome του `IngestDrawer` |

---

## 2. Δομή αρχείων

Isomorphic split όπως το `lib/import` (isomorphic targets vs server-only writes):

```
src/lib/ingestion/
  target.ts            # IngestionTarget/IngestionFieldDef types + helpers   (ISOMORPHIC, no prisma)
  registry.ts          # INGESTION_TARGETS: product, partner                 (ISOMORPHIC)
  fields.ts            # field builders (text/number/date/enum) — lift από import/targets
  normalized.ts        # NormalizedBatch / SourceRecord types                (ISOMORPHIC)
  map.ts               # mapToRows(batch, mappings, target) → RawIngestionRow[]  (PURE)
  validate.ts          # validateRows(rows, target) → { parsed, errors }         (PURE)
  ocr-project.ts       # projectOcr(doc, target) → { sourceKeys, records }        (PURE — 'party' | 'lines')
  api-normalize.ts     # normalizeApiJson(json) → { sourceKeys, records }         (PURE)
  sources/
    excel.ts           # ExcelSource — wraps xlsx-parse → NormalizedBatch         (client)
  commit/
    index.ts           # COMMIT_REGISTRY: targetKey → commit fn                   (SERVER-ONLY)
    product.ts         # reuse import/product-upsert
    partner.ts         # νέο Trdr upsert (uniqueBy: afm) + Contact rows
  actions.ts           # 'use server' — acquireFromApi, acquireFromOcr, validateBatch, commitBatch, apiPresets CRUD

src/components/ingestion/
  ingest-drawer.tsx        # base-ui side drawer, wizard chrome (Steel & Frost)
  step-source.tsx          # pill cards Excel/OCR/API + acquisition panel swap
  source-api-panel.tsx     # URL + header/token + presets + [Ανάκτηση] + preview
  source-ocr-panel.tsx     # wraps OcrUploader + cost/model panel + preview
  step-ingest-map.tsx      # sourceKey→field grid (reuse StepMapping internals)
  step-ingest-validate.tsx # DataTable errors + σύνοψη
  step-ingest-commit.tsx   # progress + totals
  ocr-cost-panel.tsx       # role-gated κόστος/μοντέλο
  ingest-entry-button.tsx  # «Καταχώριση από… ▾» για object list pages
```

**Κανόνας isomorphic:** τα `target.ts`/`registry.ts`/`map.ts`/`validate.ts`/`ocr-project.ts`/`api-normalize.ts`/`normalized.ts`/`fields.ts` **δεν** κάνουν import `@/lib/prisma`. Οι Prisma writes ζουν αποκλειστικά στο `commit/*` (server-only) και καλούνται μόνο από `actions.ts` + pg-boss worker. Ίδιο pattern με `import/targets.ts` vs `import/product-upsert.ts`.

---

## 3. Contract — `NormalizedBatch`

```ts
// lib/ingestion/normalized.ts  (ISOMORPHIC)
export type SourceRecord = Record<string, string>          // sourceKey → raw string τιμή
export type NormalizedBatch = {
  source: 'excel' | 'ocr' | 'api'
  sourceKeys: { key: string; sample?: string }[]           // οδηγεί το mapping UI (στήλες / json keys / ocr πεδία)
  records: SourceRecord[]                                   // flat: 1 record → 1 entity row
  meta?: {
    ocr?: { model: string; usedFallback: boolean; costUsd: number; mismatches: MismatchFlag[] }
    api?: { url: string; fetchedAt: number; count: number }
    excel?: { fileName: string; sheet: string }
  }
}
```

Όλες οι τιμές είναι **strings** στο `SourceRecord` (raw), ώστε το `field.parse()` του validate να είναι ο **μοναδικός** τόπος coercion (ελληνικοί αριθμοί, ημερομηνίες κ.λπ.) — ίδια αρχή με τον υπάρχοντα import.

---

## 4. Registry — `IngestionTarget`

```ts
// lib/ingestion/target.ts  (ISOMORPHIC)
import type { ImportFieldDef } from '@/lib/import/targets'
import type { OcrDocTypeHint } from '@/lib/ocr/schema'

export type IngestionFieldDef = ImportFieldDef & {
  aliases?: string[]                     // extra ονόματα για fuzzy auto-match από OCR/API keys
}
export type IngestionSourceKind = 'excel' | 'ocr' | 'api'
export type OcrProjection = 'party' | 'lines'

export type IngestionTarget = {
  key: string                            // 'product' | 'partner'
  label: string                          // «Προϊόντα» / «Συναλλασσόμενοι»
  objectKey: string                      // link σε OBJECT_REGISTRY (permission/menu/href)
  permission: string                     // απαιτούμενο για ingest (π.χ. 'product.edit' / 'customer.edit')
  fields: IngestionFieldDef[]
  uniqueBy: string                       // fieldKey για upsert ('code' / 'afm')
  sources: IngestionSourceKind[]         // ενεργοί adapters
  ocr?: { docTypeHint?: OcrDocTypeHint; project: OcrProjection }
}
```

```ts
// lib/ingestion/registry.ts  (ISOMORPHIC)
export const INGESTION_TARGETS: IngestionTarget[] = [
  {
    key: 'product', label: 'Προϊόντα', objectKey: 'products', permission: 'product.edit',
    fields: PRODUCT_FIELDS,              // lift από import PRODUCT_TARGET.fields (μηδέν duplication)
    uniqueBy: 'code',
    sources: ['excel', 'ocr', 'api'],
    ocr: { project: 'lines' },           // γραμμές τιμολογίου → N προϊόντα
  },
  {
    key: 'partner', label: 'Συναλλασσόμενοι', objectKey: 'partners', permission: 'customer.edit',
    fields: PARTNER_FIELDS,              // νέο: name/afm/address/phones/emails/website → Trdr
    uniqueBy: 'afm',
    sources: ['excel', 'ocr', 'api'],
    ocr: { docTypeHint: 'invoice', project: 'party' },  // εκδότης → 1 συναλλασσόμενος
  },
]

export function ingestionTargetByKey(key: string): IngestionTarget | undefined
export function targetsForObject(objectKey: string): IngestionTarget[]
```

**Helpers χρειάζονται:** `ingestionTargetByKey`, `targetsForObject` (για το entry button).

### PRODUCT_FIELDS
Lift από το υπάρχον `PRODUCT_TARGET.fields`. Επανεξάγονται/μοιράζονται· δεν αντιγράφονται.

### PARTNER_FIELDS (νέο)
Χαρτογράφηση προς `Trdr`. Ελάχιστο σύνολο v1 (επιβεβαίωση ονομάτων πεδίων `Trdr` στο plan):

| fieldKey | label | required | parse | Trdr στόχος | aliases |
|---|---|---|---|---|---|
| `afm` | ΑΦΜ | ναι (uniqueBy) | 9 ψηφία, strip EL/GR prefix | `afm` | vat, tin |
| `name` | Επωνυμία | ναι | text ≤190 | `name` | onomasia, εκδότης |
| `address` | Διεύθυνση | όχι | text | `address` | διεύθυνση |
| `phone` | Τηλέφωνο | όχι | text | Contact «Από ingestion» | τηλ, phones |
| `email` | Email | όχι | email | Contact | emails |
| `city` | Πόλη | όχι | text | `city`? | περιοχή |

> Τα ακριβή πεδία του `Trdr` επιβεβαιώνονται από `prisma/schema.prisma` στο implementation plan. Επιπλέον phones/emails → `Contact` rows με σημείωση προέλευσης (όπως το υπάρχον OCR customer-actions).

---

## 5. Adapters (`acquire() → NormalizedBatch`)

### ① Excel (client)
Wrapper γύρω από το υπάρχον `xlsx-parse` (SheetJS via CDN tarball ≥0.20.2). `columns → sourceKeys`, `rows → records` (string values). Ουσιαστικά τα βήματα 1-2 του υπάρχοντος wizard, με έξοδο `NormalizedBatch` (`source:'excel'`, `meta.excel`).

### ② OCR (server action `acquireFromOcr`)
`images/PDF → extractDocument()` (υπάρχον pipeline: Gemini vision → zod → invoice-math) → **flatten** ανά `target.ocr.project` μέσω `projectOcr(doc, target)`:

- **`project:'lines'`** (product): κάθε `doc.lines[]` → 1 `SourceRecord`
  (`description`, `quantity`, `unitPrice`, `vatPct`, `total`). `sourceKeys` = τα κλειδιά γραμμής. N records.
- **`project:'party'`** (partner): ο `doc.issuer` → 1 `SourceRecord`
  (`name`, `afm`, `address`, `phone` (πρώτο/joined), `email`, `website`). 1 record.

`meta.ocr = { model, usedFallback, costUsd, mismatches }`. Το `costUsd` υπολογίζεται από το `pricing.ts` βάσει tokens/model. Η χρήση ήδη γράφεται στο `AiUsage` (refType `'ocr'`) από `gemini.ts`/`deepseek.ts`.

### ③ API (server action `acquireFromApi`)
Server-side `fetch(url, { headers })` (αποφυγή CORS· τα secrets μένουν server) → JSON → `normalizeApiJson`:

- array → `records`
- `{ data: [...] }` (ή `{ items: [...] }`) → η εσωτερική array
- single object → `[object]`

Top-level scalars κάθε record → `SourceRecord` (stringify). `sourceKeys` = union κλειδιών με sample από το πρώτο record. Nested objects/arrays αγνοούνται στην v1 (flat only).

**Guardrails (§8 security):** μόνο `http(s)`, block localhost/private ranges, timeout (π.χ. 15s), max response bytes, max records.

**Presets:** `Setting` key `ingestion.apiPresets:<targetKey>` → λίστα `{ name, url, headerName?, /* token: server-only ref */ }`. Το UI: dropdown «φόρτωσε preset» + «Αποθήκευση endpoint». Το ad-hoc είναι το primitive· τα presets απλώς προ-συμπληρώνουν.

---

## 6. Pipeline

### map.ts (PURE)
```ts
export type IngestionMapping = { sourceKey: string; fieldKey: string }   // fieldKey '' = παράβλεψη
export function mapToRows(batch, mappings, target): RawIngestionRow[]     // { rowNum, values }[]
export function autoMatch(sourceKeys, target): IngestionMapping[]         // fuzzy σε key/label/aliases (reuse step-mapping)
```

### validate.ts (PURE)
```ts
export function validateRows(rows, target): { parsed: ParsedRow[]; errors: FieldError[] }
// ανά πεδίο: field.parse(raw) → value|error· required checks· uniqueBy παρουσία & duplicates-εντός-batch
// errors: { row, column, message } — ελληνικά «αιτία+διόρθωση»
```

### commit (SERVER-ONLY)
```ts
// commit/index.ts
export const COMMIT_REGISTRY: Record<string, (parsed: ParsedRow[]) => Promise<IngestionTotals>>
export type IngestionTotals = { total, processed, created, updated, failed, errors: FieldError[] }
```
- **product** → reuse `import/product-upsert` (chunked, bulk existence, uniqueBy `code`).
- **partner** → νέο upsert σε `Trdr` by `afm` (create/update)· επιπλέον phones/emails → `Contact` rows «Από ingestion».

**Async threshold:** batches > `SYNC_EXECUTE_THRESHOLD` (=500, υπάρχον) → pg-boss/`ImportJob` path με πρόοδο στο notification center. Αλλιώς sync. OCR/API τυπικά μικρά → sync.

---

## 7. Cost & role panel (μόνο OCR)

Πηγή: `meta.ocr`. Λογική εμφάνισης = ίδια με `/costs` (`markup.ts` + role gate):

| Role | Εμφάνιση |
|---|---|
| SUPER_ADMIN | μοντέλο + base USD + breakdown markup ανά provider + τελικό € |
| ADMIN / `costs.view` | μοντέλο + τελικό € (markup applied, χωρίς breakdown) |
| χωρίς `costs.view` | μόνο όνομα μοντέλου (χωρίς ποσό) |

Το `costUsd → €` περνά από `applyMarkup` + fx (`lib/ai/fx.ts`). Τα `mismatches` (invoice-math) εμφανίζονται ως ⚠ inline. **Το role gating γίνεται server-side** (το panel δέχεται ήδη-φιλτραρισμένα δεδομένα, δεν στέλνει ποτέ κόστος που ο ρόλος δεν επιτρέπεται να δει).

---

## 8. UI (`IngestDrawer`) — Steel & Frost, wizard §6.2

base-ui side drawer (`render=`, όχι `asChild`), glass (radius 22-26px), navy pills, Comfortaa headings / Manrope UI, base 14px, `react-icons/lu`. Wizard chrome αντιγράφει το `import-wizard` (glass step header, αριθμημένοι κύκλοι, navy connectors, `canProceed` gating).

**Βήματα:**
1. **Πηγή** — pill cards `[Excel] [OCR] [API]` (φιλτραρισμένα από `target.sources`)· επιλογή → acquisition panel:
   - Excel: `StepUpload` + `StepSheet`
   - OCR: `OcrUploader` + `ocr-cost-panel` + preview (γραμμές/party)
   - API: `source-api-panel` (URL label πάνω + header/token + presets + `[Ανάκτηση]` + preview)
2. **Αντιστοίχιση** — `sourceKey→field` grid, auto-match, required flags
3. **Έλεγχος** — errors σε **DataTable §4α** + σύνοψη «X νέες · Y ενημερώσεις · Z σφάλματα» + OCR mismatches ⚠
4. **Καταχώριση** — primary pill πάνω-δεξιά, πραγματικό progress bar, totals, checkmark· μεγάλο batch → «τρέχει στο παρασκήνιο» + link notification center

**Autosave draft** ανά target (§6.2, localStorage). Όλα ελληνικά, labels πάνω από πεδία, validation on blur, `prefers-reduced-motion` respected.

**Entry point:** `ingest-entry-button` — δευτερεύον pill «**Καταχώριση από… ▾**» (Excel/OCR/API) σε κάθε object list page δίπλα στο primary «Νέο». Gated από `target.permission`. Δηλωτικό: νέα targets το παίρνουν αυτόματα μέσω `targetsForObject(objectKey)`. Σέβεται «μία κύρια ενέργεια/οθόνη» (το «Νέο» παραμένει primary).

---

## 9. Security

- **AuthZ:** κάθε server action (`acquireFromOcr`, `acquireFromApi`, `validateBatch`, `commitBatch`, presets CRUD) ελέγχει session + `target.permission` **πριν** από κάθε ενέργεια. Ποτέ trust στον client για target/permission.
- **API SSRF:** ο ad-hoc URL είναι server-side fetch αυθαίρετου προορισμού → μόνο `https`, άρνηση localhost/loopback/private IP ranges (10/172.16/192.168/169.254/::1), timeout, cap σε bytes & records. Ο token μένει server-side (δεν επιστρέφεται στον client· τα presets αποθηκεύουν reference, όχι plaintext στο client bundle).
- **Cost gating:** server-side (§7).
- **Καμία raw error/stack** στον χρήστη — φιλικά ελληνικά (anti-pattern §8 MASTER).

---

## 10. Error handling

| Κατάσταση | Συμπεριφορά |
|---|---|
| Gemini μη ρυθμισμένο (OCR εικόνων) | υπάρχον `GEMINI_NOT_CONFIGURED_MESSAGE` |
| API δεν απαντά / timeout | «Το endpoint δεν απάντησε (timeout/σφάλμα δικτύου).» |
| API μη-JSON / κακό shape | «Η απάντηση δεν ήταν έγκυρο JSON / αναγνωρίσιμη λίστα.» |
| Validation errors | non-blocking preview· commit μόνο έγκυρων rows, αναφορά failed (όπως import) |
| Commit αποτυχία γραμμής | καταγράφεται στα `errors`, δεν ρίχνει όλο το batch |
| Μεγάλο batch | async· η πρόοδος/αποτέλεσμα στο notification center |

---

## 11. Testing (TDD)

**Pure units** (vitest, ύφος `tests/ocr-*`, χωρίς δίκτυο):
- `mapToRows` / `autoMatch` (fuzzy)
- `validateRows` (required, uniqueBy, ελληνικοί αριθμοί, duplicates εντός batch)
- `normalizeApiJson` (array / `{data}` / `{items}` / single object / σκουπίδια)
- `projectOcr` (`party` 1 record, `lines` N records, κενά/null)
- partner upsert-prep (create vs update by afm, contacts από phones/emails)
- cost/markup role gating (SUPER_ADMIN vs ADMIN vs no-costs.view)
- API guardrails (block private IP, non-https, size/records cap)

**Integration/e2e** (Playwright, όπως `ocr-demo.spec`): ένα happy path ανά πηγή → product & partner (mock `fetch`/`extractDocument` όπου χρειάζεται).

---

## 12. Εκτός scope (v1 του A)

- Master-detail (header+γραμμές ως parent+children) → doc-profiles (C).
- Target «Έξοδα»/Expense model → sections 1/2.
- Push σε SoftOne από ingestion → υπάρχον sync engine, ξεχωριστά.
- Region designer / δυναμικά OCR schemas → sub-project B.
- Nested JSON flattening στο API adapter (μόνο top-level scalars στην v1).

---

## 13. Ορόσημο ολοκλήρωσης (Definition of Done)

- `lib/ingestion/*` + `components/ingestion/*` υλοποιημένα, isomorphic split τηρημένος.
- Products **και** Partners καταχωρίζονται end-to-end και από τις 3 πηγές (Excel/OCR/API).
- OCR run εμφανίζει κόστος+μοντέλο role-gated.
- «Καταχώριση από…» εμφανίζεται δηλωτικά στις σελίδες Products & Partners, gated από permission.
- Όλα τα pure units + τουλάχιστον 1 e2e happy path ανά πηγή περνούν· `tsc` clean· build ΟΚ.
- Steel & Frost + wizard §6.2 συμμόρφωση.
