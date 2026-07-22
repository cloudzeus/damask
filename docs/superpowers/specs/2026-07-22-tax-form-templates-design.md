# Sub-project B — Φορολογικά Έντυπα (Tax Form Templates + Extraction) · Design Spec

**Ημερομηνία:** 2026-07-22
**Κατάσταση:** Εγκεκριμένο design (brainstorming) → έτοιμο για implementation plan
**Sub-project:** B από την αποδόμηση του «universal OCR/data-entry» οράματος (μετά το A που έγινε merge)

**Reference:** πιστή προσαρμογή του `cloudzeus/postgres-boilerplate` feature `tax-templates` (μελετήθηκε: `prisma/schema.prisma` models `TaxFormTemplate`/`TaxFormTemplateField`/`CompanyFinancialValue`, `app/admin/tax-templates/[id]/editor.tsx`, `components/admin/tax-template-region-editor.tsx`, `app/api/admin/tax-templates/[id]/{test-field,scan-table,page-image,sample,fields}/route.ts`, `lib/ocr/tax-extract.ts`, `lib/tax/template-prompt.ts`, `lib/greek-format.ts`, `lib/ocr/rasterize.ts::cropRegionToImage`) στο DAMASK stack.

---

## 0. Πλαίσιο & αποφάσεις

Ο χρήστης θέλει σελίδα με **φορολογικά έντυπα** (π.χ. Ε3): σε κάθε έντυπο **σχεδιάζει περιοχές και τις ονομάζει**, ώστε να αποθηκεύει τα στοιχεία του εντύπου **ανά πελάτη**. Εύρος αυτής της επανάληψης (επιβεβαιωμένο 2026-07-22): **χαρτογράφηση + extraction** end-to-end.

### Κλειδωμένες αποφάσεις
1. **Πελάτης = `Trdr`** (DAMASK equivalent του `Company` του reference). Τα εξαγόμενα δεδομένα αποθηκεύονται ανά `Trdr` + έτος.
2. **Client-side crop**: το cropping περιοχής γίνεται στον browser (canvas), συνεπές με το υπάρχον client-only `src/lib/ocr/rasterize.ts` (pdfjs + OffscreenCanvas· κανένα server `sharp`/`canvas`). Δεν αντιγράφουμε το server-side `cropRegionToImage` του reference.
3. **Δεν** είναι A ingestion target (τα tax data δεν είναι upsert σε γραμμή `Trdr`/`Product`) — ξεχωριστή αποθήκευση, αλλά **ξαναχρησιμοποιεί** gemini vision, Bunny, και το role-gated cost view του A.
4. **Extraction ανά περιοχή (crop)**: κάθε πεδίο SINGLE/SERIES διαβάζεται από το crop της περιοχής του (το μοντέλο βλέπει μόνο εκείνο το κελί). TABLE μέσω ξεχωριστού scan-table flow.
5. **bbox normalized 0-1** ως `[x, y, w, h]` σχετικά με τη σελίδα· `regionHint = { page: number (0-based), bbox }`.

### Reuse από DAMASK (verified)
| Υπάρχον | Χρήση |
|---|---|
| `src/lib/bunny-storage.ts` — `bunnyUploadPrivate`, `bunnyDownload`, `bunnyDeleteOne`, `bunnyList` | αποθήκευση δείγματος εντύπου + συμπληρωμένων εγγράφων |
| `src/lib/ocr/rasterize.ts` — `imageFileToPage`, `rasterizePdf`, `isPdfFile`, `normalizeImageMimeType`, `MAX_RASTERIZE_PAGES`, `RasterizedPage` (base64+dims) | render σελίδων εντύπου σε canvas (client) |
| `src/lib/gemini.ts` — `geminiGenerate({ parts:[inlineData…], systemInstruction, json:true, scope, refType, refId, userId })` → `{ text, model, tokensUsed }` | vision extraction |
| `src/lib/ai/usage.ts` — `logAiUsage` (γίνεται ήδη μέσα στο gemini.ts), `AiScope` (`OCR_VISION`) | cost logging |
| `src/lib/ingestion/ocr-cost.ts` — `buildOcrCostViewForSession(role, model, tokensUsed)`, `OcrCostView` (A) | role-gated κόστος/μοντέλο στο scan |
| `src/lib/ocr/extract.ts` — `parseJsonLoose` | ανεκτικό JSON parse |
| `src/lib/objects.ts` — `OBJECT_REGISTRY` | νέο object «Φορολογικά έντυπα» |
| `src/lib/rbac-server.ts` — `requirePermission` | AuthZ σε κάθε action |
| `Trdr` model + `partners/[id]` καρτέλα | tab «Φορολογικά» |

