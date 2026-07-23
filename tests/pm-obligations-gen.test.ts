import { describe, it, expect } from 'vitest'
import { buildObligationRows, buildCriterionScoreRows } from '@/lib/pm/obligations-gen'

describe('obligations generation', () => {
  it('maps forms→DOCUMENTS, deliverables→EXPENSES_DELIVERABLES with sourceId + stage', () => {
    const rows = buildObligationRows({ requiredForms: [{ id: 'f1', name: 'Ε3', mandatory: true }], deliverables: [{ id: 'd1', name: 'Έκθεση', mandatory: true }] })
    expect(rows.find((r) => r.sourceId === 'f1')).toMatchObject({ kind: 'FORM', stage: 'DOCUMENTS', name: 'Ε3' })
    expect(rows.find((r) => r.sourceId === 'd1')).toMatchObject({ kind: 'DELIVERABLE', stage: 'EXPENSES_DELIVERABLES' })
  })
  it('criterion score rows carry weight snapshot', () => {
    const s = buildCriterionScoreRows([{ id: 'c1', name: 'Κριτήριο', weight: 2 }])
    expect(s[0]).toMatchObject({ criterionId: 'c1', name: 'Κριτήριο', weight: 2, maxScore: 100 })
  })
})
