/**
 * Region hierarchy (Καλλικράτης) — pure helpers, ported from the reference PIM's
 * lib/regions/tree.ts. NO prisma/react/clock imports here — the ref's deriveHierarchy
 * queried prisma in a loop; that part is split out to the server wrapper in regions.ts,
 * which builds a node map and delegates to walkRegionChain/deriveHierarchyFromMap below.
 */

export type RegionRef = { code: string; nameEL: string }

export type RegionBreadcrumb = {
  region: RegionRef | null // level 3 (Περιφέρεια)
  regionalUnit: RegionRef | null // level 4 (Περιφερειακή Ενότητα / Νομός)
  municipality: RegionRef | null // level 5 (Δήμος)
}

export type RegionChainNode = { code: string; nameEL: string; level: number }

/** Minimal shape needed to walk the parent chain (subset of the Region model). */
export type RegionNodeLookup = { code: string; nameEL: string; level: number; parentCode: string | null }

/** Pure: map an ordered (root→leaf) chain into the breadcrumb by level. */
export function buildBreadcrumb(chain: RegionChainNode[]): RegionBreadcrumb {
  const byLevel = (lvl: number) => {
    const n = chain.find((c) => c.level === lvl)
    return n ? { code: n.code, nameEL: n.nameEL } : null
  }
  return {
    region: byLevel(3),
    regionalUnit: byLevel(4),
    municipality: byLevel(5),
  }
}

/**
 * Pure: walk up the parent chain from a node code using a caller-supplied node map
 * (code → node). Mirrors the ref's sequential prisma findUnique loop, but over an
 * in-memory map so it is unit-testable without a DB. Depth capped at 8 (same as ref)
 * to avoid pathological cycles. Stops (does not throw) on a missing node.
 */
export function walkRegionChain(code: string, nodeMap: Map<string, RegionNodeLookup>): RegionChainNode[] {
  const chain: RegionChainNode[] = []
  let current: string | null = code
  for (let i = 0; i < 8 && current; i++) {
    const node = nodeMap.get(current)
    if (!node) break
    chain.unshift({ code: node.code, nameEL: node.nameEL, level: node.level })
    current = node.parentCode
  }
  return chain
}

/** Pure: walk + breadcrumb-build in one call, given a pre-fetched node map. */
export function deriveHierarchyFromMap(code: string, nodeMap: Map<string, RegionNodeLookup>): RegionBreadcrumb {
  return buildBreadcrumb(walkRegionChain(code, nodeMap))
}
