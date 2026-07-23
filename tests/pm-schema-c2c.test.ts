import { describe, it, expect } from 'vitest'
import { Prisma, ReminderStatus } from '@prisma/client'
describe('C2c schema', () => {
  it('ReminderStatus enum', () => { expect(Object.values(ReminderStatus).sort()).toEqual(['FAILED', 'SENT', 'SKIPPED']) })
  it('ReminderLog fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ReminderLog')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['userId', 'email', 'dueSoonCount', 'overdueCount', 'status', 'sentAt']) expect(f.has(k), k).toBe(true)
  })
})
