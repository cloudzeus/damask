import { describe, it, expect } from 'vitest'
import { Prisma, TaskAssignTo } from '@prisma/client'

describe('C2e schema', () => {
  it('exposes ProgramTaskTemplate model with expected fields', () => {
    const model = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramTaskTemplate')
    expect(model).toBeTruthy()
    const fields = new Set(model!.fields.map(f => f.name))
    for (const f of ['programId', 'stage', 'title', 'assignTo', 'mandatory', 'dueOffsetDays', 'order', 'active']) {
      expect(fields.has(f), `missing field ${f}`).toBe(true)
    }
  })
  it('TaskAssignTo enum has MANAGER/PROCESSOR/BOTH', () => {
    // Note: Prisma.dmmf.datamodel.enums is empty for ALL enums in this Prisma 7.8
    // client build (pre-existing, not specific to this enum) — assert via the
    // generated runtime enum object instead, which carries the same values.
    expect(Object.values(TaskAssignTo).sort()).toEqual(['BOTH', 'MANAGER', 'PROCESSOR'])
  })
  it('ApplicationObligation has templateId', () => {
    const model = Prisma.dmmf.datamodel.models.find(m => m.name === 'ApplicationObligation')
    expect(model!.fields.some(f => f.name === 'templateId')).toBe(true)
  })
})
