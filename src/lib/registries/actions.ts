'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { stripKadDots } from '@/lib/registries/kad-pure'
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

// ── Διαχείριση μητρώων (regions.manage / kad.manage) ────────────────────────
// CRUD πάνω στα Region/KadCode για τις σελίδες «Ευρωπαϊκά Προγράμματα › Περιφέρειες/ΚΑΔ».
// Το code είναι primary key και ΔΕΝ αλλάζει μετά τη δημιουργία (ούτε re-parenting) —
// path/level παράγονται από τον γονέα κατά τη δημιουργία, όπως στο import.

const regionCreateSchema = z.object({
  code: z.string().trim().regex(/^\d{3,10}$/, 'Ο κωδικός πρέπει να αποτελείται από 3–10 ψηφία.'),
  nameEL: z.string().trim().min(1, 'Το όνομα είναι υποχρεωτικό.').max(200),
  nameEN: z.string().trim().max(200).optional(),
  parentCode: z.string().trim().min(1).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
})

export type RegionCreateInput = z.input<typeof regionCreateSchema>

export async function regionCreateAction(input: RegionCreateInput): Promise<{ ok: true; code: string }> {
  await requirePermission('regions.manage')
  const v = regionCreateSchema.parse(input)

  const existing = await prisma.region.findUnique({ where: { code: v.code } })
  if (existing) throw new Error(`Υπάρχει ήδη περιοχή με κωδικό ${v.code}.`)

  let level = 3
  let path = v.code
  if (v.parentCode) {
    const parent = await prisma.region.findUnique({ where: { code: v.parentCode } })
    if (!parent) throw new Error(`Δεν βρέθηκε γονική περιοχή με κωδικό ${v.parentCode}.`)
    if (parent.level >= 5) throw new Error('Οι Δήμοι (επίπεδο 5) δεν έχουν υποδιαιρέσεις.')
    if (!v.code.startsWith(parent.code)) {
      throw new Error(`Ο κωδικός πρέπει να ξεκινά με τον κωδικό του γονέα (${parent.code}) — σχήμα Καλλικράτη.`)
    }
    level = parent.level + 1
    path = parent.path ? `${parent.path}>${v.code}` : `${parent.code}>${v.code}`
  }

  await prisma.region.create({
    data: {
      code: v.code,
      nameEL: v.nameEL,
      nameEN: v.nameEN || null,
      level,
      parentCode: v.parentCode ?? null,
      path,
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
    },
  })
  revalidatePath('/regions')
  return { ok: true, code: v.code }
}

const regionUpdateSchema = z.object({
  code: z.string().trim().min(1),
  nameEL: z.string().trim().min(1, 'Το όνομα είναι υποχρεωτικό.').max(200),
  nameEN: z.string().trim().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isActive: z.boolean().optional(),
})

export type RegionUpdateInput = z.input<typeof regionUpdateSchema>

export async function regionUpdateAction(input: RegionUpdateInput): Promise<{ ok: true }> {
  await requirePermission('regions.manage')
  const v = regionUpdateSchema.parse(input)

  const existing = await prisma.region.findUnique({ where: { code: v.code } })
  if (!existing) throw new Error(`Δεν βρέθηκε περιοχή με κωδικό ${v.code}.`)

  await prisma.region.update({
    where: { code: v.code },
    data: {
      nameEL: v.nameEL,
      // undefined = «δεν άλλαξε»· ρητό null/'' καθαρίζει το πεδίο.
      nameEN: v.nameEN === undefined ? undefined : (v.nameEN || null),
      latitude: v.latitude === undefined ? undefined : v.latitude,
      longitude: v.longitude === undefined ? undefined : v.longitude,
      isActive: v.isActive,
    },
  })
  revalidatePath('/regions')
  return { ok: true }
}

export async function regionDeleteAction(code: string): Promise<{ ok: true }> {
  await requirePermission('regions.manage')

  const existing = await prisma.region.findUnique({
    where: { code },
    select: { code: true, _count: { select: { children: true, trdrs: true } } },
  })
  if (!existing) throw new Error(`Δεν βρέθηκε περιοχή με κωδικό ${code}.`)
  if (existing._count.children > 0) {
    throw new Error(`Η περιοχή έχει ${existing._count.children} υποδιαιρέσεις — διαγράψτε ή μετακινήστε τις πρώτα.`)
  }
  if (existing._count.trdrs > 0) {
    throw new Error(`Η περιοχή χρησιμοποιείται από ${existing._count.trdrs} συναλλασσόμενους — δεν μπορεί να διαγραφεί. Μπορείτε να την απενεργοποιήσετε.`)
  }

  await prisma.region.delete({ where: { code } })
  revalidatePath('/regions')
  return { ok: true }
}

