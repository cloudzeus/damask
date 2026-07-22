import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deepseek', () => ({
  deepseekChat: vi.fn(async () => JSON.stringify({ categoryId: 'c1', reason: 'Πάγιος εξοπλισμός', confidence: 0.82 })),
}))

import { suggestCategory } from '@/lib/programs/categorize'

describe('suggestCategory', () => {
  it('returns the model suggestion parsed', async () => {
    const r = await suggestCategory({ categories: [{ id: 'c1', name: 'Εξοπλισμός' }], expense: { description: 'laptop', amount: 1200 } })
    expect(r).toMatchObject({ categoryId: 'c1', confidence: 0.82 })
    expect(r.reason).toContain('εξοπλισμ')
  })
})
