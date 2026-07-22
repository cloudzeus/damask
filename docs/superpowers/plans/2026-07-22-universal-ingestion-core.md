# Universal Ingestion Core (A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-object "Καταχώριση από… (Excel / OCR / API)" ingestion framework where all three sources normalize into one `NormalizedBatch`, flow through shared map→validate→commit, and write into local Postgres — wired for **Products** and **Συναλλασσόμενοι (Trdr)** in v1.

**Architecture:** Three source adapters (Excel client-side, OCR + API server-side) produce an identical `NormalizedBatch`. A pure `map` stage maps source keys to target fields; a pure `validate` stage runs each field's `parse()`; a server-only `commit` registry upserts into Prisma. OCR runs surface a role-gated cost/model panel. UI is one `IngestDrawer` (base-ui, Steel & Frost) that swaps only the acquisition panel per source, reusing the existing import wizard's map/validate steps.

**Tech Stack:** Next.js (App Router, RSC + server actions), Prisma/Postgres, base-ui/react + Tailwind 4, TanStack Table (DataTable), react-icons/lu, vitest, Playwright, SheetJS (xlsx via CDN), Google Gemini vision (existing OCR pipeline).

**Reference spec:** `docs/superpowers/specs/2026-07-22-universal-ingestion-core-design.md`

**Key existing code to reuse (verified):**
- `src/lib/import/targets.ts` — `ImportFieldDef`, `ImportTargetDef`, `parseGreekNumber`, `PRODUCT_TARGET`, `normalizeHeader`, `autoMatchField`, `parseProductRow`, `RawImportRow`, `FieldError`, `FieldParseResult`
- `src/lib/import/product-upsert.ts` — `runProductImport(rows)`, `ImportTotals`, `emptyTotals`, `SYNC_EXECUTE_THRESHOLD`, `validateProductChunk`
- `src/lib/import/xlsx-parse.ts` — `readWorkbookFromFile`, `SheetMeta`, `RawRow`, `ColumnInfo`, `colIndexToLetter`
- `src/lib/ocr/extract.ts` — `extractDocument(input)` → `{ data, mismatches, model, usedFallback }` (extended in Task 7)
- `src/lib/ocr/schema.ts` — `ExtractedDocument`, `OcrLine`, `OcrParty`, `OcrDocTypeHint`
- `src/lib/gemini.ts` — `geminiGenerate` returns `GeminiResult { text, model, tokensUsed }`
- `src/lib/ai/pricing.ts` — `computeCostAsync(model, {input?,output?,total?})` → `UsageCost { totalCost, matched }`
- `src/lib/ai/markup.ts` — `loadAiMarkup()`, `applyMarkup(usd, pct)`, `markupPctForProvider(markup, provider)`, `DEFAULT_USD_TO_EUR_FALLBACK`
- `src/lib/ai/fx.ts` — `getUsdToEurLatest(fallback)`
- `src/lib/settings.ts` — `getSetting<T>(key)`, `setSetting(key, value)`
- `src/lib/rbac-server.ts` — `requirePermission(perm)` → `Session` (has `session.user.role`)
- `src/lib/objects.ts` — `OBJECT_REGISTRY`, `itemByKey`
- Prisma models: `Trdr` (NAME req, AFM?, ADDRESS?, CITY?, ZIP?, PHONE01?, EMAIL?, WEBPAGE?, SODTYPE default 13, TRDR? unique, ISPROSP), `Contact` (trdrId, name, phone?, email?)
- UI chrome: `src/app/(app)/import/import-wizard.tsx` (glass stepper), `src/components/ocr/ocr-uploader.tsx`, `src/app/(app)/import/step-mapping.tsx`

**Conventions (from AGENTS.md + design system MASTER.md):**
- This Next.js version has breaking changes — before writing any App Router / RSC / server-action code, read the relevant guide under `node_modules/next/dist/docs/`.
- Greek UI strings everywhere, action verbs. Steel & Frost v3 skin, base-ui (`render=`, not `asChild`), `react-icons/lu` for new code. Labels above fields, validation on blur, real progress bars.
- Isomorphic rule: `target/registry/map/validate/ocr-project/api-normalize/normalized/fields` MUST NOT import `@/lib/prisma`. Prisma writes live only in `commit/*` (server-only) called from `actions.ts` / pg-boss worker.

---

## Task 1: Ingestion types, target registry, and field builders

**Files:**
- Create: `src/lib/ingestion/normalized.ts`
- Create: `src/lib/ingestion/fields.ts`
- Create: `src/lib/ingestion/target.ts`
- Create: `src/lib/ingestion/registry.ts`
- Modify: `src/lib/import/targets.ts` (export `textField`, `numberField` for reuse)
- Test: `tests/ingestion-registry.test.ts`

- [ ] **Step 1: Export the two field builders from import/targets so ingestion can reuse them (DRY)**

In `src/lib/import/targets.ts`, change the two internal declarations to exported:

```ts
export function textField(opts: {
  key: string; label: string; description?: string; required?: boolean; sample?: string; maxLength?: number
}): ImportFieldDef {
```
```ts
export function numberField(opts: {
  key: string; label: string; description?: string; required?: boolean; sample?: string
}): ImportFieldDef {
```
(Only add the `export` keyword; leave the bodies unchanged.)

- [ ] **Step 2: Write `normalized.ts` (the shared adapter contract)**

```ts
// src/lib/ingestion/normalized.ts — ISOMORPHIC (no prisma, no react)
import type { MismatchFlag } from '@/lib/ocr/invoice-math'
import type { RawImportRow } from '@/lib/import/targets'

/** Μία flat source-εγγραφή: sourceKey → raw string τιμή (coercion γίνεται μόνο στο validate). */
export type SourceRecord = Record<string, string>

export type SourceKind = 'excel' | 'ocr' | 'api'

export type NormalizedBatch = {
  source: SourceKind
  /** Οδηγεί το mapping UI (στήλες Excel / json keys / πεδία OCR) + samples για preview. */
  sourceKeys: { key: string; sample?: string }[]
  /** Flat: 1 record → 1 entity row. */
  records: SourceRecord[]
  meta?: {
    ocr?: { model: string; usedFallback: boolean; costUsd: number; mismatches: MismatchFlag[] }
    api?: { url: string; fetchedAt: number; count: number }
    excel?: { fileName: string; sheet: string }
  }
}

/** Μία γραμμή μετά το mapping, έτοιμη προς validate/commit — ίδιο shape με τον import (DRY). */
export type RawIngestionRow = RawImportRow
```

- [ ] **Step 3: Write `fields.ts` (reuse import builders + add afm/email/enum)**

```ts
// src/lib/ingestion/fields.ts — ISOMORPHIC
import { textField, numberField, type ImportFieldDef, type FieldParseResult } from '@/lib/import/targets'

export { textField, numberField }

/** ΑΦΜ: 9 ψηφία· αφαιρεί πρόθεμα χώρας EL/GR· κενό επιτρέπεται μόνο αν !required. */
export function afmField(opts: { key: string; label: string; required?: boolean; sample?: string }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: !!opts.required, sample: opts.sample,
    parse(raw): FieldParseResult<string> {
      const t = raw.trim().replace(/^(EL|GR)/i, '')
      if (t === '') {
        return opts.required
          ? { value: null, error: `${opts.label}: το πεδίο είναι υποχρεωτικό.` }
          : { value: null, error: null }
      }
      if (!/^\d{9}$/.test(t)) return { value: null, error: `${opts.label}: πρέπει να έχει 9 ψηφία.` }
      return { value: t, error: null }
    },
  }
}

/** email: απλός έλεγχος μορφής· κενό → null χωρίς σφάλμα όταν !required. */
export function emailField(opts: { key: string; label: string; required?: boolean; sample?: string }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: !!opts.required, sample: opts.sample,
    parse(raw): FieldParseResult<string> {
      const t = raw.trim()
      if (t === '') {
        return opts.required ? { value: null, error: `${opts.label}: υποχρεωτικό.` } : { value: null, error: null }
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { value: null, error: `${opts.label}: μη έγκυρο email.` }
      return { value: t, error: null }
    },
  }
}

/** enum ακέραιων κωδικών (π.χ. SODTYPE 12/13) με default όταν κενό. */
export function intEnumField(opts: {
  key: string; label: string; allowed: number[]; defaultValue: number
}): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: false,
    parse(raw): FieldParseResult<number> {
      const t = raw.trim()
      if (t === '') return { value: opts.defaultValue, error: null }
      const n = Number(t)
      if (!opts.allowed.includes(n)) {
        return { value: null, error: `${opts.label}: επιτρεπτές τιμές ${opts.allowed.join('/')}.` }
      }
      return { value: n, error: null }
    },
  }
}
```

- [ ] **Step 4: Write `target.ts` (types + helpers)**

```ts
// src/lib/ingestion/target.ts — ISOMORPHIC
import type { ImportFieldDef } from '@/lib/import/targets'
import type { OcrDocTypeHint } from '@/lib/ocr/schema'
import type { SourceKind } from './normalized'

export type IngestionFieldDef = ImportFieldDef & { aliases?: string[] }
export type OcrProjection = 'party' | 'lines'

export type IngestionTarget = {
  key: string
  label: string
  objectKey: string        // link σε OBJECT_REGISTRY (permission/menu/href)
  permission: string       // required για ingest
  fields: IngestionFieldDef[]
  uniqueBy: string         // fieldKey για upsert
  sources: SourceKind[]
  ocr?: { docTypeHint?: OcrDocTypeHint; project: OcrProjection }
}

export function requiredFieldKeys(target: IngestionTarget): string[] {
  return target.fields.filter(f => f.required).map(f => f.key)
}
```

