import { LuDatabaseBackup } from 'react-icons/lu'
import { relativeTime } from '@/lib/relative-time'
import { getBackupSettings, getBackupsList } from './backups-actions'
import { BackupsSettingsCard } from './cards/backups-settings-card'
import { BackupsTable, type BackupRow } from './backups-table'
import { BackupNowButton } from './backup-now-button'

function formatDateTime(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${dd}/${mo}/${yyyy} ${hh}:${mm}`
}

export async function BackupsTab() {
  const [settings, backups] = await Promise.all([getBackupSettings(), getBackupsList()])

  const rows: BackupRow[] = backups.map(b => ({
    id: b.id,
    filename: b.filename,
    sizeBytes: b.sizeBytes,
    status: b.status,
    trigger: b.trigger,
    errorMessage: b.errorMessage,
    isPreRestoreSafety: b.filename.startsWith('pre-restore-'),
    createdAtLabel: formatDateTime(b.createdAt),
    createdAtRelative: relativeTime(b.createdAt),
  }))

  return (
    <div className="stagger space-y-3">
      <div className="glass flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
          >
            <LuDatabaseBackup className="size-4" strokeWidth={1.8} aria-hidden />
          </div>
          <div>
            <h3 className="text-[14.5px] font-bold">Αντίγραφα ασφαλείας βάσης δεδομένων</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Αυτόματο καθημερινό backup στις 03:30 (Ελλάδα) → BunnyCDN, διατήρηση {settings.retentionDays} πιο πρόσφατων. Μπορείς και να τρέξεις ένα χειροκίνητα.
            </p>
          </div>
        </div>
        {rows.length > 0 && <BackupNowButton />}
      </div>

      <BackupsSettingsCard initial={settings} />

      <BackupsTable rows={rows} />
    </div>
  )
}