---

## 1. Μοντέλο δεδομένων (νέα Prisma models + enums)

```prisma
enum TaxTemplateStatus { DRAFT READY }
enum TaxFieldKind      { SINGLE SERIES TABLE }
enum FinancialValueType { CURRENCY NUMBER PERCENT INTEGER DATE BOOLEAN }
enum FinancialValueSource { OCR MANUAL }

model TaxFormTemplate {
  id               String   @id @default(cuid())
  code             String                       // «Ε3», «Ε1», …
  name             String
  year             Int?
  description      String?
  status           TaxTemplateStatus @default(DRAFT)
  sampleStorageKey String?                       // Bunny path του blank δείγματος (pdf/png)
  samplePageCount  Int?
  sampleThumbUrl   String?
  createdById      String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  fields           TaxFormTemplateField[]
  documents        TaxFormDocument[]
  @@unique([code, year])
  @@index([status])
}

model TaxFormTemplateField {
  id          String   @id @default(cuid())
  templateId  String
  template    TaxFormTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  fieldKey    String
  label       String
  section     String?
  valueType   FinancialValueType @default(CURRENCY)
  kind        TaxFieldKind @default(SINGLE)
  config      Json?        // TABLE → { columns: string[] }
  regionHint  Json?        // { page: number, bbox: [x,y,w,h] }  (0-1 normalized)
  aiHint      String?
  required    Boolean  @default(false)
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([templateId, fieldKey])
  @@index([templateId])
}

model TrdrFinancialValue {
  id               String   @id @default(cuid())
  trdrId           String
  trdr             Trdr     @relation(fields: [trdrId], references: [id], onDelete: Cascade)
  fieldKey         String
  templateId       String?
  year             Int
  value            Decimal? @db.Decimal(18, 2)   // SINGLE numeric
  valueText        String?                        // DATE / free text
  valueJson        Json?                          // TABLE → array of objects
  kind             TaxFieldKind @default(SINGLE)
  valueType        FinancialValueType
  source           FinancialValueSource @default(OCR)
  sourceDocumentId String?
  confidence       Float?
  verified         Boolean  @default(false)
  verifiedById     String?
  note             String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([trdrId, fieldKey, year])
  @@index([trdrId])
  @@index([fieldKey, year])
}

model TaxFormDocument {
  id            String   @id @default(cuid())
  trdrId        String
  trdr          Trdr     @relation(fields: [trdrId], references: [id], onDelete: Cascade)
  templateId    String
  template      TaxFormTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
  fiscalYear    Int
  storageKey    String                            // Bunny path του συμπληρωμένου εντύπου
  pageCount     Int?
  status        String   @default("PENDING")       // PENDING | EXTRACTED | FAILED
  extractedData Json?                              // πλήρες payload (fieldKey → raw)
  model         String?
  tokensUsed    Int?
  createdById   String?
  createdAt     DateTime @default(now())
  @@index([trdrId])
  @@index([templateId])
}
```
`Trdr` παίρνει back-relations `financialValues TrdrFinancialValue[]` + `taxDocuments TaxFormDocument[]`. Νέα migration.

---

## 2. Δομή αρχείων

