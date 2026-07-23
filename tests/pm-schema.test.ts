import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

describe('pm models', () => {
  it('exposes the new models', () => {
    for (const m of ['ApplicationObligation', 'ApplicationDocument', 'ApplicationCriterionScore']) {
      expect((Prisma.ModelName as Record<string, string>)[m]).toBe(m)
    }
  })
})
