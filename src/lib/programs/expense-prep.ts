// PURE mapping: program expense categories + one expense → CatInput for the
// AI category-suggestion prompt (category-prompt.ts). No prisma/react
// imports — unit-testable in isolation, reused from the server action.
//
// NOTE: Prisma Decimal fields (minPercentage/maxPercentage) come back as
// Decimal objects, not plain numbers — the caller (server action) must
// convert them via Number(...) before passing in here.

import type { CatInput } from '@/lib/programs/category-prompt'

export function expenseCatInput(
  program: {
    expenseCats: {
      id: string
      name: string
      minPercentage?: number | null
      maxPercentage?: number | null
      mandatory?: boolean
      notes?: string | null
    }[]
  },
  expense: { description: string; amount?: number | null; vendor?: string | null },
): CatInput {
  return {
    categories: program.expenseCats.map(c => ({
      id: c.id,
      name: c.name,
      minPercentage: c.minPercentage ?? null,
      maxPercentage: c.maxPercentage ?? null,
      mandatory: !!c.mandatory,
      notes: c.notes ?? null,
    })),
    expense: {
      description: expense.description,
      amount: expense.amount ?? null,
      vendor: expense.vendor ?? null,
    },
  }
}
