'use client'

import Link from 'next/link'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

/**
 * Funnel newsletters ανά πρόγραμμα από ProgramLead (τοπικά δεδομένα —
 * ανεξάρτητο από το αν έχει ρυθμιστεί Mailgun). Το «κλικ» εδώ είναι το δικό
 * μας /go/[token] tracking (εκδήλωση ενδιαφέροντος), όχι το click του Mailgun.
 * Πίνακας μέσω του κοινού DataTable engine (resize/επιλογή στηλών/sorting).
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

function dispatchedOf(r: ProgramFunnelRow): number { return r.sent + r.clicked }

export function MailFunnelTable({ rows }: { rows: ProgramFunnelRow[] }) {
  const columns: DataTableColumn<ProgramFunnelRow>[] = [
    {
      id: 'title', header: 'Πρόγραμμα', width: 280, enableHide: false, sortValue: r => r.title || r.programId,
      cell: r => (
        <Link href={`/programs/${r.programId}`} className="hover:underline underline-offset-2">
          {r.title || r.programId}
        </Link>
      ),
    },
    { id: 'total', header: 'Υποψήφιοι', align: 'right', width: 110, nowrap: true, sortValue: r => r.total, cell: r => <span className="tabular-nums">{NUM.format(r.total)}</span> },
    { id: 'sent', header: 'Εστάλησαν', align: 'right', width: 110, nowrap: true, sortValue: dispatchedOf, cell: r => <span className="tabular-nums">{NUM.format(dispatchedOf(r))}</span> },
    { id: 'clicked', header: 'Κλικ', align: 'right', width: 90, nowrap: true, sortValue: r => r.clicked, cell: r => <span className="tabular-nums">{NUM.format(r.clicked)}</span> },
    { id: 'failed', header: 'Απέτυχαν', align: 'right', width: 100, nowrap: true, sortValue: r => r.failed, cell: r => <span className="tabular-nums">{r.failed > 0 ? NUM.format(r.failed) : '—'}</span> },
    { id: 'ctr', header: 'CTR', align: 'right', width: 90, nowrap: true, sortValue: r => (dispatchedOf(r) > 0 ? r.clicked / dispatchedOf(r) : -1), cell: r => <span className="font-semibold tabular-nums">{pct(r.clicked, dispatchedOf(r))}</span> },
  ]

  return (
    <DataTable
      tableId="mail-funnel"
      columns={columns}
      rows={rows}
      rowKey={r => r.programId}
      bare
      fillHeight={false}
      emptyMessage="Δεν υπάρχουν ακόμα newsletters — στείλε το πρώτο από την καρτέλα «Δυνητικοί» ενός προγράμματος."
    />
  )
}
