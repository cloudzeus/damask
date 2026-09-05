'use client'

import { LuDatabaseBackup, LuCircleCheck, LuCircleX } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { DbBackupStatus } from '@prisma/client'
import { cn } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { BackupNowButton } from './backup-now-button'
import { BackupRowActions } from './backup-row-actions'

export type BackupRow = {
  id: string
  filename: string
  sizeBytes: number
  status: DbBackupStatus
  trigger: string
  errorMessage: string | null
  /** filename ξεκινάει με "pre-restore-" — αυτόματο safety backup πριν από restore (βλ. src/lib/backup.ts). */
  isPreRestoreSafety: boolean
  createdAtLabel: string
  createdAtRelative: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const STATUS_META: Record<DbBackupStatus, { label: string; badgeClass: string; style?: React.CSSProperties; pulse?: boolean; icon?: IconType }> = {
  PENDING: { label: 'Σε εξέλιξη', badgeClass: 'badge-pill warn', pulse: true },
  READY: { label: 'Έτοιμο', badgeClass: 'badge-pill ok', icon: LuCircleCheck },
  FAILED: {
    label: 'Απέτυχε', badgeClass: 'badge-pill',
    style: { color: 'var(--destructive)', background: 'color-mix(in srgb, var(--destructive) 12%, transparent)' },
    icon: LuCircleX,
  },
  RESTORING: { label: 'Γίνεται επαναφορά', badgeClass: 'badge-pill warn', pulse: true },
}

function TriggerBadge({ trigger, isPreRestoreSafety }: { trigger: string; isPreRestoreSafety: boolean }) {
  if (isPreRestoreSafety) {
    return (
      <span className="badge-pill info" title="Δημιουργήθηκε αυτόματα πριν από ένα restore, ως δίχτυ ασφαλείας">
        Πριν από restore
      </span>
    )
  }
  return (
    <span className={cn('badge-pill', trigger === 'cron' ? 'muted' : 'info')}>
      {trigger === 'cron' ? 'Προγραμματισμένο' : 'Χειροκίνητο'}
    </span>
  )
}

export function BackupsTable({ rows }: { rows: BackupRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="glass table-card stagger flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <LuDatabaseBackup className="size-5" strokeWidth={1.6} aria-hidden />
        </div>
        <div>
          <p className="font-semibold">Δεν υπάρχουν ακόμα αντίγραφα ασφαλείας.</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Το πρώτο θα τρέξει αυτόματα απόψε στις 03:30, ή μπορείς να το ξεκινήσεις τώρα.</p>
        </div>
        <BackupNowButton />
      </div>
    )
  }

  const columns: DataTableColumn<BackupRow>[] = [
    {
      id: 'date',
      header: 'Ημ/νία',
      width: 160,
      sortValue: row => row.createdAtLabel,
      cell: row => <span title={row.createdAtRelative}>{row.createdAtLabel}</span>,
    },
    {
      id: 'filename',
      header: 'Αρχείο',
      width: 280,
      sortValue: row => row.filename,
      cell: row => <span className="block max-w-[280px] truncate font-mono text-[12px]" title={row.filename}>{row.filename}</span>,
    },
    {
      id: 'size',
      header: 'Μέγεθος',
      align: 'right',
      width: 110,
      sortValue: row => row.sizeBytes,
      cell: row => formatBytes(row.sizeBytes),
    },
    {
      id: 'trigger',
      header: 'Τρόπος',
      width: 140,
      sortValue: row => (row.isPreRestoreSafety ? 'zzz' : row.trigger),
      cell: row => <TriggerBadge trigger={row.trigger} isPreRestoreSafety={row.isPreRestoreSafety} />,
    },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 160,
      sortValue: row => STATUS_META[row.status].label,
      cell: row => {
        const meta = STATUS_META[row.status]
        return (
          <span className={meta.badgeClass} style={meta.style} title={row.status === 'FAILED' ? (row.errorMessage ?? undefined) : undefined}>
            {meta.pulse
              ? <span className="status-dot pulse" style={{ background: 'var(--warning)', color: 'var(--warning)' }} aria-hidden />
              : (meta.icon ? <meta.icon className="size-3" aria-hidden /> : null)}
            {meta.label}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 48,
      enableHide: false,
      enableResize: false,
      cell: row => <BackupRowActions backup={row} />,
    },
  ]

  return (
    <DataTable
      tableId="backups"
      columns={columns}
      rows={rows}
      rowKey={row => row.id}
      emptyMessage="Δεν υπάρχουν αντίγραφα ασφαλείας."
      footer={<span>{rows.length} {rows.length === 1 ? 'αντίγραφο' : 'αντίγραφα'}</span>}
    />
  )
}
