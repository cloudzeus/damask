# Tax Form Templates + Extraction (Sub-project B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Οδηγοί Εντύπων»: define per-form field/region templates (Ε3/Ε1/…), then OCR-extract a customer's filled form (from `Trdr` row actions) into a named/dated `TrdrFormRecord` + queryable per-field `TrdrFinancialValue`.

**Architecture:** Faithful port of `cloudzeus/postgres-boilerplate` `tax-templates` to DAMASK. New Prisma models; isomorphic/pure libs (`greek-format`, `template-prompt`, `template`, `crop`) + server extraction (`tax-extract` via `geminiGenerate`) + server actions. Region crop is **client-side** (reuse client-only `rasterize.ts`). UI: `/tax-templates` list+editor and a `partners` row-action scan dialog + `Trdr` «Φορολογικά» tab.

**Tech Stack:** Next.js (App Router, server actions), Prisma/Postgres, base-ui + Tailwind (Steel & Frost), react-icons/lu, pdfjs (rasterize), Bunny storage, Google Gemini vision, vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-07-22-tax-form-templates-design.md`
**Reference source to port (cloned this session):** `<scratchpad>/pb-ref/` — key files: `lib/greek-format.ts`, `lib/tax/template-prompt.ts`, `lib/ocr/tax-extract.ts`, `components/admin/tax-template-region-editor.tsx`, `app/admin/tax-templates/**`. (`<scratchpad>` = the session scratchpad dir.)

**Verified DAMASK APIs to reuse:**
- `src/lib/bunny-storage.ts` — `bunnyUploadPrivate({...})`, `bunnyDownload(key)`, `bunnyDeleteOne(key)`, `bunnyList(prefix)`
- `src/lib/ocr/rasterize.ts` — `isPdfFile(file)`, `normalizeImageMimeType(file)`, `imageFileToPage(file)`, `rasterizePdf(...)`, `MAX_RASTERIZE_PAGES`, `RasterizedPage {base64, mimeType, width, height}` (client-only, pdfjs+OffscreenCanvas)
- `src/lib/gemini.ts` — `geminiGenerate({ parts:[{inlineData:{data,mimeType}}|{text}], systemInstruction, json:true, scope:'OCR_VISION', refType, refId, userId }) → { text, model, tokensUsed }`
- `src/lib/ocr/extract.ts` — `parseJsonLoose(s)`
- `src/lib/ingestion/ocr-cost.ts` — `buildOcrCostViewForSession(role, model, tokensUsed) → OcrCostView`
- `src/lib/settings.ts` — `getIntegration('gemini')`, `isIntegrationConfigured`
- `src/lib/rbac-server.ts` — `requirePermission(perm) → Session` (`session.user.id`, `session.user.role`)
- `src/lib/objects.ts` — `OBJECT_REGISTRY`
- `src/lib/prisma.ts` — `prisma`
- Prisma `Trdr` model (id, NAME, AFM, …)

**Conventions:** Greek UI strings; Steel & Frost; base-ui (`render=`, not `asChild`); react-icons/lu. Isomorphic rule: `template.ts`/`greek-format.ts`/`template-prompt.ts`/`crop.ts` (pure part) MUST NOT import `@/lib/prisma`. **Before any App-Router/server-action/RSC code, read the relevant guide under `node_modules/next/dist/docs/`.** Ignore the pre-existing `RouteContext` tsc error; add none.

---

## Task 1: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/tax-schema.test.ts`

- [ ] **Step 1: Add enums + models to `prisma/schema.prisma`**

Append the four enums and models EXACTLY as in spec §1 (`TaxTemplateStatus`, `TaxFieldKind`, `FinancialValueType`, `FinancialValueSource`; `TaxFormTemplate`, `TaxFormTemplateField`, `TrdrFormRecord`, `TrdrFinancialValue`). Verify enum/model names match the spec.

- [ ] **Step 2: Add back-relations to the existing `Trdr` model**

In `model Trdr { … }` add:
```prisma
  formRecords     TrdrFormRecord[]
  financialValues TrdrFinancialValue[]
```

- [ ] **Step 3: Create the migration**

Run: `npx prisma migrate dev --name tax_form_templates`
Expected: migration created + applied to the dev DB. If the dev DB is unreachable (ECONNREFUSED), instead run `npx prisma migrate diff` to author the SQL, or `npx prisma validate` + `npx prisma generate`, and note the DB was unavailable (the migration file must still be committed).

- [ ] **Step 4: Regenerate client + write a schema sanity test**

Run: `npx prisma generate`

```ts
// tests/tax-schema.test.ts
import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

describe('tax form template models', () => {
  it('exposes the new models + enums on the Prisma client', () => {
    expect(Prisma.ModelName.TaxFormTemplate).toBe('TaxFormTemplate')
    expect(Prisma.ModelName.TaxFormTemplateField).toBe('TaxFormTemplateField')
    expect(Prisma.ModelName.TrdrFormRecord).toBe('TrdrFormRecord')
    expect(Prisma.ModelName.TrdrFinancialValue).toBe('TrdrFinancialValue')
  })
})
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run tests/tax-schema.test.ts && npx tsc --noEmit`
Expected: PASS; no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/tax-schema.test.ts
git commit -m "feat(tax): prisma models for form templates + records + financial values"
```

---

## Task 2: `lib/tax/template.ts` — isomorphic types + helpers

**Files:**
- Create: `src/lib/tax/template.ts`
- Test: `tests/tax-template.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tax-template.test.ts
import { describe, it, expect } from 'vitest'
import { slugFieldKey, isValidBbox, type RegionHint } from '@/lib/tax/template'

describe('slugFieldKey', () => {
  it('slugs a Greek label to an ascii-ish key', () => {
    expect(slugFieldKey('Καθαρά Κέρδη')).toMatch(/^[a-z0-9_]+$/)
    expect(slugFieldKey('Κύκλος Εργασιών 2024')).toContain('2024')
    expect(slugFieldKey('  ')).toBe('')
  })
})

describe('isValidBbox', () => {
  it('accepts a normalized 0-1 bbox and rejects out-of-range', () => {
    expect(isValidBbox([0.1, 0.2, 0.3, 0.05])).toBe(true)
    expect(isValidBbox([0, 0, 1, 1])).toBe(true)
    expect(isValidBbox([-0.1, 0, 0.2, 0.2])).toBe(false)
    expect(isValidBbox([0.5, 0.5, 0.7, 0.2])).toBe(false) // x+w > 1
    expect(isValidBbox([0.1, 0.1, 0, 0.1])).toBe(false)   // zero width
  })
})
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run tests/tax-template.test.ts`

- [ ] **Step 3: Implement `template.ts`**

```ts
// src/lib/tax/template.ts — ISOMORPHIC (no prisma/react)
export type FinancialValueTypeStr = 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'
export type TaxFieldKindStr = 'SINGLE' | 'SERIES' | 'TABLE'
export type Bbox = [number, number, number, number] // x, y, w, h — normalized 0-1
export type RegionHint = { page: number; bbox: Bbox }

export type TemplateField = {
  id?: string
  fieldKey: string
  label: string
  section?: string | null
  valueType: FinancialValueTypeStr
  kind: TaxFieldKindStr
  config?: { columns: string[] } | null
  regionHint?: RegionHint | null
  aiHint?: string | null
  required: boolean
  order: number
}

/** Greek label → safe fieldKey: strip accents, lowercase, non-alnum→_, collapse, trim _. */
export function slugFieldKey(label: string): string {
  const noAccents = label.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return noAccents.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function isValidBbox(bbox: unknown): bbox is Bbox {
  if (!Array.isArray(bbox) || bbox.length !== 4) return false
  const [x, y, w, h] = bbox as number[]
  if (![x, y, w, h].every(n => typeof n === 'number' && Number.isFinite(n))) return false
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return false
  return x + w <= 1.0001 && y + h <= 1.0001
}
```

- [ ] **Step 4: Run → PASS + tsc.** `npx vitest run tests/tax-template.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/template.ts tests/tax-template.test.ts
git commit -m "feat(tax): isomorphic template types + helpers (slug, bbox validate)"
```

---

## Task 3: `lib/tax/greek-format.ts` — value coercion (port)

**Files:**
- Create: `src/lib/tax/greek-format.ts`
- Test: `tests/tax-greek-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tax-greek-format.test.ts
import { describe, it, expect } from 'vitest'
import { parseGreekNumber, parseGreekDate, coerceFinancialValue } from '@/lib/tax/greek-format'

describe('parseGreekNumber (dot=thousands, comma=decimal)', () => {
  it('parses Greek tax-form numbers', () => {
    expect(parseGreekNumber('1.556.540,27')).toBeCloseTo(1556540.27, 2)
    expect(parseGreekNumber('1.234')).toBe(1234)       // dot ALWAYS thousands
    expect(parseGreekNumber('24,5%')).toBeCloseTo(24.5, 2)
    expect(parseGreekNumber('  ')).toBeNull()
    expect(parseGreekNumber('-')).toBeNull()
  })
})

describe('coerceFinancialValue', () => {
  it('coerces per valueType', () => {
    expect(coerceFinancialValue('12,50', 'CURRENCY')).toBeCloseTo(12.5, 2)
    expect(coerceFinancialValue('12,50', 'INTEGER')).toBe(13)
    expect(coerceFinancialValue('ΝΑΙ', 'BOOLEAN')).toBe(1)
    expect(coerceFinancialValue('όχι', 'BOOLEAN')).toBe(0)
    expect(coerceFinancialValue('nonsense', 'NUMBER')).toBeNull()
  })
  it('DATE → epoch ms', () => {
    const v = coerceFinancialValue('31/12/2024', 'DATE')
    expect(v).toBe(Date.UTC(2024, 11, 31))
  })
})
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run tests/tax-greek-format.test.ts`

- [ ] **Step 3: Implement `greek-format.ts`** — port verbatim from `<scratchpad>/pb-ref/lib/greek-format.ts`:

```ts
// src/lib/tax/greek-format.ts — PURE
export type FinancialValueTypeStr = 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'

export function parseGreekNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  let s = String(v).trim()
  if (!s) return null
  s = s.replace(/[^\d.,-]/g, '')
  if (!s || /^[.,-]+$/.test(s)) return null
  s = s.replace(/\./g, '').replace(',', '.')
  const num = Number(s)
  return Number.isFinite(num) ? num : null
}

