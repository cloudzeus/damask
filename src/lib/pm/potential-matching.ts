import { prisma } from '@/lib/prisma'
import { deriveHierarchyFromMap, type RegionNodeLookup } from '@/lib/registries/regions-tree'
import { evaluateTrdrEligibility } from '@/lib/prospects/eligibility'
import { extractKadRule } from '@/lib/prospects/evaluate-pair'

/**
 * (Plain module.) «Δυνητικά προγράμματα»: βασικός μαζικός έλεγχος πελατών × ενεργών/αναμενόμενων προγραμμάτων
 * σε ΠΕΡΙΦΕΡΕΙΑ, ΚΑΔ και ΝΟΜΙΚΗ ΜΟΡΦΗ (όχι μέγεθος/έτη). Φορτώνει τα πάντα μία φορά και αξιολογεί στη μνήμη —
 * ίδιος κανόνας με τον έλεγχο της καρτέλας (evaluateTrdrEligibility). Αποτέλεσμα σε TrdrProgramMatch· η δυνητική
 * συμμετοχή (ProgramApplication) δημιουργείται ΜΟΝΟ με κλικ στο γραφείο (επιλογή χρήστη).
 */

const CRITERIA = { kad: true, region: true, legalForm: true, size: false, age: false }

/** Ενεργά + αναμενόμενα: ACTIVE και η υποβολή δεν έχει λήξει (ή δεν έχει ημερομηνία). */
function openProgramsWhere(ids?: string[]) {
  const today = new Date(new Date().toISOString().slice(0, 10))
  return { status: 'ACTIVE' as const, OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }], ...(ids ? { id: { in: ids } } : {}) }
}

export type MatchRunResult = { programs: number; customers: number; matches: number; restrictedMatches: number; byProgram: { programId: string; title: string; matches: number }[] }

export async function runPotentialMatching(opts: { programIds?: string[]; trdrIds?: string[] } = {}): Promise<MatchRunResult> {
  const [programs, trdrs, regions] = await Promise.all([
    prisma.program.findMany({
      where: openProgramsWhere(opts.programIds),
      select: { id: true, title: true, extractedData: true, kads: { select: { code: true } }, regions: { select: { name: true } }, legalForms: { select: { name: true } } },
    }),
    // Πελάτες & υποψήφιοι (SODTYPE 13) με τουλάχιστον έναν ΚΑΔ — χωρίς ΚΑΔ δεν κρίνεται επιλεξιμότητα.
    prisma.trdr.findMany({
      where: { SODTYPE: 13, kads: { some: {} }, ...(opts.trdrIds ? { id: { in: opts.trdrIds } } : {}) },
      select: { id: true, appLegalForm: true, regionCode: true, kads: { select: { code: true } } },
    }),
    prisma.region.findMany({ select: { code: true, nameEL: true, level: true, parentCode: true } }),
  ])
  const regionMap = new Map<string, RegionNodeLookup>(regions.map(r => [r.code, r]))
  const regionNameOf = new Map<string, string | null>()
  const now = new Date()

  const rows: { trdrId: string; programId: string; eligible: boolean; restricted: boolean; matched: string[]; failed: string[]; matchedKads: string[]; evaluatedAt: Date }[] = []
  const byProgram = new Map<string, number>()
  for (const p of programs) {
    const kadRule = extractKadRule(p.extractedData)
    const kads = p.kads.map(k => ({ code: k.code, excluded: false }))
    // «Πραγματικός περιορισμός»: λίστα ΚΑΔ με κανόνα ή συγκεκριμένες περιφέρειες — αλλιώς ταιριάζουν όλοι.
    // (όλες οι 13 περιφέρειες = πανελλαδικό, όχι περιορισμός)
    const restricted = (kadRule !== 'UNSPECIFIED' && kads.length > 0) || (p.regions.length > 0 && p.regions.length < 13)
    const programInput = {
      kadRule, kads, regionNames: p.regions.map(x => x.name), legalFormNames: p.legalForms.map(f => f.name),
      minEme: null, minYears: null,
    }
    for (const t of trdrs) {
      if (t.regionCode && !regionNameOf.has(t.regionCode)) regionNameOf.set(t.regionCode, deriveHierarchyFromMap(t.regionCode, regionMap).region?.nameEL ?? null)
      const r = evaluateTrdrEligibility(
        { trdrCodes: t.kads.map(k => k.code), legalForm: t.appLegalForm, regionName: t.regionCode ? regionNameOf.get(t.regionCode) ?? null : null, eme: null, operationalYears: null },
        programInput, CRITERIA,
      )
      rows.push({ trdrId: t.id, programId: p.id, eligible: r.eligible, restricted, matched: r.matched, failed: r.failed, matchedKads: r.matchedKads, evaluatedAt: now })
      if (r.eligible) byProgram.set(p.id, (byProgram.get(p.id) ?? 0) + 1)
    }
  }

  // Αντικατάσταση των αποτελεσμάτων για τα ζεύγη που αξιολογήθηκαν (+ καθάρισμα όσων δεν είναι πια ενεργά).
  await prisma.$transaction(async tx => {
    if (opts.trdrIds) await tx.trdrProgramMatch.deleteMany({ where: { trdrId: { in: opts.trdrIds } } })
    else if (opts.programIds) await tx.trdrProgramMatch.deleteMany({ where: { programId: { in: opts.programIds } } })
    else await tx.trdrProgramMatch.deleteMany({})
    for (let i = 0; i < rows.length; i += 2000) await tx.trdrProgramMatch.createMany({ data: rows.slice(i, i + 2000), skipDuplicates: true })
  }, { timeout: 120_000 })

  return {
    programs: programs.length, customers: trdrs.length,
    matches: rows.filter(r => r.eligible).length,
    restrictedMatches: rows.filter(r => r.eligible && r.restricted).length,
    byProgram: programs.map(p => ({ programId: p.id, title: p.title, matches: byProgram.get(p.id) ?? 0 })),
  }
}

