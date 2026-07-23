import { describe, it, expect } from 'vitest'
import {
  kadMatches,
  evalKadRule,
  canonicalLegalForm,
  normRegion,
  regionNameMatches,
  evaluateTrdrEligibility,
  type ProgramKadInput,
} from '@/lib/prospects/eligibility'

describe('kadMatches (hierarchical dotted prefix)', () => {
  it('matches equal codes', () => {
    expect(kadMatches('62.01', '62.01')).toBe(true)
  })
  it('matches when trdr code is a more specific child of the program code', () => {
    expect(kadMatches('62.01', '62.01.11')).toBe(true)
  })
  it('matches symmetrically when program code is more specific than trdr code', () => {
    expect(kadMatches('62.01.11', '62.01')).toBe(true)
  })
  it('does not match unrelated codes', () => {
    expect(kadMatches('62.01', '62.02')).toBe(false)
  })
  it('does not match on a bare numeric-prefix collision without a dot boundary', () => {
    // "62.0" is not a dotted-prefix of "62.01" (no ".01" split at "62.0")
    expect(kadMatches('62.0', '62.01')).toBe(false)
  })
  it('ignores whitespace', () => {
    expect(kadMatches(' 62.01 ', '62.01.11')).toBe(true)
  })
})

describe('evalKadRule', () => {
  it('UNSPECIFIED always passes regardless of lists', () => {
    const kads: ProgramKadInput[] = [{ code: '62.01', excluded: false }]
    const r = evalKadRule('UNSPECIFIED', kads, ['99.99'])
    expect(r.pass).toBe(true)
  })

  it('empty programKads auto-passes even for a non-UNSPECIFIED rule', () => {
    const r = evalKadRule('ONLY_LISTED', [], ['62.01.11'])
    expect(r.pass).toBe(true)
  })

  describe('ALL_EXCEPT_LISTED', () => {
    const kads: ProgramKadInput[] = [{ code: '47.11', excluded: true }]
    it('passes when the trdr has no excluded-listed code', () => {
      const r = evalKadRule('ALL_EXCEPT_LISTED', kads, ['62.01.11'])
      expect(r.pass).toBe(true)
    })
    it('fails when the trdr matches an excluded code (excluded-hit fail)', () => {
      const r = evalKadRule('ALL_EXCEPT_LISTED', kads, ['47.11.01'])
      expect(r.pass).toBe(false)
    })
  })

  describe('ONLY_LISTED', () => {
    const kads: ProgramKadInput[] = [{ code: '62.01', excluded: false }]
    it('passes when the trdr matches a listed code', () => {
      const r = evalKadRule('ONLY_LISTED', kads, ['62.01.11'])
      expect(r.pass).toBe(true)
    })
    it('fails when the trdr matches none of the listed codes', () => {
      const r = evalKadRule('ONLY_LISTED', kads, ['10.11'])
      expect(r.pass).toBe(false)
    })
  })

  describe('MIXED', () => {
    const kads: ProgramKadInput[] = [
      { code: '62.01', excluded: false },
      { code: '62.01.30', excluded: true },
    ]
    it('passes when the trdr has a listed match and no excluded match', () => {
      const r = evalKadRule('MIXED', kads, ['62.01.11'])
      expect(r.pass).toBe(true)
    })
    it('fails when the trdr has no listed match at all', () => {
      const r = evalKadRule('MIXED', kads, ['10.11'])
      expect(r.pass).toBe(false)
    })
    it('fails when the trdr matches an excluded code even if it also matches a listed one', () => {
      // 62.01.30 is both a child of the listed 62.01 AND itself excluded — MIXED needs
      // listed AND no excluded, so this must fail.
      const r = evalKadRule('MIXED', kads, ['62.01.30'])
      expect(r.pass).toBe(false)
    })
  })
})

describe('canonicalLegalForm', () => {
  it.each([
    ['ΙΚΕ', 'ΙΚΕ'],
    ['Ι.Κ.Ε.', 'ΙΚΕ'],
    ['Ιδιωτική Κεφαλαιουχική Εταιρεία', 'ΙΚΕ'],
    ['Μονοπρόσωπη ΙΚΕ', 'ΙΚΕ'],
    ['ΑΕ', 'ΑΕ'],
    ['Ανώνυμη Εταιρεία', 'ΑΕ'],
    ['ΕΠΕ', 'ΕΠΕ'],
    ['Εταιρεία Περιορισμένης Ευθύνης', 'ΕΠΕ'],
    ['ΟΕ', 'ΟΕ'],
    ['Ομόρρυθμη Εταιρεία', 'ΟΕ'],
    ['ΕΕ', 'ΕΕ'],
    ['Ετερόρρυθμη Εταιρεία', 'ΕΕ'],
    ['Ατομική Επιχείρηση', 'ΑΤΟΜΙΚΗ'],
    ['ΚΟΙΝΣΕΠ', 'ΚΟΙΝΣΕΠ'],
    ['Κοινωνική Συνεταιριστική Επιχείρηση', 'ΚΟΙΝΣΕΠ'],
    ['ΚΟΙΣΠΕ', 'ΚΟΙΣΠΕ'],
    ['ΑΜΚΕ', 'ΑΜΚΕ'],
    ['Αστική Μη Κερδοσκοπική Εταιρεία', 'ΑΜΚΕ'],
    ['Συνεταιρισμός', 'ΣΥΝΕΤΑΙΡΙΣΜΟΣ'],
  ])('canonicalizes %s → %s', (raw, expected) => {
    expect(canonicalLegalForm(raw)).toBe(expected)
  })

  it('does not classify a Κοινωνικός Συνεταιρισμός Περιορισμένης Ευθύνης as plain ΕΠΕ', () => {
    expect(canonicalLegalForm('Κοινωνικός Συνεταιρισμός Περιορισμένης Ευθύνης')).toBe('ΚΟΙΣΠΕ')
  })
})

