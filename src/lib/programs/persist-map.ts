// Pure mapping helpers — ExtractedProgram → Prisma-shaped scalars/related rows.
//
// ISOMORPHIC: no prisma import here on purpose, so it stays unit-testable
// without spinning up a DB adapter. `persist.ts` (server-only) imports these
// and does the actual prisma.$transaction write.

import type { ExtractedProgram, ExtractedDeliverableGroup } from '@/lib/programs/types'
import { DELIVERABLE_PHASE_ORDER, type DeliverablePhaseStr } from '@/lib/pm/deliverable-phases'

const VALID_BONUS_KINDS = ['SPEED', 'INNOVATION', 'GREEN', 'EMPLOYMENT'] as const
export type ProgramBonusKindLike = (typeof VALID_BONUS_KINDS)[number] | 'OTHER'

const VALID_DELIVERABLE_PHASES = new Set<string>(DELIVERABLE_PHASE_ORDER)
const DELIVERABLE_PHASE_FALLBACK: DeliverablePhaseStr = 'FULL_CERTIFICATION'

/** invalid/null phase strings fall back to FULL_CERTIFICATION (spec T12.3). */
function toDeliverablePhase(phase: string | null | undefined): DeliverablePhaseStr {
  return phase && VALID_DELIVERABLE_PHASES.has(phase) ? (phase as DeliverablePhaseStr) : DELIVERABLE_PHASE_FALLBACK
}

/**
 * PURE: one ExtractedDeliverableGroup → RelatedRows.deliverableGroups[number].
 * Drops empty-name tasks/groups (defensive — extract.ts's normalize already
 * does this, but this mapper must stay correct for hand-built ExtractedProgram
 * fixtures too, e.g. in tests). Groups left with zero tasks after filtering
 * are dropped, mirroring saveDeliverableTemplate's "at least one task" rule.
 */
function toDeliverableGroupRow(g: ExtractedDeliverableGroup): Omit<RelatedRows['deliverableGroups'][number], 'order'> | null {
  const name = g.name.trim()
  if (!name) return null
  const hint = g.categoryHint?.trim() || null
  const tasks = g.tasks
    .map(t => ({ ...t, name: t.name.trim() }))
    .filter(t => t.name)
    .map((t, tOrder) => ({
      phase: toDeliverablePhase(t.phase),
      name: t.name,
      mandatory: t.mandatory,
      onSiteVerification: t.onSiteVerification,
      minFiles: 1,
      order: tOrder,
    }))
  if (tasks.length === 0) return null
  return {
    name,
    description: hint ? `[${hint}]` : null,
    appliesTo: g.appliesTo === 'APPLICATION' ? 'APPLICATION' : 'EXPENSE',
    tasks,
  }
}

/** Accepts `YYYY-MM-DD` or full ISO datetime strings; anything invalid → null. */
export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

function toBonusKind(kind: string | null | undefined): ProgramBonusKindLike {
  const upper = (kind ?? '').trim().toUpperCase()
  return (VALID_BONUS_KINDS as readonly string[]).includes(upper) ? (upper as ProgramBonusKindLike) : 'OTHER'
}

export type ProgramScalars = {
  title: string
  summary: string | null
  referenceCode: string | null
  publicationDate: Date | null
  submissionStart: Date | null
  submissionEnd: Date | null
  totalBudget: number | null
  fundingRate: number | null
  durationMonths: number | null
  minEmployeesFte: number | null
  minOperationalYears: number | null
  eligibilityNote: string | null
}

/** PURE: Program scalar-field mapping (dates parsed, numbers passed through — Prisma accepts number for Decimal). */
export function toProgramScalars(e: ExtractedProgram): ProgramScalars {
  return {
    title: e.title ?? '',
    summary: e.summary,
    referenceCode: e.referenceCode,
    publicationDate: parseIsoDate(e.publicationDate),
    submissionStart: parseIsoDate(e.submissionStart),
    submissionEnd: parseIsoDate(e.submissionEnd),
    totalBudget: e.totalBudget,
    fundingRate: e.fundingRate,
    durationMonths: e.durationMonths,
    minEmployeesFte: e.minEmployeesFte,
    minOperationalYears: e.minOperationalYears,
    eligibilityNote: e.eligibilityNote,
  }
}

export type RelatedRows = {
  expenseCats: {
    name: string
    minPercentage: number | null
    maxPercentage: number | null
    minAmount: number | null
    maxAmount: number | null
    mandatory: boolean
    notes: string | null
    order: number
  }[]
  kads: { code: string; description: string | null }[]
  bonuses: {
    kind: ProgramBonusKindLike
    name: string
    condition: string | null
    bonusRate: number | null
    bonusAmount: number | null
    order: number
  }[]
  criteria: { name: string; weight: number | null; notes: string | null; order: number }[]
  deadlines: { name: string; date: Date | null; notes: string | null; order: number }[]
  phases: { name: string; order: number }[]
  deliverables: { name: string; description: string | null; mandatory: boolean; order: number; phaseName: string | null }[]
  deliverableGroups: {
    name: string
    description: string | null
    appliesTo: 'EXPENSE' | 'APPLICATION'
    order: number
    tasks: { phase: DeliverablePhaseStr; name: string; mandatory: boolean; onSiteVerification: boolean; minFiles: number; order: number }[]
  }[]
  regions: { name: string; notes: string | null }[]
  legalForms: { name: string }[]
  requiredForms: { name: string; mandatory: boolean; notes: string | null; order: number }[]
}

/** PURE: related-collection mapping, each array element stamped with `order: index`. */
export function toRelatedRows(e: ExtractedProgram): RelatedRows {
  return {
    expenseCats: e.expenseCategories.map((c, order) => ({
      name: c.name,
      minPercentage: c.minPercentage,
      maxPercentage: c.maxPercentage,
      minAmount: c.minAmount,
      maxAmount: c.maxAmount,
      mandatory: c.mandatory,
      notes: c.notes ?? null,
      order,
    })),
    kads: e.kads.map(k => ({ code: k.code, description: k.description ?? null })),
    bonuses: e.bonuses.map((b, order) => ({
      kind: toBonusKind(b.kind),
      name: b.name,
      condition: b.condition ?? null,
      bonusRate: b.bonusRate ?? null,
      bonusAmount: b.bonusAmount ?? null,
      order,
    })),
    criteria: e.criteria.map((c, order) => ({ name: c.name, weight: c.weight ?? null, notes: c.notes ?? null, order })),
    deadlines: e.deadlines.map((d, order) => ({ name: d.name, date: parseIsoDate(d.date), notes: d.notes ?? null, order })),
    phases: e.phases.map((p, order) => ({ name: p.name, order })),
    deliverables: e.deliverables.map((d, order) => ({
      name: d.name,
      description: d.description ?? null,
      mandatory: d.mandatory,
      order,
      phaseName: d.phase ?? null,
    })),
    deliverableGroups: e.deliverableGroups
      .map(toDeliverableGroupRow)
      .filter((g): g is Omit<RelatedRows['deliverableGroups'][number], 'order'> => g !== null)
      .map((g, order) => ({ ...g, order })),
    regions: e.regions.map(r => ({ name: r.name, notes: r.notes ?? null })),
    legalForms: e.eligibleLegalForms.map(name => ({ name })),
    requiredForms: e.requiredForms.map((f, i) => ({ name: f.name, mandatory: f.mandatory, notes: f.notes ?? null, order: i })),
  }
}
