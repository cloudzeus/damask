import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { deepseekChat } from '@/lib/deepseek'
import { PROGRAM_CMS_SYSTEM_PROMPT, PROGRAM_CMS_JSON_SHAPE, buildProgramCmsUserMessage } from '@/lib/programs/cms-prompt'

/**
 * Παραγωγή/αποθήκευση public CMS περιεχομένου προγράμματος (SEO/GEO/AEO + marketing)
 * μέσω DeepSeek, με βάση την αποδελτίωση. Plain module — καλείται από server actions
 * (programs/actions.ts) ΜΕΤΑ τον permission gate, ΚΑΙ αυτόματα από το extractProgram.
 */

export type ProgramCmsFaq = { q: string; a: string }
export type ProgramCms = {
  seoTitle: string
  seoDescription: string
  keywords: string[]
  heroTag: string
  heroTitle: string
  heroSubtitle: string
  cardTitle: string
  cardSummary: string
  amountDisplay: string
  amountNote: string
  overview: string
  audience: string[]
  eligibleExpenses: string[]
  benefits: string[]
  faq: ProgramCmsFaq[]
  deadlineText?: string
  regionText?: string
}

const CMS_MODEL = 'deepseek-chat'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => str(x)).filter(Boolean) : [])

function normalizeCms(raw: Record<string, unknown>): ProgramCms {
  const faq = Array.isArray(raw.faq)
    ? (raw.faq as unknown[]).map(f => {
        const o = (f ?? {}) as Record<string, unknown>
        return { q: str(o.q), a: str(o.a) }
      }).filter(f => f.q && f.a)
    : []
  return {
    seoTitle: str(raw.seoTitle),
    seoDescription: str(raw.seoDescription),
    keywords: strArr(raw.keywords),
    heroTag: str(raw.heroTag),
    heroTitle: str(raw.heroTitle),
    heroSubtitle: str(raw.heroSubtitle),
    cardTitle: str(raw.cardTitle),
    cardSummary: str(raw.cardSummary),
    amountDisplay: str(raw.amountDisplay),
    amountNote: str(raw.amountNote),
    overview: str(raw.overview),
    audience: strArr(raw.audience),
    eligibleExpenses: strArr(raw.eligibleExpenses),
    benefits: strArr(raw.benefits),
    faq,
    deadlineText: str(raw.deadlineText) || undefined,
    regionText: str(raw.regionText) || undefined,
  }
}

async function repairParse(s: string): Promise<Record<string, unknown>> {
  const { jsonrepair } = await import('jsonrepair')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  const cand = start !== -1 && end > start ? s.slice(start, end + 1) : s
  return JSON.parse(jsonrepair(cand)) as Record<string, unknown>
}

/** Συγκεντρώνει τα δεδομένα αποδελτίωσης του προγράμματος σε context για το μοντέλο. */
async function collectProgramData(programId: string): Promise<Record<string, unknown> | null> {
  const p = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      expenseCats: { orderBy: { order: 'asc' }, select: { name: true } },
      deliverables: { orderBy: { order: 'asc' }, select: { name: true } },
      criteria: { orderBy: { order: 'asc' }, select: { name: true } },
      bonuses: { orderBy: { order: 'asc' }, select: { name: true } },
      kads: { select: { code: true, description: true }, take: 40 },
      regions: { select: { name: true }, take: 30 },
      legalForms: { select: { name: true } },
    },
  })
  if (!p) return null
  return {
    title: p.title,
    summary: p.summary,
    referenceCode: p.referenceCode,
    totalBudget: p.totalBudget,
    fundingRate: p.fundingRate,
    durationMonths: p.durationMonths,
    submissionStart: p.submissionStart,
    submissionEnd: p.submissionEnd,
    minEmployeesFte: p.minEmployeesFte,
    minOperationalYears: p.minOperationalYears,
    eligibilityNote: p.eligibilityNote,
    expenseCategories: p.expenseCats.map(c => c.name),
    deliverables: p.deliverables.map(d => d.name),
    criteria: p.criteria.map(c => c.name),
    bonuses: p.bonuses.map(b => b.name),
    kads: p.kads.map(k => `${k.code} ${k.description ?? ''}`.trim()),
    regions: p.regions.map(r => r.name),
    legalForms: p.legalForms.map(l => l.name),
    extractedData: p.extractedData ?? null,
  }
}

/** Παράγει το CMS περιεχόμενο μέσω DeepSeek και το αποθηκεύει στο Program.cmsContent. */
export async function generateProgramCms(
  programId: string,
  opts: { userId?: string | null } = {},
): Promise<ProgramCms> {
  const data = await collectProgramData(programId)
  if (!data) throw new Error('Το πρόγραμμα δεν βρέθηκε.')

  const raw = await deepseekChat(
    [
      { role: 'system', content: `${PROGRAM_CMS_SYSTEM_PROMPT}\n\nΣΧΗΜΑ JSON:\n${PROGRAM_CMS_JSON_SHAPE}` },
      { role: 'user', content: buildProgramCmsUserMessage(data) },
    ],
    { model: CMS_MODEL, temperature: 0.5, maxTokens: 4000, scope: 'CMS_GENERATE', refType: 'program-cms', refId: programId, userId: opts.userId ?? null },
  )
  const cms = normalizeCms(await repairParse(raw))
  await prisma.program.update({
    where: { id: programId },
    data: { cmsContent: cms as unknown as Prisma.InputJsonValue, cmsGeneratedAt: new Date(), cmsModel: CMS_MODEL },
  })
  return cms
}

export async function getProgramCms(programId: string): Promise<{ cms: ProgramCms | null; generatedAt: string | null; model: string | null }> {
  const p = await prisma.program.findUnique({ where: { id: programId }, select: { cmsContent: true, cmsGeneratedAt: true, cmsModel: true } })
  return {
    cms: (p?.cmsContent as unknown as ProgramCms) ?? null,
    generatedAt: p?.cmsGeneratedAt ? p.cmsGeneratedAt.toISOString() : null,
    model: p?.cmsModel ?? null,
  }
}

export async function saveProgramCms(programId: string, cms: ProgramCms): Promise<void> {
  await prisma.program.update({
    where: { id: programId },
    data: { cmsContent: normalizeCms(cms as unknown as Record<string, unknown>) as unknown as Prisma.InputJsonValue },
  })
}