```
src/lib/tax/
  template.ts          # ISOMORPHIC types: RegionHint {page,bbox}, TaxFieldKind, FinancialValueType, TemplateFieldLite, helpers (fieldKey auto-slug)
  greek-format.ts      # PURE: coerceFinancialValue(raw, valueType) — port (currency/number/percent/integer/date/boolean, ελληνικά κόμμα/τελεία)
  template-prompt.ts   # PURE: regionHintText(regionHint), buildFieldsPrompt(fields[]) — port
  crop.ts              # CLIENT: cropRegionFromPage(rasterizedPageBase64, dims, bbox) → base64 PNG (OffscreenCanvas)
  tax-extract.ts       # SERVER: extractFields(images, fields[]) via geminiGenerate → { values, series, model, tokensUsed }; scanTable(image, columns?) → grid
  actions.ts           # 'use server': template CRUD, uploadSample, saveFields, testField, scanForm, saveFinancialValues, list/getTemplate
src/components/tax/
  region-editor.tsx        # canvas: render page + draw/resize bbox, page nav, zoom, saved-region overlays
  field-list.tsx           # πεδία: label/fieldKey/section/valueType/kind/columns/aiHint/required + «Δοκιμή πεδίου»
  template-editor.tsx      # wrapper: meta (name/year/status) + sample upload + region-editor + field-list
  scan-panel.tsx           # καρτέλα Trdr: pick template+year, upload filled form, extract, preview grid + confidence
  correction-grid.tsx      # edit εξαγόμενων τιμών πριν save, mark verified
  financials-tab.tsx       # Trdr tab: TrdrFinancialValue ανά έτος (πίνακας)
src/app/(app)/tax-templates/
  page.tsx                 # ΛΙΣΤΑ εντύπων (name, code/year, description, #πεδία, status) + «Νέο έντυπο»
  [id]/page.tsx            # editor σελίδα (server: fetch template+fields → <TemplateEditor/>)
```

---

## 3. Ροές

### 3α. Χαρτογράφηση (authoring)
1. **Λίστα** `/tax-templates`: DataTable (§4α) με name, code+year, description, #πεδία, status badge· «Νέο έντυπο» → dialog (code/name/year/description) → create DRAFT.
2. **Editor** `/tax-templates/[id]`:
   - **Upload δείγματος**: file (pdf/png/jpg) → `uploadSample` server action → `bunnyUploadPrivate` + client rasterize για pageCount + thumb. Αποθηκεύεται `sampleStorageKey/samplePageCount/sampleThumbUrl`.
   - **Region editor**: render της τρέχουσας σελίδας (client rasterize του δείγματος από Bunny signed URL ή server page-image), σχεδίαση bbox με ποντίκι (normalized 0-1), page nav + zoom, overlays των αποθηκευμένων περιοχών.
   - **Πεδία**: για την επιλεγμένη περιοχή → φόρμα (label· auto fieldKey slug· section· valueType· kind SINGLE/SERIES/TABLE· αν TABLE → columns[]· aiHint· required). Save μέσω `saveFields` (bulk upsert `TaxFormTemplateField` by `[templateId, fieldKey]`).
   - **«Δοκιμή πεδίου»**: client-crop της περιοχής → `testField` server action → `extractFields` (Gemini) → εμφανίζει raw + coerced τιμή + μοντέλο. (Επιβεβαίωση ότι διαβάζει σωστά πριν το production.)
   - status DRAFT→READY όταν έτοιμο.

### 3β. Extraction πελάτη
1. Στην καρτέλα `Trdr` (`partners/[id]`) tab «**Φορολογικά**» → `financials-tab` (τιμές ανά έτος) + κουμπί «**Σάρωση εντύπου**».
2. `scan-panel`: επιλογή template (READY) + έτος + ανέβασμα συμπληρωμένου εντύπου (pdf/εικόνα).
3. `scanForm` server action: αποθηκεύει `TaxFormDocument` (Bunny)· για κάθε SINGLE/SERIES πεδίο → client-crop της περιοχής → `extractFields` (Gemini, dynamic prompt από `buildFieldsPrompt`) → `coerceFinancialValue`. TABLE → `scanTable`. Επιστρέφει grid { fieldKey, label, raw, value, confidence }.
4. **Cost panel** role-gated (reuse `buildOcrCostViewForSession`).
5. `correction-grid`: ο χρήστης διορθώνει/επιβεβαιώνει → `saveFinancialValues` → upsert `TrdrFinancialValue` by `[trdrId, fieldKey, year]` (source OCR, confidence, sourceDocumentId). Χειροκίνητη επεξεργασία → source MANUAL, verified.

---

## 4. Extraction engine (`tax-extract.ts`, server)

