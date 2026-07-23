/**
 * Region hierarchy (Καλλικράτης) — server functions, ported from the reference PIM's
 * lib/regions/decoder.ts + lib/regions/match.ts. Uses the DAMASK prisma singleton
 * (@/lib/prisma) and the pure helpers in regions-tree.ts / regions-match-pure.ts.
 * RBAC is NOT enforced here (ref used requirePermission in its route handlers) — that's
 * the caller's job (server actions / route handlers wired in a later task).
 *
 * NOT integration-tested here — these are pure ports meant to compile; DB-backed
 * verification happens in a later task.
 */

import { prisma } from '@/lib/prisma'
import {
  buildBreadcrumb,
  walkRegionChain,
  type RegionBreadcrumb,
  type RegionNodeLookup,
} from '@/lib/registries/regions-tree'
import { nameMatchCandidate, nearestNode } from '@/lib/registries/regions-match-pure'
import { getIntegration } from '@/lib/settings'
import { geocodeSearch, GeocodeError } from '@/lib/geocode'

export type DecodedRegion = {
  code: string
  nameEL: string
  nameEN: string | null
  level: number
  path: string | null
  latitude: number | null
  longitude: number | null
  breadcrumb: RegionBreadcrumb
  children: Array<{ code: string; nameEL: string; level: number }>
}

async function fetchRegionNode(code: string): Promise<RegionNodeLookup | null> {
  return prisma.region.findUnique({
    where: { code },
    select: { code: true, nameEL: true, level: true, parentCode: true },
  })
}

/**
 * Walk up the parent chain from a node code, then build the breadcrumb.
 * Server wrapper: queries prisma per level (max depth 8, same as ref), builds an
 * in-memory node map, and delegates the actual chain-walk to the pure helper.
 */
export async function deriveHierarchy(code: string): Promise<RegionBreadcrumb> {
  const nodeMap = new Map<string, RegionNodeLookup>()
  let current: string | null = code
  for (let i = 0; i < 8 && current; i++) {
    const node = await fetchRegionNode(current)
    if (!node) break
    nodeMap.set(node.code, node)
    current = node.parentCode
  }
  return buildBreadcrumb(walkRegionChain(code, nodeMap))
}

/** Look up a region by exact code, or by case-insensitive nameEL contains. */
export async function decodeRegion(input: string): Promise<DecodedRegion | null> {
  const raw = (input ?? '').trim()
  if (!raw) return null

  let hit = await prisma.region.findUnique({ where: { code: raw } })
  if (!hit) {
    hit = await prisma.region.findFirst({
      where: { nameEL: { contains: raw } },
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
    })
  }
  if (!hit) return null

  const [children, breadcrumb] = await Promise.all([
    prisma.region.findMany({
      where: { parentCode: hit.code },
      orderBy: { nameEL: 'asc' },
      take: 400,
      select: { code: true, nameEL: true, level: true },
    }),
    deriveHierarchy(hit.code),
  ])

  return {
    code: hit.code,
    nameEL: hit.nameEL,
    nameEN: hit.nameEN,
    level: hit.level,
    path: hit.path,
    latitude: hit.latitude,
    longitude: hit.longitude,
    breadcrumb,
    children,
  }
}

export type RegionChildNode = {
  code: string
  nameEL: string
  level: number
  parentCode: string | null
  directChildren: number
  descendants: number
  hasChildren: boolean
}

/**
 * GET-children equivalent (ported from ref app/api/regions/children/route.ts):
 * parentCode=null|undefined → top-level (Περιφέρειες, level=3); otherwise direct
 * children of parentCode, each annotated with direct/descendant counts via
 * path startsWith.
 */