export function parseGreekDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (m) {
    const [, dd, mm, yyyy] = m
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const iso = new Date(s)
  return Number.isNaN(iso.getTime()) ? null : iso
}

const TRUTHY = new Set(['1', 'ναι', 'nai', 'yes', 'true', 'αληθες', 'x', '✓'])
const FALSY = new Set(['0', 'οχι', 'όχι', 'ochi', 'no', 'false'])

export function coerceFinancialValue(raw: unknown, valueType: FinancialValueTypeStr): number | null {
  switch (valueType) {
    case 'INTEGER': { const n = parseGreekNumber(raw); return n == null ? null : Math.round(n) }
    case 'BOOLEAN': {
      const s = String(raw ?? '').trim().toLowerCase()
      if (TRUTHY.has(s)) return 1
      if (FALSY.has(s)) return 0
      const n = parseGreekNumber(raw); return n == null ? null : n !== 0 ? 1 : 0
    }
    case 'DATE': { const d = parseGreekDate(raw); return d ? d.getTime() : null }
    case 'PERCENT': case 'CURRENCY': case 'NUMBER': default: return parseGreekNumber(raw)
  }
}
```

- [ ] **Step 4: Run → PASS + tsc.**

- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/greek-format.ts tests/tax-greek-format.test.ts
git commit -m "feat(tax): Greek financial value coercion (port)"
```

---

## Task 4: `lib/tax/template-prompt.ts` — vision prompt builders (port)

**Files:**
- Create: `src/lib/tax/template-prompt.ts`
- Test: `tests/tax-template-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tax-template-prompt.test.ts
import { describe, it, expect } from 'vitest'
import { regionHintText, buildFieldsPrompt, type TemplateFieldLite } from '@/lib/tax/template-prompt'

describe('regionHintText', () => {
  it('describes a region as page + percentages', () => {
    expect(regionHintText({ page: 0, bbox: [0.1, 0.2, 0.3, 0.05] }))
      .toBe('page 1, area at left 10%, top 20%, width 30%, height 5% (top-left origin)')
    expect(regionHintText(null)).toBeNull()
  })
})

describe('buildFieldsPrompt', () => {
  it('lists SINGLE + SERIES fields, excludes TABLE, mentions JSON', () => {
    const fields: TemplateFieldLite[] = [
      { fieldKey: 'kerdi', label: 'Καθαρά Κέρδη', valueType: 'CURRENCY', kind: 'SINGLE', regionHint: { page: 0, bbox: [0.1, 0.2, 0.3, 0.05] }, aiHint: 'κάτω δεξιά' },
      { fieldKey: 'tziros', label: 'Τζίρος', valueType: 'CURRENCY', kind: 'SERIES', regionHint: null },
      { fieldKey: 'pinakas', label: 'Ανάλυση', valueType: 'CURRENCY', kind: 'TABLE' },
    ]
    const p = buildFieldsPrompt(fields)
    expect(p).toContain('"kerdi"')
    expect(p).toContain('"tziros"')
    expect(p).not.toContain('"pinakas"')
    expect(p).toMatch(/JSON/i)
    expect(p).toContain('located at page 1')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `template-prompt.ts`** (port `regionHintText` verbatim; `buildFieldsPrompt` from `<scratchpad>/pb-ref/lib/ocr/tax-extract.ts`):

```ts
// src/lib/tax/template-prompt.ts — PURE
import type { FinancialValueTypeStr } from '@/lib/tax/greek-format'