Port του reference `buildFieldsPrompt`/`extractTaxForm`, προσαρμοσμένο σε `geminiGenerate`:
- `extractFields(images: {base64,mimeType}[], fields: TemplateFieldLite[]): Promise<{ values: Record<string,string|null>; series: Record<string,{year:number|null;value:string|null}[]>; model; tokensUsed }>` — systemInstruction = `buildFieldsPrompt(fields)` («precise field extractor for Greek Ε3/Ε1… extract ONLY listed fields… raw JSON»), `json:true`, `scope:'OCR_VISION'`, `refType:'taxform'`. `parseJsonLoose` το αποτέλεσμα.
- Ανά-πεδίο crop: το `scanForm` καλεί `extractFields` με το crop ενός πεδίου κάθε φορά (ή σε μικρά batches ίδιας σελίδας) — το μοντέλο βλέπει μόνο το κελί → ακρίβεια.
- `scanTable(image, columns?)`: prompt για πίνακα → `{ columns[], rows: {label, values[]}[] }` → `valueJson`.
- `coerceFinancialValue(raw, valueType)` για κάθε τιμή.

---

## 5. UI (Steel & Frost, §4β/§6)

- **Λίστα εντύπων**: DataTable §4α, primary «Νέο έντυπο» πάνω-δεξιά, status badges (εικονίδιο+λέξη), Ελληνικά.
- **Region editor**: glass canvas· bbox με navy περίγραμμα, active region coral highlight· page nav/zoom pills· «Δοκιμή πεδίου» δείχνει read value inline· labels πάνω από πεδία· validation on blur.
- **Scan/correction**: πραγματικό progress bar στη σάρωση (όχι bare spinner)· grid με confidence chips (χαμηλό confidence = coral)· «Αποθήκευση» primary.
- **react-icons/lu**, **base-ui** (`render=`), όλα Ελληνικά.

---

## 6. Security & cost
- Κάθε server action gated με `requirePermission('taxform.manage')` (templates) / `'taxform.scan'` ή reuse `'customer.edit'` για το scan σε πελάτη (θα κλειδωθεί στο plan).
- Sample/filled έγγραφα σε **private** Bunny zone (`bunnyUploadPrivate`)· page-image μέσω server route ή signed URL, ποτέ public.
- Cost figures role-gated (§4). AiUsage logging μέσω gemini.ts.
- Καμία raw error/stack στον χρήστη (Ελληνικά μηνύματα).

---

## 7. Object registry + permissions
Νέο module/item στο `OBJECT_REGISTRY`: `{ key:'tax-templates', href:'/tax-templates', label:'Φορολογικά έντυπα', icon: <lucide>, menuPermission:'taxform.manage', permissions:[{taxform.manage},{taxform.scan}] }`. Το tab στην καρτέλα Trdr gated με `taxform.scan` (ή `customer.edit`).

---

## 8. Testing (TDD)
- **Pure units**: `coerceFinancialValue` (currency/number/percent/integer/date/boolean, ελληνικά «1.234,56»/«24%»/κενά), `regionHintText`, `buildFieldsPrompt` (SINGLE/SERIES/TABLE φιλτράρισμα), `template.ts` helpers (fieldKey slug, region normalize/denormalize), `crop.ts` bbox math (pure part).
- **Server**: `extractFields`/`scanTable` με mocked `geminiGenerate`· `saveFinancialValues` prep (pure mapping ParsedValue→Trdr write-data)· action guards (permission).
- **e2e** (όπου εφικτό, βλ. γνωστό env footgun): authoring happy path (create template → upload sample → draw region → save field), scan happy path σε Trdr.

---

## 9. Εκτός scope (v1 του B)
- OCR **region designer γενικού σκοπού** για ΟΠΟΙΟΔΗΠΟΤΕ object (πέρα από tax forms) → μελλοντικά, αν χρειαστεί.
- Έκθεση ως A ingestion source.
- Section 3 (ευρωπαϊκά προγράμματα + παραδοτέα) → sub-project C (χωριστό).
- Batch σάρωση πολλών εντύπων ταυτόχρονα.

---

## 10. Definition of Done
- Migration + 4 models applied· `Trdr` relations.
- `/tax-templates` λίστα + editor: upload δείγματος, σχεδίαση/ονομασία περιοχών, πεδία (SINGLE/SERIES/TABLE), «Δοκιμή πεδίου» διαβάζει σωστά.
- Καρτέλα Trdr «Φορολογικά»: σάρωση συμπληρωμένου εντύπου → extraction → διόρθωση → αποθήκευση `TrdrFinancialValue` ανά έτος, με role-gated cost.
- Pure units + server tests πράσινα· `tsc` clean· build ΟΚ· Steel & Frost + Ελληνικά.
