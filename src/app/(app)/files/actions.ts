'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { runNasBackup, restoreFromNas } from '@/lib/nas/backup'

export type BackupRunRow = {
  id: string
  trigger: string
  status: string
  startedAt: string
  finishedAt: string | null
  scanned: number
  uploaded: number
  uploadedBytes: number
  failed: number
  pending: number
  message: string | null
}

export async function listBackupRuns(): Promise<BackupRunRow[]> {
  await requirePermission('files.manage')
  const rows = await prisma.nasBackupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30 })
  return rows.map(r => ({
    id: r.id, trigger: r.trigger, status: r.status,
    startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
    scanned: r.scanned, uploaded: r.uploaded, uploadedBytes: Number(r.uploadedBytes), failed: r.failed, pending: r.pending, message: r.message,
  }))
}

/** «Backup τώρα»: ξεκινά στο παρασκήνιο (με κλείδωμα — μία εκτέλεση τη φορά). */
export async function startNasBackupNow(): Promise<{ ok: boolean; message: string }> {
  const session = await requirePermission('files.manage')
  const running = await prisma.nasBackupRun.findFirst({ where: { status: 'RUNNING', startedAt: { gt: new Date(Date.now() - 3 * 3600_000) } } })
  if (running) return { ok: false, message: 'Τρέχει ήδη backup — δες την πρόοδο παρακάτω.' }
  void runNasBackup({ trigger: 'manual', userId: session.user.id }).catch(err => console.error('[nas-backup] manual failed', err))
  return { ok: true, message: 'Το backup ξεκίνησε — η πρόοδος ενημερώνεται αυτόματα.' }
}

export async function restoreFileFromNas(key: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission('files.manage')
  try {
    await restoreFromNas(key)
    revalidatePath('/files')
    return { ok: true, message: 'Το αρχείο επανήλθε στην αποθήκη από το NAS.' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η επαναφορά απέτυχε.' }
  }
}
