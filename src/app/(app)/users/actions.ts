'use server'

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

/** Ενεργοποίηση/απενεργοποίηση χρήστη. Ποτέ στον εαυτό σου — έλεγχος server-side, όχι μόνο UI. */
export async function toggleUserActive(userId: string): Promise<ActionResult> {
  const session = await requirePermission('user.manage')

  if (userId === session.user.id) {
    return { ok: false, message: 'Δεν μπορείς να απενεργοποιήσεις τον εαυτό σου.' }
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { ok: false, message: 'Ο χρήστης δεν βρέθηκε.' }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { active: !user.active },
  })

  revalidatePath('/users')
  return {
    ok: true,
    message: updated.active ? 'Ο χρήστης ενεργοποιήθηκε.' : 'Ο χρήστης απενεργοποιήθηκε.',
  }
}

/** Αλλαγή ρόλου χρήστη — ισχύει από το επόμενο login (JWT permissions). */
export async function changeUserRole(userId: string, roleId: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findUnique({ where: { id: roleId } }),
  ])
  if (!user) return { ok: false, message: 'Ο χρήστης δεν βρέθηκε.' }
  if (!role) return { ok: false, message: 'Ο ρόλος δεν βρέθηκε.' }

  await prisma.user.update({ where: { id: userId }, data: { roleId } })

  revalidatePath('/users')
  return { ok: true, message: `Ο ρόλος του/της ${user.name} άλλαξε σε ${role.name}.` }
}

function randomTempPassword(): string {
  return crypto.randomBytes(12).toString('base64url')
}

/**
 * Εγκρίνει ένα B2B αίτημα πρόσβασης: δημιουργεί User (CUSTOMER ή ARCHITECT),
 * ενεργό, με τυχαίο προσωρινό password· σημειώνει το αίτημα ως APPROVED.
 */
export async function approveAccessRequest(requestId: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  const request = await prisma.accessRequest.findUnique({ where: { id: requestId } })
  if (!request || request.status !== 'PENDING') {
    return { ok: false, message: 'Το αίτημα δεν βρέθηκε ή έχει ήδη διεκπεραιωθεί.' }
  }

  const roleName = request.type === 'ARCHITECT' ? 'ARCHITECT' : 'CUSTOMER'
  const role = await prisma.role.findUnique({ where: { name: roleName } })
  if (!role) return { ok: false, message: `Ο ρόλος ${roleName} δεν υπάρχει.` }

  const tempPassword = randomTempPassword()

  try {
    await prisma.user.create({
      data: {
        email: request.email,
        name: request.name,
        passwordHash: await bcrypt.hash(tempPassword, 12),
        active: true,
        roleId: role.id,
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: 'Υπάρχει ήδη χρήστης με αυτό το email.' }
    }
    throw e
  }

  await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'APPROVED' } })

  // TODO(SMTP): δεν έχει ρυθμιστεί ακόμα mailer — προσωρινά logάρουμε το temp password.
  console.log(`[access-request] Εγκρίθηκε ${request.email} (${roleName}) — προσωρινός κωδικός: ${tempPassword}`)

  revalidatePath('/users')
  return { ok: true, message: `Ο λογαριασμός για ${request.name} δημιουργήθηκε.` }
}

/** Απορρίπτει ένα B2B αίτημα πρόσβασης — δεν δημιουργεί χρήστη. */
export async function rejectAccessRequest(requestId: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  const request = await prisma.accessRequest.findUnique({ where: { id: requestId } })
  if (!request || request.status !== 'PENDING') {
    return { ok: false, message: 'Το αίτημα δεν βρέθηκε ή έχει ήδη διεκπεραιωθεί.' }
  }

  await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } })

  revalidatePath('/users')
  return { ok: true, message: `Το αίτημα του/της ${request.name} απορρίφθηκε.` }
}