export type TemplateFieldLite = {
  fieldKey: string
  label: string
  aiHint?: string | null
  regionHint?: { page?: number; bbox?: [number, number, number, number] } | null
  valueType: FinancialValueTypeStr
  kind?: 'SINGLE' | 'SERIES' | 'TABLE'
}

export function regionHintText(regionHint: unknown): string | null {
  const r = regionHint as { page?: number; bbox?: [number, number, number, number] } | null | undefined
  if (!r || !Array.isArray(r.bbox)) return null
  const [x, y, w, h] = r.bbox
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return `page ${(r.page ?? 0) + 1}, area at left ${pct(x)}, top ${pct(y)}, width ${pct(w)}, height ${pct(h)} (top-left origin)`
}

export function buildFieldsPrompt(fields: TemplateFieldLite[]): string {
  const nonTable = fields.filter(f => f.kind !== 'TABLE')
  const lines = nonTable.map(f => {
    const loc = regionHintText(f.regionHint)
    const where = loc ? ` — located at ${loc}` : ''
    const hint = f.aiHint ? ` (${f.aiHint})` : ''
    if (f.kind === 'SERIES') {
      return `- "${f.fieldKey}": SERIES — read the table row labeled "${f.label}"${where}${hint}. Return an array of {"year": <number or null>, "value": "<string or null>"} for every year/column present, left to right.`
    }
    return `- "${f.fieldKey}": "${f.label}"${where}${hint}. Return the single value as a string, or null.`
  })
  const shape = nonTable.map(f => f.kind === 'SERIES'
    ? `"${f.fieldKey}": [{"year": 2024, "value": "..."}]`
    : `"${f.fieldKey}": "value or null"`).join(', ')
  return [
    'You are a precise field extractor for a Greek financial/tax document (Ε3/Ε1).',
    'Extract ONLY the fields listed. Respond with a single raw JSON object (no markdown).',
    '',
    'Fields:',
    ...lines,
    '',
    `Response shape: { ${shape} }`,
    'If a value is not visible, use null. Do NOT invent values.',
  ].join('\n')
}
```

- [ ] **Step 4: Run → PASS + tsc.**

- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/template-prompt.ts tests/tax-template-prompt.test.ts
git commit -m "feat(tax): vision prompt builders (regionHintText + buildFieldsPrompt, port)"
```

---

## Task 5: `lib/tax/crop.ts` — client-side region crop

**Files:**
- Create: `src/lib/tax/crop.ts`
- Test: `tests/tax-crop.test.ts`

- [ ] **Step 1: Write the failing test (pure pixel-rect math only)**

```ts
// tests/tax-crop.test.ts
import { describe, it, expect } from 'vitest'
import { bboxToPixelRect } from '@/lib/tax/crop'

describe('bboxToPixelRect', () => {
  it('maps a normalized bbox to integer pixel rect within the page', () => {
    expect(bboxToPixelRect([0.1, 0.2, 0.3, 0.4], 1000, 2000)).toEqual({ sx: 100, sy: 400, sw: 300, sh: 800 })
  })
  it('clamps to page bounds', () => {
    expect(bboxToPixelRect([0.9, 0.9, 0.5, 0.5], 100, 100)).toEqual({ sx: 90, sy: 90, sw: 10, sh: 10 })
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `crop.ts`** (pure math exported + a client crop helper using canvas)

```ts
// src/lib/tax/crop.ts — client (pure math + a canvas helper)
import type { Bbox } from '@/lib/tax/template'

export type PixelRect = { sx: number; sy: number; sw: number; sh: number }

/** PURE: normalized bbox → integer source rect, clamped to the page. */
export function bboxToPixelRect(bbox: Bbox, pageW: number, pageH: number): PixelRect {
  const [x, y, w, h] = bbox
  const sx = Math.max(0, Math.round(x * pageW))
  const sy = Math.max(0, Math.round(y * pageH))
  const sw = Math.max(1, Math.min(Math.round(w * pageW), pageW - sx))
  const sh = Math.max(1, Math.min(Math.round(h * pageH), pageH - sy))
  return { sx, sy, sw, sh }
}

/** CLIENT: crop a region out of a rendered page image (base64) → PNG base64 (no data: prefix). */
export async function cropRegion(pageBase64: string, mimeType: string, bbox: Bbox): Promise<{ base64: string; mimeType: 'image/png' }> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Αποτυχία φόρτωσης εικόνας σελίδας.'))
    img.src = `data:${mimeType};base64,${pageBase64}`
  })
  const { sx, sy, sw, sh } = bboxToPixelRect(bbox, img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = sw; canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context μη διαθέσιμο.')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  const dataUrl = canvas.toDataURL('image/png')
  return { base64: dataUrl.split(',')[1] ?? '', mimeType: 'image/png' }
}
```

- [ ] **Step 4: Run → PASS + tsc.**

- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/crop.ts tests/tax-crop.test.ts
git commit -m "feat(tax): client-side region crop (pure rect math + canvas crop)"
```

---

## Task 6: `lib/tax/tax-extract.ts` — server extraction via Gemini

**Files:**
- Create: `src/lib/tax/tax-extract.ts`
- Test: `tests/tax-extract.test.ts`

> Read `<scratchpad>/pb-ref/lib/ocr/tax-extract.ts` for the reference. Adapt to DAMASK's `geminiGenerate`. Only the merge/parse logic is unit-tested (mock `geminiGenerate`).

- [ ] **Step 1: Write the failing test (mock geminiGenerate)**

```ts
// tests/tax-extract.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/gemini', () => ({
  geminiGenerate: vi.fn(async () => ({
    text: JSON.stringify({ kerdi: '1.234,50', tziros: [{ year: 2024, value: '5.000,00' }] }),
    model: 'gemini-2.5-flash', tokensUsed: 321,
  })),
}))

import { extractFields } from '@/lib/tax/tax-extract'

describe('extractFields', () => {
  it('returns values + series + model/tokens from the vision JSON', async () => {
    const r = await extractFields([{ base64: 'x', mimeType: 'image/png' }], [
      { fieldKey: 'kerdi', label: 'Κέρδη', valueType: 'CURRENCY', kind: 'SINGLE' },
      { fieldKey: 'tziros', label: 'Τζίρος', valueType: 'CURRENCY', kind: 'SERIES' },
    ])
    expect(r.model).toBe('gemini-2.5-flash')
    expect(r.tokensUsed).toBe(321)
    expect(r.values.kerdi).toBe('1.234,50')
    expect(r.series.tziros).toEqual([{ year: 2024, value: '5.000,00' }])
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `tax-extract.ts`**

```ts
// src/lib/tax/tax-extract.ts — SERVER (imports gemini)
import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { buildFieldsPrompt, type TemplateFieldLite } from '@/lib/tax/template-prompt'

