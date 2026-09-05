'use server'

import { auth } from '@/auth'
import {
  listNotificationsFor,
  unreadCountFor,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '@/lib/notifications/service'

/**
 * Gated wrappers για το topbar bell + dashboard feed. Οι ειδοποιήσεις είναι για
 * το προσωπικό (κάθε logged-in χρήστης)· δεν χρειάζεται ειδικό permission — αρκεί
 * ενεργό session. Χωρίς session επιστρέφουν ασφαλή κενά.
 */

async function currentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

export async function getUnreadNotificationCount(): Promise<number> {
  const userId = await currentUserId()
  if (!userId) return 0
  return unreadCountFor(userId)
}

export async function getNotifications(limit = 20): Promise<NotificationRow[]> {
  const userId = await currentUserId()
  if (!userId) return []
  return listNotificationsFor(userId, limit)
}

export async function markNotificationReadAction(id: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId()
  if (!userId) return { ok: false }
  await markNotificationRead(userId, id)
  return { ok: true }
}

export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const userId = await currentUserId()
  if (!userId) return { ok: false }
  await markAllNotificationsRead(userId)
  return { ok: true }
}
