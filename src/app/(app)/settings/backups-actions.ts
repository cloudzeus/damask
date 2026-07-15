'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { getSetting, setSetting } from '@/lib/settings'
import { runBackup, restoreBackup, deleteBackup, listBackups, type BackupListItem } from '@/lib/backup'
import type { ActionResult } from './actions'

/**
 * Server actions ειδικά για την καρτέλα «Backups» — ξεχωριστά από το γενικό
 * settings/actions.ts (εκείνο είναι καθαρό KV-settings CRUD μέσω getIntegration/
 * setSetting· εδώ οι ενέργειες κάνουν spawn σε pg_dump/pg_restore και μιλάνε με
 * το BunnyCDN, διαφορετική φύση/ρίσκο — καλύτερα σε δικό τους module).
 */

function revalidateSettings() {
  revalidatePath('/settings')
}

// ══════════════════════════════════════════════════════════════════════════
// Ρυθμίσεις (backups.retentionDays / storagePrefix / pgDumpPath / pgRestorePath)
// ══════════════════════════════════════════════════════════════════════════

export type BackupSettingsValues = {
  retentionDays: string
  storagePrefix: string
  pgDumpPath: string
  pgRestorePath: string
}

const SAFE_PREFIX_RE = /^[a-zA-Z0-9/_-]*$/

const backupSettingsSchema = z.object({
  retentionDays: z.coerce.number('Μόνο αριθμός.').int('Μόνο ακέραιος αριθμός.').min(1, 'Τουλάχιστον 1.').max(3650, 'Το πολύ 3650 (10 χρόνια).'),
  storagePrefix: z.string().trim().max(200).regex(SAFE_PREFIX_RE, 'Μόνο γράμματα, αριθμοί, - _ /.').refine(v => !v.includes('..'), 'Μη έγκυρη διαδρομή.'),
  pgDumpPath: z.string().trim().max(500),
  pgRestorePath: z.string().trim().max(500),
})

const VALIDATION_MESSAGE = 'Έλεγξε τα στοιχεία που συμπλήρωσες.'

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export async function getBackupSettings(): Promise<BackupSettingsValues> {
  await requirePermission('settings.manage')
  const [retentionDays, storagePrefix, pgDumpPath, pgRestorePath] = await Promise.all([
    getSetting<number>('backups.retentionDays'),
    getSetting<string>('backups.storagePrefix'),
    getSetting<string>('backups.pgDumpPath'),
    getSetting<string>('backups.pgRestorePath'),
  ])
  return {
    retentionDays: String(retentionDays ?? 30),
    storagePrefix: storagePrefix ?? 'backups',
    pgDumpPath: pgDumpPath ?? '',
    pgRestorePath: pgRestorePath ?? '',
  }
}

export async function saveBackupSettings(values: BackupSettingsValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = backupSettingsSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }

  await Promise.all([
    setSetting('backups.retentionDays', parsed.data.retentionDays),
    setSetting('backups.storagePrefix', parsed.data.storagePrefix || 'backups'),
    setSetting('backups.pgDumpPath', parsed.data.pgDumpPath),
    setSetting('backups.pgRestorePath', parsed.data.pgRestorePath),
  ])
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις Backups αποθηκεύτηκαν.' }
}

// ══════════════════════════════════════════════════════════════════════════
// Λίστα + ενέργειες
// ══════════════════════════════════════════════════════════════════════════

export async function getBackupsList(): Promise<BackupListItem[]> {
  await requirePermission('settings.manage')
  return listBackups()
}

export async function runBackupNow(): Promise<ActionResult> {
  const session = await requirePermission('settings.manage')
  try {
    const backup = await runBackup({ trigger: 'manual', userId: session.user.id })
    revalidateSettings()
    return { ok: true, message: `Το backup «${backup.filename}» ολοκληρώθηκε.` }
  } catch (err) {
    revalidateSettings() // η αποτυχημένη γραμμή (status FAILED) πρέπει να φανεί στον πίνακα
    return { ok: false, message: err instanceof Error ? err.message : 'Το backup απέτυχε.' }
  }
}

export async function restoreBackupAction(id: string): Promise<ActionResult> {
  const session = await requirePermission('settings.manage')
  try {
    const { safetyBackup } = await restoreBackup(id, { userId: session.user.id })
    revalidateSettings()
    return {
      ok: true,
      message: `Η επαναφορά ολοκληρώθηκε. Δημιουργήθηκε αντίγραφο ασφαλείας της προηγούμενης κατάστασης πριν το restore: «${safetyBackup.filename}».`,
    }
  } catch (err) {
    revalidateSettings()
    return { ok: false, message: err instanceof Error ? err.message : 'Το restore απέτυχε.' }
  }
}

export async function deleteBackupAction(id: string): Promise<ActionResult> {
  await requirePermission('settings.manage')
  try {
    await deleteBackup(id)
    revalidateSettings()
    return { ok: true, message: 'Το backup διαγράφηκε.' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η διαγραφή απέτυχε.' }
  }
}
