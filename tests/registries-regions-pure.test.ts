import { describe, it, expect } from 'vitest'
import { buildBreadcrumb, walkRegionChain, deriveHierarchyFromMap, type RegionNodeLookup } from '@/lib/registries/regions-tree'
import { normalizeGreek, coreName, nameMatchCandidate, haversineKm, nearestNode } from '@/lib/registries/regions-match-pure'

// ── buildBreadcrumb (ported from reference lib/regions/__tests__/tree.test.ts) ──

describe('buildBreadcrumb', () => {
  it('keys an ordered Δήμος chain into region/regionalUnit/municipality', () => {
    const chain = [
      { code: '111', nameEL: 'ΠΕΡΙΦΕΡΕΙΑ ΑΝΑΤΟΛΙΚΗΣ ΜΑΚΕΔΟΝΙΑΣ ΚΑΙ ΘΡΑΚΗΣ', level: 3 },
      { code: '11102', nameEL: 'ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ ΔΡΑΜΑΣ', level: 4 },
      { code: '1110202', nameEL: 'ΔΗΜΟΣ ΔΟΞΑΤΟΥ', level: 5 },
    ]
    const b = buildBreadcrumb(chain)
    expect(b.region?.code).toBe('111')
    expect(b.regionalUnit?.code).toBe('11102')
    expect(b.municipality?.nameEL).toBe('ΔΗΜΟΣ ΔΟΞΑΤΟΥ')
  })

  it('leaves municipality null when the chain only reaches a Π.Ε.', () => {
    const chain = [
      { code: '111', nameEL: 'ΠΕΡΙΦΕΡΕΙΑ Α.Μ.Θ.', level: 3 },
      { code: '11102', nameEL: 'ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ ΔΡΑΜΑΣ', level: 4 },
    ]
    const b = buildBreadcrumb(chain)
    expect(b.regionalUnit?.code).toBe('11102')
    expect(b.municipality).toBeNull()
  })
})

// ── walkRegionChain / deriveHierarchyFromMap (new: pure split of ref's prisma-backed deriveHierarchy) ──

const NODE_MAP = new Map<string, RegionNodeLookup>([
  ['111', { code: '111', nameEL: 'ΠΕΡΙΦΕΡΕΙΑ ΑΝΑΤΟΛΙΚΗΣ ΜΑΚΕΔΟΝΙΑΣ ΚΑΙ ΘΡΑΚΗΣ', level: 3, parentCode: null }],
  ['11102', { code: '11102', nameEL: 'ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ ΔΡΑΜΑΣ', level: 4, parentCode: '111' }],
  ['1110202', { code: '1110202', nameEL: 'ΔΗΜΟΣ ΔΟΞΑΤΟΥ', level: 5, parentCode: '11102' }],
])

describe('walkRegionChain', () => {
  it('walks up parentCode links from leaf to root, returned root→leaf', () => {
    const chain = walkRegionChain('1110202', NODE_MAP)
    expect(chain.map((c) => c.code)).toEqual(['111', '11102', '1110202'])
  })

  it('stops (does not throw) when a node is missing from the map', () => {
    expect(walkRegionChain('unknown', NODE_MAP)).toEqual([])
  })
})

describe('deriveHierarchyFromMap', () => {
  it('combines the walk + breadcrumb build for a leaf Δήμος code', () => {
    const b = deriveHierarchyFromMap('1110202', NODE_MAP)
    expect(b.region?.code).toBe('111')
    expect(b.regionalUnit?.code).toBe('11102')
    expect(b.municipality?.code).toBe('1110202')
  })
})

// ── regions-match-pure (ported from reference lib/regions/__tests__/match.test.ts) ──

const NODES = [
  { code: '1110202', nameEL: 'ΔΗΜΟΣ ΔΟΞΑΤΟΥ', latitude: 41.0595867, longitude: 24.2227293 },
  { code: '0511', nameEL: 'ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ', latitude: 37.9838, longitude: 23.7275 },
  { code: '9919901', nameEL: 'ΑΓΙΟ ΟΡΟΣ (Αυτοδιοίκητο)', latitude: 40.28, longitude: 24.18 },
]

