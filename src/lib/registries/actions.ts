'use server'

import { requirePermission } from '@/lib/rbac-server'
import {
  decodeRegion,
  regionChildren,
  matchRegion,
  type DecodedRegion,
  type RegionChildNode,
  type RegionMatch,
} from '@/lib/registries/regions'
import {
  decodeKADCode,
  kadChildren,
  kadSearch,
  type DecodedKad,
  type KadChildNode,
  type KadSearchResult,
  type KadSearchResultItem,
} from '@/lib/registries/kad'

/**
 * Gated server-action wrappers γύρω από τα καθαρά (RBAC-agnostic) region/KAD
 * libs του T3 (@/lib/registries/regions.ts, @/lib/registries/kad.ts). Κάθε
 * action ελέγχει το αντίστοιχο permission (regions.view / kad.view) ΠΡΙΝ
 * αγγίξει τη βάση — mirror του gating idiom στο @/lib/pm/actions.ts.
 */

type MatchInput = Parameters<typeof matchRegion>[0]

export type { DecodedRegion, RegionChildNode, RegionMatch, DecodedKad, KadChildNode, KadSearchResult, KadSearchResultItem }
export type { MatchInput }

export async function regionChildrenAction(parentCode?: string | null): Promise<RegionChildNode[]> {
  await requirePermission('regions.view')
  return regionChildren(parentCode ?? null)
}

export async function regionDecodeAction(input: string): Promise<DecodedRegion | null> {
  await requirePermission('regions.view')
  return decodeRegion(input)
}

export async function regionMatchAction(input: MatchInput): Promise<RegionMatch | null> {
  await requirePermission('regions.view')
  return matchRegion(input)
}

export async function kadChildrenAction(parentCode?: string | null): Promise<KadChildNode[]> {
  await requirePermission('kad.view')
  return kadChildren(parentCode ?? null)
}

export async function kadDecodeAction(code: string): Promise<DecodedKad | null> {
  await requirePermission('kad.view')
  return decodeKADCode(code)
}

export async function kadSearchAction(q: string, limit = 50): Promise<KadSearchResult> {
  await requirePermission('kad.view')
  return kadSearch(q, Math.min(Math.max(1, limit), 100))
}
