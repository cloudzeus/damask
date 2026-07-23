import { describe, it, expect } from 'vitest'
import { checkBudgetCompliance, type ComplianceExpense, type ComplianceCategory } from '@/lib/pm/budget-compliance'

const cat = (o: Partial<ComplianceCategory> & { id: string; name: string }): ComplianceCategory => ({
  minAmount: null, maxAmount: null, minPercentage: null, maxPercentage: null, mandatory: false, ...o,
})
const exp = (amount: number, categoryId: string | null, confirmed = true): ComplianceExpense => ({ amount, categoryId, confirmed })

describe('checkBudgetCompliance', () => {
  it('sums confirmed categorized expenses per category', () => {
    const r = checkBudgetCompliance([exp(100, 'a'), exp(50, 'a'), exp(30, 'b')], [cat({ id: 'a', name: 'A' }), cat({ id: 'b', name: 'B' })], 1000)
    expect(r.categories.find(c => c.id === 'a')!.spent).toBe(150)
    expect(r.categories.find(c => c.id === 'a')!.pct).toBeCloseTo(15)
    expect(r.totalSpent).toBe(180)
  })
  it('flags OVER on maxAmount', () => {
    const r = checkBudgetCompliance([exp(500, 'a')], [cat({ id: 'a', name: 'A', maxAmount: 400 })], 1000)
    expect(r.categories[0].status).toBe('OVER')
    expect(r.ok).toBe(false)
  })
  it('flags UNDER only when mandatory + below minAmount', () => {
    const under = checkBudgetCompliance([exp(100, 'a')], [cat({ id: 'a', name: 'A', minAmount: 300, mandatory: true })], 1000)
    expect(under.categories[0].status).toBe('UNDER')
    const notMandatory = checkBudgetCompliance([exp(100, 'a')], [cat({ id: 'a', name: 'A', minAmount: 300, mandatory: false })], 1000)
    expect(notMandatory.categories[0].status).toBe('OK')
  })
  it('percentage limits use totalBudget', () => {
    const r = checkBudgetCompliance([exp(600, 'a')], [cat({ id: 'a', name: 'A', maxPercentage: 50 })], 1000)
    expect(r.categories[0].status).toBe('OVER') // 60% > 50%
  })
  it('pct is null when no budget', () => {
    const r = checkBudgetCompliance([exp(100, 'a')], [cat({ id: 'a', name: 'A', maxPercentage: 50 })], null)
    expect(r.categories[0].pct).toBeNull()
    expect(r.categories[0].status).toBe('OK') // can't evaluate % without budget
  })
  it('uncategorized = active without category or unconfirmed', () => {
    const r = checkBudgetCompliance([exp(40, null), exp(60, 'a', false)], [cat({ id: 'a', name: 'A' })], 1000)
    expect(r.uncategorized).toBe(100)
    expect(r.categories[0].spent).toBe(0)
  })
  it('empty → ok', () => {
    expect(checkBudgetCompliance([], [], 1000).ok).toBe(true)
  })
})
