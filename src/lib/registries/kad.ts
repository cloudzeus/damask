/**
 * KAD (Greek Activity Code) — server functions, ported from the reference PIM's
 * lib/kad/decoder.ts, lib/kad/resolve.ts, app/api/kad/children/route.ts and
 * app/api/admin/kad-codes/route.ts (GET). Uses the DAMASK prisma singleton
 * (@/lib/prisma) and the pure helpers in kad-pure.ts. RBAC is NOT enforced here —
 * that's the caller's job (server actions / route handlers wired in a later task).
 *
 * NOT integration-tested here — these are pure ports meant to compile; DB-backed
 * verification happens in a later task.
 */

import { prisma } from '@/lib/prisma'
import { normalizeKad, formatKadDots } from '@/lib/registries/kad-pure'

export type DecodedKad = {
  code: string
  codeWithoutDots: string | null
  title: string | null
  level: number | null
  sector: string | null
  path: string | null
  hierarchy: Array<{
    code: string
    title: string | null
    level: number | null
    sector: string | null
    parentCode: string | null
  }>
  children: Array<{ code: string; title: string | null; level: number | null }>
}

async function walkUp(code: string): Promise<DecodedKad['hierarchy']> {
  const chain: DecodedKad['hierarchy'] = []
  let current: string | null = code
  // Cap depth to avoid pathological cycles.
  for (let i = 0; i < 10 && current; i++) {
    const lookupCode: string = current
    const node = await prisma.kadCode.findUnique({
      where: { code: lookupCode },
      select: { code: true, title: true, description: true, level: true, sector: true, parentCode: true },
    })
    if (!node) break
    chain.unshift({
      code: node.code,
      title: node.title ?? node.description,
      level: node.level,
      sector: node.sector,
      parentCode: node.parentCode,
    })
    current = node.parentCode
  }
  return chain
}

export async function decodeKADCode(input: string): Promise<DecodedKad | null> {
  const raw = (input ?? '').trim()
  if (!raw) return null

  // Direct dotted lookup first (preserves levels with > 8 digits or custom shape).
  const dotted = raw.includes('.') ? raw : null
  let hit = dotted ? await prisma.kadCode.findUnique({ where: { code: dotted } }) : null

  if (!hit) {
    const normalized = normalizeKad(raw)
    // Try exact, then strip trailing zeros, then shorter prefixes.
    const candidates = new Set<string>()
    let cur = normalized
    candidates.add(cur)
    while (cur.endsWith('0') && cur.length > 1) {
      cur = cur.slice(0, -1)
      candidates.add(cur)
    }
    for (const len of [8, 7, 6, 5, 4, 3, 2]) {
      if (normalized.length >= len) candidates.add(normalized.slice(0, len))
    }
    for (const cand of candidates) {
      hit = await prisma.kadCode.findFirst({
        where: { codeWithoutDots: cand },
        orderBy: [{ level: 'desc' }, { code: 'asc' }],
      })
      if (hit) break
    }
    if (!hit) {
      // Last resort: startsWith on shortest meaningful prefix
      for (const len of [6, 4, 2]) {
        const prefix = normalized.slice(0, len)
        if (!prefix) continue
        hit = await prisma.kadCode.findFirst({
          where: { codeWithoutDots: { startsWith: prefix } },
          orderBy: [{ level: 'desc' }, { code: 'asc' }],
        })
        if (hit) break
      }
    }
  }

  if (!hit) return null

  const [children, hierarchy] = await Promise.all([
    prisma.kadCode.findMany({
      where: { parentCode: hit.code },
      orderBy: { code: 'asc' },
      take: 100,
      select: { code: true, title: true, description: true, level: true },
    }),
    walkUp(hit.code),
  ])

  return {
    code: hit.code,
    codeWithoutDots: hit.codeWithoutDots,
    title: hit.title ?? hit.description,
    level: hit.level,
    sector: hit.sector,
    path: hit.path,
    hierarchy,
    children: children.map((c) => ({
      code: c.code,
      title: c.title ?? c.description,
      level: c.level,
    })),
  }
}

export type KadChildNode = {
  code: string
  title: string | null
  level: number | null
  sector: string | null
  parentCode: string | null
  directChildren: number
  descendants: number
  hasChildren: boolean
}

