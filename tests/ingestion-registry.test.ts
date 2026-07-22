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
