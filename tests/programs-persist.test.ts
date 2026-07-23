import { describe, it, expect } from 'vitest'
import { toProgramScalars, toRelatedRows } from '@/lib/programs/persist-map'
import { emptyExtractedProgram } from '@/lib/programs/types'

describe('persist mapping', () => {
  it('maps scalars + related rows from an ExtractedProgram', () => {
    const e = {
      ...emptyExtractedProgram(),
      title: 'T',
      totalBudget: 1000000,
      fundingRate: 65,
      submissionEnd: '2024-12-31',
      expenseCategories: [
        { name: 'Εξοπλισμός', minPercentage: null, maxPercentage: 50, minAmount: null, maxAmount: null, mandatory: true },
      ],
      deliverables: [{ name: 'Έκθεση', description: null, phase: 'Φάση Α', mandatory: true }],
      requiredForms: [{ name: 'Ε3', mandatory: true, notes: null }],
    }
    const s = toProgramScalars(e)
    expect(s.title).toBe('T')
    expect(Number(s.totalBudget)).toBe(1000000)
    expect(Number(s.fundingRate)).toBe(65)
    expect(s.submissionEnd instanceof Date).toBe(true)

    const r = toRelatedRows(e)
    expect(r.expenseCats[0]).toMatchObject({ name: 'Εξοπλισμός', maxPercentage: 50, mandatory: true, order: 0 })
    expect(r.deliverables[0]).toMatchObject({ name: 'Έκθεση', mandatory: true, phaseName: 'Φάση Α' })
    expect(r.requiredForms[0]).toMatchObject({ name: 'Ε3', mandatory: true, order: 0 })
  })

  it('does NOT include kadRule in program scalars (no such column)', () => {
    expect('kadRule' in (toProgramScalars(emptyExtractedProgram()) as Record<string, unknown>)).toBe(false)
  })
})

describe('persist mapping — deliverableGroups (C2g Task 12)', () => {
  it('maps a valid group + tasks, order stamped, minFiles forced to 1', () => {
    const e = {
      ...emptyExtractedProgram(),
      deliverableGroups: [
        {
          name: '01.09 Μισθολογικό κόστος',
          categoryHint: 'Δαπάνες προσωπικού',
          appliesTo: 'EXPENSE' as const,
          tasks: [
            { phase: 'FINAL_PAYMENT', name: 'Μισθοδοτικές καταστάσεις', mandatory: true, onSiteVerification: true },
            { phase: 'FULL_CERTIFICATION', name: 'Ε4', mandatory: true, onSiteVerification: true },
          ],
        },
      ],
    }
    const r = toRelatedRows(e)
    expect(r.deliverableGroups).toHaveLength(1)
    const g = r.deliverableGroups[0]
    expect(g).toMatchObject({ name: '01.09 Μισθολογικό κόστος', description: '[Δαπάνες προσωπικού]', appliesTo: 'EXPENSE', order: 0 })
    expect(g.tasks).toHaveLength(2)
    expect(g.tasks[0]).toMatchObject({ phase: 'FINAL_PAYMENT', name: 'Μισθοδοτικές καταστάσεις', mandatory: true, onSiteVerification: true, minFiles: 1, order: 0 })
    expect(g.tasks[1]).toMatchObject({ phase: 'FULL_CERTIFICATION', order: 1 })
  })

  it('falls back invalid/null task phases to FULL_CERTIFICATION', () => {
    const e = {
      ...emptyExtractedProgram(),
      deliverableGroups: [
        {
          name: 'Ομάδα',
          categoryHint: null,
          appliesTo: 'APPLICATION' as const,
          tasks: [
            { phase: 'NOT_A_REAL_PHASE', name: 't1', mandatory: true, onSiteVerification: false },
            { phase: null, name: 't2', mandatory: false, onSiteVerification: false },
          ],
        },
      ],
    }
    const r = toRelatedRows(e)
    expect(r.deliverableGroups[0].description).toBeNull()
    expect(r.deliverableGroups[0].tasks.map(t => t.phase)).toEqual(['FULL_CERTIFICATION', 'FULL_CERTIFICATION'])
  })

  it('drops empty-name tasks; drops groups left with zero tasks; drops empty-name groups', () => {
    const e = {
      ...emptyExtractedProgram(),
      deliverableGroups: [
        { name: '  ', categoryHint: null, appliesTo: 'EXPENSE' as const, tasks: [{ phase: 'SUBMISSION', name: 'x', mandatory: true, onSiteVerification: false }] },
        { name: 'Μόνο κενά tasks', categoryHint: null, appliesTo: 'EXPENSE' as const, tasks: [{ phase: 'SUBMISSION', name: '   ', mandatory: true, onSiteVerification: false }] },
        {
          name: 'Έγκυρη ομάδα',
          categoryHint: null,
          appliesTo: 'EXPENSE' as const,
          tasks: [
            { phase: 'SUBMISSION', name: '', mandatory: true, onSiteVerification: false },
            { phase: 'SUBMISSION', name: 'Έγκυρο task', mandatory: true, onSiteVerification: false },
          ],
        },
      ],
    }
    const r = toRelatedRows(e)
    expect(r.deliverableGroups).toHaveLength(1)
    expect(r.deliverableGroups[0]).toMatchObject({ name: 'Έγκυρη ομάδα', order: 0 })
    expect(r.deliverableGroups[0].tasks).toHaveLength(1)
    expect(r.deliverableGroups[0].tasks[0].name).toBe('Έγκυρο task')
  })

  it('emptyExtractedProgram → empty deliverableGroups', () => {
    expect(toRelatedRows(emptyExtractedProgram()).deliverableGroups).toEqual([])
  })
})
