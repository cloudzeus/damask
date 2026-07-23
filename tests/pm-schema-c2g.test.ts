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
    // Παραδοτέο (group) — ΧΩΡΙΣ phase/mandatory/onSiteVerification (κατέβηκαν στα tasks)
    ['ProgramDeliverableTemplate', ['programId', 'name', 'description', 'appliesTo', 'order', 'active', 'sourceTemplateId', 'fromExtraction', 'tasks', 'instances']],
    // Task (βήμα ανά φάση) — ΝΕΟ, template-level
    ['ProgramDeliverableTask', ['templateId', 'template', 'phase', 'name', 'description', 'mandatory', 'onSiteVerification', 'minFiles', 'order', 'instances']],
    // Instance ομάδας ανά δαπάνη/έργο — ΧΩΡΙΣ phase/mandatory/onSiteVerification/status/acceptedById/acceptedAt/files/dependencies
    // (documentRequests ΔΕΝ μένει εδώ πια — το FK μετακόμισε στο task, βλ. παρακάτω)
    ['ExpenseDeliverable', ['applicationId', 'expenseId', 'templateId', 'name', 'notes', 'order', 'tasks']],
    // Task instance — ΝΕΟ, κουβαλάει files/deps/status/minFiles/documentRequests
    ['ExpenseDeliverableTask', ['deliverableId', 'taskTemplateId', 'phase', 'name', 'mandatory', 'onSiteVerification', 'minFiles', 'status', 'acceptedById', 'acceptedAt', 'notes', 'order', 'files', 'dependencies', 'dependents', 'documentRequests']],
    ['DeliverableFile', ['taskId', 'name', 'storageKey', 'mimeType', 'size', 'uploadedById']],
    ['DeliverableDependency', ['dependentId', 'prerequisiteId', 'auto']],
  ] as const) {
    it(`${model} fields`, () => {
      const m = Prisma.dmmf.datamodel.models.find(x => x.name === model)!
      const f = new Set(m.fields.map(x => x.name))
      for (const k of fields) expect(f.has(k), `${model}.${k}`).toBe(true)
    })
  }
  it('ProgramDeliverableTemplate no longer carries phase/mandatory/onSiteVerification', () => {
    const m = Prisma.dmmf.datamodel.models.find(x => x.name === 'ProgramDeliverableTemplate')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('phase')).toBe(false)
    expect(f.has('mandatory')).toBe(false)
    expect(f.has('onSiteVerification')).toBe(false)
  })
  it('ExpenseDeliverable no longer carries phase/mandatory/onSiteVerification/status/acceptedById/acceptedAt/files/dependencies', () => {
    const m = Prisma.dmmf.datamodel.models.find(x => x.name === 'ExpenseDeliverable')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['phase', 'mandatory', 'onSiteVerification', 'status', 'acceptedById', 'acceptedAt', 'files', 'dependencies', 'dependents']) {
      expect(f.has(k), `ExpenseDeliverable.${k} should be removed`).toBe(false)
    }
  })
  it('DeliverableFile no longer has deliverableId (renamed to taskId)', () => {
    const m = Prisma.dmmf.datamodel.models.find(x => x.name === 'DeliverableFile')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('deliverableId')).toBe(false)
  })
  it('DocumentRequest has deliverableTaskId (not deliverableId)', () => {
    const m = Prisma.dmmf.datamodel.models.find(x => x.name === 'DocumentRequest')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('deliverableTaskId')).toBe(true)
    expect(f.has('deliverableId')).toBe(false)
  })
})
