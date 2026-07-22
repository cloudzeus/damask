import { describe, it, expect } from 'vitest'
import { projectOcr } from '@/lib/ingestion/ocr-project'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { emptyExtractedDocument } from '@/lib/ocr/schema'

const product = ingestionTargetByKey('product')!
const partner = ingestionTargetByKey('partner')!

describe('projectOcr', () => {
  it('project "lines" → one record per invoice line', () => {
    const doc = { ...emptyExtractedDocument('invoice'), lines: [
      { description: 'Πολυθρόνα', quantity: 2, unitPrice: 120.5, vatPct: 24, total: 241 },
      { description: 'Τραπέζι', quantity: 1, unitPrice: 300, vatPct: 24, total: 300 },
    ] }
    const { sourceKeys, records } = projectOcr(doc, product)
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ name: 'Πολυθρόνα', quantity: '2', unitPrice: '120.5' })
    expect(sourceKeys.map(s => s.key)).toEqual(expect.arrayContaining(['name', 'quantity', 'unitPrice', 'vatPct', 'total']))
  })

  it('project "party" → one record from issuer (phones/emails joined to first)', () => {
    const doc = { ...emptyExtractedDocument('invoice'), issuer: {
      name: 'Damask AE', afm: 'EL094014201', address: 'Οδός 1', phones: ['2101234567', '2107654321'],
      emails: ['info@damask.gr'], website: 'damask.gr',
    } }
    const { records } = projectOcr(doc, partner)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ name: 'Damask AE', afm: 'EL094014201', phone: '2101234567', email: 'info@damask.gr', website: 'damask.gr', sodtype: '12' })
  })
})
