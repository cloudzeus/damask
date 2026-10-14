/**
 * (Plain module.) Κανόνας προσφορών προγράμματος: πότε μια δαπάνη χρειάζεται προσφορά/ές.
 * REQUIRED = πάντα · OPTIONAL = ποτέ · CONDITIONAL = μόνο σε συγκεκριμένες κατηγορίες ή/και πάνω από ποσό · null = άγνωστο (όπως πριν: ζητείται).
 */

export type QuotePolicy = 'REQUIRED' | 'OPTIONAL' | 'CONDITIONAL'
export type QuoteRule = { count?: number | null; minAmount?: number | null; categoryIds?: string[] | null }

export function parseQuoteRule(v: unknown): QuoteRule {
  if (!v || typeof v !== 'object') return {}
  const r = v as Record<string, unknown>
  return {
    count: typeof r.count === 'number' ? r.count : null,
    minAmount: typeof r.minAmount === 'number' ? r.minAmount : null,
    categoryIds: Array.isArray(r.categoryIds) ? r.categoryIds.map(String) : null,
  }
}

/** Χρειάζεται προσφορά αυτή η δαπάνη; (ποσό χωρίς ΦΠΑ) */
export function quoteRequiredFor(policy: string | null | undefined, rule: unknown, expense: { amount: number; categoryId: string | null }): boolean {
  if (policy === 'OPTIONAL') return false
  if (policy !== 'CONDITIONAL') return true
  const r = parseQuoteRule(rule)
  if (r.categoryIds?.length && (!expense.categoryId || !r.categoryIds.includes(expense.categoryId))) return false
  if (r.minAmount != null && expense.amount <= r.minAmount) return false
  return true
}

/** Σύντομη περιγραφή για το UI. */
export function quotePolicyLabel(policy: string | null | undefined, rule: unknown, catNames: Map<string, string>): string {
  if (policy === 'OPTIONAL') return 'Προσφορές: δεν απαιτούνται'
  if (policy === 'REQUIRED') return 'Προσφορές: απαιτούνται'
  if (policy === 'CONDITIONAL') {
    const r = parseQuoteRule(rule)
    const parts = [
      r.categoryIds?.length ? `κατηγορίες ${r.categoryIds.map(id => catNames.get(id) ?? '—').join(', ')}` : null,
      r.minAmount != null ? `άνω των ${r.minAmount.toLocaleString('el-GR')} €` : null,
    ].filter(Boolean)
    return `Προσφορές${r.count ? ` (${r.count})` : ''}: μόνο ${parts.join(' · ') || 'υπό όρους'}`
  }
  return 'Προσφορές: άγνωστος κανόνας'
}
