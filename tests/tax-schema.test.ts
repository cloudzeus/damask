import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
describe('tax form template models', () => {
  it('exposes the new models + enums on the Prisma client', () => {
    expect(Prisma.ModelName.TaxFormTemplate).toBe('TaxFormTemplate')
    expect(Prisma.ModelName.TaxFormTemplateField).toBe('TaxFormTemplateField')
    expect(Prisma.ModelName.TrdrFormRecord).toBe('TrdrFormRecord')
    expect(Prisma.ModelName.TrdrFinancialValue).toBe('TrdrFinancialValue')
  })
})