describe('normRegion / regionNameMatches', () => {
  it('normRegion strips accents, the word ΠΕΡΙΦΕΡΕΙΑ, and non-letters', () => {
    expect(normRegion('Περιφέρεια Αττικής')).toBe('ΑΤΤΙΚΗΣ')
    expect(normRegion('Αττική')).toBe('ΑΤΤΙΚΗ')
  })

  it('matches bidirectionally: registry genitive «ΑΤΤΙΚΗΣ» ⊇ program nominative «ΑΤΤΙΚΗ»', () => {
    expect(regionNameMatches(['Αττική'], 'Περιφέρεια Αττικής')).toBe(true)
  })

  it('matches the other direction too: program «ΑΤΤΙΚΗΣ» vs trdr «ΑΤΤΙΚΗ»', () => {
    expect(regionNameMatches(['Αττικής'], 'Αττική')).toBe(true)
  })

  it('does not match unrelated regions', () => {
    expect(regionNameMatches(['Κρήτη'], 'Περιφέρεια Αττικής')).toBe(false)
  })

  it('does not match when trdr region name is null', () => {
    expect(regionNameMatches(['Αττική'], null)).toBe(false)
  })
})

describe('evaluateTrdrEligibility', () => {
  const fullyEligibleProgram = {
    kadRule: 'ONLY_LISTED' as const,
    kads: [{ code: '62.01', excluded: false }],
    regionNames: ['Αττική'],
    legalFormNames: ['ΙΚΕ'],
  }

  it('evaluates only the selected criteria — unselected ones never appear in matched/failed', () => {
    const r = evaluateTrdrEligibility(
      { trdrCodes: ['10.11'], legalForm: 'ΟΕ', regionName: 'Κρήτη' }, // fails all 3 if checked
      fullyEligibleProgram,
      { kad: false, region: false, legalForm: false },
    )
    expect(r.matched).toEqual([])
    expect(r.failed).toEqual([])
    expect(r.eligible).toBe(true)
  })

  it('a subset of selected criteria: only kad selected, and it fails', () => {
    const r = evaluateTrdrEligibility(
      { trdrCodes: ['10.11'], legalForm: 'ΟΕ', regionName: 'Κρήτη' },
      fullyEligibleProgram,
      { kad: true, region: false, legalForm: false },
    )
    expect(r.matched).toEqual([])
    expect(r.failed).toEqual(['kad'])
    expect(r.eligible).toBe(false)
  })

  it('passes when all selected criteria match', () => {
    const r = evaluateTrdrEligibility(
      { trdrCodes: ['62.01.11'], legalForm: 'Ι.Κ.Ε.', regionName: 'Περιφέρεια Αττικής' },
      fullyEligibleProgram,
      { kad: true, region: true, legalForm: true },
    )
    expect(r.matched.sort()).toEqual(['kad', 'legalForm', 'region'])
    expect(r.failed).toEqual([])
    expect(r.eligible).toBe(true)
  })

  it('fails when any one selected criterion fails, listing exactly the failing ones', () => {
    const r = evaluateTrdrEligibility(
      { trdrCodes: ['62.01.11'], legalForm: 'ΟΕ', regionName: 'Περιφέρεια Αττικής' },
      fullyEligibleProgram,
      { kad: true, region: true, legalForm: true },
    )
    expect(r.matched.sort()).toEqual(['kad', 'region'])
    expect(r.failed).toEqual(['legalForm'])
    expect(r.eligible).toBe(false)
  })

  it('a selected criterion with EMPTY program-side data auto-passes and counts as matched', () => {
    const emptyProgram = { kadRule: 'UNSPECIFIED' as const, kads: [], regionNames: [], legalFormNames: [] }
    const r = evaluateTrdrEligibility(
      { trdrCodes: [], legalForm: null, regionName: null },
      emptyProgram,
      { kad: true, region: true, legalForm: true },
    )
    expect(r.matched.sort()).toEqual(['kad', 'legalForm', 'region'])
    expect(r.failed).toEqual([])
    expect(r.eligible).toBe(true)
  })

  it('empty regionNames alone auto-passes region even when kad/legalForm data exists and fails', () => {
    const program = { kadRule: 'ONLY_LISTED' as const, kads: [{ code: '62.01', excluded: false }], regionNames: [], legalFormNames: ['ΙΚΕ'] }
    const r = evaluateTrdrEligibility(
      { trdrCodes: ['99.99'], legalForm: 'ΟΕ', regionName: null },
      program,
      { kad: true, region: true, legalForm: true },
    )
    expect(r.matched).toEqual(['region'])
    expect(r.failed.sort()).toEqual(['kad', 'legalForm'])
    expect(r.eligible).toBe(false)
  })
})