export type SeriesPoint = { year: number | null; value: string | null }
export type ExtractFieldsResult = {
  values: Record<string, string | null>
  series: Record<string, SeriesPoint[]>
  model: string
  tokensUsed: number | null
}

export async function extractFields(
  images: { base64: string; mimeType: string }[],
  fields: TemplateFieldLite[],
  opts: { refId?: string | null; userId?: string | null } = {},
): Promise<ExtractFieldsResult> {
  const system = buildFieldsPrompt(fields)
  const parts = [
    ...images.map(im => ({ inlineData: { data: im.base64, mimeType: im.mimeType } })),
    { text: 'Extract the listed fields from the image(s) per the instructions.' },
  ]
  const res = await geminiGenerate({ parts, systemInstruction: system, json: true, scope: 'OCR_VISION', refType: 'taxform', refId: opts.refId, userId: opts.userId })
  const raw = (safeParse(res.text) ?? {}) as Record<string, unknown>
  const values: Record<string, string | null> = {}
  const series: Record<string, SeriesPoint[]> = {}
  for (const f of fields) {
    if (f.kind === 'TABLE') continue
    const v = raw[f.fieldKey]
    if (f.kind === 'SERIES') {
      series[f.fieldKey] = Array.isArray(v) ? v.map(p => ({
        year: numOrNull((p as any)?.year), value: strOrNull((p as any)?.value),
      })) : []
    } else {
      values[f.fieldKey] = strOrNull(v)
    }
  }
  return { values, series, model: res.model, tokensUsed: res.tokensUsed }
}

function safeParse(s: string): Record<string, unknown> | null { try { return parseJsonLoose(s) as Record<string, unknown> } catch { return null } }
function strOrNull(v: unknown): string | null { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s }
function numOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null }

export type ScanTableResult = { columns: string[]; rows: { label: string; values: string[] }[]; model: string; tokensUsed: number | null }

/** TABLE field: read a full table region → columns + labeled rows. */
export async function scanTable(
  images: { base64: string; mimeType: string }[],
  columns: string[] | undefined,
  opts: { refId?: string | null; userId?: string | null } = {},
): Promise<ScanTableResult> {
  const colHint = columns?.length ? `Expected columns: ${columns.join(', ')}. ` : ''
  const system = [
    'You read a table from a Greek financial/tax document.',
    `${colHint}Respond with raw JSON: { "columns": ["..."], "rows": [{ "label": "...", "values": ["..."] }] }.`,
    'Use null string cells for blanks. Do NOT invent data.',
  ].join('\n')
  const parts = [...images.map(im => ({ inlineData: { data: im.base64, mimeType: im.mimeType } })), { text: 'Read the table.' }]
  const res = await geminiGenerate({ parts, systemInstruction: system, json: true, scope: 'OCR_VISION', refType: 'taxform', refId: opts.refId, userId: opts.userId })
  const raw = (safeParse(res.text) ?? {}) as { columns?: unknown; rows?: unknown }
  const cols = Array.isArray(raw.columns) ? raw.columns.map(c => String(c)) : (columns ?? [])
  const rows = Array.isArray(raw.rows) ? raw.rows.map(r => ({
    label: strOrNull((r as any)?.label) ?? '', values: Array.isArray((r as any)?.values) ? (r as any).values.map((x: unknown) => strOrNull(x) ?? '') : [],
  })) : []
  return { columns: cols, rows, model: res.model, tokensUsed: res.tokensUsed }
}
```

- [ ] **Step 4: Run → PASS + tsc.**

- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/tax-extract.ts tests/tax-extract.test.ts
git commit -m "feat(tax): server extraction (extractFields + scanTable via geminiGenerate)"
```

---

## Task 7: Server actions — template CRUD + sample upload

**Files:**
- Create: `src/lib/tax/actions.ts` (`'use server'`)
- Test: `tests/tax-actions-guard.test.ts`

> Read the Next server-actions doc first. Every action gates with `requirePermission('taxform.manage')`. Types that need client import go in a sibling `src/lib/tax/actions-types.ts` only if the Next version disallows type exports from `'use server'` (A used inline type exports successfully — mirror that unless it errors).

- [ ] **Step 1: Implement the template CRUD actions**

```ts
// src/lib/tax/actions.ts  ('use server')
'use server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { revalidatePath } from 'next/cache'

export type TemplateListItem = { id: string; code: string; name: string; year: number | null; description: string | null; status: string; fieldCount: number }

export async function listTemplates(): Promise<TemplateListItem[]> {
  await requirePermission('taxform.manage')
  const rows = await prisma.taxFormTemplate.findMany({ orderBy: { updatedAt: 'desc' }, include: { _count: { select: { fields: true } } } })
  return rows.map(r => ({ id: r.id, code: r.code, name: r.name, year: r.year, description: r.description, status: r.status, fieldCount: r._count.fields }))
}

export async function createTemplate(input: { code: string; name: string; year?: number | null; description?: string | null }): Promise<{ id: string }> {
  const session = await requirePermission('taxform.manage')
  const t = await prisma.taxFormTemplate.create({ data: {
    code: input.code.trim(), name: input.name.trim(), year: input.year ?? null,
    description: input.description?.trim() || null, status: 'DRAFT', createdById: session.user.id,
  } })
  revalidatePath('/tax-templates')
  return { id: t.id }
}

export async function updateTemplateMeta(id: string, input: { name?: string; year?: number | null; description?: string | null; status?: 'DRAFT' | 'READY' }): Promise<void> {
  await requirePermission('taxform.manage')
  await prisma.taxFormTemplate.update({ where: { id }, data: {
    ...(input.name != null ? { name: input.name.trim() } : {}),
    ...(input.year !== undefined ? { year: input.year } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.status ? { status: input.status } : {}),
  } })
  revalidatePath(`/tax-templates/${id}`)
}

export async function deleteTemplate(id: string): Promise<void> {
  await requirePermission('taxform.manage')
  await prisma.taxFormTemplate.delete({ where: { id } })
  revalidatePath('/tax-templates')
}

/** Upload blank sample form to private Bunny + store key/pageCount/thumb. pageCount/thumb computed client-side and passed in. */
export async function uploadSample(templateId: string, input: { base64: string; mimeType: string; ext: string; pageCount: number; thumbUrl?: string | null }): Promise<{ storageKey: string }> {
  await requirePermission('taxform.manage')
  const key = `tax-templates/${templateId}/sample.${input.ext}`
  await bunnyUploadPrivate({ key, body: Buffer.from(input.base64, 'base64'), contentType: input.mimeType })
  await prisma.taxFormTemplate.update({ where: { id: templateId }, data: { sampleStorageKey: key, samplePageCount: input.pageCount, sampleThumbUrl: input.thumbUrl ?? null } })
  revalidatePath(`/tax-templates/${templateId}`)
  return { storageKey: key }
}
```
VERIFY `bunnyUploadPrivate`'s exact parameter names in `src/lib/bunny-storage.ts:61` and adapt the call. VERIFY `session.user.id` exists.

