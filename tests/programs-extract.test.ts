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
    expect(r.model).toBeDefined()
  })
})