const UNITS = [{ code: '11102', nameEL: 'ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ ΔΡΑΜΑΣ' }]

describe('normalizeGreek', () => {
  it('uppercases, strips accents and final sigma differences', () => {
    expect(normalizeGreek('Δοξάτο')).toBe('ΔΟΞΑΤΟ')
    expect(normalizeGreek('  αθηνα ')).toBe('ΑΘΗΝΑ')
  })

  it('strips tones and normalizes final sigma consistently', () => {
    expect(normalizeGreek('Δοξάτος')).toBe('ΔΟΞΑΤΟΣ')
    expect(normalizeGreek('ΔΟΞΑΤΟΣ')).toBe('ΔΟΞΑΤΟΣ')
  })
})

describe('coreName', () => {
  it('drops admin prefixes (ΔΗΜΟΣ / Δ. / ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ / ΝΟΜΟΣ) and parentheticals', () => {
    expect(coreName('ΔΗΜΟΣ ΔΟΞΑΤΟΥ')).toBe('ΔΟΞΑΤΟΥ')
    expect(coreName('ΑΓΙΟ ΟΡΟΣ (Αυτοδιοίκητο)')).toBe('ΑΓΙΟ ΟΡΟΣ')
    expect(coreName('ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ ΔΡΑΜΑΣ')).toBe('ΔΡΑΜΑΣ')
    expect(coreName('ΝΟΜΟΣ ΔΡΑΜΑΣ')).toBe('ΔΡΑΜΑΣ')
  })
})

describe('nameMatchCandidate against level-4 (ΓΕΜΗ prefecture descr)', () => {
  it('matches a ΓΕΜΗ νομός name "ΔΡΑΜΑΣ" to the Περιφερειακή Ενότητα', () => {
    expect(nameMatchCandidate('ΔΡΑΜΑΣ', UNITS)).toBe('11102')
  })
})

describe('nameMatchCandidate', () => {
  it('matches genitive municipality names from a nominative city (Δοξάτο → ΔΟΞΑΤΟΥ)', () => {
    expect(nameMatchCandidate('Δοξάτο', NODES)).toBe('1110202')
  })
  it('matches Αθήνα → ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ via shared stem', () => {
    expect(nameMatchCandidate('Αθήνα', NODES)).toBe('0511')
  })
  it('returns null for an unknown place', () => {
    expect(nameMatchCandidate('Λονδίνο', NODES)).toBeNull()
  })
  it('returns null for too-short queries', () => {
    expect(nameMatchCandidate('Αθ', NODES)).toBeNull()
  })
})

describe('haversineKm / nearestNode', () => {
  it('computes a sane distance', () => {
    const d = haversineKm({ lat: 37.9838, lng: 23.7275 }, { lat: 40.6401, lng: 22.9444 })
    expect(d).toBeGreaterThan(280)
    expect(d).toBeLessThan(320)
  })

  it('Athens → Thessaloniki known great-circle distance (~300km ±10%)', () => {
    const d = haversineKm({ lat: 37.9838, lng: 23.7275 }, { lat: 40.6401, lng: 22.9444 })
    expect(d).toBeGreaterThanOrEqual(270)
    expect(d).toBeLessThanOrEqual(330)
  })

  it('finds the nearest node within the cap', () => {
    expect(nearestNode({ lat: 37.99, lng: 23.73 }, NODES, 50)).toBe('0511')
  })

  it('returns null when nothing is within the cap', () => {
    expect(nearestNode({ lat: 0, lng: 0 }, NODES, 50)).toBeNull()
  })

  it('caps at 50km — a node just beyond the cap is rejected', () => {
    // Athens (37.9838, 23.7275) vs Thessaloniki (40.6401, 22.9444) is ~300km — well beyond 50km.
    const farNode = [{ code: 'far', latitude: 40.6401, longitude: 22.9444 }]
    expect(nearestNode({ lat: 37.9838, lng: 23.7275 }, farNode, 50)).toBeNull()
  })
})
