import { describe, it, expect } from 'vitest'
import { normalizeName, nameSimilarity, suggestMatches, type MatchCandidate } from '@/lib/pm/deliverable-match'

describe('normalizeName', () => {
  it('lowercases, strips accents/tones, punctuation and digits, collapses spaces', () => {
    expect(normalizeName('Άδειες Λειτουργίας')).toBe('αδειες λειτουργιας')
    expect(normalizeName('  01.09  Μισθολογικό  κόστος!! ')).toBe('μισθολογικο κοστος')
    expect(normalizeName('ΑΔΕΙΕΣ λειτουργιας')).toBe('αδειες λειτουργιας')
  })
})

describe('nameSimilarity', () => {
  it('is 1 for accent-insensitive exact matches', () => {
    expect(nameSimilarity('Άδειες Λειτουργίας', 'αδειες λειτουργιας')).toBe(1)
  })

  it('is 1 for exact matches regardless of case/whitespace', () => {
    expect(nameSimilarity('  Άδεια  Λειτουργίας  ', 'αδεια λειτουργιασ'.replace('σ', 'ς'))).toBeCloseTo(
      nameSimilarity('αδεια λειτουργιας', 'αδεια λειτουργιας'),
      5,
    )
  })

  it('scores a partial/related match meaningfully above the default threshold', () => {
    const s = nameSimilarity('Μισθοδοσία προσωπικού', 'Δαπάνες προσωπικού (μισθοδοσία)')
    expect(s).toBeGreaterThan(0.45)
    expect(s).toBeLessThan(1)
  })

  it('scores unrelated names low, below the default threshold', () => {
    const s = nameSimilarity('Μισθολογικό κόστος προσωπικού', 'Φωτογραφίες εγκατεστημένου εξοπλισμού')
    expect(s).toBeLessThan(0.45)
  })

  it('is symmetric', () => {
    const a = 'Άδεια λειτουργίας σε ισχύ'
    const b = 'Λοιπές εγκρίσεις/πιστοποιητικά'
    expect(nameSimilarity(a, b)).toBeCloseTo(nameSimilarity(b, a), 10)
  })

  it('handles empty strings without throwing', () => {
    expect(nameSimilarity('', '')).toBe(1)
    expect(nameSimilarity('κάτι', '')).toBe(0)
  })
})

describe('suggestMatches', () => {
  const candidates: { key: string; source: 'catalog' | 'library'; name: string }[] = [
    { key: 'personnel', source: 'catalog', name: 'Δαπάνες προσωπικού (μισθοδοσία)' },
    { key: 'equipment', source: 'catalog', name: 'Προμήθεια εξοπλισμού' },
    { key: 'licenses', source: 'catalog', name: 'Άδειες λειτουργίας' },
    { key: 'lib-1', source: 'library', name: 'Άδειες Λειτουργίας' },
  ]

  it('returns matches above threshold sorted by score desc', () => {
    const r = suggestMatches('Άδειες Λειτουργίας', candidates)
    expect(r.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score)
    // exact accent-insensitive matches (catalog "licenses" + library "lib-1") lead the pack
    expect(r[0].score).toBe(1)
    expect(r[1].score).toBe(1)
    expect(new Set(r.slice(0, 2).map((c: MatchCandidate) => c.key))).toEqual(new Set(['licenses', 'lib-1']))
  })

  it('carries source through untouched', () => {
    const r = suggestMatches('Άδειες Λειτουργίας', candidates)
    const lib = r.find((c) => c.key === 'lib-1')
    expect(lib?.source).toBe('library')
  })

  it('excludes candidates below threshold', () => {
    const r = suggestMatches('Άδειες Λειτουργίας', candidates)
    expect(r.find((c) => c.key === 'equipment')).toBeUndefined()
  })

  it('respects a custom threshold', () => {
    const strict = suggestMatches('01.09 Μισθολογικό κόστος', candidates, 0.99)
    expect(strict).toEqual([])
  })

  it('returns empty array when nothing matches', () => {
    expect(suggestMatches('Κάτι εντελώς άσχετο', [{ key: 'x', source: 'catalog', name: 'Zebra print poster' }])).toEqual([])
  })
})
