/**
 * Bulk Trdr eligibility engine for a Program — PURE helpers, ported from the
 * reference PIM's lib/programs/eligibility.ts (per-company engine there; here it
 * is evaluated per-Trdr, bulk, over a subset of selected criteria only — see
 * docs/superpowers/specs/2026-07-23-prospects-w3-design.md §1).
 *
 * NO prisma/react/clock imports here. Server-side bulk matching (which queries
 * prisma for Program kads/regions/legalForms + Trdr batch) lives in actions.ts.
 *
 * Ref semantics ported EXACTLY: kadMatches (hierarchical dotted prefix, both
 * directions), the 4 kadRule modes, canonicalLegalForm classification chain,
 * normRegion + bidirectional substring region matching.
 */

export type KadRule = 'ALL_EXCEPT_LISTED' | 'ONLY_LISTED' | 'MIXED' | 'UNSPECIFIED'

export interface ProgramKadInput {
  code: string
  excluded: boolean
}

export interface KadRuleResult {
  pass: boolean
  reason: string
}

export type EligibilityCriterionKey = 'kad' | 'region' | 'legalForm'

export interface TrdrEligibilityInput {
  trdrCodes: string[]
  legalForm: string | null
  regionName: string | null
}

export interface ProgramEligibilityInput {
  kadRule: KadRule
  kads: ProgramKadInput[]
  regionNames: string[]
  legalFormNames: string[]
}

export interface SelectedCriteria {
  kad: boolean
  region: boolean
  legalForm: boolean
}

export interface EligibilityEvalResult {
  eligible: boolean
  matched: EligibilityCriterionKey[]
  failed: EligibilityCriterionKey[]
}

/** Remove Greek diacritics so "Αττική" === "ΑΤΤΙΚΗ" after upper-casing. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Canonicalise a Greek legal form to a comparable token, handling abbreviation ↔ full name:
 * "Ι.Κ.Ε.", "ΙΚΕ", "Ιδιωτική Κεφαλαιουχική Εταιρεία", "Μονοπρόσωπη ΙΚΕ" → "ΙΚΕ".
 * (ref: lib/programs/eligibility.ts canonicalLegalForm — ported verbatim.)
 */
export function canonicalLegalForm(s: string): string {
  const t = stripAccents(s).toUpperCase().replace(/[^Α-ΩA-Z]/g, '')
  // Κ.ΑΛ.Ο. / κοινωνικοί φορείς FIRST — many contain "Περιορισμένης Ευθύνης" or "Εταιρεία"
  // and must NOT be mistaken for ΕΠΕ / ΑΕ.
  if (/ΚΟΙΣΠΕ/.test(t) || (/ΚΟΙΝΩΝΙΚΟΣΣΥΝΕΤΑΙΡΙΣΜΟΣ/.test(t) && /ΠΕΡΙΟΡΙΣΜΕΝΗΣΕΥΘΥΝΗΣ/.test(t))) return 'ΚΟΙΣΠΕ'
  if (/ΚΟΙΝΣΕΠ/.test(t) || /ΚΟΙΝΩΝΙΚΗΣΥΝΕΤΑΙΡΙΣΤΙΚΗ/.test(t)) return 'ΚΟΙΝΣΕΠ'
  if (/ΣΥΝΕΤΑΙΡΙΣΜ/.test(t)) return 'ΣΥΝΕΤΑΙΡΙΣΜΟΣ'
  if (/ΑΣΤΙΚΗΜΗΚΕΡΔΟΣΚΟΠΙΚΗ/.test(t) || /^ΑΜΚΕ/.test(t)) return 'ΑΜΚΕ'
  // Εμπορικές μορφές
  if (/ΙΔΙΩΤΙΚΗΚΕΦΑΛΑΙΟΥΧΙΚΗ/.test(t) || t === 'ΙΚΕ' || t.endsWith('ΙΚΕ')) return 'ΙΚΕ'
  if (/ΑΝΩΝΥΜ/.test(t) || t === 'ΑΕ') return 'ΑΕ'
  // ΕΠΕ μόνο όταν είναι «Εταιρ(ε)ία Περιορισμένης Ευθύνης» και ΟΧΙ «Συνεταιρισμός».
  if (t === 'ΕΠΕ' || (/ΕΤΑΙΡ/.test(t) && /ΠΕΡΙΟΡΙΣΜΕΝΗΣΕΥΘΥΝΗΣ/.test(t) && !/ΣΥΝΕΤΑΙΡ/.test(t))) return 'ΕΠΕ'
  if (/ΟΜΟΡΡΥΘΜ/.test(t) || t === 'ΟΕ') return 'ΟΕ'
  if (/ΕΤΕΡΟΡΡΥΘΜ/.test(t) || t === 'ΕΕ') return 'ΕΕ'
  if (/ΑΤΟΜΙΚ/.test(t)) return 'ΑΤΟΜΙΚΗ'
  return t
}

