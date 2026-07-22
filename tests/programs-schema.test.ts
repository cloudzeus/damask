import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
describe('program models', () => {
  it('exposes the new models', () => {
    for (const m of ['Program','ProgramExpenseCategory','ProgramApplication','ProgramExpense','ProgramDeliverable']) {
      expect((Prisma.ModelName as Record<string,string>)[m]).toBe(m)
    }
  })
})
