import { describe, it, expect } from 'vitest'
import { expenseCatInput } from '@/lib/programs/expense-prep'

describe('expenseCatInput', () => {
  it('maps program categories + expense → CatInput', () => {
    const inp = expenseCatInput(
      { expenseCats: [{ id: 'c1', name: 'Εξοπλισμός', maxPercentage: 50, mandatory: false, notes: null }] },
      { description: 'laptop', amount: 1200, vendor: 'ΠΛΑΙΣΙΟ' },
    )
    expect(inp.categories[0]).toMatchObject({ id: 'c1', name: 'Εξοπλισμός', maxPercentage: 50 })
    expect(inp.expense.description).toBe('laptop')
  })
})