- [ ] **Step 2: Guard test** (pins that actions require the permission — the contract):

```ts
// tests/tax-actions-guard.test.ts
import { describe, it, expect } from 'vitest'
import * as actions from '@/lib/tax/actions'
describe('tax actions surface', () => {
  it('exports the template CRUD + upload actions', () => {
    for (const k of ['listTemplates', 'createTemplate', 'updateTemplateMeta', 'deleteTemplate', 'uploadSample']) {
      expect(typeof (actions as Record<string, unknown>)[k]).toBe('function')
    }
  })
})
```

- [ ] **Step 3: Run test + tsc.** `npx vitest run tests/tax-actions-guard.test.ts && npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add src/lib/tax/actions.ts tests/tax-actions-guard.test.ts
git commit -m "feat(tax): server actions — template CRUD + sample upload"
```

---

## Task 8: Server actions — save fields + test-field

**Files:**
- Modify: `src/lib/tax/actions.ts`
- Test: `tests/tax-field-prep.test.ts`

- [ ] **Step 1: Write the failing test for a pure field-prep helper**

```ts
// tests/tax-field-prep.test.ts
import { describe, it, expect } from 'vitest'
import { prepareFieldWrites } from '@/lib/tax/field-prep'

describe('prepareFieldWrites', () => {
  it('normalizes incoming fields → upsert-ready rows with slugged keys + order', () => {
    const rows = prepareFieldWrites([
      { label: 'Καθαρά Κέρδη', valueType: 'CURRENCY', kind: 'SINGLE', regionHint: { page: 0, bbox: [0.1, 0.2, 0.3, 0.05] }, required: true },
      { fieldKey: 'tziros', label: 'Τζίρος', valueType: 'CURRENCY', kind: 'SERIES' },
    ] as any)
    expect(rows[0].fieldKey).toMatch(/^[a-z0-9_]+$/)
    expect(rows[0].order).toBe(0)
    expect(rows[1].fieldKey).toBe('tziros')
    expect(rows[1].order).toBe(1)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/tax/field-prep.ts` (PURE)**

```ts
// src/lib/tax/field-prep.ts — PURE
import { slugFieldKey, type TemplateField } from '@/lib/tax/template'

export type FieldWrite = {
  fieldKey: string; label: string; section: string | null; valueType: TemplateField['valueType']
  kind: TemplateField['kind']; config: { columns: string[] } | null; regionHint: TemplateField['regionHint'] | null
  aiHint: string | null; required: boolean; order: number
}

export function prepareFieldWrites(fields: Partial<TemplateField>[]): FieldWrite[] {
  return fields.map((f, i) => ({
    fieldKey: (f.fieldKey?.trim() || slugFieldKey(f.label ?? '')) || `field_${i + 1}`,
    label: (f.label ?? '').trim(), section: f.section?.trim() || null,
    valueType: f.valueType ?? 'CURRENCY', kind: f.kind ?? 'SINGLE',
    config: f.kind === 'TABLE' ? { columns: f.config?.columns ?? [] } : null,
    regionHint: f.regionHint ?? null, aiHint: f.aiHint?.trim() || null,
    required: !!f.required, order: i,
  }))
}
```

- [ ] **Step 4: Add `saveFields` + `testField` to `actions.ts`**

```ts
import { prepareFieldWrites } from '@/lib/tax/field-prep'
import { extractFields } from '@/lib/tax/tax-extract'
import { coerceFinancialValue } from '@/lib/tax/greek-format'

export async function saveFields(templateId: string, fields: unknown[]): Promise<void> {
  await requirePermission('taxform.manage')
  const writes = prepareFieldWrites(fields as any)
  await prisma.$transaction([
    prisma.taxFormTemplateField.deleteMany({ where: { templateId } }),
    ...writes.map(w => prisma.taxFormTemplateField.create({ data: {
      templateId, fieldKey: w.fieldKey, label: w.label, section: w.section, valueType: w.valueType,
      kind: w.kind, config: w.config ?? undefined, regionHint: w.regionHint ?? undefined, aiHint: w.aiHint, required: w.required, order: w.order,
    } })),
  ])
  revalidatePath(`/tax-templates/${templateId}`)
}

/** OCR a single field's crop (client already cropped the region). Returns raw + coerced value. */
export async function testField(input: { image: { base64: string; mimeType: string }; label: string; valueType: 'CURRENCY'|'NUMBER'|'PERCENT'|'INTEGER'|'DATE'|'BOOLEAN'; kind?: 'SINGLE'|'SERIES'; aiHint?: string | null }): Promise<{ raw: string | null; value: number | null; model: string }> {
  await requirePermission('taxform.manage')
  const key = 'test'
  const r = await extractFields([input.image], [{ fieldKey: key, label: input.label, valueType: input.valueType, kind: input.kind ?? 'SINGLE', aiHint: input.aiHint ?? null }])
  const raw = r.values[key] ?? null
  return { raw, value: coerceFinancialValue(raw, input.valueType), model: r.model }
}
```

- [ ] **Step 5: Run field-prep test + tsc.** `npx vitest run tests/tax-field-prep.test.ts && npx tsc --noEmit`

- [ ] **Step 6: Commit**
```bash
git add src/lib/tax/field-prep.ts src/lib/tax/actions.ts tests/tax-field-prep.test.ts
git commit -m "feat(tax): save fields (upsert) + test-field OCR"
```

---

## Task 9: Server actions — scan form + save financial values

**Files:**
- Modify: `src/lib/tax/actions.ts`
- Create: `src/lib/tax/value-prep.ts` (PURE)
- Test: `tests/tax-value-prep.test.ts`

- [ ] **Step 1: Write the failing test (pure value-prep)**

```ts
// tests/tax-value-prep.test.ts
import { describe, it, expect } from 'vitest'
import { prepareValueWrites } from '@/lib/tax/value-prep'

describe('prepareValueWrites', () => {
  it('maps corrected grid entries → TrdrFinancialValue write-data by valueType', () => {
    const rows = prepareValueWrites({
      trdrId: 't1', templateId: 'tpl1', year: 2024, recordId: 'r1',
      entries: [
        { fieldKey: 'kerdi', kind: 'SINGLE', valueType: 'CURRENCY', raw: '1.234,50', confidence: 0.9 },
        { fieldKey: 'hmnia', kind: 'SINGLE', valueType: 'DATE', raw: '31/12/2024', confidence: null },
        { fieldKey: 'pinakas', kind: 'TABLE', valueType: 'CURRENCY', json: [{ label: 'Α', values: ['1'] }] },
      ],
    })
    expect(rows[0]).toMatchObject({ fieldKey: 'kerdi', year: 2024, kind: 'SINGLE', valueType: 'CURRENCY' })
    expect(Number(rows[0].value)).toBeCloseTo(1234.5, 2)
    expect(rows[1].valueText).toBe('31/12/2024')       // DATE keeps raw text
    expect(rows[2].valueJson).toEqual([{ label: 'Α', values: ['1'] }])
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `value-prep.ts` (PURE)**

```ts
// src/lib/tax/value-prep.ts — PURE
import { coerceFinancialValue, type FinancialValueTypeStr } from '@/lib/tax/greek-format'

