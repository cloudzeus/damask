'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/rbac-server'
import { setSyncConfig, isSoftOneConnected } from '@/lib/sync-config-server'
import { runSyncTarget } from '@/lib/sync-engines'
import type { ObjectSyncConfig } from '@/lib/sync-targets'
import type { ActionResult } from './actions'

/** Persist a partial sync-config patch for one target (SUPER_ADMIN only). */
export async function saveSyncConfig(key: string, patch: Partial<ObjectSyncConfig>): Promise<ActionResult> {
  await requireSuperAdmin('settings.manage')
  if (!(await isSoftOneConnected())) return { ok: false, message: 'Δεν υπάρχει ενεργή σύνδεση SoftOne.' }
  await setSyncConfig(key, patch)
  revalidatePath('/settings')
  return { ok: true, message: 'Οι ρυθμίσεις συγχρονισμού αποθηκεύτηκαν.' }
}

/** Manual «Sync τώρα» for one target (SUPER_ADMIN only). */
export async function runSyncNow(key: string): Promise<ActionResult> {
  await requireSuperAdmin('settings.manage')
  if (!(await isSoftOneConnected())) return { ok: false, message: 'Δεν υπάρχει ενεργή σύνδεση SoftOne.' }
  const res = await runSyncTarget(key, () => new Date().toISOString())
  revalidatePath('/settings')
  return { ok: res.ok, message: res.message }
}
