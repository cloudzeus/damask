'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

/**
 * Ενεργοποιεί/απενεργοποιεί ένα permission για έναν ρόλο (create/delete RolePermission).
 * Ο ADMIN έχει πάντα όλα τα δικαιώματα — locked, refuses server-side (όχι μόνο στο UI).
 */
export async function togglePermission(roleName: string, permissionKey: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  if (roleName === 'ADMIN') {
    return { ok: false, message: 'Ο ρόλος ADMIN έχει πάντα όλα τα δικαιώματα.' }
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
