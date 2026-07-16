'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { syncAllReferences, S1SyncNotConfiguredError, type SyncResult } from '@/lib/s1-sync'
import type { ActionResult } from './actions'

/**
 * «Sync βοηθητικών από SoftOne» — χειροκίνητο κουμπί στην κάρτα SoftOne (καρτέλα
 * «Διασυνδέσεις»). Ίδιο idiom με runBackupNow (backups-actions.ts): bypass της
 * pg-boss ουράς 's1-ref-sync' (αυτή υπάρχει για μελλοντικό scheduled sync, βλ.
 * src/server/queue-start.ts) — το χειροκίνητο κουμπί καλεί απευθείας.
 */
export async function runS1RefSyncNow(): Promise<ActionResult & { results?: SyncResult[] }> {
  await requirePermission('settings.manage')
  try {
    const results = await syncAllReferences()
    revalidatePath('/settings')
    const failed = results.filter(r => !r.ok)
    const total = results.reduce((sum, r) => sum + r.count, 0)
    if (failed.length > 0) {
      return {
        ok: false,
        message: `Ολοκληρώθηκε με σφάλματα: ${failed.map(f => f.table).join(', ')}.`,
        results,
      }
    }
    return { ok: true, message: `Συγχρονίστηκαν ${total} εγγραφές σε ${results.length} πίνακες.`, results }
  } catch (err) {
    if (err instanceof S1SyncNotConfiguredError) return { ok: false, message: err.message }
    return { ok: false, message: err instanceof Error ? err.message : 'Το sync απέτυχε.' }
  }
}
