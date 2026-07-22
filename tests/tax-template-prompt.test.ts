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
