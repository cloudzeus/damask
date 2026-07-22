import { describe, it, expect } from 'vitest'
import { validateRows } from '@/lib/ingestion/validate'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'

const partner = ingestionTargetByKey('partner')!

describe('validateRows', () => {
  it('parses valid rows and reports parsed values keyed by fieldKey', () => {
    const rows = [{ rowNum: 1, values: { afm: 'EL094014201', name: 'Damask', email: 'a@b.gr' } }]
    const { parsed, errors } = validateRows(rows, partner)
    expect(errors).toEqual([])
    expect(parsed[0]).toMatchObject({ rowNum: 1, ok: true, data: { afm: '094014201', name: 'Damask', email: 'a@b.gr', sodtype: 13 } })
  })

  it('flags missing required + bad formats with Greek cause+fix', () => {
    const rows = [{ rowNum: 1, values: { afm: '12', email: 'nope' } }]
    const { errors } = validateRows(rows, partner)
    const cols = errors.map(e => e.column)
    expect(cols).toContain('Επωνυμία')
    expect(cols).toContain('ΑΦΜ')
    expect(cols).toContain('Email')
  })

  it('flags duplicate uniqueBy within the batch (keeps first clean)', () => {
    const rows = [
      { rowNum: 1, values: { afm: '094014201', name: 'A' } },
      { rowNum: 2, values: { afm: '094014201', name: 'B' } },
    ]
    const { errors } = validateRows(rows, partner)
    const dup = errors.find(e => e.row === 2 && /ΑΦΜ/i.test(e.column))
    expect(dup?.message).toMatch(/διπλότυπ/i)
  })
})
