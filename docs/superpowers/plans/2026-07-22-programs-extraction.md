# Program Extraction + Expense Auto-Categorization (C1+C3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu «Προγράμματα»: upload an ΕΣΠΑ program PDF → **DeepSeek αποδελτίωση** → full relational Program (expense categories with percentages, deliverables, phases, KADs, eligibility) + `extractedData` JSON; then a `Trdr`×`Program` `ProgramApplication` holds `ProgramExpense`s whose category **DeepSeek suggests** from the program's expense categories.

**Architecture:** Faithful port of `cloudzeus/postgres-boilerplate` `programs` to DAMASK. New Prisma models; isomorphic pure libs (`types`, `extract-prompt`, `category-prompt`, `persist` pure part) + server engines (`extract`, `categorize`) over DAMASK's `deepseekChat`; client PDF-text extraction (pdfjs). UI: `/programs` list+editor + expense/application panels.

**Tech Stack:** Next.js (App Router, server actions), Prisma/Postgres, base-ui + Tailwind (Steel & Frost), react-icons/lu, pdfjs (client text), Bunny storage, DeepSeek (`deepseek-chat`/`deepseek-reasoner`), `jsonrepair`, vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-07-22-programs-extraction-design.md`
**Reference source to port (cloned this session):** `<scratchpad>/pb-ref/` — key: `lib/programs/templates.ts` (`PROGRAM_SYSTEM_PROMPT`), `lib/programs/extract.ts`. `<scratchpad>` = the session scratchpad dir (absolute: `/private/tmp/claude-501/-Volumes-EXTERNALSSD-DGSMART-damask/5f092e05-2323-408e-849a-70d57b13a320/scratchpad/pb-ref`).

**Verified DAMASK APIs to reuse:**
- `src/lib/deepseek.ts` — `deepseekChat(messages: {role,content}[], opts?) → Promise<string>`, `generateText`. NOTE: hardcoded `AbortSignal.timeout(60_000)` — Task 6 adds an optional `timeoutMs` opt for the long extraction call.
- `src/lib/bunny-storage.ts` — `bunnyUploadPrivate({key, body:Buffer, contentType})`, `bunnyDownload(key)→Buffer`.
- `src/lib/ocr/rasterize.ts` — client pdfjs; it already extracts selectable text (a PDF-text helper) — reuse or mirror for `pdf-text.ts`.
- `src/lib/ocr/extract.ts` — `parseJsonLoose(s)`.
- `src/lib/ingestion/ocr-cost.ts` — `buildOcrCostViewForSession(role, model, tokensUsed)` (provider derived from model; `deepseek*` → deepseek).
- `src/lib/rbac-server.ts` — `requirePermission(perm)→Session` (`session.user.id/role`).
- `src/lib/objects.ts`, `src/lib/prisma.ts`, `Trdr` model.
- `jsonrepair` — confirm it's a dependency (`grep jsonrepair package.json`); if absent, add it (`npm i jsonrepair`) OR rely on `parseJsonLoose` only and note the reduced robustness.

**Conventions:** Greek UI strings; Steel & Frost; base-ui (`render=`); react-icons/lu. **Before App-Router/server-action/RSC code, read `node_modules/next/dist/docs/`.** Isomorphic: `types/extract-prompt/category-prompt/persist(pure)/pdf-text(pure cap)` MUST NOT import prisma/react. Ignore pre-existing `RouteContext` tsc error.

---

## Task 1: Prisma models + migration

**Files:** Modify `prisma/schema.prisma`; Test `tests/programs-schema.test.ts`.

- [ ] **Step 1:** Append the enums + models from spec §1 EXACTLY (`ProgramStatus`, `ProgramExtractStatus`, `ProgramBonusKind`, `ExpenseSuggestSource`; `Program`, `ProgramExpenseCategory`, `ProgramKad`, `ProgramBonus`, `ProgramCriterion`, `ProgramDeadline`, `ProgramPhase`, `ProgramDeliverable`, `ProgramRegion`, `ProgramEligibleLegalForm`, `ProgramApplication`, `ProgramExpense`). **Use multi-line enum syntax** (Prisma 7.8 rejects single-line `enum X { A B }` — one value per line).
- [ ] **Step 2:** Add to `model Trdr { … }`: `programApplications ProgramApplication[]`.
- [ ] **Step 3:** `npx prisma migrate dev --name programs`. If the shared dev DB reports drift/reset, STOP + report BLOCKED (never reset a shared DB). Confirm the SQL is purely additive.
- [ ] **Step 4:** `npx prisma generate`; write `tests/programs-schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
describe('program models', () => {
  it('exposes the new models', () => {
    for (const m of ['Program','ProgramExpenseCategory','ProgramApplication','ProgramExpense','ProgramDeliverable']) {
      expect((Prisma.ModelName as Record<string,string>)[m]).toBe(m)
    }
  })
})
```
- [ ] **Step 5:** `npx vitest run tests/programs-schema.test.ts && npx tsc --noEmit`.
- [ ] **Step 6:** Commit `feat(programs): prisma models for programs + applications + expenses`.

---

## Task 2: `lib/programs/types.ts` — isomorphic extracted-program shape

**Files:** Create `src/lib/programs/types.ts`; Test `tests/programs-types.test.ts`.

- [ ] **Step 1:** Failing test:
```ts
import { describe, it, expect } from 'vitest'
import { emptyExtractedProgram, coerceMoney, coercePercent } from '@/lib/programs/types'
describe('program types helpers', () => {
  it('coerceMoney parses Greek numbers, coercePercent clamps', () => {
    expect(coerceMoney('1.000.000,00')).toBeCloseTo(1000000, 2)
    expect(coerceMoney(null)).toBeNull()
    expect(coercePercent('65')).toBe(65)
    expect(coercePercent('250')).toBe(100)   // clamp 0-100
    expect(coercePercent('-5')).toBe(0)
  })
  it('emptyExtractedProgram has the array fields', () => {
    const e = emptyExtractedProgram()
    expect(e.expenseCategories).toEqual([])
    expect(e.deliverables).toEqual([])
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `src/lib/programs/types.ts` (ISOMORPHIC):
```ts
export type ExtractedExpenseCategory = { name: string; minPercentage: number | null; maxPercentage: number | null; minAmount: number | null; maxAmount: number | null; mandatory: boolean; notes?: string | null }
export type ExtractedDeliverable = { name: string; description?: string | null; phase?: string | null; mandatory: boolean }
export type ExtractedProgram = {
  title: string | null; summary: string | null; referenceCode: string | null
  publicationDate: string | null; submissionStart: string | null; submissionEnd: string | null
  totalBudget: number | null; fundingRate: number | null; durationMonths: number | null
  minEmployeesFte: number | null; minOperationalYears: number | null; eligibilityNote: string | null
  kadRule: string | null
  expenseCategories: ExtractedExpenseCategory[]
  deliverables: ExtractedDeliverable[]
  phases: { name: string }[]
  kads: { code: string; description?: string | null }[]
  bonuses: { kind?: string | null; name: string; condition?: string | null; bonusRate?: number | null; bonusAmount?: number | null }[]
  criteria: { name: string; weight?: number | null; notes?: string | null }[]
  deadlines: { name: string; date?: string | null; notes?: string | null }[]
  regions: { name: string; notes?: string | null }[]
  eligibleLegalForms: string[]
}

/** Greek number → number ('.'=thousands, ','=decimal). null on junk. */
export function coerceMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (!s || /^[.,-]+$/.test(s)) return null
  s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s); return Number.isFinite(n) ? n : null
}
/** percent 0-100 (clamped). */
export function coercePercent(v: unknown): number | null {
  const n = coerceMoney(v); if (n == null) return null
  return Math.max(0, Math.min(100, n))
}
export function emptyExtractedProgram(): ExtractedProgram {
  return { title:null, summary:null, referenceCode:null, publicationDate:null, submissionStart:null, submissionEnd:null,
    totalBudget:null, fundingRate:null, durationMonths:null, minEmployeesFte:null, minOperationalYears:null, eligibilityNote:null,
    kadRule:null, expenseCategories:[], deliverables:[], phases:[], kads:[], bonuses:[], criteria:[], deadlines:[], regions:[], eligibleLegalForms:[] }
}
```
- [ ] **Step 4:** Run → PASS + tsc.
- [ ] **Step 5:** Commit `feat(programs): isomorphic ExtractedProgram types + number coercion`.

---

## Task 3: `lib/programs/extract-prompt.ts` — DeepSeek system prompt (port)

**Files:** Create `src/lib/programs/extract-prompt.ts`; Test `tests/programs-extract-prompt.test.ts`.

- [ ] **Step 1:** Failing test:
```ts
import { describe, it, expect } from 'vitest'
import { PROGRAM_SYSTEM_PROMPT, PROGRAM_JSON_SHAPE } from '@/lib/programs/extract-prompt'
describe('program prompt', () => {
  it('is a substantial Greek prompt mentioning key anchors + JSON', () => {
    expect(PROGRAM_SYSTEM_PROMPT.length).toBeGreaterThan(1000)
    expect(PROGRAM_SYSTEM_PROMPT).toMatch(/ΕΣΠΑ|ΚΑΔ|δαπαν/i)
    expect(PROGRAM_SYSTEM_PROMPT).toMatch(/JSON/i)
    expect(PROGRAM_JSON_SHAPE).toMatch(/expenseCategories/)
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `src/lib/programs/extract-prompt.ts` (ISOMORPHIC): **port `PROGRAM_SYSTEM_PROMPT` verbatim** from `<scratchpad>/pb-ref/lib/programs/templates.ts` (read the full file — it is long: analysis loop, Greek anchors, KAD rule, region expansion, bonuses, summary style). Append/ensure a `PROGRAM_JSON_SHAPE` describing the exact JSON keys our `ExtractedProgram` expects (title, summary, referenceCode, publicationDate, submissionStart, submissionEnd, totalBudget, fundingRate, durationMonths, minEmployeesFte, minOperationalYears, eligibilityNote, kadRule, `expenseCategories:[{name,minPercentage,maxPercentage,minAmount,maxAmount,mandatory,notes}]`, `deliverables:[{name,description,phase,mandatory}]`, phases, kads, bonuses, criteria, deadlines, regions, eligibleLegalForms). If the reference prompt uses slightly different JSON keys, RECONCILE the prompt's requested shape with our `ExtractedProgram` keys so the model returns exactly what `persist.ts` (Task 8) reads.
- [ ] **Step 4:** Run → PASS + tsc.
- [ ] **Step 5:** Commit `feat(programs): DeepSeek extraction system prompt (port)`.

---

## Task 4: `lib/programs/category-prompt.ts` — expense→category prompt (pure)

**Files:** Create `src/lib/programs/category-prompt.ts`; Test `tests/programs-category-prompt.test.ts`.

- [ ] **Step 1:** Failing test:
```ts
import { describe, it, expect } from 'vitest'
import { buildCategorizeMessages, type CatInput } from '@/lib/programs/category-prompt'
describe('buildCategorizeMessages', () => {
  it('lists categories + expense and asks for JSON {categoryId,reason,confidence}', () => {
    const input: CatInput = {
      categories: [{ id:'c1', name:'Εξοπλισμός', maxPercentage:50, mandatory:false }, { id:'c2', name:'Μισθολογικό κόστος', maxPercentage:20, mandatory:true }],
      expense: { description:'Αγορά laptop Dell', amount:1200, vendor:'ΠΛΑΙΣΙΟ' },
    }
    const msgs = buildCategorizeMessages(input)
    expect(msgs[0].role).toBe('system')
    const joined = msgs.map(m=>m.content).join('\n')
    expect(joined).toContain('c1'); expect(joined).toContain('Εξοπλισμός')
    expect(joined).toContain('Αγορά laptop Dell')
    expect(joined).toMatch(/categoryId/); expect(joined).toMatch(/confidence/)
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `src/lib/programs/category-prompt.ts` (ISOMORPHIC):
```ts
export type CatInput = {
  categories: { id: string; name: string; minPercentage?: number | null; maxPercentage?: number | null; mandatory?: boolean; notes?: string | null }[]
  expense: { description: string; amount?: number | null; vendor?: string | null }
}
export function buildCategorizeMessages(input: CatInput): { role: 'system' | 'user'; content: string }[] {
  const cats = input.categories.map(c =>
    `- id="${c.id}" name="${c.name}"${c.maxPercentage != null ? ` (έως ${c.maxPercentage}% π/υ)` : ''}${c.mandatory ? ' [υποχρεωτική]' : ''}${c.notes ? ` — ${c.notes}` : ''}`,
  ).join('\n')
  const system = [
    'Είσαι σύμβουλος ΕΣΠΑ. Ταξινομείς μια δαπάνη σε ΜΙΑ από τις επιλέξιμες κατηγορίες δαπανών ενός προγράμματος.',
    'Απάντησε ΜΟΝΟ με raw JSON: { "categoryId": "<id ή null>", "reason": "<σύντομη ελληνική αιτιολόγηση>", "confidence": <0..1> }.',
    'Αν καμία κατηγορία δεν ταιριάζει, categoryId=null.',
  ].join('\n')
  const user = [
    'Κατηγορίες δαπανών:',
    cats || '(καμία)',
    '',
    'Δαπάνη:',
    `περιγραφή: ${input.expense.description}`,
    input.expense.amount != null ? `ποσό: ${input.expense.amount}€` : '',
    input.expense.vendor ? `προμηθευτής: ${input.expense.vendor}` : '',
  ].filter(Boolean).join('\n')
  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}
```
- [ ] **Step 4:** Run → PASS + tsc.
- [ ] **Step 5:** Commit `feat(programs): expense categorization prompt (pure)`.

---

## Task 5: `lib/programs/pdf-text.ts` — client PDF text extraction

**Files:** Create `src/lib/programs/pdf-text.ts`; Test `tests/programs-pdf-text.test.ts`.

- [ ] **Step 1:** Read `src/lib/ocr/rasterize.ts` — it already extracts selectable PDF text (mentioned in its header). Reuse that function if exported; otherwise mirror its pdfjs `getTextContent` loop. Expose a **pure** `capText(text, max)` + a client `extractPdfText(file): Promise<string>`.
- [ ] **Step 2:** Failing test (pure cap only):
```ts
import { describe, it, expect } from 'vitest'
import { capText, MAX_PROGRAM_TEXT_CHARS } from '@/lib/programs/pdf-text'
describe('capText', () => {
  it('caps very long text and marks truncation', () => {
    const long = 'α'.repeat(MAX_PROGRAM_TEXT_CHARS + 100)
    const out = capText(long)
    expect(out.length).toBeLessThanOrEqual(MAX_PROGRAM_TEXT_CHARS + 40)
    expect(out).toMatch(/truncated/i)
  })
  it('leaves short text intact', () => { expect(capText('γεια')).toBe('γεια') })
})
```
- [ ] **Step 3:** Implement:
```ts
export const MAX_PROGRAM_TEXT_CHARS = 360_000
export function capText(text: string, max = MAX_PROGRAM_TEXT_CHARS): string {
  return text.length > max ? text.slice(0, max) + '\n\n[... truncated ...]' : text
}
// CLIENT: File → concatenated selectable text via pdfjs (reuse rasterize's text util if present)
export async function extractPdfText(file: File): Promise<string> {
  // reuse @/lib/ocr/rasterize text extraction; fallback: dynamic import pdfjs, getDocument, per-page getTextContent → join
  // return capText(joined)
}
```
Fill `extractPdfText` per the actual rasterize util (read it). Keep `capText` pure/tested.
- [ ] **Step 4:** Run → PASS + tsc.
- [ ] **Step 5:** Commit `feat(programs): client PDF text extraction + cap`.

---

## Task 6: extend `deepseekChat` with an optional timeout

**Files:** Modify `src/lib/deepseek.ts`; Test `tests/deepseek-timeout.test.ts`.

- [ ] **Step 1:** Read `src/lib/deepseek.ts`. It uses `AbortSignal.timeout(60_000)` hardcoded. Add `timeoutMs?: number` to `DeepSeekOptions` and use `AbortSignal.timeout(opts.timeoutMs ?? 60_000)`. No behavior change when unset.
- [ ] **Step 2:** Failing test (type/contract — just assert the option is accepted + default preserved; a full network test isn't feasible):
```ts
import { describe, it, expect } from 'vitest'
import type { DeepSeekOptions } from '@/lib/deepseek'
describe('DeepSeekOptions', () => {
  it('accepts timeoutMs', () => { const o: DeepSeekOptions = { timeoutMs: 300000 }; expect(o.timeoutMs).toBe(300000) })
})
```
- [ ] **Step 3:** Make the change. Verify `generateText`/`translateText`/`deepseekChat` still compile.
- [ ] **Step 4:** `npx vitest run tests/deepseek-timeout.test.ts && npx tsc --noEmit` + run existing deepseek tests if any.
- [ ] **Step 5:** Commit `feat(deepseek): optional per-call timeoutMs (for long program extraction)`.

---

## Task 7: `lib/programs/extract.ts` — DeepSeek extraction engine (server)

**Files:** Create `src/lib/programs/extract.ts`; Test `tests/programs-extract.test.ts`.

> Port the fallback+jsonrepair logic from `<scratchpad>/pb-ref/lib/programs/extract.ts`, adapted to `deepseekChat`.

- [ ] **Step 1:** Confirm `jsonrepair` is available (`grep jsonrepair package.json`); if not, `npm i jsonrepair`.
- [ ] **Step 2:** Failing test (mock deepseekChat):
```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/deepseek', () => ({ deepseekChat: vi.fn(async () => JSON.stringify({
  title:'Ψηφιακός Μετασχηματισμός', summary:'…', submissionEnd:'2024-12-31', totalBudget:'1.000.000,00', fundingRate:'65',
  expenseCategories:[{ name:'Εξοπλισμός', maxPercentage:'50', mandatory:false }], deliverables:[{ name:'Έκθεση', mandatory:true }],
})) }))
import { extractProgramFromText } from '@/lib/programs/extract'
describe('extractProgramFromText', () => {
  it('parses DeepSeek JSON into ExtractedProgram (coerced)', async () => {
    const r = await extractProgramFromText('πλήρες κείμενο PDF…')
    expect(r.data.title).toBe('Ψηφιακός Μετασχηματισμός')
    expect(r.data.totalBudget).toBeCloseTo(1000000, 2)
    expect(r.data.fundingRate).toBe(65)
    expect(r.data.expenseCategories[0]).toMatchObject({ name:'Εξοπλισμός', maxPercentage:50 })
    expect(r.model).toBeDefined()
  })
})
```
- [ ] **Step 3:** Implement `src/lib/programs/extract.ts`:
```ts
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { PROGRAM_SYSTEM_PROMPT, PROGRAM_JSON_SHAPE } from '@/lib/programs/extract-prompt'
import { emptyExtractedProgram, coerceMoney, coercePercent, type ExtractedProgram } from '@/lib/programs/types'

const REQUIRED = ['title', 'summary', 'submissionEnd', 'totalBudget'] as const
const PRIMARY = 'deepseek-chat', FALLBACK = 'deepseek-reasoner'
const TIMEOUT = 5 * 60 * 1000

export type ExtractProgramResult = { data: ExtractedProgram; model: string; tokensUsed: number | null; retried: boolean }

async function repairParse(s: string): Promise<Record<string, unknown>> {
  try { return parseJsonLoose(s) as Record<string, unknown> } catch { /* try jsonrepair */ }
  const { jsonrepair } = await import('jsonrepair')
  const start = s.indexOf('{'), end = s.lastIndexOf('}')
  const cand = start !== -1 && end > start ? s.slice(start, end + 1) : s
  return JSON.parse(jsonrepair(cand))
}
function countMissing(raw: Record<string, unknown>): number {
  return REQUIRED.reduce((n, k) => (raw[k] == null || raw[k] === '' ? n + 1 : n), 0)
}
function normalize(raw: Record<string, unknown>): ExtractedProgram {
  const e = emptyExtractedProgram()
  const g = (k: string) => raw[k]
  const arr = (k: string) => Array.isArray(raw[k]) ? raw[k] as Record<string, unknown>[] : []
  return {
    ...e,
    title: str(g('title')), summary: str(g('summary')), referenceCode: str(g('referenceCode')),
    publicationDate: str(g('publicationDate')), submissionStart: str(g('submissionStart')), submissionEnd: str(g('submissionEnd')),
    totalBudget: coerceMoney(g('totalBudget')), fundingRate: coercePercent(g('fundingRate')), durationMonths: intOrNull(g('durationMonths')),
    minEmployeesFte: coerceMoney(g('minEmployeesFte')), minOperationalYears: coerceMoney(g('minOperationalYears')), eligibilityNote: str(g('eligibilityNote')),
    kadRule: str(g('kadRule')),
    expenseCategories: arr('expenseCategories').map(c => ({ name: str(c.name) ?? '', minPercentage: coercePercent(c.minPercentage), maxPercentage: coercePercent(c.maxPercentage), minAmount: coerceMoney(c.minAmount), maxAmount: coerceMoney(c.maxAmount), mandatory: !!c.mandatory, notes: str(c.notes) })),
    deliverables: arr('deliverables').map(d => ({ name: str(d.name) ?? '', description: str(d.description), phase: str(d.phase), mandatory: d.mandatory !== false })),
    phases: arr('phases').map(p => ({ name: str(p.name) ?? '' })).filter(p => p.name),
    kads: arr('kads').map(k => ({ code: str(k.code) ?? '', description: str(k.description) })).filter(k => k.code),
    bonuses: arr('bonuses').map(b => ({ kind: str(b.kind), name: str(b.name) ?? '', condition: str(b.condition), bonusRate: coercePercent(b.bonusRate), bonusAmount: coerceMoney(b.bonusAmount) })),
    criteria: arr('criteria').map(c => ({ name: str(c.name) ?? '', weight: coerceMoney(c.weight), notes: str(c.notes) })),
    deadlines: arr('deadlines').map(d => ({ name: str(d.name) ?? '', date: str(d.date), notes: str(d.notes) })),
    regions: arr('regions').map(r => ({ name: str(r.name) ?? '', notes: str(r.notes) })).filter(r => r.name),
    eligibleLegalForms: (Array.isArray(raw.eligibleLegalForms) ? raw.eligibleLegalForms : []).map(x => String(x)).filter(Boolean),
  }
}
function str(v: unknown): string | null { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s }
function intOrNull(v: unknown): number | null { const n = coerceMoney(v); return n == null ? null : Math.round(n) }

export async function extractProgramFromText(text: string, opts: { refId?: string | null; userId?: string | null } = {}): Promise<ExtractProgramResult> {
  const messages = [{ role: 'system' as const, content: PROGRAM_SYSTEM_PROMPT + '\n\n' + PROGRAM_JSON_SHAPE }, { role: 'user' as const, content: text }]
  let model = PRIMARY, retried = false
  const first = await deepseekChat(messages, { model: PRIMARY, maxTokens: 8000, timeoutMs: TIMEOUT, scope: 'OTHER', refType: 'program', refId: opts.refId, userId: opts.userId })
  let raw = await repairParse(first)
  if (countMissing(raw) >= 2) {
    retried = true; model = FALLBACK
    try {
      const second = await deepseekChat(messages, { model: FALLBACK, maxTokens: 8000, timeoutMs: TIMEOUT, scope: 'OTHER', refType: 'program', refId: opts.refId, userId: opts.userId })
      const raw2 = await repairParse(second)
      if (countMissing(raw2) < countMissing(raw)) raw = raw2
      else model = PRIMARY
    } catch { model = PRIMARY }
  }
  return { data: normalize(raw), model, tokensUsed: null, retried }
}
```
NOTE: `deepseekChat` returns only text (no token count) — `tokensUsed` stays null here (AiUsage still logs internally). If you want tokens surfaced, that's a follow-up. Verify `parseJsonLoose` import path + `AiScope` value (`'OTHER'` is valid; a dedicated scope could be added but isn't required).
- [ ] **Step 4:** Run → PASS + tsc.
- [ ] **Step 5:** Commit `feat(programs): DeepSeek extraction engine (chat→reasoner fallback + jsonrepair)`.

---

## Task 8: `lib/programs/persist.ts` — ExtractedProgram → DB (pure mapping + server upsert)

**Files:** Create `src/lib/programs/persist.ts`; Test `tests/programs-persist.test.ts`.

- [ ] **Step 1:** Failing test (pure mapping):
```ts
import { describe, it, expect } from 'vitest'
import { toProgramScalars, toRelatedRows } from '@/lib/programs/persist'
import { emptyExtractedProgram } from '@/lib/programs/types'
describe('persist mapping', () => {
  it('maps scalars + related rows from an ExtractedProgram', () => {
    const e = { ...emptyExtractedProgram(), title:'T', totalBudget:1000000, fundingRate:65, submissionEnd:'2024-12-31',
      expenseCategories:[{ name:'Εξοπλισμός', minPercentage:null, maxPercentage:50, minAmount:null, maxAmount:null, mandatory:true }],
      deliverables:[{ name:'Έκθεση', description:null, phase:'Φάση Α', mandatory:true }] }
    const s = toProgramScalars(e)
    expect(s.title).toBe('T'); expect(Number(s.totalBudget)).toBe(1000000); expect(Number(s.fundingRate)).toBe(65)
    expect(s.submissionEnd instanceof Date).toBe(true)
    const r = toRelatedRows(e)
    expect(r.expenseCats[0]).toMatchObject({ name:'Εξοπλισμός', maxPercentage:50, mandatory:true, order:0 })
    expect(r.deliverables[0]).toMatchObject({ name:'Έκθεση', mandatory:true, phaseName:'Φάση Α' })
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `persist.ts`: a PURE `toProgramScalars(e)` (title/summary/referenceCode/dates→Date|null/totalBudget/fundingRate/durationMonths/eligibility/kadRule) and `toRelatedRows(e)` (arrays → row objects with `order` index; deliverables carry `phaseName` for later phase-linking), plus a SERVER `persistExtractedProgram(programId, e)` that, in a `prisma.$transaction`, deletes existing related rows for the program and recreates them (phases first, then deliverables linked by phaseName→phaseId), and updates the Program scalars + `extractStatus:'DONE'`. Dates via a small `parseIsoDate(s): Date | null` helper (accept `YYYY-MM-DD` / ISO). Keep `toProgramScalars`/`toRelatedRows` pure (no prisma) so they're unit-tested; the `$transaction` writer is server-only.
- [ ] **Step 4:** Run → PASS + tsc.
- [ ] **Step 5:** Commit `feat(programs): persist ExtractedProgram to relational tables`.

---

## Task 9: `lib/programs/categorize.ts` — expense→category (server)

**Files:** Create `src/lib/programs/categorize.ts`; Test `tests/programs-categorize.test.ts`.

- [ ] **Step 1:** Failing test (mock deepseekChat):
```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/deepseek', () => ({ deepseekChat: vi.fn(async () => JSON.stringify({ categoryId:'c1', reason:'Πάγιος εξοπλισμός', confidence:0.82 })) }))
import { suggestCategory } from '@/lib/programs/categorize'
describe('suggestCategory', () => {
  it('returns the model suggestion parsed', async () => {
    const r = await suggestCategory({ categories:[{ id:'c1', name:'Εξοπλισμός' }], expense:{ description:'laptop', amount:1200 } })
    expect(r).toMatchObject({ categoryId:'c1', confidence:0.82 })
    expect(r.reason).toContain('εξοπλισμ')
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement:
```ts
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { buildCategorizeMessages, type CatInput } from '@/lib/programs/category-prompt'
export type CategorySuggestion = { categoryId: string | null; reason: string | null; confidence: number | null }
export async function suggestCategory(input: CatInput, opts: { refId?: string | null; userId?: string | null } = {}): Promise<CategorySuggestion> {
  const text = await deepseekChat(buildCategorizeMessages(input), { model: 'deepseek-chat', maxTokens: 400, scope: 'OTHER', refType: 'program-expense', refId: opts.refId, userId: opts.userId })
  let raw: Record<string, unknown> = {}
  try { raw = parseJsonLoose(text) as Record<string, unknown> } catch { /* leave empty */ }
  const id = raw.categoryId == null ? null : String(raw.categoryId)
  const valid = id && input.categories.some(c => c.id === id) ? id : null
  const conf = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : null
  return { categoryId: valid, reason: raw.reason == null ? null : String(raw.reason), confidence: conf }
}
```
- [ ] **Step 4:** Run → PASS + tsc.
- [ ] **Step 5:** Commit `feat(programs): expense category suggestion via DeepSeek`.

---

## Task 10: Server actions — program CRUD + upload + extract

**Files:** Create `src/lib/programs/actions.ts` (`'use server'`); Test `tests/programs-actions-guard.test.ts`.

> Read the Next server-actions doc. Every action gates `requirePermission('programs.manage')` first. Follow the actions-test mock convention (mock `@/lib/rbac-server`, `next/cache`, `@/lib/prisma`, `@/lib/bunny-storage`, `@/lib/programs/extract`).

- [ ] **Step 1:** Implement `listPrograms`, `createProgram({title, sourceFileName?, pdfBase64?, mimeType?})` (upload to `bunnyUploadPrivate` if pdf provided; create Program PENDING), `updateProgramMeta`, `deleteProgram`, and `extractProgram(programId, text)` → `extractProgramFromText(text, {refId:programId, userId})` then `persistExtractedProgram(programId, data)` + set `model/extractedData` + return `{ ok, cost }` where cost = `buildOcrCostViewForSession(role, model, null)`. Set `extractStatus:'RUNNING'` before, `DONE`/`FAILED` after (store `errorMessage` on failure). All gated `programs.manage`. Types inline (mirror ingestion/tax actions).
- [ ] **Step 2:** Guard test (surface exists):
```ts
import { describe, it, expect } from 'vitest'
import * as a from '@/lib/programs/actions'
describe('program actions surface', () => {
  it('exports the program actions', () => {
    for (const k of ['listPrograms','createProgram','updateProgramMeta','deleteProgram','extractProgram']) expect(typeof (a as Record<string,unknown>)[k]).toBe('function')
  })
})
```
- [ ] **Step 3:** `npx vitest run tests/programs-actions-guard.test.ts && npx tsc --noEmit`.
- [ ] **Step 4:** Commit `feat(programs): server actions — program CRUD + upload + extract`.

---

## Task 11: Server actions — applications + expenses + suggest/confirm

**Files:** Modify `src/lib/programs/actions.ts`; Test `tests/programs-expense-prep.test.ts`.

- [ ] **Step 1:** Failing test for a pure helper `expenseCatInput(program, expense)` that shapes a `CatInput` from a program's categories + an expense row:
```ts
import { describe, it, expect } from 'vitest'
import { expenseCatInput } from '@/lib/programs/expense-prep'
describe('expenseCatInput', () => {
  it('maps program categories + expense → CatInput', () => {
    const inp = expenseCatInput(
      { expenseCats:[{ id:'c1', name:'Εξοπλισμός', maxPercentage:50, mandatory:false, notes:null }] },
      { description:'laptop', amount:1200, vendor:'ΠΛΑΙΣΙΟ' })
    expect(inp.categories[0]).toMatchObject({ id:'c1', name:'Εξοπλισμός', maxPercentage:50 })
    expect(inp.expense.description).toBe('laptop')
  })
})
```
- [ ] **Step 2:** Implement pure `src/lib/programs/expense-prep.ts` (`expenseCatInput`). Then add to `actions.ts`: `createApplication({trdrId, programId})` (upsert unique), `listApplicationExpenses(applicationId)`, `createExpense(applicationId, {description, amount, vatAmount?, date?, vendor?, vendorAfm?, docNumber?})`, `suggestExpenseCategory(expenseId)` (load expense→application→program+cats, call `suggestCategory(expenseCatInput(...))`, store `suggested*` + `suggestionSource:'AI'`), `confirmExpenseCategory(expenseId, categoryId)` (set `categoryId`, `confirmed:true`), `suggestAllExpenses(applicationId)` (loop non-confirmed). All gated `programs.manage`.
- [ ] **Step 3:** `npx vitest run tests/programs-expense-prep.test.ts && npx tsc --noEmit`.
- [ ] **Step 4:** Commit `feat(programs): applications + expenses + category suggest/confirm actions`.

---

## Task 12: Registry item + permissions

**Files:** Modify `src/lib/objects.ts`; Test `tests/programs-registry.test.ts`.

- [ ] **Step 1:** Add `Landmark` (lucide) import + item `{ key:'programs', href:'/programs', label:'Προγράμματα', icon: Landmark, menuPermission:'programs.manage', permissions:[{ key:'programs.manage', description:'Διαχείριση προγραμμάτων & δαπανών' }] }` to a sensible module.
- [ ] **Step 2:** Test (mirror B's tax-registry test) asserting the item + permission. Run the FULL suite and UPDATE the permission-derivation tests (`tests/objects.test.ts` EXPECTED_KEYS count, and `PERMISSION_GROUP_LABELS` in `src/lib/permissions.ts` — add `programs: '<its module label>'` so `groupedPermissions()` stays at its expected group count) exactly as was done for `taxform` in the tax feature.
- [ ] **Step 3:** `npx vitest run && npx tsc --noEmit`.
- [ ] **Step 4:** Commit `feat(programs): register «Προγράμματα» object + permission`.

---

## Task 13: List page + new-program dialog (UI)

**Files:** Create `src/app/(app)/programs/page.tsx`, `src/components/programs/new-program-dialog.tsx`, `src/components/programs/programs-table.tsx`.

- [ ] Mirror the tax-templates list (Task 11 of the tax plan) / partners page. `page.tsx` RSC gates `programs.manage`, `listPrograms()`. `programs-table.tsx`: τίτλος, referenceCode, budget, submissionEnd, status + extractStatus badges, row→`/programs/{id}`, «Διαγραφή» (AlertDialog). `new-program-dialog.tsx`: τίτλος + file input (PDF) → on submit: client `extractPdfText(file)` for text (kept for the extract step), `createProgram({title, sourceFileName, pdfBase64, mimeType})`, then `extractProgram(id, text)` with a real progress indicator («Αποδελτίωση… (μπορεί να πάρει λεπτά)»); on done `router.push('/programs/'+id)`. Greek, Steel & Frost.
- [ ] `npx tsc --noEmit && npm run build`.
- [ ] Commit `feat(programs-ui): list page + new-program dialog with DeepSeek extraction`.

---

## Task 14: Program detail/editor (UI)

**Files:** Create `src/app/(app)/programs/[id]/page.tsx`, `src/components/programs/program-editor.tsx`.

- [ ] `page.tsx` RSC gates + fetches Program with all relations (`include`). `program-editor.tsx`: glass sections — core (title/summary/referenceCode/budget/fundingRate/dates/duration/eligibility) editable via `updateProgramMeta`; read/editable lists for **expense categories** (name+min/max%+mandatory), deliverables, phases, kads, bonuses, criteria, deadlines, regions, legalForms (v1 can render these read-only from the extraction + allow editing core scalars; full per-row editing of related lists can be minimal). «Επαναποδελτίωση» re-runs extraction from the stored PDF (download text again — or keep original text; simplest: re-upload). Show `extractStatus` + cost panel. Greek.
- [ ] `npx tsc --noEmit && npm run build`.
- [ ] Commit `feat(programs-ui): program detail/editor`.

---

## Task 15: Applications + expenses + suggestion UI

**Files:** Create `src/components/programs/expense-list.tsx`, `src/components/programs/new-expense-dialog.tsx`, `src/components/programs/link-application-dialog.tsx`; wire an «Δαπάνες / Προγράμματα» entry on the partner detail page (`partners/[id]`) OR a program's applications panel.

- [ ] Provide a way to create a `ProgramApplication` (Trdr×Program): a `link-application-dialog` (pick program) reachable from the partner detail page, and/or a partner picker from the program page. On the application, `expense-list.tsx`: table of `ProgramExpense` (description/amount/date/vendor) with the **suggested category chip** (reason tooltip; low confidence coral) + inline «Επιβεβαίωση» (`confirmExpenseCategory`) / category `<select>`. «Νέα δαπάνη» (`new-expense-dialog` → `createExpense` → auto `suggestExpenseCategory`). «Πρόταση για όλες» → `suggestAllExpenses`. Greek, real progress on suggestion.
- [ ] `npx tsc --noEmit && npm run build`.
- [ ] Commit `feat(programs-ui): applications + expenses + DeepSeek category suggestion`.

---

## Task 16: e2e (create program happy path)

**Files:** Create `e2e/programs.spec.ts`.

- [ ] Mirror `e2e/ocr-demo.spec.ts` auth. Real test: login (`programs.manage`), go to `/programs`, «Νέο πρόγραμμα», fill title, (the PDF-extract + DeepSeek steps need a real key/PDF → `test.skip` those with reasons), assert the program appears / editor opens. Per the known env footgun, run or `--list`; if login blocks (verify via `e2e/login.spec.ts` control), report DONE_WITH_CONCERNS. Do NOT fake a pass.
- [ ] Commit `test(programs): e2e create-program happy path`.

---

## Final verification
- [ ] `npx vitest run` → all pass. `npx tsc --noEmit` → clean. `npm run build` → succeeds.
- [ ] Manual smoke: upload an ΕΣΠΑ PDF → αποδελτίωση fills categories/deliverables/budget; link a company; add an expense → DeepSeek suggests a category with reason; confirm it; role-gated cost shows.

## Notes for the executor
- **DeepSeek is text-only** — program PDFs must have selectable text (v1). The 5-min `timeoutMs` (Task 6) matters for large προσκλήσεις.
- **Reference clone** `<scratchpad>/pb-ref/` — port `PROGRAM_SYSTEM_PROMPT` verbatim (Task 3); it encodes hard-won ΕΣΠΑ extraction knowledge (KAD tables, region expansion, kadRule, summary style).
- **Isomorphic discipline**: `types/extract-prompt/category-prompt/expense-prep/persist(pure)/pdf-text(cap)` must not import prisma/react.
- **Deferred (not this plan):** C2 (obligation/deliverable tracking per application, δικαιολογητικά upload, PM dashboards), C4 (DeepSeek query layer), scanned-PDF OCR, ProgramExpense population via OCR/A-ingestion, full KAD regex harvest (`kad-harvester`), `ProgramRequiredField`→TaxFormTemplate (B integration).
