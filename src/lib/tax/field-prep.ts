// src/lib/tax/field-prep.ts — PURE (no prisma/react)
import { slugFieldKey, type TemplateField } from '@/lib/tax/template'

/**
 * Normalizes editor-submitted fields (partial, author-facing) into
 * upsert-ready rows: slugs a missing fieldKey from the Greek label,
 * defaults valueType/kind, collapses TABLE-only config, and stamps
 * a stable `order` from array position. Pure — no I/O, safe to unit test
 * without mocking prisma/rbac.
 */
export type FieldWrite = {
  fieldKey: string
  label: string
  section: string | null
  valueType: TemplateField['valueType']
  kind: TemplateField['kind']
  config: { columns: string[] } | null
  regionHint: TemplateField['regionHint'] | null
  aiHint: string | null
  required: boolean
  order: number
}

export function prepareFieldWrites(fields: Partial<TemplateField>[]): FieldWrite[] {
  return fields.map((f, i) => ({
    fieldKey: (f.fieldKey?.trim() || slugFieldKey(f.label ?? '')) || `field_${i + 1}`,
    label: (f.label ?? '').trim(),
    section: f.section?.trim() || null,
    valueType: f.valueType ?? 'CURRENCY',
    kind: f.kind ?? 'SINGLE',
    config: f.kind === 'TABLE' ? { columns: f.config?.columns ?? [] } : null,
    regionHint: f.regionHint ?? null,
    aiHint: f.aiHint?.trim() || null,
    required: !!f.required,
    order: i,
  }))
}
