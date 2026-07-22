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

  it('drops regionHint when its bbox fails isValidBbox (out-of-range coordinates)', () => {
    const rows = prepareFieldWrites([
      { label: 'Ζημιά', valueType: 'CURRENCY', kind: 'SINGLE', regionHint: { page: 0, bbox: [0.9, 0.9, 0.5, 0.5] } },
    ] as any)
    expect(rows[0].regionHint).toBeNull()
  })
})
