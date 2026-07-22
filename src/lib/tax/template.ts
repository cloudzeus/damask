// src/lib/tax/template.ts — ISOMORPHIC (no prisma/react)
export type FinancialValueTypeStr = 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'
export type TaxFieldKindStr = 'SINGLE' | 'SERIES' | 'TABLE'
export type Bbox = [number, number, number, number]
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

const GREEK_TO_LATIN: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th',
  ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
}

/** Greek label → safe fieldKey: strip accents, transliterate Greek→Latin, lowercase, non-alnum→_, collapse, trim _. */
export function slugFieldKey(label: string): string {
  const noAccents = label.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const transliterated = noAccents
    .toLowerCase()
    .replace(/[α-ω]/g, (ch) => GREEK_TO_LATIN[ch] ?? ch)
  return transliterated.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** Region-key of a field — MUST mirror the identical (private) `regionKeyOf` in
 * src/components/tax/region-editor.tsx (Task 12): already-saved fields key on
 * `id`, new (unsaved) ones on `fieldKey`, falling back to `field-{index}`.
 * Shared here so template-editor.tsx / field-list.tsx stay in lockstep with
 * the region overlay's selection/highlight without duplicating the logic. */
export function regionKeyOf(field: TemplateField, index: number): string {
  return field.id ?? (field.fieldKey.trim() || `field-${index}`)
}

export function isValidBbox(bbox: unknown): bbox is Bbox {
  if (!Array.isArray(bbox) || bbox.length !== 4) return false
  const [x, y, w, h] = bbox as number[]
  if (![x, y, w, h].every(n => typeof n === 'number' && Number.isFinite(n))) return false
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return false
  return x + w <= 1.0001 && y + h <= 1.0001
}
