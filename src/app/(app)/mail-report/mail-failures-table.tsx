import type { MailFailure } from '@/lib/mailgun-stats'

/** Πρόσφατα failed/rejected/complained events από το Mailgun Events API, με λόγο. */

const AT_FMT = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const EVENT_LABEL: Record<string, string> = {
  failed: 'Αποτυχία',
  rejected: 'Απόρριψη',
  complained: 'Παράπονο',
}

export function MailFailuresTable({ failures }: { failures: MailFailure[] }) {
  if (failures.length === 0) {
    return <div className="py-4 text-[13px] text-muted-foreground">Καμία αποτυχία ή παράπονο πρόσφατα. 🎉</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-left text-[11.5px] font-bold text-muted-foreground">
            <th className="py-1.5 pr-3 font-bold">Πότε</th>
            <th className="px-2 py-1.5 font-bold">Παραλήπτης</th>
            <th className="px-2 py-1.5 font-bold">Τύπος</th>
            <th className="py-1.5 pl-2 font-bold">Λόγος</th>
          </tr>
        </thead>
        <tbody>
          {failures.map((f, i) => (
            <tr key={`${f.at}-${f.recipient}-${i}`} className="border-b border-dashed align-top last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">
                {f.at ? AT_FMT.format(new Date(f.at)) : '—'}
              </td>
              <td className="max-w-[180px] truncate px-2 py-2">{f.recipient || '—'}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: 'var(--mr-failed-soft)', color: 'var(--mr-failed)' }}
                >
                  {EVENT_LABEL[f.event] ?? f.event}
                  {f.severity === 'temporary' ? ' (προσωρινή)' : ''}
                </span>
              </td>
              <td className="max-w-[280px] py-2 pl-2 text-[12.5px] text-muted-foreground">{f.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
