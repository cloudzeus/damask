export type ComplianceExpense = { amount: number; categoryId: string | null; confirmed: boolean }
export type ComplianceCategory = {
  id: string; name: string
  minAmount: number | null; maxAmount: number | null
  minPercentage: number | null; maxPercentage: number | null
  mandatory: boolean
}
export type ComplianceStatus = 'OK' | 'UNDER' | 'OVER'
export type CategoryCompliance = ComplianceCategory & { spent: number; pct: number | null; status: ComplianceStatus }
export type BudgetCompliance = {
  categories: CategoryCompliance[]
  uncategorized: number
  totalSpent: number
  totalBudget: number | null
  ok: boolean
  violations: { categoryId: string; name: string; type: 'UNDER' | 'OVER' }[]
}

export function checkBudgetCompliance(
  activeExpenses: ComplianceExpense[],
  categories: ComplianceCategory[],
  totalBudget: number | null,
): BudgetCompliance {
  const totalSpent = activeExpenses.reduce((s, e) => s + e.amount, 0)
  const uncategorized = activeExpenses
    .filter(e => !e.categoryId || !e.confirmed)
    .reduce((s, e) => s + e.amount, 0)

  const cats = categories.map<CategoryCompliance>(c => {
    const spent = activeExpenses
      .filter(e => e.confirmed && e.categoryId === c.id)
      .reduce((s, e) => s + e.amount, 0)
    const pct = totalBudget && totalBudget > 0 ? (spent / totalBudget) * 100 : null
    let status: ComplianceStatus = 'OK'
    const over = (c.maxAmount != null && spent > c.maxAmount) || (c.maxPercentage != null && pct != null && pct > c.maxPercentage)
    const under = c.mandatory && ((c.minAmount != null && spent < c.minAmount) || (c.minPercentage != null && pct != null && pct < c.minPercentage))
    if (over) status = 'OVER'
    else if (under) status = 'UNDER'
    return { ...c, spent, pct, status }
  })

  const violations = cats.filter(c => c.status !== 'OK').map(c => ({ categoryId: c.id, name: c.name, type: c.status as 'UNDER' | 'OVER' }))
  return { categories: cats, uncategorized, totalSpent, totalBudget, ok: violations.length === 0, violations }
}