export type PotentialProgramRow = {
  programId: string; title: string; publicSlug: string | null
  status: 'open' | 'upcoming'; submissionStart: string | null; submissionEnd: string | null; fundingRate: number | null
  restricted: boolean; matched: string[]; matchedKads: string[]; evaluatedAt: string
  /** Υπάρχει ήδη συμμετοχή (οποιουδήποτε σταδίου) για αυτό το πρόγραμμα. */
  applicationId: string | null; lifecycle: string | null
}

/** Δυνητικά προγράμματα ενός πελάτη (μόνο επιλέξιμα), πρώτα όσα έχουν πραγματικό περιορισμό. */
export async function listPotentialPrograms(trdrId: string): Promise<{ rows: PotentialProgramRow[]; evaluatedAt: string | null; hasKads: boolean }> {
  const today = new Date(new Date().toISOString().slice(0, 10))
  const [matches, apps, kadCount, last] = await Promise.all([
    prisma.trdrProgramMatch.findMany({
      where: { trdrId, eligible: true, program: openProgramsWhere() },
      select: {
        restricted: true, matched: true, matchedKads: true, evaluatedAt: true,
        program: { select: { id: true, title: true, publicSlug: true, submissionStart: true, submissionEnd: true, fundingRate: true, cmsContent: true } },
      },
    }),
    prisma.programApplication.findMany({ where: { trdrId }, select: { id: true, programId: true, lifecycle: true } }),
    prisma.trdrKad.count({ where: { trdrId } }),
    prisma.trdrProgramMatch.findFirst({ where: { trdrId }, orderBy: { evaluatedAt: 'desc' }, select: { evaluatedAt: true } }),
  ])
  const appBy = new Map(apps.map(a => [a.programId, a]))
  const rows = matches.map(m => {
    const p = m.program
    const card = (p.cmsContent as { cardTitle?: string } | null)?.cardTitle
    const upcoming = (p.submissionStart != null && p.submissionStart > today) || /προδημοσίευση/i.test(`${card ?? ''} ${p.title}`)
    const app = appBy.get(p.id)
    return {
      programId: p.id, title: card || p.title, publicSlug: p.publicSlug,
      status: upcoming ? 'upcoming' as const : 'open' as const,
      submissionStart: p.submissionStart?.toISOString() ?? null, submissionEnd: p.submissionEnd?.toISOString() ?? null,
      fundingRate: p.fundingRate == null ? null : Number(p.fundingRate),
      restricted: m.restricted, matched: m.matched, matchedKads: m.matchedKads, evaluatedAt: m.evaluatedAt.toISOString(),
      applicationId: app?.id ?? null, lifecycle: app?.lifecycle ?? null,
    }
  })
  rows.sort((a, b) => Number(b.restricted) - Number(a.restricted) || (a.submissionEnd ?? '9').localeCompare(b.submissionEnd ?? '9'))
  return { rows, evaluatedAt: last?.evaluatedAt.toISOString() ?? null, hasKads: kadCount > 0 }
}

/**
 * Μετά από ενεργοποίηση/αλλαγή προγράμματος: έλεγχος όλων των πελατών ΓΙΑ ΑΥΤΟ το πρόγραμμα. Όταν το πρόγραμμα
 * μόλις ενεργοποιήθηκε (`announce`), ειδοποίηση γραφείου «Χ δυνητικοί πελάτες» με σύνδεσμο.
 */
export async function matchProgramForAllCustomers(programId: string, announce = false): Promise<number> {
  const r = await runPotentialMatching({ programIds: [programId] })
  const p = r.byProgram[0]
  if (announce && p) {
    const strong = await prisma.trdrProgramMatch.count({ where: { programId, eligible: true, restricted: true } })
    const { createNotification } = await import('@/lib/notifications/service')
    await createNotification({
      title: `Νέο πρόγραμμα: ${p.title.slice(0, 80)}`,
      body: strong
        ? `${strong} πελάτες ταιριάζουν σε περιφέρεια/ΚΑΔ/νομική μορφή — δείτε τα «Δυνητικά προγράμματα» στην καρτέλα τους.`
        : `${p.matches} πελάτες «ταιριάζουν», αλλά το πρόγραμμα δεν έχει καταχωρισμένους επιλέξιμους ΚΑΔ/περιφέρειες — συμπληρώστε τους για ακριβή έλεγχο.`,
      entityType: 'Program', entityId: programId, meta: { kind: 'potential-matching', matches: p.matches, strong },
    }).catch(() => {})
  }
  return p?.matches ?? 0
}
