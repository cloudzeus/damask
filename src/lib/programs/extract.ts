import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { PROGRAM_SYSTEM_PROMPT, PROGRAM_JSON_SHAPE } from '@/lib/programs/extract-prompt'
import { emptyExtractedProgram, coerceMoney, coercePercent, type ExtractedProgram } from '@/lib/programs/types'

/**
 * Server-side εξαγωγή δομημένων δεδομένων προγράμματος χρηματοδότησης από πλήρες
 * κείμενο PDF (ήδη εξαγμένο via pdfjs — Task 6) → DeepSeek chat → ανεκτικό JSON
 * parse (parseJsonLoose, με jsonrepair fallback) → normalized ExtractedProgram
 * (ελληνικά νούμερα/ποσοστά coerced, junk rows φιλτραρισμένα).
 *
 * Primary model: deepseek-chat. Αν λείπουν ≥2 από τα βασικά πεδία μετά το parse,
 * ξαναδοκιμάζουμε με deepseek-reasoner (πιο αργό/ακριβό αλλά καλύτερο σε μεγάλα
 * ΕΣΠΑ PDF) — κρατάμε όποιο αποτέλεσμα έχει λιγότερα missing.
 */

const REQUIRED = ['title', 'summary', 'submissionEnd', 'totalBudget'] as const
const PRIMARY = 'deepseek-chat'
const FALLBACK = 'deepseek-reasoner'
const TIMEOUT = 5 * 60 * 1000

export type ExtractProgramResult = {
  data: ExtractedProgram
  model: string
  tokensUsed: number | null
  retried: boolean
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function intOrNull(v: unknown): number | null {
  const n = coerceMoney(v)
  return n == null ? null : Math.round(n)
}

/** Ανεκτικό parse: πρώτα parseJsonLoose (ήδη αφαιρεί code fences/κόβει {...}),
 * αν αποτύχει καταφεύγουμε στο jsonrepair πάνω στο εξαγόμενο {...} block. */
async function repairParse(s: string): Promise<Record<string, unknown>> {
  try {
    const p = parseJsonLoose(s)
    if (p && typeof p === 'object') return p as Record<string, unknown>
  } catch {
    /* fall through to jsonrepair */
  }
  const { jsonrepair } = await import('jsonrepair')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  const cand = start !== -1 && end > start ? s.slice(start, end + 1) : s
  return JSON.parse(jsonrepair(cand)) as Record<string, unknown>
}

function countMissing(raw: Record<string, unknown>): number {
  return REQUIRED.reduce((n, k) => (raw[k] == null || raw[k] === '' ? n + 1 : n), 0)
}

function normalize(raw: Record<string, unknown>): ExtractedProgram {
  const e = emptyExtractedProgram()
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as Record<string, unknown>[]) : [])
  return {
    ...e,
    title: str(raw.title),
    summary: str(raw.summary),
    referenceCode: str(raw.referenceCode),
    publicationDate: str(raw.publicationDate),
    submissionStart: str(raw.submissionStart),
    submissionEnd: str(raw.submissionEnd),
    totalBudget: coerceMoney(raw.totalBudget),
    fundingRate: coercePercent(raw.fundingRate),
    durationMonths: intOrNull(raw.durationMonths),
    minEmployeesFte: coerceMoney(raw.minEmployeesFte),
    minOperationalYears: coerceMoney(raw.minOperationalYears),
    eligibilityNote: str(raw.eligibilityNote),
    kadRule: str(raw.kadRule),
    expenseCategories: arr('expenseCategories')
      .map(c => ({
        name: str(c.name) ?? '',
        minPercentage: coercePercent(c.minPercentage),
        maxPercentage: coercePercent(c.maxPercentage),
        minAmount: coerceMoney(c.minAmount),
        maxAmount: coerceMoney(c.maxAmount),
        mandatory: !!c.mandatory,
        notes: str(c.notes),
      }))
      .filter(c => c.name),
    deliverables: arr('deliverables')
      .map(d => ({
        name: str(d.name) ?? '',
        description: str(d.description),
        phase: str(d.phase),
        mandatory: d.mandatory !== false,
      }))
      .filter(d => d.name),
    deliverableGroups: arr('deliverableGroups')
      .map(g => ({
        name: str(g.name) ?? '',
        categoryHint: str(g.categoryHint),
        appliesTo: g.appliesTo === 'APPLICATION' ? ('APPLICATION' as const) : ('EXPENSE' as const),
        tasks: (Array.isArray(g.tasks) ? (g.tasks as Record<string, unknown>[]) : [])
          .map(t => ({
            phase: str(t.phase),
            name: str(t.name) ?? '',
            mandatory: t.mandatory !== false,
            onSiteVerification: !!t.onSiteVerification,
          }))
          .filter(t => t.name),
      }))
      .filter(g => g.name && g.tasks.length > 0),
    requiredForms: arr('requiredForms')
      .map(f => ({ name: str(f.name) ?? '', mandatory: f.mandatory !== false, notes: str(f.notes) }))
      .filter(f => f.name),
    phases: arr('phases')
      .map(p => ({ name: str(p.name) ?? '' }))
      .filter(p => p.name),
    kads: arr('kads')
      .map(k => ({ code: str(k.code) ?? '', description: str(k.description) }))
      .filter(k => k.code),
    bonuses: arr('bonuses')
      .map(b => ({
        kind: str(b.kind),
        name: str(b.name) ?? '',
        condition: str(b.condition),
        bonusRate: coercePercent(b.bonusRate),
        bonusAmount: coerceMoney(b.bonusAmount),
      }))
      .filter(b => b.name),
    criteria: arr('criteria')
      .map(c => ({ name: str(c.name) ?? '', weight: coerceMoney(c.weight), notes: str(c.notes) }))
      .filter(c => c.name),
    deadlines: arr('deadlines')
      .map(d => ({ name: str(d.name) ?? '', date: str(d.date), notes: str(d.notes) }))
      .filter(d => d.name),
    regions: arr('regions')
      .map(r => ({ name: str(r.name) ?? '', notes: str(r.notes) }))
      .filter(r => r.name),
    eligibleLegalForms: (Array.isArray(raw.eligibleLegalForms) ? raw.eligibleLegalForms : [])
      .map(x => String(x))
      .filter(Boolean),
  }
}

export async function extractProgramFromText(
  text: string,
  opts: { refId?: string | null; userId?: string | null } = {},
): Promise<ExtractProgramResult> {
  const messages = [
    { role: 'system' as const, content: PROGRAM_SYSTEM_PROMPT + '\n\n' + PROGRAM_JSON_SHAPE },
    { role: 'user' as const, content: text },
  ]

  let model = PRIMARY
  let retried = false

  const first = await deepseekChat(messages, {
    model: PRIMARY,
    maxTokens: 8000,
    timeoutMs: TIMEOUT,
    scope: 'OTHER',
    refType: 'program',
    refId: opts.refId,
    userId: opts.userId,
  })
  let raw = await repairParse(first)

  if (countMissing(raw) >= 2) {
    retried = true
    model = FALLBACK
    try {
      const second = await deepseekChat(messages, {
        model: FALLBACK,
        maxTokens: 8000,
        timeoutMs: TIMEOUT,
        scope: 'OTHER',
        refType: 'program',
        refId: opts.refId,
        userId: opts.userId,
      })
      const raw2 = await repairParse(second)
      if (countMissing(raw2) < countMissing(raw)) {
        raw = raw2
      } else {
        model = PRIMARY
      }
    } catch {
      model = PRIMARY
    }
  }

  return { data: normalize(raw), model, tokensUsed: null, retried }
}
