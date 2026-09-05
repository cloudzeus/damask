import { Prisma, type NotificationType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * In-app ειδοποιήσεις ομάδας (dashboard bell + feed). Plain server functions
 * (ΟΧΙ 'use server') ώστε να καλούνται και από μη-gated ροές (π.χ. δημόσια φόρμα
 * επιλεξιμότητας → createNotification). Οι gated wrappers για το UI (unread
 * count / list / mark read) ζουν στο actions.ts.
 *
 * Broadcast μοντέλο: μία Notification = ένα γεγονός ορατό σε όλη την ομάδα· η
 * κατάσταση ανάγνωσης είναι ανά χρήστη (NotificationRead).
 */

export type NotificationRow = {
  id: string
  type: NotificationType
  title: string
  body: string | null
  entityType: string | null
  entityId: string | null
  meta: Prisma.JsonValue | null
  createdAt: string
  read: boolean
}

export async function createNotification(input: {
  type?: NotificationType
  title: string
  body?: string | null
  entityType?: string | null
  entityId?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        type: input.type ?? 'GENERIC',
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta ? (input.meta as Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (err) {
    // Non-throwing: μια ειδοποίηση δεν πρέπει ποτέ να σπάσει το καλών action.
    console.error('createNotification failed:', err)
  }
}

/** Πλήθος μη-αναγνωσμένων για τον χρήστη. */
export async function unreadCountFor(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { reads: { none: { userId } } },
  })
}

/** Πρόσφατες ειδοποιήσεις + flag ανάγνωσης για τον χρήστη. */
export async function listNotificationsFor(userId: string, limit = 20): Promise<NotificationRow[]> {
  const rows = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { reads: { where: { userId }, select: { id: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    entityType: r.entityType,
    entityId: r.entityId,
    meta: r.meta,
    createdAt: r.createdAt.toISOString(),
    read: r.reads.length > 0,
  }))
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notificationRead.upsert({
    where: { notificationId_userId: { notificationId, userId } },
    create: { notificationId, userId },
    update: {},
  })
}

/** Μαρκάρει ως αναγνωσμένες όλες όσες δεν έχει διαβάσει ο χρήστης. */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const unread = await prisma.notification.findMany({
    where: { reads: { none: { userId } } },
    select: { id: true },
  })
  if (unread.length === 0) return
  await prisma.notificationRead.createMany({
    data: unread.map(n => ({ notificationId: n.id, userId })),
    skipDuplicates: true,
  })
}
