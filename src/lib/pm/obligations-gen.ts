import type { StageStr, ObligationKindStr, TaskAssignToStr } from '@/lib/pm/types'

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

export type TaskTemplateInput = {
  id: string
  stage: StageStr
  title: string
  assignTo: TaskAssignToStr
  mandatory: boolean
  dueOffsetDays: number | null
  order: number
}

export type TaskObligationRow = {
  templateId: string
  kind: 'TASK'
  stage: StageStr
  sourceId: string
  name: string
  mandatory: boolean
  order: number
  assigneeSlot: 'MANAGER' | 'PROCESSOR'
  dueOffsetDays: number | null
}

export function buildTaskObligationRows(templates: TaskTemplateInput[]): TaskObligationRow[] {
  const rows: TaskObligationRow[] = []
  for (const t of templates) {
    const mk = (slot: 'MANAGER' | 'PROCESSOR', sourceId: string): TaskObligationRow => ({
      templateId: t.id, kind: 'TASK', stage: t.stage, sourceId, name: t.title,
      mandatory: t.mandatory, order: t.order, assigneeSlot: slot, dueOffsetDays: t.dueOffsetDays,
    })
    if (t.assignTo === 'MANAGER') rows.push(mk('MANAGER', `task:${t.id}`))
    else if (t.assignTo === 'PROCESSOR') rows.push(mk('PROCESSOR', `task:${t.id}`))
    else { rows.push(mk('MANAGER', `task:${t.id}:manager`)); rows.push(mk('PROCESSOR', `task:${t.id}:processor`)) }
  }
  return rows
}
