'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuScanText, LuFileText, LuLoaderCircle, LuPlus, LuCheck, LuTrash2 } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  listTrdrFinancials, updateFinancialValue, setFinancialValueVerified, deleteFinancialValue, addManualFinancialValue,
  type TrdrFormRecordItem, type TrdrFinancialValueItem,
} from '@/lib/tax/actions'
import { ScanFormDialog } from './scan-form-dialog'

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  EXTRACTED: { label: 'Εξήχθη', cls: 'ok' },
  PENDING: { label: 'Σε εξέλιξη', cls: 'warn' },
}
const VALUE_TYPES = ['CURRENCY', 'NUMBER', 'PERCENT', 'INTEGER', 'DATE', 'BOOLEAN'] as const
const VALUE_TYPE_LABELS: Record<string, string> = {
  CURRENCY: 'Ποσό (€)', NUMBER: 'Αριθμός', PERCENT: 'Ποσοστό (%)', INTEGER: 'Ακέραιος', DATE: 'Ημερομηνία', BOOLEAN: 'Ναι/Όχι',
}

function statusBadge(status: string) {
  const s = STATUS_LABELS[status] ?? { label: status, cls: 'muted' }
  return <span className={`badge-pill ${s.cls}`}>{s.label}</span>
}

function displayValue(v: TrdrFinancialValueItem | undefined): string {
  if (!v) return '—'
  if (v.value != null) return v.value.toLocaleString('el-GR')
  if (v.valueText) return v.valueText
  return '—'
}

