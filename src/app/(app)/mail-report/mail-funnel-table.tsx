import Link from 'next/link'

/**
 * Funnel newsletters ανά πρόγραμμα από ProgramLead (τοπικά δεδομένα —
 * ανεξάρτητο από το αν έχει ρυθμιστεί Mailgun). Το «κλικ» εδώ είναι το δικό
 * μας /go/[token] tracking (εκδήλωση ενδιαφέροντος), όχι το click του Mailgun.
 */

export type ProgramFunnelRow = {
  programId: string
  title: string
  total: number
  pending: number
  sent: number
  failed: number
  clicked: number
}

const NUM = new Intl.NumberFormat('el-GR')

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—'
  return `${NUM.format(Math.round((numerator / denominator) * 1000) / 10)}%`
}

export function MailFunnelTable({ rows }: { rows: ProgramFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-4 text-[13px] text-muted-foreground">
        Δεν υπάρχουν ακόμα newsletters — στείλε το πρώτο από την καρτέλα «Δυνητικοί» ενός προγράμματος.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-left text-[11.5px] font-bold text-muted-foreground">
            <th className="py-1.5 pr-3 font-bold">Πρόγραμμα</th>
            <th className="px-2 py-1.5 text-right font-bold">Υποψήφιοι</th>
            <th className="px-2 py-1.5 text-right font-bold">Εστάλησαν</th>
            <th className="px-2 py-1.5 text-right font-bold">Κλικ</th>
            <th className="px-2 py-1.5 text-right font-bold">Απέτυχαν</th>
            <th className="py-1.5 pl-2 text-right font-bold">CTR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const dispatched = row.sent + row.clicked
            return (
              <tr key={row.programId} className="border-b border-dashed last:border-0">
                <td className="max-w-[260px] truncate py-2 pr-3">
                  <Link href={`/programs/${row.programId}`} className="hover:underline underline-offset-2">
                    {row.title || row.programId}
                  </Link>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{NUM.format(row.total)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{NUM.format(dispatched)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{NUM.format(row.clicked)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.failed > 0 ? NUM.format(row.failed) : '—'}</td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums">{pct(row.clicked, dispatched)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
