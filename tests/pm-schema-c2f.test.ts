import { describe, it, expect } from 'vitest'
import { Prisma, PaymentRequestStatus } from '@prisma/client'
describe('C2f schema', () => {
  it('PaymentRequestStatus enum', () => {
    expect(Object.values(PaymentRequestStatus).sort()).toEqual(['APPROVED', 'DRAFT', 'PAID', 'REJECTED', 'SUBMITTED'])
  })
  it('PaymentRequest model fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'PaymentRequest')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['applicationId', 'ordinal', 'title', 'targetAmount', 'status', 'paidAmount', 'expenses']) expect(f.has(k), k).toBe(true)
  })
  it('ProgramExpense has paymentRequestId', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramExpense')!
    expect(m.fields.some(x => x.name === 'paymentRequestId')).toBe(true)
  })
})
