import { describe, it, expect, vi } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { programExpense: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import { isAmendmentOf, buildAmendmentPlan, originalStart } from '@/lib/pm/approval-amend'
import type { ApprovalExtract } from '@/lib/pm/approval-extract'

const exp = (title: string, net: number) => ({ title, description: title, net, vat: 0, gross: net, quantity: 1, unit: 'Αποκοπή', unitPrice: net, aidPct: 40, category: null, subcategory: null, categoryCode: null, subcategoryCode: null, eligible: net, publicAmount: null })
const extract = (over: Partial<ApprovalExtract>): ApprovalExtract => ({
  applicationCode: 'ΑΝΤ05ΠΠΕ-0010621', beneficiaryCode: null, beneficiaryAfm: null, beneficiaryName: null, submittedAt: null, decisionRef: 'ΑΝΤ05ΠΠΕ_82/31-01-2025', ada: null,
  decisionDate: '2025-01-31', resultStatus: null, projectTitle: null, durationMonths: 30, regionCategory: null, score: null, totalBudget: 100000, publicAmount: 40000, privateAmount: 60000,
  aidPct: 40, expenses: [], indicators: [], ...over,
} as ApprovalExtract)
const current = { applicationCode: 'ΑΝΤ05ΠΠΕ-0010621', decisionRef: 'Α.Π.: 818/21.02.2024', decisionDate: new Date('2024-02-21'), extra: null } as never

describe('isAmendmentOf', () => {
  it('νεότερη απόφαση ίδιου έργου = τροποποίηση', () => expect(isAmendmentOf(extract({}), current)).toBe('newer'))
  it('παλαιότερη απόφαση = older', () => expect(isAmendmentOf(extract({ decisionRef: 'x', decisionDate: '2023-01-01' }), current)).toBe('older'))
  it('ίδια απόφαση (νέα ανάγνωση) = same', () => expect(isAmendmentOf(extract({ decisionRef: 'Α.Π.: 818/21.02.2024', decisionDate: '2024-02-21' }), current)).toBe('same'))
  it('άλλος κωδικός έργου = όχι τροποποίηση', () => expect(isAmendmentOf(extract({ applicationCode: 'ΑΛΛΟ-1' }), current)).toBeNull())
  it('έναρξη = η αρχική απόφαση, όχι η τροποποίηση', () => {
    expect(originalStart({ ...(current as object), extra: { history: [{ decisionDate: '2024-02-21' }] }, decisionDate: new Date('2025-01-31') } as never)).toBe('2024-02-21')
  })
})

describe('buildAmendmentPlan', () => {
  it('ίδια / αλλαγή ποσού / νέα / καταργείται — και δεν καταργεί δαπάνη με αγορά', async () => {
    findMany.mockResolvedValueOnce([
      { id: 'a', description: 'Δαπάνες νέου προσωπικού', amount: 30000, categoryId: 'c1', paymentRequestId: null, purchase: null, certification: null },
      { id: 'b', description: 'ΕΜΜΕΣΕΣ ΔΑΠΑΝΕΣ', amount: 6542.05, categoryId: 'c2', paymentRequestId: null, purchase: null, certification: null },
      { id: 'c', description: 'Προμήθεια εξοπλισμού ενεργειακής απόδοσης', amount: 22000, categoryId: 'c3', paymentRequestId: null, purchase: null, certification: null },
      { id: 'd', description: 'Δαπάνες Προβολής και Εξωστρέφειας', amount: 20000, categoryId: 'c4', paymentRequestId: null, purchase: { id: 'p' }, certification: null },
    ])
    const x = extract({ expenses: [exp('Δαπάνες νέου προσωπικού', 42688.95), exp('ΕΜΜΕΣΕΣ ΔΑΠΑΝΕΣ', 6542.05), exp('ΠΡΟΜΗΘΕΙΑ ΟΡΓΑΝΩΝ ΜΕΤΡΗΣΗΣ ΗΛΕΚΤΡΟΛΟΓΙΚΩΝ', 46769)] as never })
    // Η νέα δαπάνη έχει την ΙΔΙΑ κατηγορία με την «c» — δεν πρέπει να την «κλέψει» λόγω κατηγορίας.
    const plan = await buildAmendmentPlan('app', x, ['c1', 'c2', 'c3'], current)
    const by = Object.fromEntries(plan.rows.map(r => [r.expenseId ?? `new:${r.index}`, r]))
    expect(by.a.change).toBe('changed')
    expect(by.b.change).toBe('same')
    expect(by['new:2'].change).toBe('new')
    expect(by.c.change).toBe('removed')
    expect(by.d).toMatchObject({ change: 'removed', blocked: 'έχει ήδη καταχωρισμένη αγορά' })
  })
})
