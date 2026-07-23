import type { StageStr, ObligationKindStr } from '@/lib/pm/types'

export type ObligationRow = { kind: ObligationKindStr; stage: StageStr; sourceId: string; name: string; mandatory: boolean; order: number }
export type CriterionScoreRow = { criterionId: string; name: string; weight: number; maxScore: number; order: number }

export function buildObligationRows(input: {
  requiredForms: { id: string; name: string; mandatory: boolean }[]
  deliverables: { id: string; name: string; mandatory: boolean }[]
}): ObligationRow[] {
  const rows: ObligationRow[] = []
  let i = 0
  for (const f of input.requiredForms) rows.push({ kind: 'FORM', stage: 'DOCUMENTS', sourceId: f.id, name: f.name, mandatory: f.mandatory, order: i++ })
  for (const d of input.deliverables) rows.push({ kind: 'DELIVERABLE', stage: 'EXPENSES_DELIVERABLES', sourceId: d.id, name: d.name, mandatory: d.mandatory, order: i++ })
  return rows
}

export function buildCriterionScoreRows(criteria: { id: string; name: string; weight?: number | null }[]): CriterionScoreRow[] {
  return criteria.map((c, i) => ({ criterionId: c.id, name: c.name, weight: c.weight ?? 1, maxScore: 100, order: i }))
}
