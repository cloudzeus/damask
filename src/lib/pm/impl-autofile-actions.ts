'use server'

import { requireApplicationAccess } from '@/lib/pm/access'
import { logActivity } from '@/lib/activity/log'
import { enqueueImplAutofile, readAutofileStatus, type AutofileStatus } from '@/lib/pm/impl-autofile'

/** «Αυτόματη καταχώριση στην υλοποίηση» — εκκίνηση στο παρασκήνιο. */
export async function startImplAutofile(applicationId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { session } = await requireApplicationAccess(applicationId)
  const cur = await readAutofileStatus(applicationId)
  if (cur?.state === 'RUNNING' && Date.now() - Date.parse(cur.startedAt) < 30 * 60_000) return { ok: false, message: 'Η αυτόματη καταχώριση τρέχει ήδη.' }
  await enqueueImplAutofile(applicationId, session.user.id)
  await logActivity('expense.autofile', { entityType: 'application', entityId: applicationId, userId: session.user.id })
  return { ok: true }
}

export async function getImplAutofileStatus(applicationId: string): Promise<AutofileStatus | null> {
  await requireApplicationAccess(applicationId)
  return readAutofileStatus(applicationId)
}
