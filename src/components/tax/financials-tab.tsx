'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuScanText, LuFileText, LuLoaderCircle } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { listTrdrFinancials, type TrdrFormRecordItem, type TrdrFinancialValueItem } from '@/lib/tax/actions'
import { ScanFormDialog } from './scan-form-dialog'

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  EXTRACTED: { label: 'Εξήχθη', cls: 'ok' },
  PENDING: { label: 'Σε εξέλιξη', cls: 'warn' },
}

function statusBadge(status: string) {
  const s = STATUS_LABELS[status] ?? { label: status, cls: 'muted' }
  return <span className={`badge-pill ${s.cls}`}>{s.label}</span>
}

function formatCell(v: TrdrFinancialValueItem | undefined): string {
  if (!v) return '—'
  if (v.value != null) return v.value.toLocaleString('el-GR')
  if (v.valueText) return v.valueText
  return '—'
}

/**
 * Το «Φορολογικά» section μιας καρτέλας συναλλασσόμενου (Task 15): ιστορικό
 * σαρώσεων (TrdrFormRecord) + τρέχουσες τιμές ανά πεδίο/έτος
 * (TrdrFinancialValue), με δυνατότητα νέας σάρωσης μέσω του ίδιου
 * ScanFormDialog που χρησιμοποιεί το row action της λίστας (Task 14/15) —
 * φορτώνει με listTrdrFinancials (server action, ήδη πυλωρημένη με
 * `taxform.scan`) στο mount, refresh μετά από κάθε επιτυχή σάρωση.
 */
export function FinancialsTab({ trdrId, trdrName }: { trdrId: string; trdrName: string }) {
  const [records, setRecords] = React.useState<TrdrFormRecordItem[]>([])
  const [values, setValues] = React.useState<TrdrFinancialValueItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [scanOpen, setScanOpen] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    listTrdrFinancials(trdrId)
      .then(res => { setRecords(res.records); setValues(res.values) })
      .catch(() => setError('Αποτυχία φόρτωσης φορολογικών στοιχείων.'))
      .finally(() => setLoading(false))
  }, [trdrId])

  React.useEffect(() => { load() }, [load])

  function handleSaved() {
    toast.success('Τα φορολογικά στοιχεία ενημερώθηκαν.')
    load()
  }

  const years = React.useMemo(
    () => Array.from(new Set(values.map(v => v.year))).sort((a, b) => b - a),
    [values],
  )
  const fieldKeys = React.useMemo(
    () => Array.from(new Set(values.map(v => v.fieldKey))).sort((a, b) => a.localeCompare(b)),
    [values],
  )
  const valueMap = React.useMemo(() => {
    const m = new Map<string, TrdrFinancialValueItem>()
    for (const v of values) m.set(`${v.fieldKey}:${v.year}`, v)
    return m
  }, [values])

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Φορολογικά ({records.length})
        </div>
        <Button type="button" onClick={() => setScanOpen(true)}>
          <LuScanText className="size-3.5" aria-hidden /> Νέα σάρωση
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-[12.5px] text-muted-foreground">Δεν έχει καταχωριστεί κανένα φορολογικό έντυπο για τον συναλλασσόμενο αυτόν.</p>
          <Button type="button" onClick={() => setScanOpen(true)}>
            <LuScanText className="size-3.5" aria-hidden /> Νέα σάρωση
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            {records.map(r => (
              <div key={r.id} className="dotted-row-bottom flex flex-wrap items-center gap-3 py-2.5">
                <span className="avatar-ring size-8 shrink-0 text-[11px]">
                  <LuFileText className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="text-[13px]">{r.name}</b>
                    <span className="text-[11.5px] text-muted-foreground">— {r.templateName}</span>
                    {statusBadge(r.status)}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                    <span>Έτος {r.year}</span>
                    {r.usage && <span>{r.usage}</span>}
                    <span>{new Date(r.createdAt).toLocaleDateString('el-GR')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {fieldKeys.length > 0 && (
            <div className="glass max-h-[min(50vh,420px)] overflow-y-auto rounded-[16px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Πεδίο</TableHead>
                    {years.map(y => (
                      <TableHead key={y} className="text-right">{y}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldKeys.map(fk => (
                    <TableRow key={fk}>
                      <TableCell className="font-mono text-[11.5px]">{fk}</TableCell>
                      {years.map(y => (
                        <TableCell key={y} className="text-right">{formatCell(valueMap.get(`${fk}:${y}`))}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <ScanFormDialog trdrId={trdrId} trdrName={trdrName} open={scanOpen} onOpenChange={setScanOpen} onSaved={handleSaved} />
    </div>
  )
}
