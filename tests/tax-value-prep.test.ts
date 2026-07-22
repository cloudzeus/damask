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
    expect(rows[1].valueText).toBe('31/12/2024')
    expect(rows[2].valueJson).toEqual([{ label: 'Α', values: ['1'] }])
  })

  it('explodes SERIES entries into one write per year point', () => {
    const rows = prepareValueWrites({ trdrId: 't1', templateId: 'tpl1', year: 2024, recordId: 'r1', entries: [
      { fieldKey: 'tziros', kind: 'SERIES', valueType: 'CURRENCY', series: [{ year: 2023, value: '1.000,00' }, { year: 2024, value: '2.000,00' }, { year: null, value: 'x' }] },
    ] })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ fieldKey: 'tziros', year: 2023 }); expect(Number(rows[0].value)).toBeCloseTo(1000, 2)
    expect(rows[1]).toMatchObject({ fieldKey: 'tziros', year: 2024 }); expect(Number(rows[1].value)).toBeCloseTo(2000, 2)
  })
})
