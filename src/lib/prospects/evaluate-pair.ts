// Server lib (ΟΧΙ 'use server') — αξιολόγηση ΕΝΟΣ πελάτη έναντι ΕΝΟΣ προγράμματος.
// Κοινή λογική για: (α) το gated action στην καρτέλα πελάτη, (β) το association
// (associateTrdrProgram). Χωρίς requirePermission εδώ — ο καλών (server action)
// βάζει το δικό του gate. Καθρέφτης του input-building του findProspects.

import { prisma } from '@/lib/prisma'
import { deriveHierarchyFromMap, type RegionNodeLookup } from '@/lib/registries/regions-tree'
import { evaluateTrdrEligibility, type KadRule, type EligibilityCriterionKey } from '@/lib/prospects/eligibility'

const VALID_KAD_RULES = new Set<KadRule>(['ALL_EXCEPT_LISTED', 'ONLY_LISTED', 'MIXED', 'UNSPECIFIED'])

/** kadRule ζει μόνο μέσα στο Program.extractedData JSON (βλ. prospects/actions.ts). */
export function extractKadRule(extractedData: unknown): KadRule {
  if (extractedData && typeof extractedData === 'object' && 'kadRule' in extractedData) {
    const v = (extractedData as Record<string, unknown>).kadRule
    if (typeof v === 'string' && VALID_KAD_RULES.has(v as KadRule)) return v as KadRule
  }
  return 'UNSPECIFIED'
}

export type SinglePairEligibility = {
  eligible: boolean
  matched: EligibilityCriterionKey[]
  failed: EligibilityCriterionKey[]
  matchedKads: string[]
}

/** Αξιολόγηση πελάτη×προγράμματος σε ΟΛΑ τα κριτήρια (kad/region/legalForm). */
export async function computeSinglePair(trdrId: string, programId: string): Promise<SinglePairEligibility> {
  const [program, trdr, regions] = await Promise.all([
    prisma.program.findUniqueOrThrow({
      where: { id: programId },
      select: {
        extractedData: true,
        kads: { select: { code: true } },
        regions: { select: { name: true } },
        legalForms: { select: { name: true } },
      },
    }),
    prisma.trdr.findUniqueOrThrow({
      where: { id: trdrId },
      select: { appLegalForm: true, regionCode: true, kads: { select: { code: true } } },
    }),
    prisma.region.findMany({ select: { code: true, nameEL: true, level: true, parentCode: true } }),
  ])

  const regionMap = new Map<string, RegionNodeLookup>(regions.map(r => [r.code, r]))
  const regionName = trdr.regionCode
    ? (deriveHierarchyFromMap(trdr.regionCode, regionMap).region?.nameEL ?? null)
    : null

  const r = evaluateTrdrEligibility(
    { trdrCodes: trdr.kads.map(k => k.code), legalForm: trdr.appLegalForm, regionName },
    {
      kadRule: extractKadRule(program.extractedData),
      // DAMASK ProgramKad δεν έχει `excluded` column — όλοι non-excluded.
      kads: program.kads.map(k => ({ code: k.code, excluded: false })),
      regionNames: program.regions.map(x => x.name),
      legalFormNames: program.legalForms.map(f => f.name),
    },
    { kad: true, region: true, legalForm: true },
  )
  return { eligible: r.eligible, matched: r.matched, failed: r.failed, matchedKads: r.matchedKads }
}