export type GridEntry = { fieldKey: string; kind: 'SINGLE'|'SERIES'|'TABLE'; valueType: FinancialValueTypeStr; raw?: string | null; json?: unknown; confidence?: number | null }
export type ValueWrite = {
  trdrId: string; templateId: string; fieldKey: string; year: number; kind: 'SINGLE'|'SERIES'|'TABLE'; valueType: FinancialValueTypeStr
  value: number | null; valueText: string | null; valueJson: unknown; source: 'OCR'; sourceRecordId: string; confidence: number | null
}

export function prepareValueWrites(input: { trdrId: string; templateId: string; year: number; recordId: string; entries: GridEntry[] }): ValueWrite[] {
  return input.entries.map(e => {
    const isTable = e.kind === 'TABLE'
    const isDate = e.valueType === 'DATE'
    return {
      trdrId: input.trdrId, templateId: input.templateId, fieldKey: e.fieldKey, year: input.year, kind: e.kind, valueType: e.valueType,
      value: isTable || isDate ? null : coerceFinancialValue(e.raw, e.valueType),
      valueText: isDate ? (e.raw ?? null) : null,
      valueJson: isTable ? (e.json ?? null) : null,
      source: 'OCR', sourceRecordId: input.recordId, confidence: e.confidence ?? null,
    }
  })
}
```

- [ ] **Step 4: Add `scanForm` + `saveFinancialValues` to `actions.ts`**

```ts
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { buildOcrCostViewForSession } from '@/lib/ingestion/ocr-cost'
import { prepareValueWrites, type GridEntry } from '@/lib/tax/value-prep'

// scanForm: client has already cropped each field's region → sends per-field images + the template field metas.
export async function scanForm(input: {
  trdrId: string; templateId: string; year: number; name: string; usage?: string | null
  sample: { base64: string; mimeType: string; ext: string; pageCount: number }
  fieldImages: { fieldKey: string; label: string; valueType: any; kind: 'SINGLE'|'SERIES'; aiHint?: string | null; image: { base64: string; mimeType: string } }[]
}) {
  const session = await requirePermission('taxform.scan')
  const recordId = crypto.randomUUID()
  const key = `tax-records/${input.trdrId}/${recordId}.${input.sample.ext}`
  await bunnyUploadPrivate({ key, body: Buffer.from(input.sample.base64, 'base64'), contentType: input.sample.mimeType })

  const grid: { fieldKey: string; label: string; raw: string | null; value: number | null; valueType: any; kind: string; confidence: number | null }[] = []
  let model = ''; let tokens = 0
  const payload: Record<string, unknown> = {}
  for (const fi of input.fieldImages) {
    const r = await extractFields([fi.image], [{ fieldKey: fi.fieldKey, label: fi.label, valueType: fi.valueType, kind: fi.kind, aiHint: fi.aiHint ?? null }], { refId: recordId, userId: session.user.id })
    model = r.model; tokens += r.tokensUsed ?? 0
    const raw = fi.kind === 'SERIES' ? JSON.stringify(r.series[fi.fieldKey] ?? []) : (r.values[fi.fieldKey] ?? null)
    payload[fi.fieldKey] = raw
    grid.push({ fieldKey: fi.fieldKey, label: fi.label, raw, value: coerceFinancialValue(raw, fi.valueType), valueType: fi.valueType, kind: fi.kind, confidence: null })
  }

  const record = await prisma.trdrFormRecord.create({ data: {
    id: recordId, name: input.name.trim(), usage: input.usage?.trim() || null, trdrId: input.trdrId, templateId: input.templateId,
    year: input.year, storageKey: key, pageCount: input.sample.pageCount, status: 'EXTRACTED', extractedData: payload as any, model, tokensUsed: tokens, createdById: session.user.id,
  } })
  const cost = await buildOcrCostViewForSession(session.user.role, model, tokens)
  return { recordId: record.id, grid, cost }
}

