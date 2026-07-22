import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { buildFieldsPrompt, type TemplateFieldLite } from '@/lib/tax/template-prompt'

/**
 * Server-side vision extraction πάνω από τα template fields ενός Ε3/Ε1 tax
 * form — χτίζει το prompt από buildFieldsPrompt, καλεί το Gemini (μέσω
 * geminiGenerate, scope 'OCR_VISION') και κάνει parse το JSON αποτέλεσμα σε
 * { values, series }. Προσαρμογή του reference lib/ocr/tax-extract.ts (που
 * χρησιμοποιούσε άλλο LLM wrapper με PDF-native/rasterization handling) στο
 * geminiGenerate του DAMASK — η προετοιμασία εικόνας (crop/rasterize) γίνεται
 * από τον caller, εδώ παίρνουμε ήδη έτοιμα base64 images.
 */

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
      series[f.fieldKey] = Array.isArray(v) ? v.map(p => ({ year: numOrNull((p as Record<string, unknown>)?.year), value: strOrNull((p as Record<string, unknown>)?.value) })) : []
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

/**
 * Διαβάζει μια σημειωμένη TABLE περιοχή (πίνακα) — γενικό grid: columns
 * (headers), rows (label + values). Ίδιο πνεύμα με το reference scanTable
 * αλλά χωρίς name/code/headers/grid (αυτά χρειάζονταν το PDF/records mode
 * του reference· εδώ κρατάμε το minimal σχήμα columns+rows).
 */
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
  const rows = Array.isArray(raw.rows) ? raw.rows.map(r => {
    const rr = r as Record<string, unknown>
    return { label: strOrNull(rr?.label) ?? '', values: Array.isArray(rr?.values) ? (rr.values as unknown[]).map(x => strOrNull(x) ?? '') : [] }
  }) : []
  return { columns: cols, rows, model: res.model, tokensUsed: res.tokensUsed }
}
