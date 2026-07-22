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