const kadCreateSchema = z.object({
  code: z.string().trim().min(1, 'Ο κωδικός είναι υποχρεωτικός.').max(20),
  title: z.string().trim().min(1, 'Ο τίτλος είναι υποχρεωτικός.').max(500),
  parentCode: z.string().trim().min(1).optional(),
})

export type KadCreateInput = z.input<typeof kadCreateSchema>

export async function kadCreateAction(input: KadCreateInput): Promise<{ ok: true; code: string }> {
  await requirePermission('kad.manage')
  const v = kadCreateSchema.parse(input)

  const existing = await prisma.kadCode.findUnique({ where: { code: v.code } })
  if (existing) throw new Error(`Υπάρχει ήδη ΚΑΔ με κωδικό ${v.code}.`)

  let level: number | null = 1
  let path = v.code
  let sector: string | null = null
  let sectorLetter: string | null = null
  if (v.parentCode) {
    const parent = await prisma.kadCode.findUnique({ where: { code: v.parentCode } })
    if (!parent) throw new Error(`Δεν βρέθηκε γονικός ΚΑΔ με κωδικό ${v.parentCode}.`)
    if ((parent.level ?? 0) >= 7) throw new Error('Οι εθνικές δραστηριότητες (επίπεδο 7) δεν έχουν υποδιαιρέσεις.')
    level = parent.level != null ? parent.level + 1 : null
    path = parent.path ? `${parent.path}>${v.code}` : `${parent.code}>${v.code}`
    sector = parent.sector
    sectorLetter = parent.sectorLetter
  }

  const digits = stripKadDots(v.code)
  await prisma.kadCode.create({
    data: {
      code: v.code,
      codeWithoutDots: digits || null,
      title: v.title,
      description: v.title, // legacy alias — κρατιέται συγχρονισμένο με το title
      level,
      parentCode: v.parentCode ?? null,
      path,
      sector,
      sectorLetter,
    },
  })
  revalidatePath('/kad')
  return { ok: true, code: v.code }
}

const kadUpdateSchema = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Ο τίτλος είναι υποχρεωτικός.').max(500),
  isActive: z.boolean().optional(),
})

export type KadUpdateInput = z.input<typeof kadUpdateSchema>

export async function kadUpdateAction(input: KadUpdateInput): Promise<{ ok: true }> {
  await requirePermission('kad.manage')
  const v = kadUpdateSchema.parse(input)

  const existing = await prisma.kadCode.findUnique({ where: { code: v.code } })
  if (!existing) throw new Error(`Δεν βρέθηκε ΚΑΔ με κωδικό ${v.code}.`)

  await prisma.kadCode.update({
    where: { code: v.code },
    data: { title: v.title, description: v.title, isActive: v.isActive },
  })
  revalidatePath('/kad')
  return { ok: true }
}

export async function kadDeleteAction(code: string): Promise<{ ok: true }> {
  await requirePermission('kad.manage')

  const existing = await prisma.kadCode.findUnique({
    where: { code },
    select: { code: true, codeWithoutDots: true, _count: { select: { children: true } } },
  })
  if (!existing) throw new Error(`Δεν βρέθηκε ΚΑΔ με κωδικό ${code}.`)
  if (existing._count.children > 0) {
    throw new Error(`Ο ΚΑΔ έχει ${existing._count.children} υποδιαιρέσεις — διαγράψτε τις πρώτα.`)
  }

  // Soft reference από TrdrKad (χωρίς FK) — έλεγχος χρήσης πριν τη διαγραφή.
  const usage = await prisma.trdrKad.count({
    where: existing.codeWithoutDots
      ? { OR: [{ code }, { codeWithoutDots: existing.codeWithoutDots }] }
      : { code },
  })
  if (usage > 0) {
    throw new Error(`Ο ΚΑΔ χρησιμοποιείται σε ${usage} συναλλασσόμενους — δεν μπορεί να διαγραφεί. Μπορείτε να τον απενεργοποιήσετε.`)
  }

  await prisma.kadCode.delete({ where: { code } })
  revalidatePath('/kad')
  return { ok: true }
}
