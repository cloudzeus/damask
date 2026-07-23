import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deepseek', () => ({
  deepseekChat: vi.fn(async () => JSON.stringify({
    title: 'Ψηφιακός Μετασχηματισμός',
    summary: '…',
    submissionEnd: '2024-12-31',
    totalBudget: '1.000.000,00',
    fundingRate: '65',
    expenseCategories: [{ name: 'Εξοπλισμός', maxPercentage: '50', mandatory: false }],
    deliverables: [{ name: 'Έκθεση', mandatory: true }],
    requiredForms: [{ name: 'Ε3', mandatory: true }],
    deliverableGroups: [
      {
        name: '01.09 Μισθολογικό κόστος',
        categoryHint: 'Δαπάνες προσωπικού',
        appliesTo: 'EXPENSE',
        tasks: [
          { phase: 'FINAL_PAYMENT', name: 'Μισθοδοτικές καταστάσεις', mandatory: true, onSiteVerification: true },
          { phase: 'BOGUS_PHASE', name: 'Ε4', mandatory: true, onSiteVerification: false },
          { phase: null, name: '', mandatory: true, onSiteVerification: false },
        ],
      },
      { name: '', categoryHint: null, appliesTo: 'EXPENSE', tasks: [{ phase: 'SUBMISSION', name: 'x', mandatory: true, onSiteVerification: false }] },
      { name: 'Άδεια χωρίς tasks', categoryHint: null, appliesTo: 'APPLICATION', tasks: [] },
    ],
  })),
}))

import { extractProgramFromText } from '@/lib/programs/extract'

describe('extractProgramFromText', () => {
  it('parses DeepSeek JSON into ExtractedProgram (coerced)', async () => {
    const r = await extractProgramFromText('πλήρες κείμενο PDF…')
    expect(r.data.title).toBe('Ψηφιακός Μετασχηματισμός')
    expect(r.data.totalBudget).toBeCloseTo(1000000, 2)
    expect(r.data.fundingRate).toBe(65)
    expect(r.data.expenseCategories[0]).toMatchObject({ name: 'Εξοπλισμός', maxPercentage: 50 })
    expect(r.data.requiredForms[0]).toMatchObject({ name: 'Ε3', mandatory: true })
    expect(r.model).toBeDefined()
  })

  it('normalizes deliverableGroups: keeps unknown phase strings as-is (validated later in persist-map), drops empty-name tasks/groups and groups left with zero tasks', () => {
    return extractProgramFromText('…').then(r => {
      expect(r.data.deliverableGroups).toHaveLength(1)
      const g = r.data.deliverableGroups[0]
      expect(g).toMatchObject({ name: '01.09 Μισθολογικό κόστος', categoryHint: 'Δαπάνες προσωπικού', appliesTo: 'EXPENSE' })
      expect(g.tasks).toHaveLength(2)
      expect(g.tasks[0]).toMatchObject({ phase: 'FINAL_PAYMENT', name: 'Μισθοδοτικές καταστάσεις', mandatory: true, onSiteVerification: true })
      expect(g.tasks[1]).toMatchObject({ phase: 'BOGUS_PHASE', name: 'Ε4', mandatory: true, onSiteVerification: false })
    })
  })
})
