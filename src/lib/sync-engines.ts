import { prisma } from '@/lib/prisma'
import { syncAllReferences } from '@/lib/s1-sync'
import { updateLastRun } from '@/lib/sync-config-server'
import { SYNC_TARGETS } from '@/lib/sync-targets'

export type SyncRunResult = { ok: boolean; pending?: boolean; count: number; message: string }

/** engine returns {count,message}; throwing means a failed run (still logged). */
type Engine = () => Promise<{ count: number; message: string }>

const ENGINES: Record<string, Engine> = {
  's1-references': async () => {
    const results = await syncAllReferences()
    const failed = results.filter(r => !r.ok)
    const count = results.reduce((s, r) => s + r.count, 0)
    if (failed.length) {
      return { count, message: `Ολοκληρώθηκε με σφάλματα: ${failed.map(f => f.table).join(', ')}.` }
    }
    return { count, message: `Συγχρονίστηκαν ${count} εγγραφές σε ${results.length} πίνακες.` }
  },
}

/** now: injected clock (ISO) so the scheduler/tests control timestamps. */
export async function runSyncTarget(key: string, now: () => string): Promise<SyncRunResult> {
  const target = SYNC_TARGETS.find(t => t.key === key)
  if (!target) return { ok: false, count: 0, message: `Άγνωστος target: ${key}` }
  const engine = ENGINES[key]
  if (!engine) {
    return { ok: false, pending: true, count: 0, message: 'Ο μηχανισμός συγχρονισμού δεν έχει υλοποιηθεί ακόμη.' }
  }
  try {
    const { count, message } = await engine()
    const ts = now()
    await updateLastRun(key, ts)
    await prisma.syncLog.create({ data: { entity: key, action: 'pull', ok: true, message } })
    return { ok: true, count, message }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Το sync απέτυχε.'
    await prisma.syncLog.create({ data: { entity: key, action: 'pull', ok: false, message } })
    return { ok: false, count: 0, message }
  }
}
