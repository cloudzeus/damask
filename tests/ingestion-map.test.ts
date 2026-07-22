import { describe, it, expect } from 'vitest'
import { autoMatchMappings, mapToRows } from '@/lib/ingestion/map'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import type { NormalizedBatch } from '@/lib/ingestion/normalized'

const partner = ingestionTargetByKey('partner')!

describe('autoMatchMappings', () => {
  it('matches by key, label, and alias (accent/case-insensitive)', () => {
    const m = autoMatchMappings(['ΑΦΜ', 'Επωνυμία', 'vat', 'άγνωστο'], partner)
    expect(m.find(x => x.sourceKey === 'ΑΦΜ')?.fieldKey).toBe('afm')
    expect(m.find(x => x.sourceKey === 'Επωνυμία')?.fieldKey).toBe('name')
    expect(m.find(x => x.sourceKey === 'vat')?.fieldKey).toBe('afm')
    expect(m.find(x => x.sourceKey === 'άγνωστο')?.fieldKey).toBe('')
  })
})

describe('mapToRows', () => {
  it('projects each record through mappings into fieldKey→value rows', () => {
    const batch: NormalizedBatch = {
      source: 'api', sourceKeys: [{ key: 'vat' }, { key: 'name' }, { key: 'skip' }],
      records: [{ vat: '094014201', name: 'Damask', skip: 'x' }, { vat: '999', name: 'B', skip: 'y' }],
    }
    const mappings = [
      { sourceKey: 'vat', fieldKey: 'afm' },
      { sourceKey: 'name', fieldKey: 'name' },
      { sourceKey: 'skip', fieldKey: '' },
    ]
    const rows = mapToRows(batch, mappings, partner)
    expect(rows).toEqual([
      { rowNum: 1, values: { afm: '094014201', name: 'Damask' } },
      { rowNum: 2, values: { afm: '999', name: 'B' } },
    ])
  })
})