- [ ] **Step 5: Write `registry.ts` (product lift + partner new)**

```ts
// src/lib/ingestion/registry.ts — ISOMORPHIC
import { PRODUCT_TARGET } from '@/lib/import/targets'
import { textField, emailField, afmField, intEnumField } from './fields'
import type { IngestionTarget, IngestionFieldDef } from './target'

const PARTNER_FIELDS: IngestionFieldDef[] = [
  { ...afmField({ key: 'afm', label: 'ΑΦΜ', required: true, sample: '094014201' }), aliases: ['vat', 'tin', 'αφμ'] },
  { ...textField({ key: 'name', label: 'Επωνυμία', required: true, sample: 'Damask AE', maxLength: 190 }), aliases: ['onomasia', 'εκδότης', 'επωνυμία', 'name'] },
  { ...textField({ key: 'address', label: 'Διεύθυνση', maxLength: 190 }), aliases: ['διεύθυνση', 'addr'] },
  { ...textField({ key: 'city', label: 'Πόλη', maxLength: 120 }), aliases: ['περιοχή', 'city'] },
  { ...textField({ key: 'zip', label: 'Τ.Κ.', maxLength: 20 }), aliases: ['tk', 'zip', 'postal'] },
  { ...textField({ key: 'phone', label: 'Τηλέφωνο', maxLength: 40 }), aliases: ['τηλ', 'phone', 'phones'] },
  { ...emailField({ key: 'email', label: 'Email', sample: 'info@damask.gr' }), aliases: ['emails', 'mail'] },
  { ...textField({ key: 'website', label: 'Ιστότοπος', maxLength: 300 }), aliases: ['website', 'web', 'url'] },
  intEnumField({ key: 'sodtype', label: 'Τύπος (12 Προμηθευτής / 13 Πελάτης)', allowed: [12, 13], defaultValue: 13 }),
]

export const INGESTION_TARGETS: IngestionTarget[] = [
  {
    key: 'product', label: 'Προϊόντα', objectKey: 'products', permission: 'product.edit',
    fields: PRODUCT_TARGET.fields, uniqueBy: 'code',
    sources: ['excel', 'ocr', 'api'], ocr: { project: 'lines' },
  },
  {
    key: 'partner', label: 'Συναλλασσόμενοι', objectKey: 'partners', permission: 'customer.edit',
    fields: PARTNER_FIELDS, uniqueBy: 'afm',
    sources: ['excel', 'ocr', 'api'], ocr: { docTypeHint: 'invoice', project: 'party' },
  },
]

export function ingestionTargetByKey(key: string): IngestionTarget | undefined {
  return INGESTION_TARGETS.find(t => t.key === key)
}
export function targetsForObject(objectKey: string): IngestionTarget[] {
  return INGESTION_TARGETS.filter(t => t.objectKey === objectKey)
}
```

- [ ] **Step 6: Write the failing registry-invariants test**

```ts
// tests/ingestion-registry.test.ts
import { describe, it, expect } from 'vitest'
import { INGESTION_TARGETS, ingestionTargetByKey, targetsForObject } from '@/lib/ingestion/registry'

describe('INGESTION_TARGETS invariants', () => {
  it('every target has ≥1 source and a uniqueBy that exists in its fields', () => {
    for (const t of INGESTION_TARGETS) {
      expect(t.sources.length).toBeGreaterThan(0)
      expect(t.fields.some(f => f.key === t.uniqueBy)).toBe(true)
    }
  })
  it('target keys are unique', () => {
    const keys = INGESTION_TARGETS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('lookup helpers work', () => {
    expect(ingestionTargetByKey('product')?.label).toBe('Προϊόντα')
    expect(ingestionTargetByKey('nope')).toBeUndefined()
    expect(targetsForObject('partners').map(t => t.key)).toEqual(['partner'])
  })
  it('partner uniqueBy is afm and product uniqueBy is code', () => {
    expect(ingestionTargetByKey('partner')?.uniqueBy).toBe('afm')
    expect(ingestionTargetByKey('product')?.uniqueBy).toBe('code')
  })
})
```

- [ ] **Step 7: Run the test**

Run: `npx vitest run tests/ingestion-registry.test.ts`
Expected: PASS (all invariants hold).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ingestion/normalized.ts src/lib/ingestion/fields.ts src/lib/ingestion/target.ts src/lib/ingestion/registry.ts src/lib/import/targets.ts tests/ingestion-registry.test.ts
git commit -m "feat(ingestion): target registry + field builders (product + partner)"
```

---

## Task 2: `map.ts` — source keys → target fields (pure)

**Files:**
- Create: `src/lib/ingestion/map.ts`
- Test: `tests/ingestion-map.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingestion-map.test.ts
import { describe, it, expect } from 'vitest'
import { autoMatchMappings, mapToRows } from '@/lib/ingestion/map'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import type { NormalizedBatch } from '@/lib/ingestion/normalized'

const partner = ingestionTargetByKey('partner')!

describe('autoMatchMappings', () => {
  it('matches by key, label, and alias (accent/case-insensitive)', () => {
    const m = autoMatchMappings(['ΑΦΜ', 'Επωνυμία', 'vat', 'άγνωστο'], partner)
    expect(m.find(x => x.sourceKey === 'ΑΦΜ')?.fieldKey).toBe('afm')
    expect(m.find(x => x.sourceKey === 'Επωνυμία')?.fieldKey).toBe('name')
    expect(m.find(x => x.sourceKey === 'vat')?.fieldKey).toBe('afm')
    expect(m.find(x => x.sourceKey === 'άγνωστο')?.fieldKey).toBe('')
  })
})