export function FinancialsTab({ trdrId, trdrName }: { trdrId: string; trdrName: string }) {
  const [records, setRecords] = React.useState<TrdrFormRecordItem[]>([])
  const [values, setValues] = React.useState<TrdrFinancialValueItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [scanOpen, setScanOpen] = React.useState(false)
  const [manualOpen, setManualOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TrdrFinancialValueItem | null>(null)

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

  const years = React.useMemo(() => Array.from(new Set(values.map(v => v.year))).sort((a, b) => b - a), [values])
  const fieldKeys = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const v of values) if (!seen.has(v.fieldKey)) seen.set(v.fieldKey, v.label)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'el')).map(([fk]) => fk)
  }, [values])
  const labelByKey = React.useMemo(() => new Map(values.map(v => [v.fieldKey, v.label])), [values])
  const valueMap = React.useMemo(() => {
    const m = new Map<string, TrdrFinancialValueItem>()
    for (const v of values) m.set(`${v.fieldKey}:${v.year}`, v)
    return m
  }, [values])

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Τιμές εντύπων ({records.length})
        </div>
        <Button type="button" variant="outline" onClick={() => setManualOpen(true)}>
          <LuPlus className="size-3.5" aria-hidden /> Χειροκίνητη τιμή
        </Button>
        <Button type="button" onClick={() => setScanOpen(true)}>
          <LuScanText className="size-3.5" aria-hidden /> Νέα σάρωση
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[0.78125rem] text-coral">{error}</p>
      ) : records.length === 0 && values.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-[0.78125rem] text-muted-foreground">Δεν έχει καταχωριστεί κανένα φορολογικό στοιχείο για τον συναλλασσόμενο αυτόν.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setManualOpen(true)}><LuPlus className="size-3.5" aria-hidden /> Χειροκίνητη τιμή</Button>
            <Button type="button" onClick={() => setScanOpen(true)}><LuScanText className="size-3.5" aria-hidden /> Νέα σάρωση</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {records.length > 0 && (
            <div className="flex flex-col">
              {records.map(r => (
                <div key={r.id} className="dotted-row-bottom flex flex-wrap items-center gap-3 py-2.5">
                  <span className="avatar-ring size-8 shrink-0 text-[0.6875rem]"><LuFileText className="size-3.5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="text-[0.8125rem]">{r.name}</b>
                      <span className="text-[0.71875rem] text-muted-foreground">— {r.templateName}</span>
                      {statusBadge(r.status)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.71875rem] text-muted-foreground">
                      <span>Έτος {r.year}</span>
                      {r.usage && <span>{r.usage}</span>}
                      <span>{new Date(r.createdAt).toLocaleDateString('el-GR')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {fieldKeys.length > 0 && (
            <div>
              <p className="mb-1.5 text-[0.6875rem] text-muted-foreground">Κλικ σε κελί για επεξεργασία / επαλήθευση. <LuCheck className="inline size-3 text-[color:var(--success)]" aria-hidden /> = επαληθευμένο.</p>
              <div className="glass max-h-[min(50vh,420px)] overflow-y-auto rounded-[16px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Πεδίο</TableHead>
                      {years.map(y => <TableHead key={y} className="text-right">{y}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fieldKeys.map(fk => (
                      <TableRow key={fk}>
                        <TableCell className="text-[0.75rem] font-semibold">{labelByKey.get(fk) ?? fk}</TableCell>
                        {years.map(y => {
                          const v = valueMap.get(`${fk}:${y}`)
                          return (
                            <TableCell key={y} className="p-0 text-right">
                              <button
                                type="button"
                                onClick={() => v && setEditing(v)}
                                disabled={!v}
                                className={cn(
                                  'inline-flex w-full items-center justify-end gap-1 px-3 py-2 text-[0.78125rem] tabular-nums transition-colors',
                                  v ? 'cursor-pointer hover:bg-muted' : 'cursor-default text-muted-foreground',
                                )}
                                title={v ? `${v.source === 'MANUAL' ? 'Χειροκίνητο' : 'OCR'}${v.verified ? ' · Επαληθευμένο' : ''}` : undefined}
                              >
                                {v?.verified && <LuCheck className="size-3 shrink-0 text-[color:var(--success)]" aria-hidden />}
                                {displayValue(v)}
                              </button>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}

      <ScanFormDialog trdrId={trdrId} trdrName={trdrName} open={scanOpen} onOpenChange={setScanOpen} onSaved={handleSaved} />
      <ManualAddDialog trdrId={trdrId} open={manualOpen} onOpenChange={setManualOpen} onDone={load} />
      {editing && <ValueEditDialog key={editing.id} value={editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  )
}

function ValueEditDialog({
  value, onClose, onDone,
}: {
  value: TrdrFinancialValueItem
  onClose: () => void
  onDone: () => void
}) {
  // Remount ανά value (key στο parent) → αρχικοποίηση από props, χωρίς effect/ref.
  const [raw, setRaw] = React.useState(value.valueText ?? (value.value != null ? String(value.value) : ''))
  const [verified, setVerified] = React.useState(value.verified)
  const [busy, setBusy] = React.useState(false)

  async function save() {
    setBusy(true)
    try {
      const cur = raw.trim()
      const orig = value.valueText ?? (value.value != null ? String(value.value) : '')
      if (cur !== orig) await updateFinancialValue(value.id, cur)
      if (verified !== value.verified) await setFinancialValueVerified(value.id, verified)
      toast.success('Η τιμή ενημερώθηκε.')
      onDone(); onClose()
    } catch { toast.error('Η ενημέρωση απέτυχε.') } finally { setBusy(false) }
  }
  async function remove() {
    if (!window.confirm('Διαγραφή αυτής της τιμής;')) return
    setBusy(true)
    try {
      await deleteFinancialValue(value.id)
      toast.success('Η τιμή διαγράφηκε.')
      onDone(); onClose()
    } catch { toast.error('Η διαγραφή απέτυχε.') } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="glass sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Επεξεργασία τιμής</DialogTitle>
          <DialogDescription>{value.label} · έτος {value.year} · {VALUE_TYPE_LABELS[value.valueType] ?? value.valueType}{value.source === 'MANUAL' ? ' · χειροκίνητο' : ' · OCR'}</DialogDescription>
        </DialogHeader>
        <div className="field !mb-0">
          <label htmlFor="fv-raw">Τιμή</label>
          <Input id="fv-raw" value={raw} onChange={e => setRaw(e.target.value)} autoFocus disabled={busy} />
        </div>
        <div className="flex items-center gap-2.5">
          <Switch checked={verified} onCheckedChange={setVerified} disabled={busy} id="fv-verified" />
          <label htmlFor="fv-verified" className="text-[0.78125rem] font-semibold">Επαληθευμένο</label>
        </div>
        <DialogFooter className="-mx-4 -mb-4 flex-wrap gap-2 rounded-b-[22px] p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <Button type="button" variant="outline" onClick={remove} disabled={busy} className="mr-auto text-destructive"><LuTrash2 className="size-3.5" aria-hidden /> Διαγραφή</Button>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy}>Άκυρο</Button>} />
          <Button type="button" onClick={save} disabled={busy}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManualAddDialog({
  trdrId, open, onOpenChange, onDone,
}: {
  trdrId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [fieldKey, setFieldKey] = React.useState('')
  const [year, setYear] = React.useState(String(new Date().getFullYear() - 1))
  const [valueType, setValueType] = React.useState<string>('CURRENCY')
  const [raw, setRaw] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  function handleOpen(next: boolean) {
    if (busy) return
    if (!next) { setFieldKey(''); setYear(String(new Date().getFullYear() - 1)); setValueType('CURRENCY'); setRaw('') }
    onOpenChange(next)
  }

  async function save() {
    const yn = Number(year)
    if (!fieldKey.trim()) { toast.error('Δώσε κωδικό πεδίου.'); return }
    if (!Number.isInteger(yn) || yn < 2000 || yn > 2100) { toast.error('Μη έγκυρο έτος.'); return }
    setBusy(true)
    try {
      await addManualFinancialValue({ trdrId, fieldKey: fieldKey.trim(), year: yn, valueType, raw })
      toast.success('Η τιμή προστέθηκε.')
      onDone(); handleOpen(false)
    } catch { toast.error('Η προσθήκη απέτυχε.') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="glass sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Χειροκίνητη τιμή</DialogTitle>
          <DialogDescription>Πρόσθεσε μια φορολογική/οικονομική τιμή χωρίς σάρωση.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field !mb-0">
            <label htmlFor="ma-key">Κωδικός πεδίου</label>
            <Input id="ma-key" value={fieldKey} onChange={e => setFieldKey(e.target.value)} placeholder="π.χ. esoda" autoComplete="off" disabled={busy} />
          </div>
          <div className="field !mb-0">
            <label htmlFor="ma-year">Έτος</label>
            <Input id="ma-year" inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} disabled={busy} />
          </div>
          <div className="field !mb-0">
            <label htmlFor="ma-type">Τύπος τιμής</label>
            <Select value={valueType} onValueChange={v => setValueType(v ?? 'CURRENCY')}>
              <SelectTrigger id="ma-type" className="h-9 w-full rounded-full border-border bg-card px-3" disabled={busy}><SelectValue /></SelectTrigger>
              <SelectContent>{VALUE_TYPES.map(t => <SelectItem key={t} value={t}>{VALUE_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="field !mb-0">
            <label htmlFor="ma-raw">Τιμή</label>
            <Input id="ma-raw" value={raw} onChange={e => setRaw(e.target.value)} placeholder="π.χ. 125.000,00" disabled={busy} />
          </div>
        </div>
        <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy}>Άκυρο</Button>} />
          <Button type="button" onClick={save} disabled={busy || !fieldKey.trim()}>{busy ? 'Προσθήκη…' : (<><LuPlus className="size-3.5" aria-hidden /> Προσθήκη</>)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
