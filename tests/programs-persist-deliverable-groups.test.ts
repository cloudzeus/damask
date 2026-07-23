import { describe, it, expect, vi, beforeEach } from 'vitest'

// NOTE: same vi.hoisted(h.db) idiom as tests/pm-c2g-materialize.test.ts —
// mocks must be initialized before any top-level const, and we mutate
// h.db in place across tests. h.db plays double duty here as BOTH the
// object the mocked prisma.$transaction hands the callback (the `tx`
// param inside persist.ts) AND the object assertions run against below.
const h = vi.hoisted(() => ({ db: {} as any }))

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: vi.fn(async (fn: any) => fn(h.db)) },
}))

import { persistExtractedProgram } from '@/lib/programs/persist'
import { emptyExtractedProgram } from '@/lib/programs/types'

function freshDb() {
  h.db.program = { update: vi.fn() }
  h.db.programDeliverable = { deleteMany: vi.fn() }
  h.db.programDeliverableTemplate = {
    deleteMany: vi.fn(),
    create: vi.fn(async ({ data }: any) => ({ id: `tpl-${data.name}` })),
  }
  h.db.programExpenseCategory = { deleteMany: vi.fn() }
  h.db.programKad = { deleteMany: vi.fn() }
  h.db.programBonus = { deleteMany: vi.fn() }
  h.db.programCriterion = { deleteMany: vi.fn() }
  h.db.programDeadline = { deleteMany: vi.fn() }
  h.db.programPhase = { deleteMany: vi.fn(), create: vi.fn(async ({ data }: any) => ({ id: `phase-${data.name}` })) }
  h.db.programRegion = { deleteMany: vi.fn() }
  h.db.programEligibleLegalForm = { deleteMany: vi.fn() }
  h.db.programRequiredForm = { deleteMany: vi.fn() }
  h.db.programDeliverable.createMany = vi.fn()
}

describe('persistExtractedProgram — deliverableGroups (C2g Task 12)', () => {
  beforeEach(freshDb)

  it('re-extraction: deletes ONLY extraction-created ProgramDeliverableTemplate rows before recreating (wizard/library groups — fromExtraction:false — must survive)', async () => {
    const e = { ...emptyExtractedProgram(), title: 'T' }
    await persistExtractedProgram('p1', e)
    expect(h.db.programDeliverableTemplate.deleteMany).toHaveBeenCalledWith({ where: { programId: 'p1', fromExtraction: true } })
    expect(h.db.programDeliverableTemplate.create).not.toHaveBeenCalled()
  })

  it('creates one ProgramDeliverableTemplate per group with nested ProgramDeliverableTask create', async () => {
    const e = {
      ...emptyExtractedProgram(),
      title: 'T',
      deliverableGroups: [
        {
          name: '01.09 Μισθολογικό κόστος',
          categoryHint: 'Δαπάνες προσωπικού',
          appliesTo: 'EXPENSE' as const,
          tasks: [
            { phase: 'FINAL_PAYMENT', name: 'Μισθοδοτικές καταστάσεις', mandatory: true, onSiteVerification: true },
            { phase: 'BOGUS', name: 'Ε4', mandatory: true, onSiteVerification: true },
          ],
        },
        {
          name: 'Άδεια λειτουργίας',
          categoryHint: null,
          appliesTo: 'APPLICATION' as const,
          tasks: [{ phase: 'FULL_CERTIFICATION', name: 'Άδεια σε ισχύ', mandatory: true, onSiteVerification: true }],
        },
      ],
    }
    await persistExtractedProgram('p1', e)

    expect(h.db.programDeliverableTemplate.deleteMany).toHaveBeenCalledWith({ where: { programId: 'p1', fromExtraction: true } })
    expect(h.db.programDeliverableTemplate.create).toHaveBeenCalledTimes(2)

    const [firstCall, secondCall] = h.db.programDeliverableTemplate.create.mock.calls.map((c: any) => c[0].data)
    expect(firstCall).toMatchObject({
      programId: 'p1', name: '01.09 Μισθολογικό κόστος', description: '[Δαπάνες προσωπικού]', appliesTo: 'EXPENSE', order: 0,
      fromExtraction: true,
    })
    expect(firstCall.tasks.create).toEqual([
      { phase: 'FINAL_PAYMENT', name: 'Μισθοδοτικές καταστάσεις', mandatory: true, onSiteVerification: true, minFiles: 1, order: 0 },
      { phase: 'FULL_CERTIFICATION', name: 'Ε4', mandatory: true, onSiteVerification: true, minFiles: 1, order: 1 },
    ])

    expect(secondCall).toMatchObject({ programId: 'p1', name: 'Άδεια λειτουργίας', description: null, appliesTo: 'APPLICATION', order: 1, fromExtraction: true })
    expect(secondCall.tasks.create).toEqual([
      { phase: 'FULL_CERTIFICATION', name: 'Άδεια σε ισχύ', mandatory: true, onSiteVerification: true, minFiles: 1, order: 0 },
    ])
  })
})