export async function saveFinancialValues(input: { trdrId: string; templateId: string; year: number; recordId: string; entries: GridEntry[] }): Promise<{ saved: number }> {
  await requirePermission('taxform.scan')
  const writes = prepareValueWrites(input)
  await prisma.$transaction(writes.map(w => prisma.trdrFinancialValue.upsert({
    where: { trdrId_fieldKey_year: { trdrId: w.trdrId, fieldKey: w.fieldKey, year: w.year } },
    create: { trdrId: w.trdrId, fieldKey: w.fieldKey, templateId: w.templateId, year: w.year, kind: w.kind, valueType: w.valueType, value: w.value ?? undefined, valueText: w.valueText ?? undefined, valueJson: (w.valueJson as any) ?? undefined, source: 'OCR', sourceRecordId: w.sourceRecordId, confidence: w.confidence ?? undefined },
    update: { value: w.value ?? null, valueText: w.valueText ?? null, valueJson: (w.valueJson as any) ?? undefined, kind: w.kind, valueType: w.valueType, source: 'OCR', sourceRecordId: w.sourceRecordId, confidence: w.confidence ?? null },
  })))
  return { saved: writes.length }
}
```
VERIFY the `@@unique([trdrId, fieldKey, year])` compound key name Prisma generates (`trdrId_fieldKey_year`) and adapt. VERIFY `bunnyUploadPrivate` params. `crypto.randomUUID()` is available in the Node server runtime.

- [ ] **Step 5: Run value-prep test + tsc.** `npx vitest run tests/tax-value-prep.test.ts && npx tsc --noEmit`

- [ ] **Step 6: Commit**
```bash
git add src/lib/tax/value-prep.ts src/lib/tax/actions.ts tests/tax-value-prep.test.ts
git commit -m "feat(tax): scanForm (per-region OCR → record) + saveFinancialValues"
```

---

## Task 10: Object registry item + permissions

**Files:**
- Modify: `src/lib/objects.ts`
- Test: `tests/tax-registry.test.ts`

- [ ] **Step 1: Add the registry item**

In `src/lib/objects.ts`, import a suitable icon (`FileText` from `lucide-react`, matching the existing icon-import style there), and add to an appropriate module (e.g. a new `{ key:'documents', label:'Έγγραφα', items:[…] }` module or under `admin`):
```ts
{ key: 'form-guides', href: '/tax-templates', label: 'Οδηγοί Εντύπων', icon: FileText, menuPermission: 'taxform.manage', permissions: [
  { key: 'taxform.manage', description: 'Διαχείριση οδηγών εντύπων' },
  { key: 'taxform.scan', description: 'Σάρωση OCR εντύπων σε συναλλασσόμενο' },
] },
```

- [ ] **Step 2: Write the test**

```ts
// tests/tax-registry.test.ts
import { describe, it, expect } from 'vitest'
import { allItems } from '@/lib/objects'
describe('form-guides registry item', () => {
  it('is registered with its permissions', () => {
    const item = allItems().find(i => i.key === 'form-guides')
    expect(item?.href).toBe('/tax-templates')
    expect(item?.menuPermission).toBe('taxform.manage')
    expect(item?.permissions.map(p => p.key).sort()).toEqual(['taxform.manage', 'taxform.scan'])
  })
})
```

- [ ] **Step 3: Run + tsc.** `npx vitest run tests/tax-registry.test.ts && npx tsc --noEmit`

> Note: the PERMISSIONS derivation test (from Plan 2 work) may assert a fixed permission count. If `npx vitest run` shows a failure in an existing permissions test, update its expected count/list to include `taxform.manage`/`taxform.scan` (these are new, legitimately added).

- [ ] **Step 4: Commit**
```bash
git add src/lib/objects.ts tests/tax-registry.test.ts
git commit -m "feat(tax): register «Οδηγοί Εντύπων» object + permissions"
```

---

## Task 11: List page + new-guide dialog (UI)

**Files:**
- Create: `src/app/(app)/tax-templates/page.tsx` (server component)
- Create: `src/components/tax/new-guide-dialog.tsx` (`'use client'`)
- Create: `src/components/tax/guides-table.tsx` (`'use client'`)

> Mirror an existing list page (e.g. `src/app/(app)/partners/page.tsx`) for the server-fetch + DataTable + primary-action-top-right pattern, and MASTER.md §4α/§4β.

- [ ] **Step 1: `page.tsx`** — RSC: `await requirePermission('taxform.manage')`; `const rows = await listTemplates()`; render header «Οδηγοί Εντύπων» + `<NewGuideDialog/>` (primary, top-right) + `<GuidesTable rows={rows}/>`.
- [ ] **Step 2: `guides-table.tsx`** — DataTable/table of rows: name, code+year, description, #πεδία (`fieldCount`), status badge (εικονίδιο+λέξη: DRAFT «Πρόχειρο» / READY «Έτοιμο»). Each row links to `/tax-templates/[id]`. Row action «Διαγραφή» → `deleteTemplate` with AlertDialog confirm.
- [ ] **Step 3: `new-guide-dialog.tsx`** — base-ui Dialog; fields code/name/year/description (labels above); «Δημιουργία» → `createTemplate` → `router.push('/tax-templates/'+id)`. Greek, Steel & Frost.
- [ ] **Step 4: `npx tsc --noEmit && npm run build`** (ignore pre-existing Prisma ECONNREFUSED static-gen noise). Fix any base-ui misuse per `topbar.tsx`.
- [ ] **Step 5: Commit**
```bash
git add src/app/\(app\)/tax-templates/page.tsx src/components/tax/new-guide-dialog.tsx src/components/tax/guides-table.tsx
git commit -m "feat(tax-ui): «Οδηγοί Εντύπων» list page + new-guide dialog"
```

---

## Task 12: Region editor component (UI)

**Files:**
- Create: `src/components/tax/region-editor.tsx` (`'use client'`)
- Create: `src/app/(app)/tax-templates/[id]/page-image-loader.ts` (client helper) OR reuse rasterize

> Read `<scratchpad>/pb-ref/components/admin/tax-template-region-editor.tsx` for the exact drawing interaction (mousedown/move/up → normalized bbox, page nav, zoom, saved-region overlays). Port the interaction; adapt image source to DAMASK: rasterize the sample (downloaded from Bunny via a server route or signed URL) client-side with `rasterizePdf`/`imageFileToPage`.

- [ ] **Step 1: Sample image access** — add a server route `src/app/(app)/tax-templates/[id]/page-image/route.ts` that `requirePermission('taxform.manage')`, `bunnyDownload(sampleStorageKey)`, and returns the bytes (for images) OR streams the PDF; the client rasterizes PDFs with the existing client `rasterizePdf`. (Simplest: return the raw sample file; client decides via mime.)
- [ ] **Step 2: `region-editor.tsx`** — props `{ pages: RasterizedPage[]; fields: TemplateField[]; selectedId: string | null; onDrawRegion: (page: number, bbox: Bbox) => void; onSelect: (id: string) => void }`. Render current page image; on pointer drag draw a rect, normalize to 0-1 via the rendered element size, call `onDrawRegion`. Overlay saved regions (navy outline; active = coral). Page prev/next + zoom pills. Mirror the reference component's math (`box.x/y/w/h` normalized).
- [ ] **Step 3: `npx tsc --noEmit`** (component compiles; wired in Task 13).
- [ ] **Step 4: Commit**
```bash
git add src/components/tax/region-editor.tsx src/app/\(app\)/tax-templates/\[id\]/page-image
git commit -m "feat(tax-ui): region editor canvas (draw/select normalized bbox)"
```

---

## Task 13: Field list + template editor page (UI)

**Files:**
- Create: `src/components/tax/field-list.tsx` (`'use client'`)
- Create: `src/components/tax/template-editor.tsx` (`'use client'`)
- Create: `src/app/(app)/tax-templates/[id]/page.tsx` (server component)

- [ ] **Step 1: `page.tsx`** — RSC: `requirePermission('taxform.manage')`; fetch template + fields; rasterize sample not here (client). Pass serializable `template` + `fields` to `<TemplateEditor/>`.
- [ ] **Step 2: `field-list.tsx`** — list of fields with per-field form: label, auto `fieldKey` (slug, editable), section, valueType `<select>`, kind `<select>` (SINGLE/SERIES/TABLE), if TABLE → columns editor (add/remove strings), aiHint, required. «Δοκιμή πεδίου» button → client-crop the field's region (via `cropRegion` + the rendered page) → `testField` → show raw + coerced + model inline. Add/remove field. The currently-selected field binds to the region drawn in the editor.
- [ ] **Step 3: `template-editor.tsx`** — wrapper: meta row (name/year/status select + «Αποθήκευση» → `updateTemplateMeta`), sample upload (file → client rasterize for pageCount+thumb → `uploadSample`), `<RegionEditor/>` + `<FieldList/>`, «Αποθήκευση πεδίων» → `saveFields`. Manages the fields array + selected region state; drawing a region assigns bbox to the selected field.
- [ ] **Step 4: `npx tsc --noEmit && npm run build`.**
- [ ] **Step 5: Commit**
```bash
git add src/components/tax/field-list.tsx src/components/tax/template-editor.tsx src/app/\(app\)/tax-templates/\[id\]/page.tsx
git commit -m "feat(tax-ui): field list + template editor page"
```

---

## Task 14: Scan dialog + correction grid (UI)

**Files:**
- Create: `src/components/tax/scan-form-dialog.tsx` (`'use client'`)
- Create: `src/components/tax/correction-grid.tsx` (`'use client'`)
- Create: `src/components/tax/scan-action-item.tsx` (`'use client'`)

- [ ] **Step 1: `scan-form-dialog.tsx`** — props `{ trdrId: string; trdrName: string; open; onOpenChange }`. Steps: pick guide (fetch READY templates via a new `listReadyTemplates()` action — add it to actions.ts, gated `taxform.scan`), year, name (auto «{code} {year} — {trdrName}», editable), usage (free text), upload filled form. On «Σάρωση»: client-rasterize the uploaded form, for each SINGLE/SERIES field of the guide `cropRegion(page, bbox)` → collect `fieldImages` → `scanForm(...)` → show `<CorrectionGrid grid cost/>`. Real progress bar («Σάρωση…»).
- [ ] **Step 2: `correction-grid.tsx`** — editable grid of `{ fieldKey, label, raw, value, confidence }`; low-confidence rows coral; edit raw → recompute coerced client-side (import `coerceFinancialValue`); «Αποθήκευση» → build `entries: GridEntry[]` → `saveFinancialValues(...)` → success toast + close. Show `<OcrCostPanel cost/>` (reuse from A: `src/components/ingestion/ocr-cost-panel.tsx`).
- [ ] **Step 3: `scan-action-item.tsx`** — a row-action menu item «Καταχώριση OCR εντύπου» that opens the dialog for a given trdr. Exposes `<ScanActionItem trdrId trdrName />`.
- [ ] **Step 4: `npx tsc --noEmit && npm run build`.**
- [ ] **Step 5: Commit**
```bash
git add src/components/tax/scan-form-dialog.tsx src/components/tax/correction-grid.tsx src/components/tax/scan-action-item.tsx
git commit -m "feat(tax-ui): scan form dialog + correction grid + row-action item"
```

---

## Task 15: Wire into Partners (row action + «Φορολογικά» tab)

**Files:**
- Modify: the partners list row-actions component (`grep -rn "row.*action\|DropdownMenu" src/app/(app)/partners`)
- Create: `src/components/tax/financials-tab.tsx` (`'use client'`)
- Modify: the partner detail page (`src/app/(app)/partners/[id]/…`) to add the tab

- [ ] **Step 1:** Add `<ScanActionItem trdrId={row.id} trdrName={row.NAME} />` into the partners row-actions dropdown, gated by the user's `taxform.scan` permission (use the same client permission mechanism the partners toolbar already uses; if none, render unconditionally — server action re-gates).
- [ ] **Step 2: `financials-tab.tsx`** — given `trdrId`, fetch (via a new `listTrdrFinancials(trdrId)` action gated `taxform.scan`) the `TrdrFormRecord`s + `TrdrFinancialValue`s; render records list (name/usage/year/status) + a values table pivoted by year. «Νέα σάρωση» opens the scan dialog.
- [ ] **Step 3:** Add the «Φορολογικά» tab to the partner detail page (mirror how existing tabs like Contacts are added there).
- [ ] **Step 4: `npx tsc --noEmit && npm run build`.**
- [ ] **Step 5: Commit**
```bash
git add src/app/\(app\)/partners src/components/tax/financials-tab.tsx
git commit -m "feat(tax): «Καταχώριση OCR εντύπου» row action + «Φορολογικά» tab on partners"
```

---

## Task 16: End-to-end (authoring happy path)

**Files:**
- Create: `e2e/tax-templates.spec.ts`

> Mirror `e2e/ocr-demo.spec.ts` auth. The known env footgun (shared :3000 + no worktree `.env`) may prevent a green run — if so, write the real spec, confirm `--list` parses, and report DONE_WITH_CONCERNS with the reason (do NOT fake a pass). The scan path needs Gemini + a fixture form image; gate it behind config availability or `test.skip` with a clear reason if Gemini isn't configured in the test env.

- [ ] **Step 1:** Write `e2e/tax-templates.spec.ts`: log in (taxform.manage), go to `/tax-templates`, «Νέος οδηγός» → create (code Ε3, name, year), assert it appears in the list and opens the editor. (Region-drawing + OCR are hard to e2e reliably; keep the authoring-create path as the runnable assertion; mark deeper steps `test.skip` with reasons.)
- [ ] **Step 2:** `npx playwright test e2e/tax-templates.spec.ts` (or `--list` if the env blocks running).
- [ ] **Step 3: Commit**
```bash
git add e2e/tax-templates.spec.ts
git commit -m "test(tax): e2e authoring happy path (create guide)"
```

---

## Final verification
- [ ] `npx vitest run` → all pass
- [ ] `npx tsc --noEmit` → clean (only pre-existing RouteContext)
- [ ] `npm run build` → succeeds
- [ ] Manual smoke: create a guide, upload an Ε3 sample, draw + name a region, «Δοκιμή πεδίου» reads a value; from a partner row action scan a filled Ε3 → correction → save → values appear in «Φορολογικά» tab; OCR cost shows role-appropriately.

## Notes for the executor
- **Client-crop everywhere**: the browser renders the page (rasterize.ts) and crops each region (`cropRegion`), sending only small PNGs to the server actions — keeps DAMASK server free of `sharp`/`canvas`.
- **Isomorphic discipline**: `template.ts`/`greek-format.ts`/`template-prompt.ts`/`field-prep.ts`/`value-prep.ts` + `crop.ts`'s pure part must not import prisma/react.
- **Reference clone** at `<scratchpad>/pb-ref/` — read the editor + tax-extract for fidelity; do NOT copy server-side `cropRegionToImage` (DAMASK crops client-side).
- **Permissions**: `taxform.manage` (authoring) + `taxform.scan` (per-customer scan). Every action gates first.
- **Bunny private zone** for samples + filled forms; never public URLs.
- **TABLE fields**: authored fully (columns) in Tasks 8/13 and extractable via `scanTable` (Task 6). In the customer scan flow (Tasks 9/14), `scanForm` handles SINGLE/SERIES per-region crops; TABLE regions should be cropped client-side and sent to a thin `scanTableAction` wrapper (add to `actions.ts`, gated `taxform.scan`) → stored as `valueJson` on a `TrdrFinancialValue`. If time-constrained, wire SINGLE/SERIES first and treat TABLE extraction-in-scan as the immediate follow-up task (authoring already supports it). `log()`/note this if deferred — don't silently drop TABLE.
