export type ExtractedExpenseCategory = {
  name: string
  minPercentage: number | null
  maxPercentage: number | null
  minAmount: number | null
  maxAmount: number | null
  mandatory: boolean
  notes?: string | null
}

export type ExtractedDeliverable = {
  name: string
  description?: string | null
  phase?: string | null
  mandatory: boolean
}

export type ExtractedProgram = {
  title: string | null
  summary: string | null
  referenceCode: string | null
  publicationDate: string | null
  submissionStart: string | null
  submissionEnd: string | null
  totalBudget: number | null
  fundingRate: number | null
  durationMonths: number | null
  minEmployeesFte: number | null
  minOperationalYears: number | null
  eligibilityNote: string | null
  kadRule: string | null
  expenseCategories: ExtractedExpenseCategory[]
  deliverables: ExtractedDeliverable[]
  phases: { name: string }[]
  kads: { code: string; description?: string | null }[]
  bonuses: { kind?: string | null; name: string; condition?: string | null; bonusRate?: number | null; bonusAmount?: number | null }[]
  criteria: { name: string; weight?: number | null; notes?: string | null }[]
  deadlines: { name: string; date?: string | null; notes?: string | null }[]
  regions: { name: string; notes?: string | null }[]
  eligibleLegalForms: string[]
}

export function coerceMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (!s || /^[.,-]+$/.test(s)) return null
  s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function coercePercent(v: unknown): number | null {
  const n = coerceMoney(v)
  if (n == null) return null
  return Math.max(0, Math.min(100, n))
}

export function emptyExtractedProgram(): ExtractedProgram {
  return {
    title: null,
    summary: null,
    referenceCode: null,
    publicationDate: null,
    submissionStart: null,
    submissionEnd: null,
    totalBudget: null,
    fundingRate: null,
    durationMonths: null,
    minEmployeesFte: null,
    minOperationalYears: null,
    eligibilityNote: null,
    kadRule: null,
    expenseCategories: [],
    deliverables: [],
    phases: [],
    kads: [],
    bonuses: [],
    criteria: [],
    deadlines: [],
    regions: [],
    eligibleLegalForms: [],
  }
}