/**
 * GET-children equivalent (ported from ref app/api/kad/children/route.ts):
 * parentCode=null|undefined → top-level (sectors, level=1); otherwise direct
 * children of parentCode, each annotated with direct/descendant counts via
 * path startsWith.
 */
export async function kadChildren(parentCode?: string | null): Promise<KadChildNode[]> {
  const rows = await prisma.kadCode.findMany({
    where: parentCode ? { parentCode } : { level: 1 },
    orderBy: { code: 'asc' },
    select: {
      code: true,
      title: true,
      description: true,
      level: true,
      sector: true,
      parentCode: true,
      path: true,
      _count: { select: { children: true } },
    },
  })

  // Total descendants per node via path-prefix count, batched.
  const descendants = await Promise.all(
    rows.map((r) => (r.path ? prisma.kadCode.count({ where: { path: { startsWith: `${r.path}>` } } }) : Promise.resolve(0))),
  )

  return rows.map((r, i) => ({
    code: r.code,
    title: r.title ?? r.description,
    level: r.level,
    sector: r.sector,
    parentCode: r.parentCode,
    directChildren: r._count.children,
    descendants: descendants[i],
    hasChildren: r._count.children > 0,
  }))
}

/**
 * Search KadCode by code OR description/title contains (ported from ref
 * app/api/admin/kad-codes/route.ts GET). Capped at 100 regardless of requested limit.
 */
export async function kadSearch(q?: string | null, limit = 100) {
  const query = (q ?? '').trim()
  const cappedLimit = Math.min(limit, 100)

  const where = query
    ? {
        OR: [{ code: { contains: query } }, { description: { contains: query, mode: 'insensitive' as const } }],
      }
    : {}

  const [codes, total] = await Promise.all([
    prisma.kadCode.findMany({ where, orderBy: { code: 'asc' }, take: cappedLimit }),
    prisma.kadCode.count({ where }),
  ])
  return { codes, total }
}

export type ResolvedKadActivity = {
  code: string
  codeWithoutDots: string
  codeAade: string
  description: string
}

/**
 * Resolve a raw KAD code (dotted or digit-only) to its canonical KadCode entry.
 * Returns both dotted and digit-only forms so activity rows always carry both.
 * Falls back to the input itself if no match is found in KadCode.
 */
export async function resolveKadForActivity(rawCode: string, fallbackDescription = ''): Promise<ResolvedKadActivity> {
  const input = rawCode.trim()
  const digitsOnly = input.replace(/[^0-9]/g, '')
  // AADE convention: zero-padded to 8 digits (or longer if input already exceeds).
  const codeAade = digitsOnly ? digitsOnly.padEnd(Math.max(8, digitsOnly.length), '0') : input

  // 1) direct hit on dotted code
  let hit = input.includes('.')
    ? await prisma.kadCode.findUnique({
        where: { code: input },
        select: { code: true, codeWithoutDots: true, title: true, description: true },
      })
    : null

  // 2) lookup by digit-form. AADE returns zero-padded 8-digit codes ("43210000")
  //    but canonical entries store the un-padded form ("432100" for L6, "43210004"
  //    for L7). Try exact first, then progressively strip trailing zeros so an
  //    AADE-padded code falls back to its closest canonical entry.
  if (!hit && digitsOnly) {
    const candidates: string[] = [digitsOnly]
    let s = digitsOnly
    while (s.endsWith('0') && s.length > 2) {
      s = s.slice(0, -1)
      candidates.push(s)
    }
    for (const cand of candidates) {
      hit = await prisma.kadCode.findFirst({
        where: { codeWithoutDots: cand },
        orderBy: { level: 'desc' },
        select: { code: true, codeWithoutDots: true, title: true, description: true },
      })
      if (hit) break
    }
  }

  if (hit) {
    return {
      code: formatKadDots(hit.code),
      codeWithoutDots: hit.codeWithoutDots ?? digitsOnly,
      codeAade,
      description: fallbackDescription || hit.title || hit.description,
    }
  }

  // No KadCode match — still emit a canonical dotted code so the UI never shows
  // mixed "56101104" vs "56.11.01" formatting. codeWithoutDots is always digits.
  return {
    code: formatKadDots(input),
    codeWithoutDots: digitsOnly,
    codeAade,
    description: fallbackDescription,
  }
}
