import { describe, it, expect } from 'vitest'
import { Prisma, DeliverablePhase, DeliverableStatus, DeliverableScope } from '@prisma/client'
describe('C2g schema', () => {
  it('DeliverablePhase has the 9 phases', () => {
    expect(Object.values(DeliverablePhase).sort()).toEqual(['APPROVAL', 'ASSESSMENT', 'AUTHORITY_AUDIT', 'FINAL_PAYMENT', 'FIRST_PAYMENT', 'FULL_CERTIFICATION', 'MODIFICATION', 'PHASE_A_CERTIFICATION', 'SUBMISSION'])
  })
  it('DeliverableStatus + DeliverableScope', () => {
    expect(Object.values(DeliverableStatus).sort()).toEqual(['ACCEPTED', 'PENDING', 'REJECTED', 'UPLOADED', 'WAIVED'])
    expect(Object.values(DeliverableScope).sort()).toEqual(['APPLICATION', 'EXPENSE'])
  })
  for (const [model, fields] of [
    ['ProgramDeliverableTemplate', ['programId', 'phase', 'name', 'mandatory', 'onSiteVerification', 'appliesTo', 'order', 'active', 'sourceTemplateId']],
    ['ExpenseDeliverable', ['applicationId', 'expenseId', 'templateId', 'phase', 'name', 'mandatory', 'onSiteVerification', 'status', 'acceptedById', 'order']],
    ['DeliverableFile', ['deliverableId', 'name', 'storageKey', 'mimeType', 'size', 'uploadedById']],
    ['DeliverableDependency', ['dependentId', 'prerequisiteId', 'auto']],
  ] as const) {
    it(`${model} fields`, () => {
      const m = Prisma.dmmf.datamodel.models.find(x => x.name === model)!
      const f = new Set(m.fields.map(x => x.name))
      for (const k of fields) expect(f.has(k), `${model}.${k}`).toBe(true)
    })
  }
  it('DocumentRequest has deliverableId', () => {
    const m = Prisma.dmmf.datamodel.models.find(x => x.name === 'DocumentRequest')!
    expect(m.fields.some(x => x.name === 'deliverableId')).toBe(true)
  })
})
