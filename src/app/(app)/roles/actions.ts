'use server'

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission, requireSuperAdmin } from '@/lib/rbac-server'

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

/**
 * Ενεργοποιεί/απενεργοποιεί ένα permission για έναν ρόλο (create/delete RolePermission).
 * Ο SUPER_ADMIN έχει πάντα όλα τα δικαιώματα — locked, refuses server-side (όχι μόνο στο UI).
 * Ο ADMIN πλέον είναι κανονικός, επεξεργάσιμος ρόλος (RBAC v2).
 */
export async function togglePermission(roleName: string, permissionKey: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  if (roleName === 'SUPER_ADMIN') {
    return { ok: false, message: 'Ο ρόλος SUPER_ADMIN έχει πάντα όλα τα δικαιώματα.' }
  }

  const [role, permission] = await Promise.all([
    prisma.role.findUnique({ where: { name: roleName } }),
    prisma.permission.findUnique({ where: { key: permissionKey } }),
  ])
  if (!role) return { ok: false, message: 'Ο ρόλος δεν βρέθηκε.' }
  if (!permission) return { ok: false, message: 'Το δικαίωμα δεν βρέθηκε.' }

  const existing = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
  })

  if (existing) {
    await prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    })
  } else {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    })
  }

  revalidatePath('/roles')
  return {
    ok: true,
    message: existing
      ? `Αφαιρέθηκε «${permission.description}» από τον ρόλο ${roleName}.`
      : `Προστέθηκε «${permission.description}» στον ρόλο ${roleName}.`,
  }
}

// ── Δημιουργία / Διαγραφή ρόλων (SUPER_ADMIN μόνο) ────────────────────────────

const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Δώσε όνομα (≥2 χαρακτήρες).').max(40, 'Πολύ μεγάλο όνομα.'),
  description: z.string().trim().max(120, 'Πολύ μεγάλη περιγραφή.').optional(),
  b2b: z.boolean(),
  copyFromRoleId: z.string().optional(),
})

export type CreateRoleInput = {
  name: string
  description?: string
  b2b: boolean
  copyFromRoleId?: string
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** Κανονικοποίηση ονόματος ρόλου: TRIM → κενά σε _ → κεφαλαία. */
function normalizeRoleName(raw: string): string {
  return raw.trim().replace(/\s+/g, '_').toUpperCase()
}

/**
 * Δημιουργεί custom ρόλο (SUPER_ADMIN μόνο). Προαιρετική αντιγραφή δικαιωμάτων
 * από υπάρχοντα ρόλο (copyFromRoleId). Τα custom ρόλοι έχουν πάντα system=false.
 */
export async function createRole(input: CreateRoleInput): Promise<ActionResult> {
  await requireSuperAdmin('user.manage')

  const parsed = createRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία του ρόλου.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const name = normalizeRoleName(data.name)
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    return { ok: false, message: 'Μη έγκυρο όνομα ρόλου.', fieldErrors: { name: 'Λατινικά κεφαλαία, αριθμοί και _ (ξεκινά με γράμμα).' } }
  }

  let permissionIds: string[] = []
  if (data.copyFromRoleId) {
    const source = await prisma.role.findUnique({
      where: { id: data.copyFromRoleId },
      include: { permissions: true },
    })
    if (!source) {
      return { ok: false, message: 'Ο ρόλος-πηγή δεν βρέθηκε.', fieldErrors: { copyFromRoleId: 'Επίλεξε έγκυρο ρόλο.' } }
    }
    permissionIds = source.permissions.map(rp => rp.permissionId)
  }

  try {
    await prisma.role.create({
      data: {
        name,
        description: data.description && data.description.length > 0 ? data.description : null,
        system: false,
        b2b: data.b2b,
        permissions: { create: permissionIds.map(permissionId => ({ permissionId })) },
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: 'Υπάρχει ήδη ρόλος με αυτό το όνομα.', fieldErrors: { name: 'Υπάρχει ήδη ρόλος με αυτό το όνομα.' } }
    }
    throw e
  }

  revalidatePath('/roles')
  return { ok: true, message: `Ο ρόλος ${name} δημιουργήθηκε.` }
}

/**
 * Διαγράφει custom ρόλο (SUPER_ADMIN μόνο). Οι system ρόλοι δεν διαγράφονται και
 * δεν διαγράφεις τον δικό σου. Αν ο ρόλος έχει χρήστες, απαιτείται reassignToRoleId
 * (έγκυρος, διαφορετικός) — οι χρήστες μετακινούνται πρώτα, μετά διαγράφεται ο
 * ρόλος (τα RolePermission φεύγουν με cascade).
 */
export async function deleteRole(roleId: string, reassignToRoleId?: string): Promise<ActionResult> {
  const session = await requireSuperAdmin('user.manage')

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  })
  if (!role) return { ok: false, message: 'Ο ρόλος δεν βρέθηκε.' }
  if (role.system) return { ok: false, message: 'Οι βασικοί ρόλοι δεν διαγράφονται.' }
  if (role.name === session.user.role) return { ok: false, message: 'Δεν μπορείς να διαγράψεις τον δικό σου ρόλο.' }

  const userCount = role._count.users
  if (userCount > 0) {
    if (!reassignToRoleId) {
      return { ok: false, message: `Ο ρόλος έχει ${userCount} χρήστες — επίλεξε ρόλο μετακίνησης.` }
    }
    if (reassignToRoleId === roleId) {
      return { ok: false, message: 'Επίλεξε διαφορετικό ρόλο μετακίνησης.' }
    }
    const target = await prisma.role.findUnique({ where: { id: reassignToRoleId } })
    if (!target) return { ok: false, message: 'Ο ρόλος μετακίνησης δεν βρέθηκε.' }

    await prisma.$transaction([
      prisma.user.updateMany({ where: { roleId }, data: { roleId: reassignToRoleId } }),
      prisma.role.delete({ where: { id: roleId } }),
    ])
    revalidatePath('/roles')
    revalidatePath('/users')
    return { ok: true, message: `${userCount} χρήστες μετακινήθηκαν στον ${target.name} και ο ρόλος ${role.name} διαγράφηκε.` }
  }

  await prisma.role.delete({ where: { id: roleId } })
  revalidatePath('/roles')
  revalidatePath('/users')
  return { ok: true, message: `Ο ρόλος ${role.name} διαγράφηκε.` }
}