export async function regionChildren(parentCode?: string | null): Promise<RegionChildNode[]> {
  const rows = await prisma.region.findMany({
    where: parentCode ? { parentCode } : { level: 3 },
    orderBy: { nameEL: 'asc' },
    select: {
      code: true,
      nameEL: true,
      level: true,
      parentCode: true,
      path: true,
      _count: { select: { children: true } },
    },
  })

  const descendants = await Promise.all(
    rows.map((r) => (r.path ? prisma.region.count({ where: { path: { startsWith: `${r.path}>` } } }) : Promise.resolve(0))),
  )

  return rows.map((r, i) => ({
    code: r.code,
    nameEL: r.nameEL,
    level: r.level,
    parentCode: r.parentCode,
    directChildren: r._count.children,
    descendants: descendants[i],
    hasChildren: r._count.children > 0,
  }))
}

export type RegionMatch = {
  regionCode: string
  breadcrumb: RegionBreadcrumb
  confidence: 'gemi' | 'name' | 'geo'
}

type MatchInput = {
  address?: string | null
  city?: string | null
  district?: string | null
  zip?: string | null
  country?: string | null
  // ADAPTED from ref: the reference PIM had Municipality/Prefecture prisma models and
  // resolved municipalityId/prefectureId → official ΓΕΜΗ descr via a DB lookup. DAMASK
  // (W1) has no Municipality/Prefecture models yet (ΓΕΜΗ integration is a later
  // milestone) — callers pass the ΓΕΜΗ official descr text directly instead.
  municipalityDescr?: string | null // ΓΕΜΗ Δήμος official name
  prefectureDescr?: string | null // ΓΕΜΗ Νομός/Π.Ε. official name
  latitude?: number | null
  longitude?: number | null
}

type Level5Node = { code: string; nameEL: string; latitude: number | null; longitude: number | null }

/** Hybrid: ΓΕΜΗ official names → free-text name match → geocode-nearest fallback. */
export async function matchRegion(input: MatchInput): Promise<RegionMatch | null> {
  const nodes: Level5Node[] = await prisma.region.findMany({
    where: { level: 5 },
    select: { code: true, nameEL: true, latitude: true, longitude: true },
  })

  // 0) ΓΕΜΗ Δήμος (highest signal) — official Municipality descr → level-5
  if (input.municipalityDescr) {
    const code = nameMatchCandidate(input.municipalityDescr, nodes)
    if (code) return { regionCode: code, breadcrumb: await deriveHierarchy(code), confidence: 'gemi' }
  }

  // 0b) ΓΕΜΗ Νομός/Π.Ε. — official Prefecture descr → level-4 (Δήμος stays "—")
  if (input.prefectureDescr) {
    const units = await prisma.region.findMany({
      where: { level: 4 },
      select: { code: true, nameEL: true },
    })
    const code = nameMatchCandidate(input.prefectureDescr, units)
    if (code) return { regionCode: code, breadcrumb: await deriveHierarchy(code), confidence: 'gemi' }
  }

  // 1) free-text name match — district first (more specific), then city
  for (const q of [input.district, input.city]) {
    if (!q) continue
    const code = nameMatchCandidate(q, nodes)
    if (code) return { regionCode: code, breadcrumb: await deriveHierarchy(code), confidence: 'name' }
  }

  // 2) geo fallback — use given coords, else geocode the address via the existing
  //    geocode.maps.co helper (src/lib/geocode.ts), keyed from the 'maps' integration.
  let point: { lat: number; lng: number } | null =
    input.latitude != null && input.longitude != null ? { lat: input.latitude, lng: input.longitude } : null
  if (!point) {
    const query = [input.address, input.district, input.city, input.zip].filter(Boolean).join(', ')
    if (query) {
      const maps = await getIntegration<{ geocodeApiKey?: string }>('maps')
      if (maps.geocodeApiKey) {
        try {
          const [first] = await geocodeSearch(query, maps.geocodeApiKey)
          if (first) point = { lat: first.lat, lng: first.lng }
        } catch (err) {
          // Fail soft — geocoding is a best-effort fallback, never let it throw matchRegion.
          if (!(err instanceof GeocodeError)) throw err
        }
      }
    }
  }
  if (point) {
    const code = nearestNode(point, nodes)
    if (code) return { regionCode: code, breadcrumb: await deriveHierarchy(code), confidence: 'geo' }
  }
  return null
}
