import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { ACTIONS, type ActivityAction } from '@/lib/activity/registry'

/**
 * Καταγραφή μιας ενέργειας χρήστη. Non-throwing: ΠΟΤΕ δεν σπάει το καλών action
 * (τυλιγμένο σε try/catch). Ο χρήστης προκύπτει από το session (auth()). Καλείται
 * με await στο τέλος του business action ώστε να ολοκληρωθεί το insert πριν το
 * response (serverless-safe). Κατηγορία/βαρύτητα/ετικέτα από το registry.
 */
export async function logActivity(
  action: ActivityAction,
  opts?: { entityType?: string; entityId?: string | null; summary?: string; meta?: Record<string, unknown>; userId?: string | null },
): Promise<void> {
  try {
    const def = ACTIONS[action]
    if (!def) return
    let userId = opts?.userId
    if (userId === undefined) {
      const session = await auth()
      userId = session?.user?.id ?? null
    }
    await prisma.activityLog.create({
      data: {
        userId: userId ?? null,
        action,
        category: def.category,
        weight: def.weight,
        entityType: opts?.entityType ?? null,
        entityId: opts?.entityId ?? null,
        summary: opts?.summary ?? def.label,
        meta: opts?.meta ? (opts.meta as Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (err) {
    console.error('logActivity failed:', action, err)
  }
}
