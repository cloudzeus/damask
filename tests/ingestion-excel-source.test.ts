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