/**
 * Normalise a region name: drop accents + the word "ΠΕΡΙΦΕΡΕΙΑ", keep letters only.
 * Καλλικράτης registry stores "ΠΕΡΙΦΕΡΕΙΑ ΑΤΤΙΚΗΣ" (genitive); programs say "Αττική".
 * (ref: lib/programs/eligibility.ts normRegion — ported verbatim.)
 */
export function normRegion(s: string): string {
  return stripAccents(s).toUpperCase().replace(/ΠΕΡΙΦΕΡΕΙΑ/g, '').replace(/[^Α-ΩA-Z]/g, '')
}

/**
 * Bidirectional substring match between the Program's eligible region names and a
 * single Trdr's level-3 (Περιφέρεια) region name.
 * (ref: lib/programs/eligibility.ts evaluateEligibility region branch.)
 */
export function regionNameMatches(programRegionNames: string[], trdrRegionLevel3Name: string | null): boolean {
  const c = trdrRegionLevel3Name ? normRegion(trdrRegionLevel3Name) : ''
  if (!c) return false
  return programRegionNames.some((r) => {
    const a = normRegion(r)
    return !!a && (a.includes(c) || c.includes(a))
  })
}

/**
 * Hierarchical dotted prefix: program "62.01" matches trdr "62.01.11" (and equal codes),
 * and — symmetrically — a more specific program code matches a broader trdr code.
 * (ref: lib/programs/eligibility.ts kadMatches — ported verbatim.)
 */
export function kadMatches(programCode: string, trdrCode: string): boolean {
  const p = programCode.replace(/\s/g, '')
  const c = trdrCode.replace(/\s/g, '')
  return c === p || c.startsWith(p + '.') || p.startsWith(c + '.')
}

/**
 * Evaluate a Trdr's KAD codes against a Program's kadRule + ProgramKad list.
 * (ref: lib/programs/eligibility.ts evalKad — adapted to explicit params instead of
 * company/program objects, and returns {pass, reason} instead of an EligibilityCriterion.)
 */
export function evalKadRule(rule: KadRule, programKads: ProgramKadInput[], trdrCodes: string[]): KadRuleResult {
  const listed = programKads.filter((k) => !k.excluded).map((k) => k.code)
  const excluded = programKads.filter((k) => k.excluded).map((k) => k.code)

  if (rule === 'UNSPECIFIED' || (listed.length === 0 && excluded.length === 0)) {
    return { pass: true, reason: 'δεν διευκρινίζεται' }
  }

  const matchedListed = trdrCodes.filter((c) => listed.some((l) => kadMatches(l, c)))
  const matchedExcluded = trdrCodes.filter((c) => excluded.some((e) => kadMatches(e, c)))

  if (rule === 'ALL_EXCEPT_LISTED') {
    const pass = matchedExcluded.length === 0
    return { pass, reason: pass ? 'δεν εμπίπτει σε εξαίρεση' : 'ΚΑΔ εξαιρείται από το πρόγραμμα' }
  }
  if (rule === 'ONLY_LISTED') {
    const pass = matchedListed.length > 0
    return { pass, reason: pass ? 'επιλέξιμος ΚΑΔ' : 'κανένας επιλέξιμος ΚΑΔ' }
  }
  // MIXED — needs at least one listed match AND no excluded match.
  const pass = matchedListed.length > 0 && matchedExcluded.length === 0
  return {
    pass,
    reason: pass ? 'επιλέξιμος ΚΑΔ' : matchedExcluded.length > 0 ? 'ΚΑΔ εξαιρείται' : 'κανένας επιλέξιμος ΚΑΔ',
  }
}

/**
 * Evaluate a single Trdr against a Program's eligibility data, restricted to the
 * criteria the caller selected. Unselected criteria are ignored entirely (never
 * appear in matched/failed). A selected criterion whose Program-side data is empty
 * (e.g. 0 ProgramRegion rows) auto-passes and counts as matched — nothing to check
 * against means nothing disqualifies the Trdr.
 */
export function evaluateTrdrEligibility(
  input: TrdrEligibilityInput,
  program: ProgramEligibilityInput,
  selected: SelectedCriteria,
): EligibilityEvalResult {
  const matched: EligibilityCriterionKey[] = []
  const failed: EligibilityCriterionKey[] = []

  if (selected.kad) {
    const { pass } = evalKadRule(program.kadRule, program.kads, input.trdrCodes)
    if (pass) matched.push('kad')
    else failed.push('kad')
  }

  if (selected.region) {
    if (program.regionNames.length === 0) {
      matched.push('region')
    } else if (regionNameMatches(program.regionNames, input.regionName)) {
      matched.push('region')
    } else {
      failed.push('region')
    }
  }

  if (selected.legalForm) {
    if (program.legalFormNames.length === 0) {
      matched.push('legalForm')
    } else {
      const allowed = program.legalFormNames.map(canonicalLegalForm)
      const pass = !!input.legalForm && allowed.includes(canonicalLegalForm(input.legalForm))
      if (pass) matched.push('legalForm')
      else failed.push('legalForm')
    }
  }

  return { eligible: failed.length === 0, matched, failed }
}
