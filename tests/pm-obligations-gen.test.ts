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

import { buildTaskObligationRows, type TaskTemplateInput } from '@/lib/pm/obligations-gen'

describe('buildTaskObligationRows', () => {
  const base: TaskTemplateInput = { id: 't1', stage: 'DOCUMENTS', title: 'Συλλογή ΑΦΜ', assignTo: 'PROCESSOR', mandatory: true, dueOffsetDays: 5, order: 0 }

  it('MANAGER → one row assigned to manager slot', () => {
    const rows = buildTaskObligationRows([{ ...base, assignTo: 'MANAGER' }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ templateId: 't1', kind: 'TASK', stage: 'DOCUMENTS', sourceId: 'task:t1', name: 'Συλλογή ΑΦΜ', assigneeSlot: 'MANAGER', dueOffsetDays: 5 })
  })
  it('PROCESSOR → one row assigned to processor slot', () => {
    const rows = buildTaskObligationRows([base])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sourceId: 'task:t1', assigneeSlot: 'PROCESSOR' })
  })
  it('BOTH → two rows with distinct sourceIds and slots', () => {
    const rows = buildTaskObligationRows([{ ...base, assignTo: 'BOTH' }])
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.sourceId).sort()).toEqual(['task:t1:manager', 'task:t1:processor'])
    expect(rows.map(r => r.assigneeSlot).sort()).toEqual(['MANAGER', 'PROCESSOR'])
  })
  it('empty input → []', () => { expect(buildTaskObligationRows([])).toEqual([]) })
  it('preserves template order across multiple templates', () => {
    const rows = buildTaskObligationRows([{ ...base, id: 'a', order: 0 }, { ...base, id: 'b', order: 1 }])
    expect(rows.map(r => r.templateId)).toEqual(['a', 'b'])
  })
})