describe('mapToRows', () => {
  it('projects each record through mappings into fieldKey→value rows', () => {
    const batch: NormalizedBatch = {
      source: 'api', sourceKeys: [{ key: 'vat' }, { key: 'name' }, { key: 'skip' }],
      records: [{ vat: '094014201', name: 'Damask', skip: 'x' }, { vat: '999', name: 'B', skip: 'y' }],
    }
    const mappings = [
      { sourceKey: 'vat', fieldKey: 'afm' },
      { sourceKey: 'name', fieldKey: 'name' },
      { sourceKey: 'skip', fieldKey: '' }, // ignored
    ]
    const rows = mapToRows(batch, mappings, partner)
    expect(rows).toEqual([
      { rowNum: 1, values: { afm: '094014201', name: 'Damask' } },
      { rowNum: 2, values: { afm: '999', name: 'B' } },
    ])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingestion-map.test.ts`
Expected: FAIL ("Cannot find module '@/lib/ingestion/map'").

- [ ] **Step 3: Implement `map.ts`**

```ts
// src/lib/ingestion/map.ts — ISOMORPHIC, pure
import { normalizeHeader } from '@/lib/import/targets'
import type { IngestionTarget } from './target'
import type { NormalizedBatch, RawIngestionRow } from './normalized'

export type IngestionMapping = { sourceKey: string; fieldKey: string } // fieldKey '' = παράβλεψη

/** Fuzzy match ενός source key σε field key/label/aliases (accent/case-insensitive). '' αν τίποτα σίγουρο. */
export function autoMatchField(sourceKey: string, target: IngestionTarget): string {
  const norm = normalizeHeader(sourceKey)
  if (!norm) return ''
  for (const f of target.fields) {
    const candidates = [f.key, f.label, ...(f.aliases ?? [])].map(normalizeHeader)
    if (candidates.includes(norm)) return f.key
  }
  for (const f of target.fields) {
    const candidates = [f.key, f.label, ...(f.aliases ?? [])].map(normalizeHeader)
    if (candidates.some(c => c && (c.includes(norm) || norm.includes(c)))) return f.key
  }
  return ''
}

export function autoMatchMappings(sourceKeys: string[], target: IngestionTarget): IngestionMapping[] {
  return sourceKeys.map(sourceKey => ({ sourceKey, fieldKey: autoMatchField(sourceKey, target) }))
}

/** Κάθε record → { rowNum, values: fieldKey→raw } βάσει των mappings. rowNum 1-based. */
export function mapToRows(batch: NormalizedBatch, mappings: IngestionMapping[], _target: IngestionTarget): RawIngestionRow[] {
  const active = mappings.filter(m => m.fieldKey)
  return batch.records.map((rec, i) => {
    const values: Record<string, string> = {}
    for (const m of active) {
      const v = rec[m.sourceKey]
      if (v != null) values[m.fieldKey] = v
    }
    return { rowNum: i + 1, values }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ingestion-map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/map.ts tests/ingestion-map.test.ts
git commit -m "feat(ingestion): pure map stage (auto-match + mapToRows)"
```

---

## Task 3: `validate.ts` — per-field parse + required + duplicate uniqueBy (pure)

**Files:**
- Create: `src/lib/ingestion/validate.ts`
- Test: `tests/ingestion-validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingestion-validate.test.ts
import { describe, it, expect } from 'vitest'
import { validateRows } from '@/lib/ingestion/validate'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'

const partner = ingestionTargetByKey('partner')!

describe('validateRows', () => {
  it('parses valid rows and reports parsed values keyed by fieldKey', () => {
    const rows = [{ rowNum: 1, values: { afm: 'EL094014201', name: 'Damask', email: 'a@b.gr' } }]
    const { parsed, errors } = validateRows(rows, partner)
    expect(errors).toEqual([])
    expect(parsed[0]).toMatchObject({ rowNum: 1, ok: true, data: { afm: '094014201', name: 'Damask', email: 'a@b.gr', sodtype: 13 } })
  })

  it('flags missing required + bad formats with Greek cause+fix', () => {
    const rows = [{ rowNum: 1, values: { afm: '12', email: 'nope' } }] // name missing, afm short, email bad
    const { errors } = validateRows(rows, partner)
    const cols = errors.map(e => e.column)
    expect(cols).toContain('Επωνυμία')
    expect(cols).toContain('ΑΦΜ')
    expect(cols).toContain('Email')
  })

  it('flags duplicate uniqueBy within the batch (keeps first clean)', () => {
    const rows = [
      { rowNum: 1, values: { afm: '094014201', name: 'A' } },
      { rowNum: 2, values: { afm: '094014201', name: 'B' } },
    ]
    const { errors } = validateRows(rows, partner)
    const dup = errors.find(e => e.row === 2 && /ΑΦΜ/i.test(e.column))
    expect(dup?.message).toMatch(/διπλότυπ/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingestion-validate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `validate.ts`**

```ts
// src/lib/ingestion/validate.ts — ISOMORPHIC, pure
import type { FieldError } from '@/lib/import/targets'
import type { IngestionTarget } from './target'
import type { RawIngestionRow } from './normalized'

export type ParsedRow =
  | { rowNum: number; ok: true; data: Record<string, unknown> }
  | { rowNum: number; ok: false; errors: FieldError[] }

export type ValidateResult = { parsed: ParsedRow[]; errors: FieldError[] }

function parseRowAgainstTarget(rowNum: number, raw: Record<string, string>, target: IngestionTarget): ParsedRow {
  const errors: FieldError[] = []
  const data: Record<string, unknown> = {}
  for (const field of target.fields) {
    const cell = raw[field.key] ?? ''
    const result = field.parse(cell)
    if (result.error) errors.push({ row: rowNum, column: field.label, message: result.error })
    else data[field.key] = result.value
  }
  return errors.length > 0 ? { rowNum, ok: false, errors } : { rowNum, ok: true, data }
}

export function validateRows(rows: RawIngestionRow[], target: IngestionTarget): ValidateResult {
  const parsed = rows.map(r => parseRowAgainstTarget(r.rowNum, r.values, target))
  const errors: FieldError[] = parsed.flatMap(p => (p.ok ? [] : p.errors))

  // duplicate uniqueBy within batch — pin the field label for the error column
  const uniqueField = target.fields.find(f => f.key === target.uniqueBy)
  const uniqueLabel = uniqueField?.label ?? target.uniqueBy
  const firstSeen = new Map<string, number>()
  for (const p of parsed) {
    if (!p.ok) continue
    const key = String(p.data[target.uniqueBy] ?? '')
    if (!key) continue
    const seen = firstSeen.get(key)
    if (seen) errors.push({ row: p.rowNum, column: uniqueLabel, message: `Διπλότυπη τιμή «${key}» μέσα στο batch (ήδη στη γραμμή ${seen}).` })
    else firstSeen.set(key, p.rowNum)
  }
  return { parsed, errors }
}

export function validationSummary(result: ValidateResult): { valid: number; invalid: number; errors: number } {
  const valid = result.parsed.filter(p => p.ok).length
  return { valid, invalid: result.parsed.length - valid, errors: result.errors.length }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ingestion-validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/validate.ts tests/ingestion-validate.test.ts
git commit -m "feat(ingestion): pure validate stage (parse + required + dup uniqueBy)"
```

---

## Task 4: `ocr-project.ts` — ExtractedDocument → flat records (pure)

**Files:**
- Create: `src/lib/ingestion/ocr-project.ts`
- Test: `tests/ingestion-ocr-project.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingestion-ocr-project.test.ts
import { describe, it, expect } from 'vitest'
import { projectOcr } from '@/lib/ingestion/ocr-project'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { emptyExtractedDocument } from '@/lib/ocr/schema'

const product = ingestionTargetByKey('product')!
const partner = ingestionTargetByKey('partner')!

describe('projectOcr', () => {
  it('project "lines" → one record per invoice line', () => {
    const doc = { ...emptyExtractedDocument('invoice'), lines: [
      { description: 'Πολυθρόνα', quantity: 2, unitPrice: 120.5, vatPct: 24, total: 241 },
      { description: 'Τραπέζι', quantity: 1, unitPrice: 300, vatPct: 24, total: 300 },
    ] }
    const { sourceKeys, records } = projectOcr(doc, product)
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ name: 'Πολυθρόνα', quantity: '2', unitPrice: '120.5' })
    expect(sourceKeys.map(s => s.key)).toEqual(expect.arrayContaining(['name', 'quantity', 'unitPrice', 'vatPct', 'total']))
  })

  it('project "party" → one record from issuer (phones/emails joined to first)', () => {
    const doc = { ...emptyExtractedDocument('invoice'), issuer: {
      name: 'Damask AE', afm: 'EL094014201', address: 'Οδός 1', phones: ['2101234567', '2107654321'],
      emails: ['info@damask.gr'], website: 'damask.gr',
    } }
    const { records } = projectOcr(doc, partner)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ name: 'Damask AE', afm: 'EL094014201', phone: '2101234567', email: 'info@damask.gr', website: 'damask.gr', sodtype: '12' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingestion-ocr-project.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ocr-project.ts`**

```ts
// src/lib/ingestion/ocr-project.ts — ISOMORPHIC, pure
import type { ExtractedDocument } from '@/lib/ocr/schema'
import type { IngestionTarget } from './target'
import type { SourceRecord } from './normalized'

function str(v: unknown): string { return v == null ? '' : String(v) }

export function projectOcr(doc: ExtractedDocument, target: IngestionTarget): { sourceKeys: { key: string; sample?: string }[]; records: SourceRecord[] } {
  const projection = target.ocr?.project ?? 'lines'

  if (projection === 'party') {
    const p = doc.issuer
    const rec: SourceRecord = {
      name: str(p.name), afm: str(p.afm), address: str(p.address),
      phone: str(p.phones[0] ?? ''), email: str(p.emails[0] ?? ''), website: str(p.website),
      sodtype: '12', // εκδότης παραστατικού αγοράς = Προμηθευτής
    }
    const keys = Object.keys(rec)
    return { sourceKeys: keys.map(k => ({ key: k, sample: rec[k] || undefined })), records: [rec] }
  }

  // 'lines' → N προϊόντα
  const records: SourceRecord[] = doc.lines.map(l => ({
    name: str(l.description), quantity: str(l.quantity), unitPrice: str(l.unitPrice),
    vatPct: str(l.vatPct), total: str(l.total),
  }))
  const keys = ['name', 'quantity', 'unitPrice', 'vatPct', 'total']
  const sample = records[0]
  return { sourceKeys: keys.map(k => ({ key: k, sample: sample?.[k] || undefined })), records }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ingestion-ocr-project.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/ocr-project.ts tests/ingestion-ocr-project.test.ts
git commit -m "feat(ingestion): OCR projection (party/lines → flat records)"
```

---

## Task 5: `api-normalize.ts` — JSON → flat records + SSRF guard (pure)

**Files:**
- Create: `src/lib/ingestion/api-normalize.ts`
- Test: `tests/ingestion-api-normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingestion-api-normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeApiJson, assertSafeIngestUrl } from '@/lib/ingestion/api-normalize'

describe('normalizeApiJson', () => {
  it('accepts a top-level array', () => {
    const r = normalizeApiJson([{ a: '1', b: 2 }, { a: '3' }])
    expect(r.records).toEqual([{ a: '1', b: '2' }, { a: '3' }])
    expect(r.sourceKeys.map(s => s.key)).toEqual(['a', 'b'])
  })
  it('unwraps {data:[…]} and {items:[…]}', () => {
    expect(normalizeApiJson({ data: [{ x: 1 }] }).records).toEqual([{ x: '1' }])
    expect(normalizeApiJson({ items: [{ y: 'z' }] }).records).toEqual([{ y: 'z' }])
  })
  it('wraps a single object into one record', () => {
    expect(normalizeApiJson({ name: 'A', afm: '1' }).records).toEqual([{ name: 'A', afm: '1' }])
  })
  it('drops nested objects/arrays (flat only) and stringifies scalars', () => {
    const r = normalizeApiJson([{ a: 1, nested: { x: 1 }, arr: [1], nil: null }])
    expect(r.records[0]).toEqual({ a: '1' })
  })
  it('throws on unrecognizable shapes', () => {
    expect(() => normalizeApiJson('hello')).toThrow()
    expect(() => normalizeApiJson(42)).toThrow()
  })
})

describe('assertSafeIngestUrl', () => {
  it('rejects non-https, localhost, and private ranges', () => {
    expect(() => assertSafeIngestUrl('http://example.com')).toThrow()
    expect(() => assertSafeIngestUrl('https://localhost/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://127.0.0.1/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://10.0.0.5/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://192.168.1.1/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://169.254.1.1/x')).toThrow()
  })
  it('accepts a public https url', () => {
    expect(() => assertSafeIngestUrl('https://api.example.com/v1/data')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingestion-api-normalize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `api-normalize.ts`**

```ts
// src/lib/ingestion/api-normalize.ts — ISOMORPHIC, pure
import type { SourceRecord } from './normalized'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Scalar → string. Nested object/array/null/undefined → παραλείπεται (flat only v1). */
function toRecord(o: Record<string, unknown>): SourceRecord {
  const rec: SourceRecord = {}
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    rec[k] = String(v)
  }
  return rec
}

export function normalizeApiJson(json: unknown): { sourceKeys: { key: string; sample?: string }[]; records: SourceRecord[] } {
  let list: unknown[]
  if (Array.isArray(json)) list = json
  else if (isPlainObject(json) && Array.isArray(json.data)) list = json.data
  else if (isPlainObject(json) && Array.isArray(json.items)) list = json.items
  else if (isPlainObject(json)) list = [json]
  else throw new Error('Η απάντηση δεν ήταν έγκυρο JSON αντικείμενο/λίστα.')

  const records = list.filter(isPlainObject).map(toRecord)
  if (records.length === 0) throw new Error('Δεν βρέθηκαν εγγραφές στην απάντηση.')

  const keySet = new Set<string>()
  for (const r of records) for (const k of Object.keys(r)) keySet.add(k)
  const first = records[0]
  const sourceKeys = [...keySet].map(k => ({ key: k, sample: first[k] || undefined }))
  return { sourceKeys, records }
}

/** SSRF guard: μόνο https + δημόσιος host. Πετάει με ελληνικό μήνυμα σε παραβίαση. */
export function assertSafeIngestUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('Μη έγκυρο URL.') }
  if (u.protocol !== 'https:') throw new Error('Επιτρέπονται μόνο https διευθύνσεις.')
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') throw new Error('Δεν επιτρέπεται localhost.')
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const priv =
      a === 10 || a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    if (priv) throw new Error('Δεν επιτρέπονται ιδιωτικές/loopback διευθύνσεις IP.')
  }
  return u
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ingestion-api-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/api-normalize.ts tests/ingestion-api-normalize.test.ts
git commit -m "feat(ingestion): API JSON normalize + SSRF guard"
```

---

## Task 6: Commit registry — product reuse + partner upsert

**Files:**
- Create: `src/lib/ingestion/commit/partner-upsert.ts` (server-only)
- Create: `src/lib/ingestion/commit/index.ts` (server-only)
- Test: `tests/ingestion-partner-prep.test.ts`

> `partner-upsert.ts` contains a **pure prep function** (testable, no DB) plus a server upsert that uses prisma. Only the prep function is unit-tested; the DB path is exercised in the Task 15 e2e.

- [ ] **Step 1: Write the failing test (pure prep only)**

```ts
// tests/ingestion-partner-prep.test.ts
import { describe, it, expect } from 'vitest'
import { preparePartnerRows } from '@/lib/ingestion/commit/partner-upsert'

describe('preparePartnerRows', () => {
  it('maps parsed fields to Trdr create-data with first phone/email + default sodtype', () => {
    const parsed = [{ rowNum: 1, ok: true as const, data: { afm: '094014201', name: 'Damask', address: 'Οδός 1', city: 'Αθήνα', zip: '11111', phone: '2101234567', email: 'info@damask.gr', website: 'damask.gr', sodtype: 12 } }]
    const prepared = preparePartnerRows(parsed)
    expect(prepared).toEqual([{ rowNum: 1, afm: '094014201', data: {
      NAME: 'Damask', AFM: '094014201', ADDRESS: 'Οδός 1', CITY: 'Αθήνα', ZIP: '11111',
      PHONE01: '2101234567', EMAIL: 'info@damask.gr', WEBPAGE: 'damask.gr', SODTYPE: 12,
    } }])
  })
  it('skips invalid rows and nulls empty optionals', () => {
    const parsed = [
      { rowNum: 1, ok: false as const, errors: [] },
      { rowNum: 2, ok: true as const, data: { afm: '999999999', name: 'B', sodtype: 13 } },
    ]
    const prepared = preparePartnerRows(parsed)
    expect(prepared).toHaveLength(1)
    expect(prepared[0].data).toMatchObject({ NAME: 'B', AFM: '999999999', ADDRESS: null, PHONE01: null, SODTYPE: 13 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingestion-partner-prep.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `partner-upsert.ts`**

```ts
// src/lib/ingestion/commit/partner-upsert.ts — SERVER-ONLY (imports prisma)
import { prisma } from '@/lib/prisma'
import { emptyTotals, type ImportTotals } from '@/lib/import/product-upsert'
import type { ParsedRow } from '@/lib/ingestion/validate'

const str = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

export type PreparedPartner = {
  rowNum: number
  afm: string
  data: {
    NAME: string; AFM: string | null; ADDRESS: string | null; CITY: string | null; ZIP: string | null
    PHONE01: string | null; EMAIL: string | null; WEBPAGE: string | null; SODTYPE: number
  }
}

/** PURE: parsed valid rows → Trdr write-data. Άκυρες γραμμές παραλείπονται. */
export function preparePartnerRows(parsed: ParsedRow[]): PreparedPartner[] {
  const out: PreparedPartner[] = []
  for (const p of parsed) {
    if (!p.ok) continue
    const d = p.data
    const afm = String(d.afm ?? '')
    out.push({
      rowNum: p.rowNum, afm,
      data: {
        NAME: String(d.name ?? ''), AFM: str(d.afm), ADDRESS: str(d.address), CITY: str(d.city), ZIP: str(d.zip),
        PHONE01: str(d.phone), EMAIL: str(d.email), WEBPAGE: str(d.website),
        SODTYPE: typeof d.sodtype === 'number' ? d.sodtype : 13,
      },
    })
  }
  return out
}

/** SERVER: upsert σε Trdr by AFM (AFM δεν είναι @unique → findFirst + create/update). TRDR=null (μη συγχρονισμένο). */
export async function runPartnerUpsert(parsed: ParsedRow[]): Promise<ImportTotals> {
  const prepared = preparePartnerRows(parsed)
  const totals = emptyTotals(parsed.length)
  totals.failed = parsed.length - prepared.length
  for (const row of prepared) {
    try {
      const existing = row.afm ? await prisma.trdr.findFirst({ where: { AFM: row.afm } }) : null
      if (existing) {
        await prisma.trdr.update({ where: { id: existing.id }, data: row.data })
        totals.updated++
      } else {
        await prisma.trdr.create({ data: { ...row.data, TRDR: null, ISPROSP: 0 } })
        totals.created++
      }
      totals.processed++
    } catch (err) {
      totals.failed++
      if (totals.errors.length < 50) totals.errors.push({ row: row.rowNum, column: 'Συναλλασσόμενος', message: err instanceof Error ? err.message : 'Σφάλμα αποθήκευσης.' })
    }
  }
  return totals
}
```

- [ ] **Step 4: Implement `commit/index.ts`**

```ts
// src/lib/ingestion/commit/index.ts — SERVER-ONLY
import { runProductImport, type ImportTotals } from '@/lib/import/product-upsert'
import type { RawImportRow } from '@/lib/import/targets'
import { validateRows } from '@/lib/ingestion/validate'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { runPartnerUpsert } from './partner-upsert'

/** targetKey → commit fn. Δέχεται RawImportRow[] (fieldKey→string) — ό,τι παράγει το map stage. */
export const COMMIT_REGISTRY: Record<string, (rows: RawImportRow[]) => Promise<ImportTotals>> = {
  product: (rows) => runProductImport(rows),
  partner: (rows) => {
    const target = ingestionTargetByKey('partner')!
    return runPartnerUpsert(validateRows(rows, target).parsed)
  },
}

export function commitFor(targetKey: string) {
  return COMMIT_REGISTRY[targetKey] ?? null
}
```

> Note: `runProductImport(rows: RawImportRow[]): Promise<ImportTotals>` — confirm the exact signature at `src/lib/import/product-upsert.ts:165` and match it (it already parses+upserts products by `code`). Partner path re-runs `validateRows` server-side (never trust client-parsed values) before writing.

- [ ] **Step 5: Run to verify prep test passes**

Run: `npx vitest run tests/ingestion-partner-prep.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingestion/commit tests/ingestion-partner-prep.test.ts
git commit -m "feat(ingestion): commit registry (product reuse + partner upsert)"
```

---

## Task 7: Thread OCR token usage into `extractDocument`

**Files:**
- Modify: `src/lib/ocr/extract.ts` (add `tokensUsed` to `ExtractResult` + `resolveAiCall`)
- Test: `tests/ocr-extract-tokens.test.ts`

> `geminiGenerate` already returns `tokensUsed` (total). `generateText` (deepseek fallback) does not expose tokens → `tokensUsed: null` on that path (acceptable v1; cost shows «μη διαθέσιμο»).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ocr-extract-tokens.test.ts
import { describe, it, expect } from 'vitest'
import type { ExtractResult } from '@/lib/ocr/extract'

describe('ExtractResult shape', () => {
  it('includes tokensUsed (number|null)', () => {
    const r: ExtractResult = {
      data: {} as ExtractResult['data'], mismatches: [], model: 'gemini-2.5-flash', usedFallback: false, tokensUsed: 1234,
    }
    expect(r.tokensUsed).toBe(1234)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ocr-extract-tokens.test.ts`
Expected: FAIL (`tokensUsed` not on `ExtractResult`).

- [ ] **Step 3: Modify `extract.ts`**

Add `tokensUsed` to the `ExtractResult` interface:
```ts
export interface ExtractResult {
  data: ExtractedDocument
  mismatches: MismatchFlag[]
  model: string
  usedFallback: boolean
  /** Συνολικά tokens της κλήσης (από Gemini usageMetadata)· null στο deepseek text fallback. */
  tokensUsed: number | null
}
```

In `resolveAiCall`, return `tokensUsed` from each branch (Gemini result already has `.tokensUsed`; deepseek path → null):
```ts
): Promise<{ rawText: string; model: string; usedFallback: boolean; tokensUsed: number | null }> {
```
Gemini branch:
```ts
    return { rawText: result.text, model: result.model, usedFallback: false, tokensUsed: result.tokensUsed }
```
DeepSeek branch:
```ts
  return { rawText, model: 'deepseek (text fallback)', usedFallback: true, tokensUsed: null }
```

In `extractDocument`, thread it through:
```ts
  const { rawText, model, usedFallback, tokensUsed } = await resolveAiCall(prompt, input)
  // …
  return { data, mismatches, model, usedFallback, tokensUsed }
```

- [ ] **Step 4: Run to verify it passes + existing OCR tests still pass**

Run: `npx vitest run tests/ocr-extract-tokens.test.ts tests/ocr-extract.test.ts`
Expected: PASS (update any `ExtractResult` fixtures in `tests/ocr-extract.test.ts` to include `tokensUsed` if the compiler flags them).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ocr/extract.ts tests/ocr-extract-tokens.test.ts
git commit -m "feat(ocr): expose tokensUsed on ExtractResult for cost display"
```

---

## Task 8: Role-gated OCR cost view (server helper)

**Files:**
- Create: `src/lib/ingestion/ocr-cost.ts` (server — reads settings/fx)
- Test: `tests/ingestion-ocr-cost.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingestion-ocr-cost.test.ts
import { describe, it, expect } from 'vitest'
import { providerFromModel, buildOcrCostView } from '@/lib/ingestion/ocr-cost'

describe('providerFromModel', () => {
  it('maps model id → provider', () => {
    expect(providerFromModel('gemini-2.5-flash')).toBe('gemini')
    expect(providerFromModel('deepseek (text fallback)')).toBe('deepseek')
    expect(providerFromModel('claude-opus-4-8')).toBe('claude')
    expect(providerFromModel('mystery')).toBe('other')
  })
})

describe('buildOcrCostView (pure core)', () => {
  const args = { model: 'gemini-2.5-flash', costUsd: 0.10, markupPct: 20, usdToEur: 0.9 }
  it('SUPER_ADMIN sees breakdown + final eur', () => {
    const v = buildOcrCostView('SUPER_ADMIN', args)
    expect(v).toMatchObject({ model: 'gemini-2.5-flash', showAmount: true, showBreakdown: true })
    expect(v.finalEur).toBeCloseTo(0.10 * 1.2 * 0.9, 6)
    expect(v.baseUsd).toBeCloseTo(0.10, 6)
  })
  it('ADMIN sees final eur, no breakdown', () => {
    const v = buildOcrCostView('ADMIN', args)
    expect(v).toMatchObject({ showAmount: true, showBreakdown: false })
    expect(v.baseUsd).toBeUndefined()
  })
  it('role without costs.view sees only the model name', () => {
    const v = buildOcrCostView('SALES', args)
    expect(v).toMatchObject({ model: 'gemini-2.5-flash', showAmount: false, showBreakdown: false })
    expect(v.finalEur).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingestion-ocr-cost.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ocr-cost.ts`**

```ts
// src/lib/ingestion/ocr-cost.ts
import { applyMarkup, markupPctForProvider, loadAiMarkup, DEFAULT_USD_TO_EUR_FALLBACK } from '@/lib/ai/markup'
import { getUsdToEurLatest } from '@/lib/ai/fx'
import { computeCostAsync } from '@/lib/ai/pricing'

export function providerFromModel(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('gemini')) return 'gemini'
  if (m.includes('deepseek')) return 'deepseek'
  if (m.includes('claude') || m.includes('anthropic')) return 'claude'
  return 'other'
}

export type OcrCostView = {
  model: string
  showAmount: boolean
  showBreakdown: boolean
  baseUsd?: number
  markupPct?: number
  finalEur?: number
}

/** Ρόλοι που βλέπουν ποσό. SUPER_ADMIN βλέπει και breakdown. Ίδιο gating με /costs (costs.view). */
const ROLES_WITH_AMOUNT = new Set(['SUPER_ADMIN', 'ADMIN'])

/** PURE core — δέχεται ήδη-φορτωμένα markup/fx (δες buildOcrCostViewForSession για το DB wiring). */
export function buildOcrCostView(role: string, args: { model: string; costUsd: number | null; markupPct: number; usdToEur: number }): OcrCostView {
  const showAmount = ROLES_WITH_AMOUNT.has(role) && args.costUsd != null
  if (!showAmount) return { model: args.model, showAmount: false, showBreakdown: false }
  const finalUsd = applyMarkup(args.costUsd!, args.markupPct)
  const finalEur = finalUsd * args.usdToEur
  const showBreakdown = role === 'SUPER_ADMIN'
  return {
    model: args.model, showAmount: true, showBreakdown,
    finalEur,
    ...(showBreakdown ? { baseUsd: args.costUsd!, markupPct: args.markupPct } : {}),
  }
}

/** SERVER wiring: model+tokensUsed → costUsd (pricing) + markup/fx (settings) → role-gated view. */
export async function buildOcrCostViewForSession(role: string, model: string, tokensUsed: number | null): Promise<OcrCostView> {
  const costUsd = tokensUsed == null ? null : (await computeCostAsync(model, { total: tokensUsed })).totalCost
  const markup = await loadAiMarkup()
  const markupPct = markupPctForProvider(markup, providerFromModel(model))
  const usdToEur = await getUsdToEurLatest(markup.usdToEur ?? DEFAULT_USD_TO_EUR_FALLBACK)
  return buildOcrCostView(role, { model, costUsd, markupPct, usdToEur })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ingestion-ocr-cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/ocr-cost.ts tests/ingestion-ocr-cost.test.ts
git commit -m "feat(ingestion): role-gated OCR cost view helper"
```

---

## Task 9: Excel source adapter (client)

**Files:**
- Create: `src/lib/ingestion/sources/excel.ts`
- Test: `tests/ingestion-excel-source.test.ts`

- [ ] **Step 1: Write the failing test (pure transform, no File API)**

```ts
// tests/ingestion-excel-source.test.ts
import { describe, it, expect } from 'vitest'
import { rowsToBatch } from '@/lib/ingestion/sources/excel'

describe('rowsToBatch', () => {
  it('builds a NormalizedBatch from headers + data rows (excluded cols dropped)', () => {
    const headers = ['Κωδικός', 'Ονομασία', '']
    const rows = [
      { rowNum: 2, cells: ['DM-1', 'Πολυθρόνα', 'x'] },
      { rowNum: 3, cells: ['DM-2', 'Τραπέζι', 'y'] },
    ]
    const batch = rowsToBatch(headers, rows, { fileName: 'a.xlsx', sheet: 'Sheet1', excluded: [2] })
    expect(batch.source).toBe('excel')
    expect(batch.sourceKeys.map(s => s.key)).toEqual(['Κωδικός', 'Ονομασία'])
    expect(batch.records).toEqual([
      { 'Κωδικός': 'DM-1', 'Ονομασία': 'Πολυθρόνα' },
      { 'Κωδικός': 'DM-2', 'Ονομασία': 'Τραπέζι' },
    ])
    expect(batch.meta?.excel).toEqual({ fileName: 'a.xlsx', sheet: 'Sheet1' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingestion-excel-source.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `sources/excel.ts`**

```ts
// src/lib/ingestion/sources/excel.ts — client (pure transform + a File helper)
import { readWorkbookFromFile, colIndexToLetter } from '@/lib/import/xlsx-parse'
import type { NormalizedBatch, SourceRecord } from '@/lib/ingestion/normalized'

/** PURE: headers + data rows → NormalizedBatch. Στήλες με κενό header ή στο `excluded` (0-based) παραλείπονται. */
export function rowsToBatch(
  headers: (string | null)[],
  rows: { rowNum: number; cells: (string | null)[] }[],
  opts: { fileName: string; sheet: string; excluded?: number[] },
): NormalizedBatch {
  const excluded = new Set(opts.excluded ?? [])
  const kept = headers
    .map((h, idx) => ({ idx, key: (h ?? '').trim() }))
    .filter(c => c.key !== '' && !excluded.has(c.idx))

  const records: SourceRecord[] = rows.map(r => {
    const rec: SourceRecord = {}
    for (const c of kept) {
      const v = r.cells[c.idx]
      if (v != null && String(v).trim() !== '') rec[c.key] = String(v)
    }
    return rec
  })
  const first = rows[0]
  const sourceKeys = kept.map(c => ({ key: c.key, sample: first ? (first.cells[c.idx] ?? undefined) as string | undefined : undefined }))
  return { source: 'excel', sourceKeys, records, meta: { excel: { fileName: opts.fileName, sheet: opts.sheet } } }
}

/** Client helper: File → sheet name → { headers, rows } via SheetJS, ready for rowsToBatch. */
export async function readSheet(file: File, sheetName: string, headerRow = 1): Promise<{ headers: (string | null)[]; rows: { rowNum: number; cells: (string | null)[] }[] }> {
  const wb = await readWorkbookFromFile(file)
  const ws = wb.Sheets[sheetName]
  // Reuse the same aoa extraction the import wizard uses; see step-sheet.tsx for reference.
  const XLSX = await import('xlsx')
  const aoa = XLSX.utils.sheet_to_json<(string | null)[]>(ws, { header: 1, raw: true, defval: null })
  const headers = (aoa[headerRow - 1] ?? []).map(v => (v == null ? '' : String(v)))
  const rows = aoa.slice(headerRow).map((cells, i) => ({
    rowNum: headerRow + 1 + i,
    cells: headers.map((_, ci) => { const v = cells[ci]; return v == null ? null : String(v) }),
  }))
  void colIndexToLetter // keep import consistent with existing util surface
  return { headers, rows }
}
```

> Reference `src/app/(app)/import/step-sheet.tsx` for the exact header-row / column-info extraction already in use, and mirror it if it diverges from the helper above.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ingestion-excel-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/sources/excel.ts tests/ingestion-excel-source.test.ts
git commit -m "feat(ingestion): Excel source adapter (rowsToBatch + readSheet)"
```

---

## Task 10: Server actions (acquire API/OCR, validate, commit, presets)

**Files:**
- Create: `src/lib/ingestion/actions.ts` (`'use server'`)
- Test: `tests/ingestion-actions-guard.test.ts` (guards only; network/DB paths covered by e2e)

> Before writing this file, read `node_modules/next/dist/docs/` for the current server-actions guidance in this Next version. Mirror the auth/`requirePermission` pattern from `src/lib/ocr/customer-actions.ts`.

- [ ] **Step 1: Write the failing test (SSRF guard is exported & enforced)**

```ts
// tests/ingestion-actions-guard.test.ts
import { describe, it, expect } from 'vitest'
import { assertSafeIngestUrl } from '@/lib/ingestion/api-normalize'

describe('acquireFromApi uses the SSRF guard', () => {
  it('guard throws for private targets (contract the action relies on)', () => {
    expect(() => assertSafeIngestUrl('https://10.1.2.3/data')).toThrow()
    expect(() => assertSafeIngestUrl('https://public.example.com/data')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it passes (guard already exists from Task 5)**

Run: `npx vitest run tests/ingestion-actions-guard.test.ts`
Expected: PASS. (This test locks the guard contract the action depends on.)

- [ ] **Step 3: Implement `actions.ts`**

```ts
// src/lib/ingestion/actions.ts
'use server'

import { requirePermission } from '@/lib/rbac-server'
import { getSetting, setSetting } from '@/lib/settings'
import { extractDocument } from '@/lib/ocr/extract'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { projectOcr } from '@/lib/ingestion/ocr-project'
import { normalizeApiJson, assertSafeIngestUrl } from '@/lib/ingestion/api-normalize'
import { buildOcrCostViewForSession, type OcrCostView } from '@/lib/ingestion/ocr-cost'
import { validateRows } from '@/lib/ingestion/validate'
import { commitFor } from '@/lib/ingestion/commit'
import type { NormalizedBatch } from '@/lib/ingestion/normalized'
import type { IngestionMapping } from '@/lib/ingestion/map'
import { mapToRows } from '@/lib/ingestion/map'
import type { ImportTotals } from '@/lib/import/product-upsert'
import type { FieldError } from '@/lib/import/targets'

const MAX_BYTES = 2_000_000
const MAX_RECORDS = 2000
const TIMEOUT_MS = 15_000

async function requireTarget(targetKey: string) {
  const target = ingestionTargetByKey(targetKey)
  if (!target) throw new Error('Άγνωστο αντικείμενο καταχώρισης.')
  const session = await requirePermission(target.permission)
  return { target, session }
}

export type AcquireOcrResult = { batch: NormalizedBatch; cost: OcrCostView }

export async function acquireFromOcr(
  targetKey: string,
  input: { images: { base64: string; mimeType: string }[]; text?: string },
): Promise<AcquireOcrResult> {
  const { target, session } = await requireTarget(targetKey)
  const result = await extractDocument({
    images: input.images, text: input.text,
    docType: target.ocr?.docTypeHint, refType: 'ocr', userId: session.user.id,
  })
  const { sourceKeys, records } = projectOcr(result.data, target)
  const cost = await buildOcrCostViewForSession(session.user.role, result.model, result.tokensUsed)
  const costUsd = cost.showBreakdown ? cost.baseUsd ?? 0 : 0
  const batch: NormalizedBatch = {
    source: 'ocr', sourceKeys, records,
    meta: { ocr: { model: result.model, usedFallback: result.usedFallback, costUsd, mismatches: result.mismatches } },
  }
  return { batch, cost }
}

export async function acquireFromApi(targetKey: string, url: string, headerName?: string, headerValue?: string): Promise<NormalizedBatch> {
  await requireTarget(targetKey)
  const safe = assertSafeIngestUrl(url)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (headerName && headerValue) headers[headerName] = headerValue

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let json: unknown
  try {
    const res = await fetch(safe.toString(), { headers, signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`Το endpoint απάντησε HTTP ${res.status}.`)
    const text = await res.text()
    if (text.length > MAX_BYTES) throw new Error('Η απάντηση είναι πολύ μεγάλη.')
    json = JSON.parse(text)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('Το endpoint δεν απάντησε (timeout).')
    if (err instanceof SyntaxError) throw new Error('Η απάντηση δεν ήταν έγκυρο JSON.')
    throw err
  } finally {
    clearTimeout(timer)
  }
  const { sourceKeys, records } = normalizeApiJson(json)
  if (records.length > MAX_RECORDS) throw new Error(`Πολλές εγγραφές (max ${MAX_RECORDS}).`)
  return { source: 'api', sourceKeys, records, meta: { api: { url: safe.toString(), fetchedAt: 0, count: records.length } } }
}

export type ValidateBatchResult = { toCreate: number; toUpdate: number; errors: FieldError[]; validRows: number }

export async function validateBatch(targetKey: string, batch: NormalizedBatch, mappings: IngestionMapping[]): Promise<ValidateBatchResult> {
  const { target } = await requireTarget(targetKey)
  const rows = mapToRows(batch, mappings, target)
  const { parsed, errors } = validateRows(rows, target)
  const validRows = parsed.filter(p => p.ok).length
  // toCreate/toUpdate distinction needs DB; approximate here as valid rows (exact split computed at commit).
  return { toCreate: validRows, toUpdate: 0, errors, validRows }
}

export async function commitBatch(targetKey: string, batch: NormalizedBatch, mappings: IngestionMapping[]): Promise<ImportTotals> {
  const { target } = await requireTarget(targetKey)
  const commit = commitFor(targetKey)
  if (!commit) throw new Error('Δεν υπάρχει διαθέσιμη αποθήκευση για αυτό το αντικείμενο.')
  const rows = mapToRows(batch, mappings, target)
  return commit(rows)
}

// ── API presets (saved endpoints ανά target) ──
export type ApiPreset = { name: string; url: string; headerName?: string }

export async function listApiPresets(targetKey: string): Promise<ApiPreset[]> {
  await requireTarget(targetKey)
  return (await getSetting<ApiPreset[]>(`ingestion.apiPresets:${targetKey}`)) ?? []
}

export async function saveApiPreset(targetKey: string, preset: ApiPreset): Promise<ApiPreset[]> {
  await requireTarget(targetKey)
  assertSafeIngestUrl(preset.url)
  const list = (await getSetting<ApiPreset[]>(`ingestion.apiPresets:${targetKey}`)) ?? []
  const next = [...list.filter(p => p.name !== preset.name), { name: preset.name, url: preset.url, headerName: preset.headerName }]
  await setSetting(`ingestion.apiPresets:${targetKey}`, next)
  return next
}
```

> `session.user.id` / `session.user.role` come from `requirePermission`'s returned `Session` — confirm field names against `src/lib/rbac-server.ts` and the auth session type. Preset header **values (tokens) are never persisted** (only `headerName`), so secrets never land in a `Setting` row or client bundle.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/actions.ts tests/ingestion-actions-guard.test.ts
git commit -m "feat(ingestion): server actions (acquire OCR/API, validate, commit, presets)"
```

---

## Task 11: `IngestDrawer` shell + step chrome (UI)

**Files:**
- Create: `src/components/ingestion/ingest-drawer.tsx` (`'use client'`)
- Create: `src/components/ingestion/types.ts`

> UI task — mirror `src/app/(app)/import/import-wizard.tsx` for the glass stepper and `canProceed` gating; use base-ui Dialog rendered as a right-side sheet (`render=`, not `asChild`), Steel & Frost skin, `react-icons/lu`. All strings Greek.

- [ ] **Step 1: Define the wizard state type**

```ts
// src/components/ingestion/types.ts
import type { NormalizedBatch } from '@/lib/ingestion/normalized'
import type { IngestionMapping } from '@/lib/ingestion/map'
import type { OcrCostView } from '@/lib/ingestion/ocr-cost'
import type { FieldError } from '@/lib/import/targets'
import type { ImportTotals } from '@/lib/import/product-upsert'
import type { SourceKind } from '@/lib/ingestion/normalized'

export type IngestStep = 1 | 2 | 3 | 4

export type IngestState = {
  source: SourceKind | null
  batch: NormalizedBatch | null
  ocrCost: OcrCostView | null
  mappings: IngestionMapping[]
  validation: { toCreate: number; errors: FieldError[]; validRows: number } | null
  totals: ImportTotals | null
}

export const EMPTY_INGEST_STATE: IngestState = {
  source: null, batch: null, ocrCost: null, mappings: [], validation: null, totals: null,
}
```

- [ ] **Step 2: Implement `ingest-drawer.tsx` (shell + stepper + navigation)**

Structure (fill bodies from the referenced files):
```tsx
'use client'
import { useState } from 'react'
import { LuDatabase, LuGitMerge, LuListChecks, LuRocket } from 'react-icons/lu'
import type { IngestionTarget } from '@/lib/ingestion/target'
import { requiredFieldKeys } from '@/lib/ingestion/target'
import { EMPTY_INGEST_STATE, type IngestState, type IngestStep } from './types'
import { StepSource } from './step-source'
import { StepIngestMap } from './step-ingest-map'
import { StepIngestValidate } from './step-ingest-validate'
import { StepIngestCommit } from './step-ingest-commit'

const STEPS = [
  { id: 1, label: 'Πηγή', icon: LuDatabase },
  { id: 2, label: 'Αντιστοίχιση', icon: LuGitMerge },
  { id: 3, label: 'Έλεγχος', icon: LuListChecks },
  { id: 4, label: 'Καταχώριση', icon: LuRocket },
] as const

function canProceed(step: IngestStep, s: IngestState, target: IngestionTarget): boolean {
  switch (step) {
    case 1: return !!s.batch && s.batch.records.length > 0
    case 2: {
      const mapped = new Set(s.mappings.filter(m => m.fieldKey).map(m => m.fieldKey))
      return requiredFieldKeys(target).every(k => mapped.has(k))
    }
    case 3: return !!s.validation && s.validation.validRows > 0
    case 4: return true
  }
}

export function IngestDrawer({ target, open, onOpenChange, onDone }: {
  target: IngestionTarget; open: boolean; onOpenChange: (v: boolean) => void; onDone?: () => void
}) {
  const [step, setStep] = useState<IngestStep>(1)
  const [state, setState] = useState<IngestState>(EMPTY_INGEST_STATE)
  const patch = (u: Partial<IngestState>) => setState(prev => ({ ...prev, ...u }))
  // Reuse the exact stepper markup + navigation (next/back/goTo) from import-wizard.tsx,
  // rendered inside a base-ui Dialog as a right-side sheet. Render the active step:
  //   1: <StepSource target state patch />
  //   2: <StepIngestMap target state patch />
  //   3: <StepIngestValidate target state patch />
  //   4: <StepIngestCommit target state patch onDone />
  // Primary «Καταχώριση» pill top-right on step 4; «Πίσω» always available (disabled on step 1 / while committing).
  return null // replace with the sheet + stepper + step body per the reference wizard
}
```

- [ ] **Step 3: Type-check (steps stubbed next tasks — temporarily stub the four Step components)**

Create minimal placeholder exports so `tsc` passes now; real bodies land in Tasks 12–13:
```tsx
// temporarily in each of step-source.tsx / step-ingest-map.tsx / step-ingest-validate.tsx / step-ingest-commit.tsx
export function StepSource() { return null } // etc.
```

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ingestion/ingest-drawer.tsx src/components/ingestion/types.ts src/components/ingestion/step-*.tsx
git commit -m "feat(ingestion-ui): IngestDrawer shell + stepper (steps stubbed)"
```

---

## Task 12: Map, Validate, Commit step components (UI)

**Files:**
- Modify: `src/components/ingestion/step-ingest-map.tsx`
- Modify: `src/components/ingestion/step-ingest-validate.tsx`
- Modify: `src/components/ingestion/step-ingest-commit.tsx`

> Mirror `src/app/(app)/import/step-mapping.tsx`, `step-validate.tsx`, `step-execute.tsx`. Use the DataTable pattern (§4α) for the errors list. All strings Greek.

- [ ] **Step 1: `step-ingest-map.tsx` — sourceKey→field grid with auto-match**

```tsx
'use client'
import { useEffect } from 'react'
import type { IngestionTarget } from '@/lib/ingestion/target'
import { autoMatchMappings } from '@/lib/ingestion/map'
import type { IngestState } from './types'

export function StepIngestMap({ target, state, patch }: { target: IngestionTarget; state: IngestState; patch: (u: Partial<IngestState>) => void }) {
  // On first mount with a batch and no mappings, auto-match; render a two-column grid:
  //   left: sourceKey + sample  |  right: <select> of target.fields (+ «— παράβλεψη —»)
  // Required fields not yet mapped → coral hint. Mirror step-mapping.tsx interactions.
  useEffect(() => {
    if (state.batch && state.mappings.length === 0) {
      patch({ mappings: autoMatchMappings(state.batch.sourceKeys.map(s => s.key), target) })
    }
  }, [state.batch, state.mappings.length, target, patch])
  return null // replace with the grid
}
```

- [ ] **Step 2: `step-ingest-validate.tsx` — run `validateBatch`, show summary + errors DataTable**

```tsx
'use client'
import { useState } from 'react'
import type { IngestionTarget } from '@/lib/ingestion/target'
import { validateBatch } from '@/lib/ingestion/actions'
import type { IngestState } from './types'

export function StepIngestValidate({ target, state, patch }: { target: IngestionTarget; state: IngestState; patch: (u: Partial<IngestState>) => void }) {
  const [loading, setLoading] = useState(false)
  async function run() {
    if (!state.batch) return
    setLoading(true)
    try {
      const r = await validateBatch(target.key, state.batch, state.mappings)
      patch({ validation: { toCreate: r.toCreate, errors: r.errors, validRows: r.validRows } })
    } finally { setLoading(false) }
  }
  // Auto-run on mount; render «X έγκυρες · Z σφάλματα», an errors DataTable (row/column/message),
  // and OCR mismatches from state.batch.meta.ocr.mismatches as ⚠ warnings. «Επανέλεγχος» button.
  return null // replace with UI (call run() on mount)
}
```

- [ ] **Step 3: `step-ingest-commit.tsx` — commit + progress + totals**

```tsx
'use client'
import { useState } from 'react'
import type { IngestionTarget } from '@/lib/ingestion/target'
import { commitBatch } from '@/lib/ingestion/actions'
import type { IngestState } from './types'

export function StepIngestCommit({ target, state, patch, onDone }: { target: IngestionTarget; state: IngestState; patch: (u: Partial<IngestState>) => void; onDone?: () => void }) {
  const [running, setRunning] = useState(false)
  async function commit() {
    if (!state.batch) return
    setRunning(true)
    try {
      const totals = await commitBatch(target.key, state.batch, state.mappings)
      patch({ totals })
      onDone?.()
    } finally { setRunning(false) }
  }
  // Primary «Καταχώριση» pill; while running show a real progress bar (indeterminate ok for sync);
  // after: totals card «N δημιουργήθηκαν · M ενημερώθηκαν · K απέτυχαν» + checkmark; list first errors.
  return null // replace with UI
}
```

- [ ] **Step 4: Type-check + full test suite**

Run: `npx tsc --noEmit && npx vitest run tests/ingestion-*.test.ts`
Expected: tsc clean; all ingestion unit tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ingestion/step-ingest-*.tsx
git commit -m "feat(ingestion-ui): map/validate/commit steps"
```

---

## Task 13: Source-selection + OCR/API acquisition panels (UI)

**Files:**
- Modify: `src/components/ingestion/step-source.tsx`
- Create: `src/components/ingestion/source-ocr-panel.tsx`
- Create: `src/components/ingestion/source-api-panel.tsx`
- Create: `src/components/ingestion/ocr-cost-panel.tsx`

> Reuse `src/components/ocr/ocr-uploader.tsx` for the OCR file staging. Excel reuses `readSheet`/`rowsToBatch` (Task 9) and the import `step-upload`/`step-sheet` UI. All strings Greek; Steel & Frost pills.

- [ ] **Step 1: `step-source.tsx` — three pill cards filtered by `target.sources`, then the chosen panel**

```tsx
'use client'
import { LuFileSpreadsheet, LuScanText, LuGlobe } from 'react-icons/lu'
import type { IngestionTarget } from '@/lib/ingestion/target'
import type { IngestState } from './types'
import type { SourceKind } from '@/lib/ingestion/normalized'
import { SourceOcrPanel } from './source-ocr-panel'
import { SourceApiPanel } from './source-api-panel'
// Excel panel: reuse existing import step-upload/step-sheet, producing a batch via rowsToBatch.

const SOURCE_META: Record<SourceKind, { label: string; icon: typeof LuGlobe }> = {
  excel: { label: 'Excel', icon: LuFileSpreadsheet },
  ocr: { label: 'OCR (φωτο/PDF)', icon: LuScanText },
  api: { label: 'API endpoint', icon: LuGlobe },
}

export function StepSource({ target, state, patch }: { target: IngestionTarget; state: IngestState; patch: (u: Partial<IngestState>) => void }) {
  // Render target.sources.map → pill card; on select patch({ source }).
  // Then render the matching panel; each panel calls patch({ batch, ocrCost? }) when data is acquired.
  return null // replace with cards + active panel
}
```

- [ ] **Step 2: `source-ocr-panel.tsx` — OcrUploader → `acquireFromOcr` → cost panel + preview**

```tsx
'use client'
import { useState } from 'react'
import type { IngestionTarget } from '@/lib/ingestion/target'
import { acquireFromOcr } from '@/lib/ingestion/actions'
import { OcrCostPanel } from './ocr-cost-panel'
import type { IngestState } from './types'
// import { OcrUploader } from '@/components/ocr/ocr-uploader'  // reuse for staging photo/PDF pages → base64 images

export function SourceOcrPanel({ target, patch, ocrCost }: { target: IngestionTarget; patch: (u: Partial<IngestState>) => void; ocrCost: IngestState['ocrCost'] }) {
  const [busy, setBusy] = useState(false)
  async function run(images: { base64: string; mimeType: string }[]) {
    setBusy(true)
    try {
      const { batch, cost } = await acquireFromOcr(target.key, { images })
      patch({ batch, ocrCost: cost })
    } finally { setBusy(false) }
  }
  // Render OcrUploader (staged pages → run(images)); show <OcrCostPanel cost={ocrCost} /> after; preview records.
  return null // replace with UI
}
```

- [ ] **Step 3: `ocr-cost-panel.tsx` — render the role-gated view**

```tsx
'use client'
import type { OcrCostView } from '@/lib/ingestion/ocr-cost'

export function OcrCostPanel({ cost }: { cost: OcrCostView | null }) {
  if (!cost) return null
  // Always show model badge (cost.model). If cost.showAmount → show «Κόστος: X,XX €» (cost.finalEur).
  // If cost.showBreakdown → also show base USD + markup% chips (SUPER_ADMIN). Steel & Frost pill/chips.
  return null // replace with UI
}
```

- [ ] **Step 4: `source-api-panel.tsx` — URL + header/token + presets + fetch preview**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { IngestionTarget } from '@/lib/ingestion/target'
import { acquireFromApi, listApiPresets, saveApiPreset, type ApiPreset } from '@/lib/ingestion/actions'
import type { IngestState } from './types'

export function SourceApiPanel({ target, patch }: { target: IngestionTarget; patch: (u: Partial<IngestState>) => void }) {
  const [url, setUrl] = useState('')
  const [headerName, setHeaderName] = useState('')
  const [headerValue, setHeaderValue] = useState('')
  const [presets, setPresets] = useState<ApiPreset[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { listApiPresets(target.key).then(setPresets).catch(() => {}) }, [target.key])

  async function fetchNow() {
    setBusy(true); setError(null)
    try {
      const batch = await acquireFromApi(target.key, url, headerName || undefined, headerValue || undefined)
      patch({ batch })
    } catch (e) { setError(e instanceof Error ? e.message : 'Σφάλμα ανάκτησης.') }
    finally { setBusy(false) }
  }
  // Labels above inputs (URL / Header name / Token). Preset dropdown pre-fills url+headerName.
  // «Ανάκτηση» pill → fetchNow(). «Αποθήκευση endpoint» → saveApiPreset (token NOT saved). Show error in Greek.
  return null // replace with UI
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ingestion/step-source.tsx src/components/ingestion/source-ocr-panel.tsx src/components/ingestion/source-api-panel.tsx src/components/ingestion/ocr-cost-panel.tsx
git commit -m "feat(ingestion-ui): source selection + OCR/API panels + cost panel"
```

---

## Task 14: Entry button + wire into Products & Partners pages

**Files:**
- Create: `src/components/ingestion/ingest-entry-button.tsx` (`'use client'`)
- Modify: Products list page toolbar (`src/app/(app)/products/…` — the list header component)
- Modify: Partners list page toolbar (`src/app/(app)/partners/…`)

- [ ] **Step 1: Implement `ingest-entry-button.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { LuImport, LuChevronDown } from 'react-icons/lu'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { IngestDrawer } from './ingest-drawer'

export function IngestEntryButton({ targetKey, onDone }: { targetKey: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const target = ingestionTargetByKey(targetKey)
  if (!target) return null
  return (
    <>
      {/* Secondary (outline) pill «Καταχώριση από… ▾» — NOT primary (page keeps its «Νέο» primary). */}
      <button type="button" onClick={() => setOpen(true)} className="/* Steel & Frost outline pill */">
        <LuImport /> Καταχώριση από… <LuChevronDown />
      </button>
      <IngestDrawer target={target} open={open} onOpenChange={setOpen} onDone={onDone} />
    </>
  )
}
```

> Permission gating: the page already renders behind its menu permission; the drawer's server actions independently enforce `target.permission`. Optionally hide the button client-side when the user's permissions (already available in the app shell) lack `target.permission`.

- [ ] **Step 2: Add the button to the Products list toolbar**

Locate the Products list header/toolbar (where the primary «Νέο προϊόν» button lives — search `grep -rn "Νέο" src/app/(app)/products`). Add next to it:
```tsx
import { IngestEntryButton } from '@/components/ingestion/ingest-entry-button'
// …in the toolbar, after the primary button:
<IngestEntryButton targetKey="product" />
```

- [ ] **Step 3: Add the button to the Partners list toolbar**

Locate the Partners list toolbar (`grep -rn "Νέο" src/app/(app)/partners`). Add:
```tsx
import { IngestEntryButton } from '@/components/ingestion/ingest-entry-button'
<IngestEntryButton targetKey="partner" />
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/ingestion/ingest-entry-button.tsx src/app/\(app\)/products src/app/\(app\)/partners
git commit -m "feat(ingestion): «Καταχώριση από…» entry on Products & Partners"
```

---

## Task 15: End-to-end happy paths

**Files:**
- Create: `e2e/ingestion.spec.ts`

> Mirror `e2e/ocr-demo.spec.ts` for auth/setup. Use a test DB (existing e2e setup). Cover one source per target end-to-end. Mock external OCR/API where the harness requires (per existing OCR e2e conventions).

- [ ] **Step 1: Write the e2e spec (Excel → Products, API → Partners)**

```ts
// e2e/ingestion.spec.ts
import { test, expect } from '@playwright/test'
// Follow e2e/ocr-demo.spec.ts for login + navigation helpers.

test('Excel ingestion into Products creates rows', async ({ page }) => {
  // 1. login as a user with product.edit
  // 2. go to /products, click «Καταχώριση από…», choose Excel
  // 3. upload a small fixture .xlsx (code,name), pick sheet, verify auto-mapping
  // 4. validate → expect «N έγκυρες, 0 σφάλματα»
  // 5. commit → expect totals «N δημιουργήθηκαν»
  // 6. assert the new products appear in the products table
  expect(true).toBe(true) // replace with real steps
})

test('API ingestion into Partners upserts by AFM', async ({ page }) => {
  // 1. login as a user with customer.edit
  // 2. /partners → «Καταχώριση από…» → API
  // 3. enter a mock https endpoint returning [{afm,name}], fetch, map, validate, commit
  // 4. assert the partner exists (by AFM) in the partners table
  expect(true).toBe(true) // replace with real steps
})
```

- [ ] **Step 2: Flesh out the steps using the existing e2e helpers and run**

Run: `npx playwright test e2e/ingestion.spec.ts`
Expected: PASS (both flows green).

- [ ] **Step 3: Commit**

```bash
git add e2e/ingestion.spec.ts
git commit -m "test(ingestion): e2e happy paths (Excel→Products, API→Partners)"
```

---

## Final verification

- [ ] **Full unit suite:** `npx vitest run` → all pass
- [ ] **Types:** `npx tsc --noEmit` → clean
- [ ] **Build:** `npm run build` → succeeds
- [ ] **E2E:** `npx playwright test e2e/ingestion.spec.ts` → pass
- [ ] **Manual smoke (per design-system §6):** open `/products` and `/partners`, run one OCR scan → confirm the cost/model panel shows role-appropriate figures (SUPER_ADMIN breakdown vs ADMIN final-only), confirm Steel & Frost skin + Greek strings + real progress bar.

---

## Notes for the executor

- **Isomorphic discipline:** if `tsc` or the build complains about `@/lib/prisma` bundled into a client component, a server-only module leaked into `'use client'`. Keep prisma strictly in `commit/*` + `actions.ts`.
- **Next version:** read `node_modules/next/dist/docs/` before writing server actions / client-server boundaries — APIs differ from older Next.
- **base-ui, not Radix:** `render=` prop, `DropdownMenuLabel` needs a `DropdownMenuGroup` wrapper (see `src/components/shell/topbar.tsx`).
- **Do not** push to SoftOne here — commit target is local Postgres only (spec §12).
- **Deferred (not this plan):** Έξοδα/Expense target, master-detail cardinality, region designer (sub-project B), nested-JSON flattening.
