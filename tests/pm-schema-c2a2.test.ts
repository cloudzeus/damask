import { describe, it, expect } from 'vitest'
import { Prisma, ExpenseStatus } from '@prisma/client'

describe('C2a.2 schema', () => {
  it('ExpenseStatus enum has ACTIVE/REPLACED', () => {
    expect(Object.values(ExpenseStatus).sort()).toEqual(['ACTIVE', 'REPLACED'])
  })
  it('ProgramExpense has status + replacesExpenseId', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramExpense')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('status')).toBe(true)
    expect(f.has('replacesExpenseId')).toBe(true)
  })
  it('ProgramExpenseCertification model exists with expected fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramExpenseCertification')
    expect(m).toBeTruthy()
    const f = new Set(m!.fields.map(x => x.name))
    for (const k of ['expenseId', 'serialNumber', 'location', 'assetRegistryRef', 'photoKey', 'bankStatementKey', 'newUnusedCertKey', 'paid', 'verified']) {
      expect(f.has(k), `missing ${k}`).toBe(true)
    }
  })
})
