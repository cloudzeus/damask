'use client'

import type { MailFailure } from '@/lib/mailgun-stats'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

/** Πρόσφατα failed/rejected/complained events από το Mailgun Events API, με λόγο.
 *  Μέσω του κοινού DataTable engine (resize/επιλογή στηλών/sorting). */

const AT_FMT = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const EVENT_LABEL: Record<string, string> = {
  failed: 'Αποτυχία',
  rejected: 'Απόρριψη',
  complained: 'Παράπονο',
}

type Row = MailFailure & { _key: string }

export function MailFailuresTable({ failures }: { failures: MailFailure[] }) {
  const rows: Row[] = failures.map((f, i) => ({ ...f, _key: `${f.at}-${f.recipient}-${i}` }))

  const columns: DataTableColumn<Row>[] = [
    {
      id: 'at', header: 'Πότε', width: 120, nowrap: true, sortValue: r => r.at ?? '',
      cell: r => <span className="tabular-nums text-muted-foreground">{r.at ? AT_FMT.format(new Date(r.at)) : '—'}</span>,
    },
    { id: 'recipient', header: 'Παραλήπτης', width: 200, sortValue: r => r.recipient ?? '', cell: r => <span className="truncate">{r.recipient || '—'}</span> },
    {
      id: 'event', header: 'Τύπος', width: 140, nowrap: true, sortValue: r => r.event,
      cell: r => (
        <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold" style={{ background: 'var(--mr-failed-soft)', color: 'var(--mr-failed)' }}>
          {EVENT_LABEL[r.event] ?? r.event}{r.severity === 'temporary' ? ' (προσωρινή)' : ''}
        </span>
      ),
    },
    { id: 'reason', header: 'Λόγος', width: 320, sortValue: r => r.reason ?? '', cell: r => <span className="text-[0.78125rem] text-muted-foreground">{r.reason}</span> },
  ]

  return (
    <DataTable
      tableId="mail-failures"
      columns={columns}
      rows={rows}
      rowKey={r => r._key}
      bare
      fillHeight={false}
      emptyMessage="Καμία αποτυχία ή παράπονο πρόσφατα. 🎉"
    />
  )
}
